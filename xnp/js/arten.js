// Antragsarten für XNP „Sonstige Anträge“.
// sachgebiet = Code aus der XJustiz-Codeliste GDS.Sachgebiet 2.3; XNP liest außerdem die Bezeichnung im Gegenstand.
// abteilung = Zeile unter dem Gericht im Anschreiben. nachlass = Erblasser-Felder anzeigen und auslesen.

export const SACHGEBIETE = {
  "001": "Adoptionssachen", "004": "Betreuungssachen", "010": "Familiensachen", "013": "Grundbuchsachen",
  "025": "Nachlasssachen", "034": "Sonstige Sachen", "045": "Vormundschaftssachen", "058": "Unterbringungssachen",
};

const BOTE = "als Bote für die Beteiligten zur weiteren Verwendung.";

export const ARTEN = {
  erbausschlagung: {
    name: "Erbausschlagung", sachgebiet: "025", gegenstand: "Erbausschlagung", abteilung: "Nachlassgericht",
    nachlass: true, unterzeichner: true, betreff: "Nachlasssache",
    text: `ich übersende beiliegende Erbausschlagungserklärung in elektronisch beglaubigter Form ${BOTE}`,
  },
  anfechtung: {
    name: "Anfechtung der Erbausschlagung / Annahme", sachgebiet: "025", gegenstand: "Anfechtung", abteilung: "Nachlassgericht",
    nachlass: true, unterzeichner: true, betreff: "Nachlasssache",
    text: `ich übersende beiliegende Anfechtungserklärung in elektronisch beglaubigter Form ${BOTE}`,
  },
  erbschein: {
    name: "Erbscheinsantrag", sachgebiet: "025", gegenstand: "Erbscheinsantrag", abteilung: "Nachlassgericht",
    nachlass: true, betreff: "Nachlasssache",
    text: "ich übersende den beiliegenden Erbscheinsantrag nebst Anlagen in elektronisch beglaubigter Form " +
      "mit der Bitte um Erteilung des beantragten Erbscheins.",
  },
  enz: {
    name: "Europäisches Nachlasszeugnis", sachgebiet: "025", gegenstand: "Antrag auf Europäisches Nachlasszeugnis",
    abteilung: "Nachlassgericht", nachlass: true, betreff: "Nachlasssache",
    text: "ich übersende den beiliegenden Antrag auf Erteilung eines Europäischen Nachlasszeugnisses nebst Anlagen " +
      "in elektronisch beglaubigter Form mit der Bitte um Erteilung.",
  },
  nachlass: {
    name: "Sonstige Nachlasssache", sachgebiet: "025", gegenstand: "", abteilung: "Nachlassgericht",
    nachlass: true, betreff: "Nachlasssache",
    text: "ich übersende beiliegende Urkunde nebst Anlagen in elektronisch beglaubigter Form zur weiteren Veranlassung.",
  },
  adoption: {
    name: "Adoption (Annahme als Kind)", sachgebiet: "001", gegenstand: "Annahme als Kind", abteilung: "Familiengericht",
    betreff: "Adoptionssache", parteien: "Annehmende(r) und Kind, z. B. „Muster, Max / Muster, Mia“", ort: "Wohnort der/des Annehmenden",
    text: "ich übersende den beiliegenden Antrag auf Annahme als Kind nebst Anlagen in elektronisch beglaubigter Form " +
      "mit der Bitte um weitere Veranlassung.",
  },
  betreuung: {
    name: "Betreuungsgerichtliche Genehmigung", sachgebiet: "004", gegenstand: "Antrag auf betreuungsgerichtliche Genehmigung",
    abteilung: "Betreuungsgericht", betreff: "Betreuungssache", parteien: "Betroffene(r), z. B. „Muster, Max“",
    ort: "gewöhnlicher Aufenthalt der/des Betroffenen",
    text: "ich übersende beiliegende Urkunde nebst Anlagen in elektronisch beglaubigter Form mit der Bitte um Erteilung " +
      "der betreuungsgerichtlichen Genehmigung und Übersendung des Beschlusses an mich.",
  },
  familie: {
    name: "Familiengerichtliche Genehmigung", sachgebiet: "010", gegenstand: "Antrag auf familiengerichtliche Genehmigung",
    abteilung: "Familiengericht", betreff: "Familiensache", parteien: "Kind, z. B. „Muster, Mia“",
    ort: "gewöhnlicher Aufenthalt des Kindes",
    text: "ich übersende beiliegende Urkunde nebst Anlagen in elektronisch beglaubigter Form mit der Bitte um Erteilung " +
      "der familiengerichtlichen Genehmigung und Übersendung des Beschlusses an mich.",
  },
  sonstiges: {
    name: "Sonstiger Antrag", sachgebiet: "034", gegenstand: "", abteilung: "", betreff: "In Sachen",
    parteien: "Beteiligte, z. B. „Muster, Max“", ort: "Ort für die Zuständigkeit",
    text: "ich übersende beiliegende Urkunde nebst Anlagen in elektronisch beglaubigter Form zur weiteren Veranlassung.",
  },
};

// Dokumenttyp (GDS.Dokumenttyp 3.8) einer Anlage nach dem Dateinamen
export function anlagentyp(name) {
  const n = name.toLowerCase();
  if (/geburt|sterbe|heirat|ehe|personenstand|lebenspartner/.test(n)) return "081"; // Personenstandsurkunde
  if (/testament/.test(n)) return "086";
  if (/erbvertrag/.test(n)) return "069";
  if (/erbschein/.test(n)) return "068";
  if (/vollmacht/.test(n)) return "214";
  if (/genehmigung|einwilligung|zustimmung/.test(n)) return "132";
  return "213"; // Urkunde
}

// Lesbare Bezeichnung aus dem Dateinamen: "Geburtsurkunde_Mia.pdf" -> "Geburtsurkunde Mia"
export function bezeichnung(name) {
  return name.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
}
