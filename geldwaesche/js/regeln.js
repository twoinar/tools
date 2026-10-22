// Prüfkatalog: Pflichten, meldepflichtige Sachverhalte (GwGMeldV-Immobilien) und Risikofaktoren.
// Jeder Punkt hat eine Erkennung, die aus dem Vertrag einen Vorschlag macht.
// Vorschlag "ja" = Anhaltspunkt im Vertrag gefunden, "pruefen" = Hinweis, bitte ansehen,
// "nein" = im Vertrag nichts gefunden, null = aus dem Vertrag nicht erkennbar (Angabe des Notars nötig).
// Die Entscheidung trifft immer der Notar.

import { euro } from "./erkennen.js";
import { HOCHRISIKO_STAND } from "./staaten.js";

const SCHWELLE_BAR = 10000;
const SCHWELLE_VORAUS = 20000;
const SCHWELLE_DRITTE = 20000;

const texte = (liste) => liste.map((x) => x.text);
const gesellschaften = (f) => f.beteiligte.filter((p) => p.art === "Gesellschaft");
const vertragsparteien = (f) => f.beteiligte.filter((p) => !p.organ);

function hrStaatenBeiBeteiligten(f) {
  const funde = [];
  for (const p of f.beteiligte) if (p.land?.hochrisiko) funde.push(`${p.name}: ${p.land.name} (${p.wohnort || p.sitz || p.staatsangehoerigkeit || p.ausweis})`);
  return funde;
}

function jahreZwischen(a, b) {
  if (!a || !b) return null;
  return (Date.parse(b) - Date.parse(a)) / (365.25 * 864e5);
}

export const PUNKTE = [
  // ---------- Pflichten bei jedem Erwerbsvorgang ----------
  {
    id: "identifizierung", gruppe: "pflicht", norm: "§§ 10 Abs. 1 Nr. 1, 11, 12, 8 GwG",
    titel: "Identifizierung aller Beteiligten und der für sie auftretenden Personen, Ausweiskopie zur Akte",
    auto: (f) => {
      const vertreten = f.beteiligte.filter((p) => p.vertreten || p.organ).map((p) => `${p.name} handelt für einen anderen – Vertretungsmacht prüfen und Vertretenen identifizieren`);
      return { vorschlag: null, funde: vertreten };
    },
  },
  {
    id: "wirtschaftlich", gruppe: "pflicht", norm: "§§ 10 Abs. 1 Nr. 2, 11 Abs. 5, 3 GwG",
    titel: "Wirtschaftlich Berechtigte ermitteln; bei Gesellschaften Eigentums- und Kontrollstruktur abklären",
    auto: (f) => {
      const g = gesellschaften(f);
      return g.length
        ? { vorschlag: "ja", funde: g.map((p) => `${p.name}${p.sitz ? `, Sitz ${p.sitz}` : ""} – wirtschaftlich Berechtigte ermitteln`) }
        : { vorschlag: "nein", funde: [], hinweis: "Keine Gesellschaft als Beteiligte erkannt; bei natürlichen Personen genügt die Frage, ob sie für eigene Rechnung handeln." };
    },
  },
  {
    id: "transparenzregister", gruppe: "pflicht", norm: "§§ 12 Abs. 4, 20 Abs. 1, 10 Abs. 9 Satz 4, 23a GwG",
    titel: "Gesellschaft beteiligt: schlüssige Dokumentation der Eigentums- und Kontrollstruktur vorlegen lassen, Transparenzregister einsehen; ohne diese Nachweise Beurkundung ablehnen; bei Abweichungen Unstimmigkeitsmeldung",
    auto: (f) => {
      const g = gesellschaften(f);
      if (!g.length) return { vorschlag: "nein", funde: [], hinweis: "Nur nötig, wenn eine Vereinigung oder Rechtsgestaltung beteiligt ist." };
      const funde = g.map((p) => p.name + (p.auslaendisch ? " – ausländische Vereinigung: zusätzlich Nachweis der Mitteilung an das deutsche Transparenzregister (§ 20 Abs. 1 Satz 2 GwG)" : ""));
      return { vorschlag: "ja", funde: [...funde, ...texte(f.treffer.transparenzregister)] };
    },
  },
  {
    id: "pep", gruppe: "pflicht", norm: "§§ 10 Abs. 1 Nr. 4, 15 Abs. 3 Nr. 1, Abs. 4 GwG",
    titel: "Abklären, ob Beteiligte oder wirtschaftlich Berechtigte politisch exponierte Personen (PEP), deren Familienmitglieder oder bekanntermaßen nahestehende Personen sind",
    auto: () => ({ vorschlag: null, funde: [] }),
  },
  {
    id: "sanktionsliste", gruppe: "pflicht", norm: "§ 3 Abs. 3 GwGMeldV-Immobilien",
    titel: "Abgleich der Beteiligten und wirtschaftlich Berechtigten mit den Sanktionslisten (finanz-sanktionsliste.de)",
    link: "https://www.finanz-sanktionsliste.de/fisalis/",
    auto: (f) => {
      const ru = f.staaten.filter((s) => s.code === "RU" || s.code === "BY" || s.sanktionen);
      return { vorschlag: null, funde: ru.length ? [`Bezug zu ${[...new Set(ru.map((s) => s.name))].join(", ")} – Sanktionsabgleich besonders sorgfältig`] : [] };
    },
  },
  {
    id: "barzahlungsverbot", gruppe: "pflicht", norm: "§ 16a GwG",
    titel: "Barzahlungsverbot: Nachweis der unbaren Zahlung (z. B. Bankbestätigung) vor dem Antrag auf Eigentumsumschreibung prüfen",
    auto: (f) => {
      if (f.kaufpreis != null && f.kaufpreis <= 10000) return { vorschlag: "nein", funde: [`Kaufpreis ${euro(f.kaufpreis)}: Nachweis nach § 16a Abs. 5 GwG entbehrlich`] };
      if (f.treffer.notaranderkonto.length) return { vorschlag: "nein", funde: ["Zahlung über Notaranderkonto: Nachweis nach § 16a Abs. 5 GwG entbehrlich", ...texte(f.treffer.notaranderkonto)] };
      return {
        vorschlag: "ja",
        funde: f.treffer.klausel16a.length ? ["Hinweis auf § 16a GwG im Vertrag vorhanden"] : ["Kein Hinweis auf das Barzahlungsverbot im Vertrag gefunden"],
        hinweis: "Eintragungsantrag erst stellen, wenn der Nachweis schlüssig ist (§ 16a Abs. 3 GwG). Bei Raten nach Antragstellung: § 16a Abs. 4 GwG.",
      };
    },
  },

  // ---------- Meldepflichtige Sachverhalte ----------
  {
    id: "m3_1", gruppe: "melde", norm: "§ 3 Abs. 1 GwGMeldV-Immobilien",
    titel: "Beteiligter oder wirtschaftlich Berechtigter ist in einem Hochrisikostaat ansässig oder hat einen gleichermaßen engen Bezug dazu",
    hilfe: `Hochrisikostaaten: ${HOCHRISIKO_STAND} (Liste in den Einstellungen).`,
    auto: (f) => {
      const bei = hrStaatenBeiBeteiligten(f);
      if (bei.length) return { vorschlag: "ja", funde: bei };
      const sonst = f.staaten.filter((s) => s.hochrisiko);
      return sonst.length ? { vorschlag: "pruefen", funde: sonst.map((s) => `${s.name}: ${s.text}`) } : { vorschlag: "nein", funde: [] };
    },
  },
  {
    id: "m3_2", gruppe: "melde", norm: "§ 3 Abs. 2 GwGMeldV-Immobilien",
    titel: "Geschäftsgegenstand oder ein eingesetztes Bankkonto hat einen engen Bezug zu einem Hochrisikostaat",
    auto: (f) => {
      const konten = f.treffer.ibans.filter((x) => x.hochrisiko);
      return konten.length ? { vorschlag: "ja", funde: konten.map((x) => `Konto ${x.iban} (${x.land})`) } : { vorschlag: "nein", funde: [] };
    },
  },
  {
    id: "m3_3", gruppe: "melde", norm: "§ 3 Abs. 3 GwGMeldV-Immobilien",
    titel: "Beteiligter oder wirtschaftlich Berechtigter ist in einer Sanktionsliste (EU-Anhänge, Allgemeinverfügung) aufgeführt",
    link: "https://www.finanz-sanktionsliste.de/fisalis/",
    auto: () => ({ vorschlag: null, funde: [] }),
  },
  {
    id: "m4_1", gruppe: "melde", norm: "§ 4 Nr. 1 GwGMeldV-Immobilien, § 11 Abs. 6 GwG",
    titel: "Ein Beteiligter erfüllt seine Mitwirkungs-, Auskunfts- oder Nachweispflichten nicht",
    auto: () => ({ vorschlag: null, funde: [] }),
  },
  {
    id: "m4_2", gruppe: "melde", norm: "§ 4 Nr. 2 GwGMeldV-Immobilien",
    titel: "Anhaltspunkte für bewusst falsche oder unvollständige Angaben zur Identität eines Beteiligten oder wirtschaftlich Berechtigten",
    auto: () => ({ vorschlag: null, funde: [] }),
  },
  {
    id: "m4_3", gruppe: "melde", norm: "§ 4 Nr. 3 GwGMeldV-Immobilien",
    titel: "Treuhandverhältnis (Erwerb, Halten oder Beendigung) ohne erkennbaren rechtmäßigen Zweck",
    auto: (f) => (f.treffer.treuhand.length ? { vorschlag: "pruefen", funde: texte(f.treffer.treuhand) } : { vorschlag: "nein", funde: [] }),
  },
  {
    id: "m4_4", gruppe: "melde", norm: "§ 4 Nr. 4 GwGMeldV-Immobilien",
    titel: "Bekanntes Ermittlungs-/Strafverfahren oder Verurteilung (letzte fünf Jahre) eines Beteiligten oder wirtschaftlich Berechtigten wegen einer Vortat der Geldwäsche, Zusammenhang nicht ausschließbar",
    auto: () => ({ vorschlag: null, funde: [] }),
  },
  {
    id: "m4_5", gruppe: "melde", norm: "§ 4 Nr. 5 GwGMeldV-Immobilien",
    titel: "Erwerb steht in grobem Missverhältnis zu den legalen Einkünften oder dem Vermögen eines Beteiligten oder wirtschaftlich Berechtigten",
    auto: () => ({ vorschlag: null, funde: [] }),
  },
  {
    id: "m4_6", gruppe: "melde", norm: "§ 4 Nr. 6 GwGMeldV-Immobilien",
    titel: "Wirtschaftlich Berechtigter ist über eine Gesellschaft mit Sitz in einem Drittstaat beteiligt, in dem er nicht ansässig ist, ohne erkennbaren rechtmäßigen Zweck",
    auto: (f) => {
      const g = gesellschaften(f).filter((p) => p.drittstaat || p.land?.offshore);
      return g.length ? { vorschlag: "pruefen", funde: g.map((p) => `${p.name}${p.sitz ? `, Sitz ${p.sitz}` : ""}${p.land ? ` (${p.land.name})` : ""}`) } : { vorschlag: "nein", funde: [] };
    },
  },
  {
    id: "m4_7", gruppe: "melde", norm: "§ 4 Nr. 7 GwGMeldV-Immobilien, §§ 138d ff. AO",
    titel: "Zusammenhang mit einer meldepflichtigen grenzüberschreitenden Steuergestaltung, bei der der Notar Intermediär ist",
    auto: () => ({ vorschlag: null, funde: [] }),
  },
  {
    id: "m5_1", gruppe: "melde", norm: "§ 5 Nr. 1 GwGMeldV-Immobilien",
    titel: "Handeln aufgrund einer nicht schriftlichen Vollmacht, schriftlicher Nachweis auch zwei Monate nach Aufforderung nicht vorgelegt",
    auto: (f) => (f.treffer.vollmachtFormfehlt.length ? { vorschlag: "pruefen", funde: texte(f.treffer.vollmachtFormfehlt) } : { vorschlag: null, funde: [] }),
  },
  {
    id: "m5_2", gruppe: "melde", norm: "§ 5 Nr. 2 GwGMeldV-Immobilien",
    titel: "Vorlage einer gefälschten oder verfälschten Vollmachtsurkunde",
    auto: () => ({ vorschlag: null, funde: [] }),
  },
  {
    id: "m5_3", gruppe: "melde", norm: "§ 5 Nr. 3 GwGMeldV-Immobilien",
    titel: "Handeln aufgrund einer Vollmacht, deren zugrunde liegendes Rechtsverhältnis nicht erkennbar ist",
    auto: (f) => (f.treffer.vollmacht.length ? { vorschlag: "pruefen", funde: texte(f.treffer.vollmacht), hinweis: "Grund der Bevollmächtigung erfragen und vermerken (z. B. Familienangehöriger, Hausverwalter, Mitarbeiter)." } : { vorschlag: "nein", funde: [] }),
  },
  {
    id: "m5_4", gruppe: "melde", norm: "§ 5 Nr. 4 GwGMeldV-Immobilien",
    titel: "Vollmacht wurde von einer deutschen Auslandsvertretung in einem Hochrisikostaat beglaubigt",
    auto: (f) => {
      const k = f.treffer.konsulat.filter((x) => x.staat);
      if (k.length) return { vorschlag: "ja", funde: k.map((x) => `${x.staat.name}: ${x.text}`) };
      return f.treffer.konsulat.length ? { vorschlag: "pruefen", funde: texte(f.treffer.konsulat) } : { vorschlag: "nein", funde: [] };
    },
  },
  {
    id: "m6_1_1", gruppe: "melde", norm: "§ 6 Abs. 1 Nr. 1 GwGMeldV-Immobilien",
    titel: `Zahlung mit Bargeld, Kryptowerten, Gold, Platin oder Edelsteinen ab ${euro(SCHWELLE_BAR)} oder über ein Konto in einem Drittstaat, in dem der Zahlende nicht ansässig ist`,
    auto: (f) => {
      const bar = [...f.treffer.bar, ...f.treffer.krypto, ...f.treffer.edelmetall];
      const funde = bar.map((x) => x.text + (x.betrag ? ` [${euro(x.betrag)}]` : ""));
      const dritt = f.treffer.ibans.filter((x) => x.drittstaat);
      funde.push(...dritt.map((x) => `Konto in ${x.land}: ${x.iban} – ist der Zahlende dort ansässig?`));
      if (bar.some((x) => x.betrag == null || x.betrag >= SCHWELLE_BAR)) return { vorschlag: "ja", funde };
      return funde.length ? { vorschlag: "pruefen", funde } : { vorschlag: "nein", funde: [] };
    },
  },
  {
    id: "m6_1_2", gruppe: "melde", norm: "§ 6 Abs. 1 Nr. 2 GwGMeldV-Immobilien",
    titel: "Kaufpreis weicht um mehr als 25 % vom tatsächlichen Verkehrswert ab (ohne offengelegte unentgeltliche Zuwendung, Ausnahmen beachten)",
    hilfe: "Geschätzten Verkehrswert unten eintragen, dann wird die Abweichung berechnet.",
    auto: (f, e) => {
      const wert = e.verkehrswert || f.verkehrswertVertrag;
      const hinweise = [...texte(f.treffer.schenkung)];
      if (!wert || !f.kaufpreis) return { vorschlag: null, funde: hinweise };
      const abw = (f.kaufpreis - wert) / wert;
      const zeile = `Kaufpreis ${euro(f.kaufpreis)}, Verkehrswert ${euro(wert)}: Abweichung ${(abw * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
      if (Math.abs(abw) > 0.25) return { vorschlag: hinweise.length ? "pruefen" : "ja", funde: [zeile, ...hinweise], hinweis: hinweise.length ? "Im Vertrag ist von Schenkung/Zuwendung die Rede; offengelegte unentgeltliche Zuwendungen sind ausgenommen." : "" };
      return { vorschlag: "nein", funde: [zeile] };
    },
  },
  {
    id: "m6_1_3", gruppe: "melde", norm: "§ 6 Abs. 1 Nr. 3 GwGMeldV-Immobilien",
    titel: `Zahlung ganz oder teilweise vor Abschluss des Rechtsgeschäfts von mehr als ${euro(SCHWELLE_VORAUS)} (Ausnahmen beachten)`,
    auto: (f) => {
      const v = f.treffer.vorauszahlung;
      if (!v.length) return { vorschlag: "nein", funde: [] };
      const funde = v.map((x) => x.text + (x.betrag ? ` [${euro(x.betrag)}]` : ""));
      return { vorschlag: v.some((x) => x.betrag > SCHWELLE_VORAUS) ? "ja" : "pruefen", funde };
    },
  },
  {
    id: "m6_1_4", gruppe: "melde", norm: "§ 6 Abs. 1 Nr. 4 GwGMeldV-Immobilien",
    titel: `Zahlung durch oder an eine nicht beteiligte, nicht wirtschaftlich berechtigte Person von mehr als ${euro(SCHWELLE_DRITTE)} (Ausnahmen: Ehegatte/Lebenspartner, Verwandte 1. und 2. Grades, bestimmte Anderkonten)`,
    hilfe: "Zahlungen an abzulösende Grundpfandgläubiger aus der Lastenfreistellung sind übliche Vertragsgestaltung; im Einzelfall prüfen.",
    auto: (f) => {
      const d = f.treffer.dritte;
      if (!d.length) return { vorschlag: "nein", funde: [] };
      return { vorschlag: "pruefen", funde: d.map((x) => x.text + (x.betrag ? ` [${euro(x.betrag)}]` : "")) };
    },
  },
  {
    id: "m6_1_5", gruppe: "melde", norm: "§ 6 Abs. 1 Nr. 5 GwGMeldV-Immobilien",
    titel: "Zahlung soll mehr als ein Jahr nach dem Antrag auf Eintragung ins Grundbuch erfolgen, ohne nachvollziehbaren Grund",
    auto: (f) => {
      const funde = [...texte(f.treffer.ratenSpaet), ...texte(f.treffer.raten)];
      return f.treffer.ratenSpaet.length ? { vorschlag: "pruefen", funde, hinweis: "Fälligkeit mehr als ein Jahr nach Beurkundung erkannt; Grund vermerken." }
        : funde.length ? { vorschlag: "pruefen", funde } : { vorschlag: "nein", funde: [] };
    },
  },
  {
    id: "m6_2", gruppe: "melde", norm: "§ 6 Abs. 2 GwGMeldV-Immobilien",
    titel: "Weiterveräußerung binnen zwei Jahren zu erheblich abweichendem Preis oder Rückveräußerung an den früheren Eigentümer binnen drei Jahren, jeweils ohne nachvollziehbaren Grund",
    hilfe: "Vorerwerb und früheren Kaufpreis unten eintragen, falls nicht erkannt.",
    auto: (f, e) => {
      const datum = e.vorerwerbDatum || f.vorerwerbDatum;
      const jahre = jahreZwischen(datum, f.urkundsdatum || new Date().toISOString().slice(0, 10));
      const vorpreis = e.vorpreis || f.vorpreis;
      if (jahre == null) return { vorschlag: null, funde: [] };
      const funde = [`Vorerwerb ${datum.split("-").reverse().join(".")}, also vor ${jahre.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Jahren`, ...texte(f.treffer.vorerwerb)];
      if (jahre > 3) return { vorschlag: "nein", funde };
      if (jahre <= 2 && vorpreis && f.kaufpreis) {
        const abw = (f.kaufpreis - vorpreis) / vorpreis;
        funde.unshift(`Früherer Kaufpreis ${euro(vorpreis)}, jetzt ${euro(f.kaufpreis)}: ${abw > 0 ? "+" : ""}${(abw * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`);
        return { vorschlag: Math.abs(abw) > 0.25 ? "ja" : "pruefen", funde, hinweis: "„Erheblich“ ist in der Verordnung nicht beziffert; die 25 %-Markierung ist nur eine Orientierung. Nachvollziehbare Gründe (z. B. Sanierung) vermerken." };
      }
      return { vorschlag: "pruefen", funde, hinweis: jahre <= 2 ? "Frühere Gegenleistung vergleichen." : "Nur relevant, wenn an den früheren Eigentümer zurückveräußert wird." };
    },
  },
  {
    id: "m6_3", gruppe: "melde", norm: "§ 6 Abs. 3 GwGMeldV-Immobilien",
    titel: "Gegenleistung über ein Anderkonto (nicht des Notars) ohne berechtigtes Sicherungsinteresse",
    auto: (f) => (f.treffer.anderkonto.length ? { vorschlag: "pruefen", funde: texte(f.treffer.anderkonto) } : { vorschlag: "nein", funde: [] }),
  },
  {
    id: "m6_4", gruppe: "melde", norm: "§ 6 Abs. 4 GwGMeldV-Immobilien, § 16a Abs. 2 GwG",
    titel: "Ein Beteiligter erfüllt eine Nachweispflicht nach dem GwG trotz Aufforderung des Notars nicht (z. B. Nachweis der unbaren Zahlung)",
    auto: () => ({ vorschlag: null, funde: [] }),
  },

  // ---------- Risikofaktoren ----------
  {
    id: "r_pep", gruppe: "risiko", norm: "§ 15 Abs. 3 Nr. 1 GwG",
    titel: "Politisch exponierte Person, Familienmitglied oder bekanntermaßen nahestehende Person beteiligt",
    auto: () => ({ vorschlag: null, funde: [] }),
  },
  {
    id: "r_hrs", gruppe: "risiko", norm: "§ 15 Abs. 3 Nr. 2, Abs. 5 GwG",
    titel: "Beteiligung einer in einem Hochrisikostaat ansässigen Person",
    auto: (f) => {
      const bei = hrStaatenBeiBeteiligten(f);
      return bei.length ? { vorschlag: "ja", funde: bei } : { vorschlag: "nein", funde: [] };
    },
  },
  {
    id: "r_ungewoehnlich", gruppe: "risiko", norm: "§ 15 Abs. 3 Nr. 3 GwG",
    titel: "Transaktion besonders komplex oder ungewöhnlich groß, ungewöhnliches Muster oder ohne offensichtlichen wirtschaftlichen oder rechtmäßigen Zweck",
    auto: (f) => {
      const funde = [];
      if (f.shareDeal) funde.push("Anteilserwerb (Share Deal)");
      if (f.treffer.treuhand.length) funde.push("Treuhandgestaltung");
      if (f.treffer.vorauszahlung.length && f.treffer.dritte.length) funde.push("Vorauszahlung und Zahlung durch Dritte");
      return { vorschlag: funde.length ? "pruefen" : null, funde };
    },
  },
  {
    id: "r_struktur", gruppe: "risiko", norm: "Anlage 2 Nr. 1 GwG",
    titel: "Kundenrisiko: ausländische oder komplexe Gesellschaftsstruktur, Offshore-Sitz, nominelle Anteilseigner, Gesellschaft als Vermögensverwaltung, bargeldintensives Geschäft",
    auto: (f) => {
      const g = gesellschaften(f).filter((p) => p.auslaendisch || p.land?.offshore);
      const off = f.staaten.filter((s) => s.offshore).map((s) => `${s.name}: ${s.text}`);
      const funde = [...g.map((p) => `${p.name}${p.land ? ` (${p.land.name})` : ""}`), ...off];
      return funde.length ? { vorschlag: "ja", funde } : { vorschlag: "nein", funde: [] };
    },
  },
  {
    id: "r_fern", gruppe: "risiko", norm: "Anlage 2 Nr. 2 Buchst. c GwG",
    titel: "Produkt-/Transaktionsrisiko: Beteiligte nicht persönlich anwesend (Vertretung, vollmachtlos Vertretene, Fernbeglaubigung)",
    auto: (f) => {
      const funde = [...texte(f.treffer.vollmachtlos), ...texte(f.treffer.vollmacht)];
      return funde.length ? { vorschlag: "ja", funde } : { vorschlag: "nein", funde: [] };
    },
  },
  {
    id: "r_dritte", gruppe: "risiko", norm: "Anlage 2 Nr. 2 Buchst. d GwG",
    titel: "Zahlungen unbekannter oder nicht verbundener Dritter",
    auto: (f) => (f.treffer.dritte.length ? { vorschlag: "ja", funde: texte(f.treffer.dritte) } : { vorschlag: "nein", funde: [] }),
  },
  {
    id: "r_geo", gruppe: "risiko", norm: "Anlage 2 Nr. 3 GwG",
    titel: "Geografisches Risiko: Bezug zu Drittstaaten mit Mängeln bei der Geldwäschebekämpfung, Korruption, Sanktionen",
    auto: (f) => {
      const funde = [...new Set(f.staaten.filter((s) => s.code !== "DE").map((s) => `${s.name}${s.hochrisiko ? " (Hochrisikostaat)" : ""}${s.sanktionen ? " (Sanktionen)" : ""}`))];
      return funde.length ? { vorschlag: f.staaten.some((s) => s.hochrisiko || s.sanktionen) ? "ja" : "pruefen", funde } : { vorschlag: "nein", funde: [] };
    },
  },
];

export const GRUPPEN = {
  pflicht: { titel: "Pflichten bei jedem Erwerb", werte: [["offen", "offen"], ["erledigt", "erledigt"], ["entfaellt", "entfällt"]] },
  melde: { titel: "Meldepflichtige Sachverhalte (GwGMeldV-Immobilien)", werte: [["offen", "nicht geprüft"], ["nein", "liegt nicht vor"], ["ja", "liegt vor"], ["entkraeftet", "liegt vor, aber entkräftet (§ 7)"]] },
  risiko: { titel: "Risikofaktoren (§ 15 GwG, Anlage 2 GwG)", werte: [["offen", "nicht geprüft"], ["nein", "nein"], ["ja", "ja"]] },
};

// Aus dem Vorschlag den Anfangswert der Auswahl ableiten
export function startwert(punkt, vorschlag) {
  if (punkt.gruppe === "pflicht") return vorschlag === "nein" ? "entfaellt" : "offen";
  if (vorschlag === "ja") return "ja";
  if (vorschlag === "nein") return "nein";
  return "offen";
}

// Positives (risikominderndes) aus dem Vertrag, nur zur Information
export function entlastend(f) {
  const liste = [];
  if (f.treffer.finanzierung.length) liste.push("Finanzierung über ein Kreditinstitut vorgesehen (Finanzierungsgrundschuld/Belastungsvollmacht)");
  if (f.treffer.notaranderkonto.length) liste.push("Kaufpreiszahlung über Notaranderkonto");
  if (f.treffer.klausel16a.length) liste.push("Vertrag enthält Hinweis auf das Barzahlungsverbot (§ 16a GwG)");
  if (f.treffer.ibans.length && f.treffer.ibans.every((x) => !x.drittstaat)) liste.push("Nur Konten in EU/EWR-Staaten genannt");
  if (vertragsparteien(f).length && vertragsparteien(f).every((p) => p.art === "Person" && !p.land && !p.vertreten)) liste.push("Nur natürliche Personen ohne erkennbaren Auslandsbezug, persönlich anwesend");
  return liste;
}

// Gesamtergebnis aus den Werten der Auswahl: { stufe: "rot"|"orange"|"gelb"|"gruen", titel, text }
export function gesamt(werte) {
  const p = (g, w) => PUNKTE.filter((x) => x.gruppe === g && werte[x.id]?.wert === w);
  const melde = p("melde", "ja");
  const entkraeftet = p("melde", "entkraeftet");
  const risiko = p("risiko", "ja");
  const offen = [...p("melde", "offen"), ...p("risiko", "offen")];
  const pflichtOffen = p("pflicht", "offen");
  if (melde.length) {
    return {
      stufe: "rot", titel: "Meldepflichtiger Sachverhalt angekreuzt",
      text: `Für ${melde.length === 1 ? "den angekreuzten Sachverhalt" : `die ${melde.length} angekreuzten Sachverhalte`} besteht nach § 43 Abs. 1 GwG i. V. m. der GwGMeldV-Immobilien eine Meldepflicht an die FIU (goAML), es sei denn, Tatsachen entkräften den Verdacht (§ 7 GwGMeldV-Immobilien; dann die Gründe aufzeichnen). Den Eintragungsantrag erst stellen, wenn die Meldung erfolgt ist und § 46 GwG nicht entgegensteht (§ 16a Abs. 3 Nr. 2 GwG). Den Beteiligten die Meldung nicht mitteilen (§ 47 GwG).`,
    };
  }
  if (risiko.length) {
    return {
      stufe: "orange", titel: "Erhöhtes Risiko",
      text: "Mindestens ein Risikofaktor liegt vor. Verstärkte Sorgfaltspflichten nach § 15 GwG erfüllen (insbesondere Herkunft der Vermögenswerte klären, Zustimmung einer Führungsebene, verstärkte Überwachung) und dokumentieren."
        + (entkraeftet.length ? " Entkräftete Sachverhalte sind mit Begründung aufzuzeichnen (§ 7 GwGMeldV-Immobilien, § 8 Abs. 1 Satz 1 Nr. 5 GwG)." : ""),
    };
  }
  if (offen.length || pflichtOffen.length) {
    return {
      stufe: "gelb", titel: "Prüfung noch nicht abgeschlossen",
      text: `Noch offen: ${offen.length} Prüfpunkt(e) und ${pflichtOffen.length} Pflicht(en). Bisher keine meldepflichtigen Sachverhalte und keine Risikofaktoren angekreuzt.`,
    };
  }
  return {
    stufe: "gruen", titel: "Keine Auffälligkeiten",
    text: "Keine meldepflichtigen Sachverhalte und keine erhöhten Risikofaktoren festgestellt. Allgemeine Sorgfaltspflichten (§ 10 GwG) und das Barzahlungsverbot (§ 16a GwG) bleiben zu beachten."
      + (entkraeftet.length ? " Entkräftete Sachverhalte sind mit Begründung aufgezeichnet (§ 7 GwGMeldV-Immobilien)." : ""),
  };
}
