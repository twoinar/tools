// Liest die Daten einer Erbausschlagung aus dem Text der PDF-Urkunde.
// Läuft vollständig im Browser. Was nicht sicher erkannt wird, bleibt leer.

const MONATE = {
  januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7,
  august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};

const DATUM = String.raw`\d{1,2}\.\s?\d{1,2}\.\s?\d{4}`;
const DATUM_LANG = String.raw`\d{1,2}\.\s*[A-Za-zäÄ]+\s+\d{4}`;
const NAME = String.raw`[A-ZÄÖÜ][\wäöüßÄÖÜ\- ]+?`;

export function glaetten(text) {
  return text
    .replace(/\r/g, "")
    .replace(/_x000b_|\v/g, "\n")
    // Silbentrennung am Zeilenende: "Muster-\nfrau" -> "Musterfrau"
    .replace(/([\wäöüß])-\n([\wäöüß])/g, "$1$2")
    .replace(/[ \t]*\n[ \t]*/g, " ")
    .replace(/\s{2,}/g, " ")
    // Texterkennungsfehler "Kind l" -> "Kind 1"
    .replace(/\bKind [lI|](?=[\s:])/g, "Kind 1");
}

export function datumIso(s) {
  if (!s) return "";
  s = s.trim();
  let m = s.match(/^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\.\s*([A-Za-zäÄ]+)\s+(\d{4})$/);
  if (m && MONATE[m[2].toLowerCase()]) {
    return `${m[3]}-${String(MONATE[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return "";
}

function nameTeilen(name) {
  const teile = name.trim().split(/\s+/);
  if (teile.length < 2) return ["", name.trim()];
  return [teile.slice(0, -1).join(" "), teile[teile.length - 1]];
}

function person(name, { geburtsdatum = "", geburtsname = "", anschrift = "", anrede = "" } = {}) {
  const [vorname, nachname] = nameTeilen(name);
  const p = {
    anrede: anrede.startsWith("Herr") ? "Herr" : anrede,
    vorname, nachname, geburtsname, geburtsdatum, strasse: "", plz: "", ort: "",
  };
  const m = anschrift.trim().match(/^(\d{5})\s+(.+?),\s*(.+)$/);
  if (m) [, p.plz, p.ort, p.strasse] = m;
  return p;
}

export function auslesen(roh) {
  const t = glaetten(roh);
  const d = {
    uvz_nr: "", uvz_jahr: "", urkundsdatum: "", notar: "", erblasser: null,
    gericht_aktenzeichen: "", gericht_ort: "",
    sterbedatum_von: "", sterbedatum_bis: "", sterbeort: "", letzter_wohnort: "",
    ausschlagende: [], kinder: [], unsicher: [],
  };

  let m = t.match(/UVZ\.?-?\s*Nr\.?:?\s*(\d+)\s*(?:für|\/|-)\s*(\d{4})/);
  if (m) [, d.uvz_nr, d.uvz_jahr] = m; else d.unsicher.push("UVZ-Nummer");

  // Aktenzeichen und Gericht, falls das Nachlassgericht schon geschrieben hat
  m = t.match(/Az\.?\s*(?:des\s+)?Nachlassgerichts:?\s*(.+?)\s+(?=UVZ|Ausschlagung)/);
  if (m) d.gericht_aktenzeichen = m[1].trim();
  m = t.match(/Schreiben des Amtsgerichts? (.+?) vom/);
  if (m) d.gericht_ort = m[1].trim();

  // Erblasser: mehrere übliche Formulierungen, die erste passende gewinnt
  const VOR = String.raw`(?:(?:meine[mrns]?|unsere[mrns]?|seine[mrns]?|ihre[mrns]?) [A-ZÄÖÜ][a-zäöüß]+,? )?(?:(?:de[mr]|des) )?(?:(?:am [^ ]+ )?(?:verstorbenen|verst\.) )?(?:(?:Herrn?|Frau) )?`;
  const GEB = String.raw`(?:,? geb(?:\.|orene|oren)? (${NAME}))?`;
  const ERBLASSER = [
    `(?:Mit|Allein|Vor|Nach)?[Ee]rb(?:e|in|en) nach ${VOR}(${NAME})${GEB},?\\s+(?:geworden|bin|sei|ist|bzw|gemäß|nach|auf|aus|geboren|verstorben|zuletzt|wohnhaft)`,
    `[Ee]rbschaft nach ${VOR}(${NAME})${GEB},?\\s+(?:aus\\b|aus sämtlichen|aus allen|als|und|für)`,
    `Nachlass(?:sache)? ${VOR}(${NAME})${GEB},?\\s+(?:geboren|verstorben|zuletzt|ist|war|bin|als)`,
    `(?:Erblasser|Erblasserin|Verstorbene[rn]?)(?: ist| war|:)? ${VOR}(${NAME})${GEB},?\\s+(?:geboren|verstorben|zuletzt|ist|war|am)`,
  ];
  for (const muster of ERBLASSER) {
    m = t.match(new RegExp(muster));
    if (m) break;
  }
  if (m) {
    const umfeld = t.slice(m.index, m.index + m[0].length + 120);
    const g = umfeld.match(new RegExp(`geboren am (${DATUM_LANG}|${DATUM})`))
      || t.match(new RegExp(`Erblasser(?:in)?,?(?: ist| war)? geboren am (${DATUM_LANG}|${DATUM})`));
    d.erblasser = person(m[1], { geburtsname: m[2] || "", geburtsdatum: g ? datumIso(g[1]) : "" });
    if (!g) d.unsicher.push("Geburtsdatum Erblasser");
  } else {
    d.unsicher.push("Erblasser");
  }

  // Sterbedatum und -ort
  const ORT = String.raw`([A-ZÄÖÜ][^,.;]*?)`;
  if ((m = t.match(new RegExp(`zwischen dem (${DATUM}) und (?:dem )?(${DATUM}) in ${ORT} (?:verstorben|gestorben)`)))) {
    d.sterbedatum_von = datumIso(m[1]); d.sterbedatum_bis = datumIso(m[2]); d.sterbeort = m[3].trim();
  } else if ((m = t.match(new RegExp(`(?:am )?(${DATUM}|${DATUM_LANG}) in ${ORT} (?:verstorben|gestorben|verstarb)`)))
    || (m = t.match(new RegExp(`(?:verstorben|gestorben|verstarb|Sterbedatum:?)(?: am)? (${DATUM}|${DATUM_LANG})(?: in ${ORT}(?=[,.;]| und| zuletzt| wohnhaft))?`)))) {
    d.sterbedatum_von = d.sterbedatum_bis = datumIso(m[1]); d.sterbeort = (m[2] || "").trim();
  } else if ((m = t.match(new RegExp(`(${DATUM}|${DATUM_LANG}),? (?:verstarb|starb)(?: in ${ORT}(?=[,.;]| meine| mein| unser| der| die| Herr| Frau))?`)))) {
    d.sterbedatum_von = d.sterbedatum_bis = datumIso(m[1]); d.sterbeort = (m[2] || "").trim();
  } else if ((m = t.match(new RegExp(`am (${DATUM}|${DATUM_LANG}) (?:verstorben|gestorben)`)))) {
    d.sterbedatum_von = d.sterbedatum_bis = datumIso(m[1]);
  } else {
    d.unsicher.push("Sterbedatum/-ort");
  }

  // Letzter Wohnort
  m = t.match(new RegExp(`zuletzt (?:wohnhaft )?in ${ORT}(?: wohnhaft| gewohnt| gemeldet|,| und|\\.)`))
    || t.match(new RegExp(`(?:mit |seinem |ihrem )?letzte[mnr]? (?:gewöhnliche[mnr]? )?(?:Aufenthalt|Wohnsitz|Wohnort) in ${ORT}(?= verstorben|,|\\.| und|$)`))
    || t.match(new RegExp(`letzte[rn]? (?:gewöhnliche[rn]? )?(?:Wohnsitz|Wohnort|Aufenthalt)(?:es|s)?:? (?:war )?(?:in )?${ORT}(?=[,.;]| und|$)`));
  if (m) {
    d.letzter_wohnort = m[1].trim().replace(/^\d{5}\s+/, "");
  } else {
    d.unsicher.push("letzter Wohnort");
  }

  // Beglaubigungsvermerk: Name, Geburtsdatum, Anschrift der Unterzeichner
  const vermerk = {};
  const reVermerk = new RegExp(
    `(Frau|Herrn?) (${NAME}), geboren am (${DATUM_LANG}|${DATUM}), Anschrift: ([^,]+?,[^,]+?),?(?= Frau| Herrn?| jeweils| ausgewiesen| wird| werden|$)`, "g");
  for (const v of t.matchAll(reVermerk)) vermerk[v[2].trim()] = [datumIso(v[3]), v[4].trim(), v[1]];

  // Ausschlagende: "Hiermit schlage ich, Frau/Herr <Name> die Erbschaft / für ..."
  const gesehen = new Set();
  for (const a of t.matchAll(new RegExp(`schlagen? (?:ich|wir),? (Frau|Herrn?) (${NAME}),? (?:die Erbschaft|für|hiermit|als|und|aus)`, "g"))) {
    const name = a[2].trim();
    if (gesehen.has(name)) continue;
    gesehen.add(name);
    const [geb, anschrift] = vermerk[name] || ["", ""];
    d.ausschlagende.push(person(name, { geburtsdatum: geb, anschrift, anrede: a[1] }));
    if (!geb) d.unsicher.push(`Geburtsdatum/Anschrift ${name}`);
  }
  // „Hiermit schlage ich, die Unterzeichnende …“: Namen aus dem Beglaubigungsvermerk
  if (!d.ausschlagende.length) {
    for (const [name, [geb, anschrift, anrede]] of Object.entries(vermerk)) {
      d.ausschlagende.push(person(name, { geburtsdatum: geb, anschrift, anrede }));
    }
  }
  if (!d.ausschlagende.length) d.unsicher.push("Ausschlagende");

  // Minderjährige Kinder: nur die vor der Erklärung der Eltern aufgezählten
  const eltern = t.search(/für die vorgenannten minderjährigen Kinder/);
  if (eltern >= 0) {
    for (const k of t.slice(0, eltern).matchAll(new RegExp(`Kind (\\d+): (${NAME}), geboren am (${DATUM})`, "g"))) {
      d.kinder.push(person(k[2], { geburtsdatum: datumIso(k[3]) }));
    }
  }

  m = t.match(new RegExp(`, (?:den )?(${DATUM_LANG})`)) || t.match(new RegExp(`[a-z)], (?:den )?(${DATUM})(?![\\d.])`));
  if (m) d.urkundsdatum = datumIso(m[1]);

  m = t.match(/([A-ZÄÖÜ][A-Za-zäöüßÄÖÜ\- ]+?), (Notar(?:assessor)?|Notarin)\b/);
  if (m) d.notar = `${m[1].trim()}, ${m[2]}`;

  kopfangaben(t, d, vermerk);
  if (!d.gericht_ort) d.unsicher.push("Nachlassgericht (steht nicht in der Urkunde)");
  return d;
}

// Kopfzeilen, die das Büro oben in die Urkunde schreibt. Sie haben Vorrang vor dem Fließtext:
//   Erblasser: Vorname Nachname, geb. Geburtsname, geboren am TT.MM.JJJJ
//   Ausschlagende: Vorname Nachname; Vorname Nachname
//   Nachlassgericht: Amtsgericht Ort, Az. 61 VI 123/26
const KOPF_ENDE = String.raw`(?=\s(?:Erblasser(?:in)?|Ausschlagende(?: Personen)?|Nachlassgericht|Az\.? des|UVZ\.?-?\s*Nr|Ausschlagung einer)\b|$)`;

function kopf(t, wort) {
  const m = t.match(new RegExp(`(?:^|\\s)${wort}\\s*:\\s*(.+?)${KOPF_ENDE}`));
  return m ? m[1].trim().replace(/[,;]$/, "") : "";
}

function ohne(d, ...eintraege) {
  d.unsicher = d.unsicher.filter((u) => !eintraege.some((e) => u.startsWith(e)));
}

function kopfangaben(t, d, vermerk) {
  const e = kopf(t, "Erblasser(?:in)?");
  if (e) {
    const name = e.split(",")[0].trim();
    const gebName = e.match(new RegExp(`geb(?:\\.|orene|oren)? (${NAME})(?:,|$)`));
    const gebDatum = e.match(new RegExp(`geboren am (${DATUM_LANG}|${DATUM})`));
    d.erblasser = person(name, {
      geburtsname: gebName ? gebName[1].trim() : (d.erblasser?.geburtsname || ""),
      geburtsdatum: gebDatum ? datumIso(gebDatum[1]) : (d.erblasser?.geburtsdatum || ""),
    });
    ohne(d, "Erblasser");
    if (!d.erblasser.geburtsdatum) d.unsicher.push("Geburtsdatum Erblasser");
    const ans = e.match(/Anschrift:?\s*\d{5}\s+([^,]+)/);
    if (ans && !d.letzter_wohnort) {
      d.letzter_wohnort = ans[1].trim();
      ohne(d, "letzter Wohnort");
    }
  }

  const a = kopf(t, "Ausschlagende(?: Personen)?");
  if (a) {
    d.ausschlagende = a.split(/\s*;\s*|\s+und\s+/).filter(Boolean).map((roh) => {
      const anrede = (roh.match(/^(Frau|Herrn?)\s+/) || [, ""])[1];
      const name = roh.replace(/^(Frau|Herrn?)\s+/, "").split(",")[0].trim();
      const [geb, anschrift, anredeV] = vermerk[name] || ["", "", ""];
      return person(name, { geburtsdatum: geb, anschrift, anrede: anrede || anredeV || "" });
    });
    ohne(d, "Ausschlagende", "Geburtsdatum/Anschrift");
    for (const p of d.ausschlagende) if (!p.plz) d.unsicher.push(`Geburtsdatum/Anschrift ${p.vorname} ${p.nachname}`);
  }

  const g = kopf(t, "Nachlassgericht");
  if (g) {
    const az = g.match(/,?\s*(?:Az\.?|Aktenzeichen):?\s*(.+)$/);
    if (az) d.gericht_aktenzeichen = az[1].trim();
    d.gericht_ort = g.replace(/,?\s*(?:Az\.?|Aktenzeichen):?.*$/, "").replace(/^(?:Amtsgericht|AG)\s+/, "").trim();
  }
}
