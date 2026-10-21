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

  let m = t.match(/UVZ\.?-?\s*Nr\.?\s*(\d+)\s*für\s*(\d{4})/);
  if (m) [, d.uvz_nr, d.uvz_jahr] = m; else d.unsicher.push("UVZ-Nummer");

  // Aktenzeichen und Gericht, falls das Nachlassgericht schon geschrieben hat
  m = t.match(/Az\.?\s*(?:des\s+)?Nachlassgerichts:?\s*(.+?)\s+(?=UVZ|Ausschlagung)/);
  if (m) d.gericht_aktenzeichen = m[1].trim();
  m = t.match(/Schreiben des Amtsgerichts? (.+?) vom/);
  if (m) d.gericht_ort = m[1].trim();

  m = t.match(new RegExp(`Erb(?:e|in) nach (${NAME})(?:, geb(?:orene|oren)? (${NAME}))?,?\\s+geworden`));
  if (m) {
    const g = t.match(new RegExp(`Erblasser(?:in)?,? geboren am (${DATUM})`));
    d.erblasser = person(m[1], { geburtsname: m[2] || "", geburtsdatum: g ? datumIso(g[1]) : "" });
    if (!g) d.unsicher.push("Geburtsdatum Erblasser");
  } else {
    d.unsicher.push("Erblasser");
  }

  m = t.match(new RegExp(`zwischen dem (${DATUM}) und (${DATUM}) in (.+?) verstorben`));
  if (m) {
    d.sterbedatum_von = datumIso(m[1]); d.sterbedatum_bis = datumIso(m[2]); d.sterbeort = m[3].trim();
  } else if ((m = t.match(new RegExp(`(?:am )?(${DATUM}) in (.+?) verstorben`)))) {
    d.sterbedatum_von = d.sterbedatum_bis = datumIso(m[1]); d.sterbeort = m[2].trim();
  } else if ((m = t.match(new RegExp(`am (${DATUM}) verstorben`)))) {
    d.sterbedatum_von = d.sterbedatum_bis = datumIso(m[1]);
  } else {
    d.unsicher.push("Sterbedatum/-ort");
  }

  m = t.match(/zuletzt in (.+?) wohnhaft/);
  if (m) d.letzter_wohnort = m[1].trim(); else d.unsicher.push("letzter Wohnort");

  // Beglaubigungsvermerk: Name, Geburtsdatum, Anschrift der Unterzeichner
  const vermerk = {};
  const reVermerk = new RegExp(
    `(Frau|Herrn?) (${NAME}), geboren am (${DATUM_LANG}|${DATUM}), Anschrift: ([^,]+?,[^,]+?)(?= Frau| Herrn?| jeweils| ausgewiesen| wird| werden|$)`, "g");
  for (const v of t.matchAll(reVermerk)) vermerk[v[2].trim()] = [datumIso(v[3]), v[4].trim(), v[1]];

  // Ausschlagende: "Hiermit schlage ich, Frau/Herr <Name> die Erbschaft / für ..."
  const gesehen = new Set();
  for (const a of t.matchAll(new RegExp(`Hiermit schlage ich, (Frau|Herrn?) (${NAME}) (?:die Erbschaft|für)`, "g"))) {
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

  m = t.match(new RegExp(`, (?:den )?(${DATUM_LANG})`));
  if (m) d.urkundsdatum = datumIso(m[1]);

  m = t.match(/([A-ZÄÖÜ][A-Za-zäöüßÄÖÜ\- ]+?), (Notar(?:assessor)?|Notarin)\b/);
  if (m) d.notar = `${m[1].trim()}, ${m[2]}`;

  if (!d.gericht_ort) d.unsicher.push("Nachlassgericht (steht nicht in der Urkunde)");
  return d;
}
