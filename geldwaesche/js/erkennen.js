// Liest aus dem Text eines Kaufvertrags die für das GwG wichtigen Angaben aus.
// Regelbasiert, läuft vollständig im Browser. Jede Erkennung bringt ihre Fundstelle mit,
// damit der Notar sie im Vertrag nachprüfen kann. Nichts wird abschließend entschieden.

import { staatenFinden, EU_EWR, landZuCode, hochrisikoListe } from "./staaten.js";

const MONATE = {
  januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7,
  august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};
const DATUM = String.raw`\d{1,2}\.\s?\d{1,2}\.\s?\d{4}|\d{1,2}\.\s*(?:Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+\d{4}`;
const BETRAG = String.raw`(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,(\d{2}|-{1,2}|–))?`;
const WAEHRUNG = String.raw`(?:EUR|Euro|€)`;
// Verneinungen, mit denen Verträge das Barzahlungsverbot wiedergeben
const VERNEINT = /\b(nicht|kein\w*|ausgeschlossen|unzulässig|verboten|untersagt|unbar\w*|weder|darf nur|ausschließlich durch Überweisung|§\s*16a)\b/i;

export function glaetten(text) {
  return text
    .replace(/\r/g, "")
    .replace(/ /g, " ")
    .replace(/_x000b_|\v/g, "\n")
    .replace(/([a-zäöüß])-\n([a-zäöüß])/g, "$1$2")
    .replace(/[ \t]*\n[ \t]*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
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

export function betragZahl(ganz) {
  return Number(String(ganz).replace(/[.\s]/g, ""));
}

export function euro(n) {
  if (n == null || Number.isNaN(n)) return "";
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

// Textausschnitt um eine Fundstelle, an Wortgrenzen gekürzt
export function ausschnitt(t, index, laenge = 0, rand = 110) {
  let a = Math.max(0, index - rand), b = Math.min(t.length, index + laenge + rand);
  while (a > 0 && t[a - 1] !== " ") a--;
  while (b < t.length && t[b] !== " ") b++;
  return (a > 0 ? "… " : "") + t.slice(a, b).trim() + (b < t.length ? " …" : "");
}

// Der Satz, in dem eine Fundstelle steht (für die Prüfung auf Verneinung)
function satz(t, index) {
  const ende = /[.;:!?]\s+(?=[A-ZÄÖÜ§(])/g;
  let a = 0, b = t.length, m;
  while ((m = ende.exec(t))) {
    // Abkürzungen wie "Nr.", "geb.", "z. B." beenden keinen Satz
    const wort = t.slice(0, m.index).match(/(\S+)$/)?.[1] || "";
    if (/^(Nr|geb|bzw|z|B|ggf|Abs|S|Art|Dr|Str|vgl|u|a|i|V|d|h|ca|inkl|zzgl|evtl|Prof|Hr|Fr|Flst|lfd)$/i.test(wort) || /^\d+$/.test(wort)) continue;
    if (m.index < index) a = m.index + m[0].length;
    else { b = m.index + 1; break; }
  }
  return { text: t.slice(a, b), start: a };
}

// Steht in der Nähe der Fundstelle (im selben Satz) eine Verneinung? z. B. "darf nicht in bar", "Anderkonto erfolgt nicht"
function verneint(t, index, laenge, danach) {
  const { text, start } = satz(t, index);
  const von = Math.max(0, index - start - 60);
  const bis = index - start + laenge + danach;
  return VERNEINT.test(text.slice(von, bis));
}

function alleTreffer(t, re, { verneinungPruefen = false } = {}) {
  const liste = [];
  for (const m of t.matchAll(re)) {
    if (verneinungPruefen && verneint(t, m.index, m[0].length, verneinungPruefen === "davor" ? 0 : 45)) continue;
    // Treffer dicht hintereinander zeigen denselben Ausschnitt: nur einmal aufführen
    if (liste.length && m.index - liste[liste.length - 1].index < 100) continue;
    liste.push({ index: m.index, wort: m[0], text: ausschnitt(t, m.index, m[0].length), m });
  }
  return liste;
}

// Der Betrag im selben Satz, der der Fundstelle am nächsten steht
function betragImSatz(t, index) {
  const { text, start } = satz(t, index);
  const re = new RegExp(`(?:${WAEHRUNG}\\s*${BETRAG})|(?:${BETRAG}\\s*${WAEHRUNG})`, "g");
  let best = null;
  for (const m of text.matchAll(re)) {
    const abstand = Math.abs(start + m.index - index);
    if (!best || abstand < best.abstand) best = { abstand, wert: betragZahl(m[1] || m[3]) };
  }
  return best ? best.wert : null;
}

// ---------- Beteiligte ----------

const RECHTSFORMEN_IN = String.raw`GmbH\s*&\s*Co\.\s*KG|gGmbH|GmbH|UG\s*\(haftungsbeschränkt\)|AG|SE|KGaA|KG|OHG|GbR|eG|e\.\s?V\.|Stiftung|Partnerschaftsgesellschaft|PartG(?:\s?mbB)?`;
const RECHTSFORMEN_AUS = String.raw`Ltd\.?|Limited|LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|S\.A\.|S\.à\s?r\.l\.|SARL|S\.r\.l\.|B\.V\.|N\.V\.|sp\.\s?z\s?o\.\s?o\.|s\.r\.o\.|a\.s\.|LLP|PLC|plc|FZE|FZCO|FZ-LLC|Trust|Foundation|Anstalt|OOO|ООО`;
const AUSLAENDISCH = new RegExp(`^(?:${RECHTSFORMEN_AUS})$`);
// Rechtsformen aus EU-Staaten: ausländisch, aber kein Drittstaat
const EU_FORMEN = /^(S\.à\s?r\.l\.|SARL|S\.r\.l\.|B\.V\.|N\.V\.|sp\.\s?z\s?o\.\s?o\.|s\.r\.o\.|a\.s\.)$/;

function erschienenenTeil(t) {
  // Bis zum Beginn der Erklärungen; sonst die ersten 4000 Zeichen
  const ende = t.search(/(?:Die Erschienenen (?:erklärten|baten|ließen)|§\s*1\b|I\.\s*Grundbuchstand|Vorbemerkung|Grundbuch- und Sachstand|A\.\s*Grundbuchstand)/);
  return t.slice(0, ende > 200 ? ende : Math.min(t.length, 4000));
}

function rolleMarken(teil) {
  const re = /(?:nachstehend|nachfolgend|im Folgenden|im folgenden|hier|künftig)[^.;]{0,60}?[„"»‚']?\s?(Verkäufer|Veräußerer|Käufer|Erwerber)/g;
  return [...teil.matchAll(re)].map((m) => ({ index: m.index, rolle: /^(Verkäufer|Veräußerer)/.test(m[1]) ? "Verkäufer" : "Käufer" }));
}

function landAus(textstueck) {
  const st = staatenFinden(textstueck);
  if (st.length) return st[0];
  return null;
}

export function beteiligteFinden(t) {
  const teil = erschienenenTeil(t);
  const marken = rolleMarken(teil);
  const rolleFuer = (i) => marken.find((m) => m.index > i)?.rolle || "";
  const liste = [];

  const PERSON = /(?<!Notar(?:in)?\s|Notarvertreter(?:in)?\s|Notariatsangestellte[rn]?\s|Dolmetscher(?:in)?\s)(Herr|Frau)\s+((?:Dr\.\s+|Prof\.\s+)*[A-ZÄÖÜ][\wäöüß\-]+(?:\s+(?:von\s+|van\s+|de\s+)?[A-ZÄÖÜ][\wäöüß\-]+){1,3})/g;
  for (const m of teil.matchAll(PERSON)) {
    const nach = teil.slice(m.index, m.index + 600);
    // Notar und Mitarbeiter gehören nicht zu den Beteiligten
    if (/^(Herr|Frau)\s+\S+(?:\s+\S+)?,?\s+(Notar|Notarin|Notarvertreter)/.test(nach)) continue;
    if (liste.some((p) => p.name === m[2])) continue;
    const bis = nach.slice(20).search(/(?:\b(?:Herr|Frau)\s+[A-ZÄÖÜ]|\b\d\.\s+(?:Herr|Frau|die|der|Die|Der)\b)/);
    const eigen = bis > 0 ? nach.slice(0, bis + 20) : nach;
    const p = {
      art: "Person", name: m[2], anrede: m[1], rolle: rolleFuer(m.index),
      geburtsdatum: datumIso(eigen.match(new RegExp(`geb(?:oren|\\.)?\\s+am\\s+(${DATUM})`))?.[1] || ""),
      wohnort: (eigen.match(/wohnhaft(?:\s+in)?:?\s+([^;]+?)(?=,\s*(?:(?:beide\s+)?ausgewiesen|dem Notar|von Person|handelnd|nach|geb|[a-zäöüß\-]+e[rn]?\s+Staatsangehörig)|;|\s[-–]\s|$)/)?.[1] || "").trim().slice(0, 120),
      staatsangehoerigkeit: (eigen.match(/([a-zäöüß\-]+?)e[rn]?\s+Staatsangehörig(?:e[rn]?|keit)\b|Staatsangehörigkeit:?\s+([a-zäöüßA-ZÄÖÜ\-]+)|(?:Staatsangehörige[rn]?|Staatsbürger(?:in)?)\s+(?:von\s+|der\s+|des\s+)?([A-ZÄÖÜ][\wäöüß\-]+)/) || []).slice(1).find(Boolean) || "",
      ausweis: (eigen.match(/(Reisepass|Personalausweis|Aufenthaltstitel|Identitätskarte|ID-Karte)[^,;]{0,60}/)?.[0] || "").trim(),
      vertreten: /handelnd\s+(?:nicht\s+im eigenen Namen|aufgrund|auf Grund|kraft|als\s+(?:Bevollmächtigte|Vertreter))|als vollmachtlose|vollmachtlos/i.test(eigen),
      index: m.index, fund: ausschnitt(teil, m.index, m[0].length, 60),
    };
    // Wer nur für eine Gesellschaft handelt (Geschäftsführer), ist Vertreter, nicht Partei
    p.organ = /\bals\s+(?:alleinvertretungsberechtigte[rn]?\s+|einzelvertretungsberechtigte[rn]?\s+|gesamtvertretungsberechtigte[rn]?\s+)?(Geschäftsführer|Vorstand|Prokurist|Liquidator|Director|Managing Director|persönlich haftende)/i.test(eigen);
    const land = landAus(`${p.wohnort} ${p.staatsangehoerigkeit} ${p.ausweis}`);
    p.land = land ? { code: land.code, name: land.name, hochrisiko: land.hochrisiko, offshore: land.offshore } : null;
    liste.push(p);
  }

  const FIRMA = new RegExp(`((?:[A-ZÄÖÜ0-9][\\w&äöüßÄÖÜ.'\\-]*\\s+){1,6}?)(${RECHTSFORMEN_IN}|${RECHTSFORMEN_AUS})(?![\\wäöüß])`, "g");
  for (const m of teil.matchAll(FIRMA)) {
    let name = (m[1] + m[2]).replace(/^(?:(?:Die|die|Der|der|Firma|für|Für|die Firma|als|Geschäftsführer|Geschäftsführerin|der|Vertreter|von)\s+)+/, "").trim();
    if (name.split(/\s+/).length < 2) continue;
    if (/^(Amtsgericht|Handelsregister|Registergericht|Notar)/.test(name)) continue;
    if (liste.some((p) => p.name === name)) continue;
    const nach = teil.slice(m.index, m.index + 400);
    const sitz = (nach.match(/(?:mit\s+(?:dem\s+)?(?:Sitz|Geschäftsanschrift|Satzungssitz)\s+in|registered\s+(?:office|in)|eingetragen\s+in)\s+([^,;]+)/)?.[1] || "").trim().slice(0, 80);
    const register = (nach.match(/(?:Amtsgericht|Registergericht)\s+[A-ZÄÖÜ][^,;]*?\s+(?:unter\s+)?(?:HR[AB]|GnR|PR|VR|GsR)\s*\d+\s*[A-Z]*|Companies House[^,;]*|Registernummer[^,;]*|KRS[^,;]*/)?.[0] || "").trim();
    const land = landAus(sitz) || (/Companies House/.test(register) ? landZuCode("GB") : null);
    const auslaendisch = AUSLAENDISCH.test(m[2]) || (land && land.code !== "DE");
    const p = {
      art: "Gesellschaft", name, rechtsform: m[2], rolle: rolleFuer(m.index), sitz, register,
      auslaendisch: !!auslaendisch,
      drittstaat: !!auslaendisch && !(EU_FORMEN.test(m[2]) && !land) && !(land && EU_EWR.has(land.code)),
      land: land ? { code: land.code, name: land.name, hochrisiko: land.hochrisiko, offshore: land.offshore } : null,
      index: m.index, fund: ausschnitt(teil, m.index, m[0].length, 60),
    };
    liste.push(p);
  }
  return liste.sort((a, b) => a.index - b.index);
}

// ---------- Gesamtauswertung ----------

export function erkennen(roh) {
  const t = glaetten(roh);
  const f = { text: t, treffer: {}, unsicher: [] };
  const treffer = (name, re, opt) => (f.treffer[name] = alleTreffer(t, re, opt));

  let m = t.match(/(?:UVZ|UR|URNr|UR-Nr|Urkundenrolle)[.\- ]*(?:Nr\.?|Nummer)?\s*:?\s*(\d+)\s*(?:\/|für|-)\s*(\d{4})/i);
  f.uvz = m ? `${m[1]}/${m[2]}` : "";
  m = t.match(new RegExp(`(?:Verhandelt|Geschehen|Beurkundet)[^.]{0,80}?(?:am|den)\\s+(${DATUM})`)) || t.match(new RegExp(`\\b(?:am|den)\\s+(${DATUM})`));
  f.urkundsdatum = m ? datumIso(m[1]) : "";
  f.vertragsart = (t.match(/\b(Grundstückskaufvertrag|Kaufvertrag über (?:Wohnungs|Teil)eigentum|Wohnungseigentumskaufvertrag|Kaufvertrag|Geschäftsanteilskaufvertrag|Anteilskaufvertrag|Tauschvertrag|Überlassungsvertrag|Erbbaurechtskaufvertrag)\b/)?.[1] || "");
  f.shareDeal = /Geschäftsanteil|Anteilskauf|Kommanditanteil|Gesellschaftsanteil/i.test(t);

  // Objekt
  m = t.match(/Grundbuch\s+(?:von|des Amtsgerichts)\s+([A-ZÄÖÜ][^,;]{1,40}?)\s*,?\s*Blatt\s+(\d+)/);
  f.grundbuch = m ? `${m[1].trim()} Blatt ${m[2]}` : "";
  const flur = t.match(/Gemarkung\s+([A-ZÄÖÜ][^,;]{1,40}?),?\s*Flur\s+(\d+),?\s*Flurstück(?:e)?\s+([\d\/, und]+\d)/);
  f.flurstueck = flur ? `Gemarkung ${flur[1].trim()}, Flur ${flur[2]}, Flurstück ${flur[3].trim()}` : "";
  f.objektart = /Wohnungseigentum|Wohnungsgrundbuch|Teileigentum|Miteigentumsanteil.{0,80}Sondereigentum/i.test(t) ? "Wohnungs-/Teileigentum"
    : /Erbbaurecht/i.test(t) ? "Erbbaurecht" : f.shareDeal ? "Gesellschaftsanteile" : f.grundbuch || f.flurstueck ? "Grundstück" : "";
  f.lage = (t.match(/(?:belegen|gelegen|Lage|Anschrift)\s*:?\s*(?:in\s+)?([A-ZÄÖÜ][\wäöüß.\- ]+(?:straße|str\.|weg|allee|platz|ring|gasse|damm|ufer|chaussee)\s*\d+\s*[a-z]?,\s*\d{5}\s+[A-ZÄÖÜ][^,;.]+)/i)?.[1] || "").trim();

  // Kaufpreis
  m = t.match(new RegExp(`(?:Der\\s+)?(?:Kaufpreis|Gegenleistung|Tauschwert)(?:\\s+für\\s+[^.]{0,60}?)?\\s*(?:beträgt|in Höhe von|von|:|wird vereinbart mit|ist)\\s*(?:insgesamt\\s+|pauschal\\s+)?(?:${WAEHRUNG}\\s*${BETRAG}|${BETRAG}\\s*${WAEHRUNG})`, "i"));
  f.kaufpreis = m ? betragZahl(m[1] || m[3]) : null;
  if (!f.kaufpreis) f.unsicher.push("Kaufpreis");
  f.kaufpreisFund = m ? ausschnitt(t, m.index, m[0].length) : "";

  // Zahlungsweise
  treffer("bar", /\b(?:in bar|Barzahlung|bar\s+(?:zu\s+)?(?:zahlen|gezahlt|bezahlt|übergeben|entrichtet|ausgehändigt|geleistet)|Bargeld|Barbetrag|Banknoten)\b/gi, { verneinungPruefen: true });
  f.treffer.bar.forEach((x) => (x.betrag = betragImSatz(t, x.index)));
  treffer("krypto", /\b(?:Bitcoin|BTC|Ether(?:eum)?|Kryptow\w*|Kryptowährung\w*|Krypto-\w+|Stablecoin\w*|USDT|Tether|Wallet-Adresse|Wallet)\b/gi, { verneinungPruefen: true });
  treffer("edelmetall", /\b(?:Gold(?:barren|münzen)?|Feingold|Platin|Edelstein\w*|Diamant\w*)(?![\wäöüß])/g, { verneinungPruefen: true });
  treffer("klausel16a", /§\s*16a\s*(?:GwG|Geldwäschegesetz|des Geldwäschegesetzes)?|Barzahlungsverbot|nicht\s+in\s+bar|unbar/gi);
  treffer("notaranderkonto", /Notaranderkonto|Anderkonto\s+des\s+(?:amtierenden\s+|beurkundenden\s+)?Notars|notarielle[ns]?\s+Verwahrung|Verwahrungsanweisung/gi, { verneinungPruefen: true });
  f.treffer.anderkonto = alleTreffer(t, /\b(?:Rechtsanwalts|Treuhand|Makler|Anwalts)?[Aa]nderkonto\b|\bTreuhandkonto\b|\bEscrow\b/g, { verneinungPruefen: true })
    .filter((x) => !/Notar/i.test(t.slice(Math.max(0, x.index - 40), x.index + x.wort.length + 30)));
  treffer("vorauszahlung", /\b(?:bereits|vorab|im Voraus|vor (?:der |dieser )?Beurkundung|vor Vertragsschluss)\b[^.;]{0,80}?\b(?:gezahlt|bezahlt|geleistet|erhalten|überwiesen|entrichtet)\b|\bAnzahlung\b|\b(?:quittiert|Empfang bestätigt|Erhalt\b[^.;]{0,40}\bbestätigt)/gi, { verneinungPruefen: true });
  f.treffer.vorauszahlung.forEach((x) => (x.betrag = betragImSatz(t, x.index)));
  treffer("dritte", /\b(?:durch|von)\s+(?:einen|einem|eine[rn]?)?\s*Dritte[nr]?\b|für Rechnung des Käufers|anstelle des Käufers|im Auftrag des Käufers|Abtretung des Kaufpreis\w*|Kaufpreis\w*\s+(?:wird\s+)?(?:von|durch)\s+(?:Herrn|Frau|der|die|den)\s+[A-ZÄÖÜ][^.;]{0,60}?(?:gezahlt|überwiesen|geleistet)|auf (?:ein|das) Konto (?:eines|einer) Dritten|an (?:einen|eine) Dritte[nr]?\b/gi, { verneinungPruefen: true });
  f.treffer.dritte.forEach((x) => (x.betrag = betragImSatz(t, x.index)));
  treffer("raten", /\b(?:Raten|Ratenzahlung\w*|Jahresrate\w*|Monatsrate\w*|gestundet|Stundung|Leibrente|Kaufpreisrente|Rentenzahlung\w*|Restkaufpreis)\b/gi, { verneinungPruefen: true });
  f.treffer.ratenSpaet = [];
  for (const x of alleTreffer(t, new RegExp(`(?:fällig|zahlbar|zu zahlen)[^.;]{0,40}?(?:am|bis zum|zum)\\s+(${DATUM})`, "g"))) {
    const d = datumIso(x.m[1]);
    if (d && f.urkundsdatum && Date.parse(d) - Date.parse(f.urkundsdatum) > 365 * 864e5) f.treffer.ratenSpaet.push({ ...x, datum: d });
  }
  f.treffer.ibans = alleTreffer(t, /\b([A-Z]{2})(\d{2})\s?((?:[A-Z0-9]{4}\s?){2,7}[A-Z0-9]{1,4})\b/g)
    .filter((x) => /\d/.test(x.m[3]) && x.m[3].replace(/\s/g, "").length >= 10)
    .map((x) => {
      const code = x.m[1];
      const land = landZuCode(code);
      return { ...x, iban: x.wort.replace(/\s/g, ""), code, land: land?.name || code,
        hochrisiko: hochrisikoListe().some((s) => s.code === code), drittstaat: !EU_EWR.has(code) };
    });
  f.treffer.konsulat = alleTreffer(t, /\b(?:Botschaft|Generalkonsulat|Konsulat|Auslandsvertretung|Konsularbeamt\w*|Honorarkonsul\w*)\b/g)
    .map((x) => ({ ...x, staat: staatenFinden(t.slice(Math.max(0, x.index - 150), x.index + 200)).find((s) => s.hochrisiko) || null }));

  // Personen, Vertretung, Treuhand
  treffer("treuhand", /\b(?:treuhänderisch\w*|Treuhänder\w*|Treuhandvertrag\w*|Treuhandverhältnis\w*|Treugeber\w*|Strohm(?:ann|änner)|für Rechnung (?:eines|einer) Dritten|verdeckt\w* Stellvertret\w*)\b/gi, { verneinungPruefen: "davor" });
  f.treffer.treuhand = f.treffer.treuhand.filter((x) => !/Notar|Grundpfand|Gläubiger|Bank|Sparkasse|Lastenfreistellung|Treuhandauf/i.test(t.slice(Math.max(0, x.index - 60), x.index + 80)));
  treffer("vollmacht", /\b(?:handelnd\s+)?(?:aufgrund|auf Grund|kraft)\s+(?:einer\s+|der\s+)?(?:[\wäöüß\-]+\s+){0,4}Vollmacht\b|\bals\s+(?:General)?(?:Bevollmächtigte[rn]?|bevollmächtigte[rn]?\s+Vertreter(?:in)?)\b|\bhandelnd\s+(?:nicht\s+im\s+eigenen\s+Namen|im\s+Namen\s+(?:von|des|der))/gi);
  f.treffer.vollmacht = f.treffer.vollmacht.filter((x) => !/Vollzugs|Durchführungs|Finanzierungs|Belastungs|Notariats(?:angestellt|mitarbeit)|Geschäftsführer|Vorstand/i.test(t.slice(Math.max(0, x.index - 60), x.index + x.wort.length + 60)));
  treffer("vollmachtlos", /\bvollmachtlos\w*|\bohne\s+Vertretungsmacht\b|\bvorbehaltlich\s+(?:der\s+)?(?:nachträglichen\s+)?Genehmigung\b/gi);
  treffer("vollmachtFormfehlt", /\bmündlich\w*\s+(?:erteilte[rn]?\s+)?(?:bevollmächtigt|Vollmacht)|\bVollmacht\b[^.;]{0,80}\b(?:nachgereicht|nachzureichen|liegt\s+(?:noch\s+)?nicht\s+vor|wird\s+nachgereicht)|\bVollmachtsbestätigung\b/gi);
  treffer("schenkung", /\b(?:gemischte\s+Schenkung|Schenkung\w*|unentgeltlich\w*|Zuwendung\w*|unter\s+(?:dem\s+)?Verkehrswert|Verwandtenpreis|Freundschaftspreis|Pflichtteilsanrechnung|vorweggenommene\s+Erbfolge)\b/gi);
  treffer("verwandt", /\b(?:Sohn|Tochter|Vater|Mutter|Eltern|Bruder|Schwester|Geschwister|Ehegatte\w*|Ehefrau|Ehemann|Eheleute|eingetragene[rn]?\s+Lebenspartner\w*|Enkel\w*|Großeltern|Großvater|Großmutter)\b/g);
  treffer("finanzierung", /\b(?:Finanzierungsgrundschuld\w*|Finanzierungsvollmacht|Belastungsvollmacht|Mitwirkung\s+bei\s+der\s+Kaufpreisfinanzierung|Darlehen\w*)\b/gi);
  treffer("verkehrswert", new RegExp(`Verkehrswert[^.;]{0,60}?(?:${WAEHRUNG}\\s*${BETRAG}|${BETRAG}\\s*${WAEHRUNG})`, "gi"));
  treffer("transparenzregister", /Transparenzregister\w*/g);
  f.verkehrswertVertrag = f.treffer.verkehrswert[0] ? betragZahl(f.treffer.verkehrswert[0].m[1] || f.treffer.verkehrswert[0].m[3]) : null;

  // Vorerwerb des Verkäufers (Weiterveräußerung binnen zwei bzw. drei Jahren)
  f.treffer.vorerwerb = alleTreffer(t, new RegExp(`(?:erworben|Eigentum\\s+(?:erlangt|erworben)|Erwerb|aufgelassen|als Eigentümer\\w*\\s+eingetragen|eingetragen\\s+(?:am|seit))[^.;]{0,120}?(?:vom|am|seit dem|seit)\\s+(${DATUM})`, "gi"))
    .map((x) => ({ ...x, datum: datumIso(x.m[1]) })).filter((x) => x.datum);
  for (const x of alleTreffer(t, new RegExp(`(?:Urkunde|Vertrag|Kaufvertrag|Auflassung|Zuschlag\\w*)\\s+vom\\s+(${DATUM})[^.;]{0,80}?(?:erworben|aufgelassen|übertragen)`, "gi"))) {
    f.treffer.vorerwerb.push({ ...x, datum: datumIso(x.m[1]) });
  }
  f.vorerwerbDatum = f.treffer.vorerwerb.map((x) => x.datum).sort().pop() || "";
  m = t.match(new RegExp(`(?:damaligen?|früheren?|seinerzeitigen?)\\s+Kaufpreis[^.;]{0,40}?(?:${WAEHRUNG}\\s*${BETRAG}|${BETRAG}\\s*${WAEHRUNG})`, "i"));
  f.vorpreis = m ? betragZahl(m[1] || m[3]) : null;

  // Staaten im gesamten Text und bei den Beteiligten
  f.staaten = staatenFinden(t).map((s) => ({ ...s, text: ausschnitt(t, s.index, s.wort.length) }));
  f.beteiligte = beteiligteFinden(t);
  return f;
}

