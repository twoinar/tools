// Erzeugt xjustiz_nachricht.xml für den Import in XNP „Sonstige Anträge“.
// Aufbau wie ein Export „Für Ersatzeinreichung“ aus XNP (XJustiz 3.6.2).

import { SACHGEBIETE } from "./arten.js";

export const CODES = {
  rolle_notar: "208",           // Notar(in)
  rolle_einreicher: "215",      // Einreicher(in)
  dokumentklasse_urkunde: "015", dokumenttyp_urkunde: "213",          // Schreiben / Urkunde
  dokumentklasse_anschreiben: "001", dokumenttyp_anschreiben: "122",  // Sonstige / Anschreiben
  dokumentklasse_anlage: "001",                                         // Sonstige
};
const GESCHLECHT = { Herr: "1", Frau: "2" };

const x = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const T = (n) => "\t".repeat(n);

function code(tag, wert, version, uri, e) {
  const attr = uri ? ` listURI="${uri}"` : "";
  return `${T(e)}<tns:${tag}${attr} listVersionID="${version}">\n${T(e + 1)}<code>${x(wert)}</code>\n${T(e)}</tns:${tag}>\n`;
}

const gericht = (c, e) => code("gericht", c, "3.6", "urn:xoev-de:xjustiz:codeliste:gds.gerichte", e);

function strasseHausnummer(s) {
  const m = (s || "").trim().match(/^(.+?)\s+(\d+\s*[a-zA-Z]?(?:\s*-\s*\d+)?)$/);
  return m ? [m[1], m[2]] : [(s || "").trim(), ""];
}

function notarBeteiligung(n, az) {
  const [strasse, hnr] = strasseHausnummer(n.strasse);
  const g = GESCHLECHT[n.anrede] || "";
  const rolle = (nr, c, gz) =>
    `${T(4)}<tns:rolle>\n${T(5)}<tns:rollennummer>${nr}</tns:rollennummer>\n` +
    code("rollenbezeichnung", c, "3.4", null, 5) +
    `${T(5)}<tns:geschaeftszeichen>${x(gz)}</tns:geschaeftszeichen>\n${T(4)}</tns:rolle>\n`;
  return `${T(3)}<tns:beteiligung>\n` +
    rolle(1, CODES.rolle_notar, az) + rolle(2, CODES.rolle_einreicher, "") +
    `${T(4)}<tns:beteiligter>\n${T(5)}<tns:beteiligtennummer>1</tns:beteiligtennummer>\n` +
    `${T(5)}<tns:auswahl_beteiligter>\n${T(6)}<tns:natuerlichePerson>\n` +
    `${T(7)}<tns:vollerName>\n${T(8)}<tns:vorname>${x(n.vorname)}</tns:vorname>\n` +
    `${T(8)}<tns:titel></tns:titel>\n${T(8)}<tns:nachname>${x(n.nachname)}</tns:nachname>\n${T(7)}</tns:vollerName>\n` +
    (g ? `${T(7)}<tns:geschlecht>\n${T(8)}<code>${g}</code>\n${T(7)}</tns:geschlecht>\n` : "") +
    `${T(7)}<tns:anschrift>\n${T(8)}<tns:strasse>${x(strasse)}</tns:strasse>\n` +
    `${T(8)}<tns:hausnummer>${x(hnr)}</tns:hausnummer>\n${T(8)}<tns:postleitzahl>${x(n.plz)}</tns:postleitzahl>\n` +
    `${T(8)}<tns:ort>${x(n.ort)}</tns:ort>\n` + code("staat", "000", "6.0", null, 8) +
    `${T(7)}</tns:anschrift>\n${T(6)}</tns:natuerlichePerson>\n${T(5)}</tns:auswahl_beteiligter>\n` +
    `${T(4)}</tns:beteiligter>\n${T(3)}</tns:beteiligung>\n`;
}

function dokument(nr, datum, klasse, typ, datei, signatur) {
  const teil = (name, bestandteil, bezug) =>
    `${T(4)}<tns:datei>\n${T(5)}<tns:dateiname>${x(name)}</tns:dateiname>\n` +
    code("bestandteil", bestandteil, "2.5", null, 5) +
    (bezug ? `${T(5)}<tns:dateiname.bezugsdatei>${x(bezug)}</tns:dateiname.bezugsdatei>\n` : "") +
    `${T(4)}</tns:datei>\n`;
  return `${T(2)}<tns:dokument>\n${T(3)}<tns:identifikation>\n${T(4)}<tns:id>${crypto.randomUUID()}</tns:id>\n` +
    `${T(4)}<tns:nummerImUebergeordnetenContainer>${nr}</tns:nummerImUebergeordnetenContainer>\n${T(3)}</tns:identifikation>\n` +
    `${T(3)}<tns:datumDesSchreibens>${x(datum)}</tns:datumDesSchreibens>\n${T(3)}<tns:xjustiz.fachspezifischeDaten>\n` +
    code("dokumentklasse", klasse, "1.4", "urn:xoev-de:xjustiz:codeliste:gds.dokumentklasse", 4) +
    code("dokumententyp", typ, "3.8", null, 4) +
    `${T(4)}<tns:akteneinsicht>false</tns:akteneinsicht>\n` +
    teil(datei, "001") + (signatur ? teil(signatur, "003", datei) : "") +
    `${T(3)}</tns:xjustiz.fachspezifischeDaten>\n${T(2)}</tns:dokument>\n`;
}

// XNP liest Parteien und Gegenstand aus EINEM Feld, fünf Teile mit Semikolon getrennt:
// Aktenzeichen; Sachgebiet; Bezeichnung der Parteien; Verfahrensgegenstand; Verfahrensnummer (vergibt XNP)
export function gegenstandXnp(d, az) {
  const teil = (s) => String(s || "").replace(/;/g, ",").trim();
  return `${az};${SACHGEBIETE[d.sachgebiet] || ""};${teil(d.parteien)};${teil(d.gegenstand)};`;
}

export function aktenzeichen(d) {
  return d.uvz_nr ? `${d.uvz_nr}/${d.uvz_jahr}` : "";
}

export function nachricht(d, notar, dokumente, version) {
  const az = aktenzeichen(d);
  const jetzt = new Date();
  jetzt.setMilliseconds(0);
  const zeit = new Date(jetzt - jetzt.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  // dokumente: [{ datei, signatur, klasse, typ }] in der Reihenfolge Urkunde, Anschreiben, Anlagen
  const doks = dokumente.map((dok, i) =>
    dokument(i + 1, d.urkundsdatum, dok.klasse, dok.typ, dok.datei, dok.signatur)).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<tns:nachricht.gds.uebermittlungSchriftgutobjekte.0005005 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.xjustiz.de xjustiz_0005_nachrichten_3_2.xsd" xmlns:tns="http://www.xjustiz.de">
\t<tns:nachrichtenkopf xjustizVersion="3.6.2">
\t\t<tns:erstellungszeitpunkt>${zeit}</tns:erstellungszeitpunkt>
\t\t<tns:absender>
\t\t\t<tns:informationen>
\t\t\t\t<tns:auswahl_kommunikationspartner>
\t\t\t\t\t<tns:sonstige>${x(`Notar${notar.anrede === "Frau" ? "in" : ""} ${notar.vorname} ${notar.nachname}, ${notar.ort}`)}</tns:sonstige>
\t\t\t\t</tns:auswahl_kommunikationspartner>
\t\t\t</tns:informationen>
\t\t\t<tns:aktenzeichen>${x(az)}</tns:aktenzeichen>
\t\t\t<tns:eigeneNachrichtenID>${crypto.randomUUID()}</tns:eigeneNachrichtenID>
\t\t</tns:absender>
\t\t<tns:empfaenger>
\t\t\t<tns:informationen>
\t\t\t\t<tns:auswahl_kommunikationspartner>
${gericht(d.gericht_code, 5)}\t\t\t\t</tns:auswahl_kommunikationspartner>
\t\t\t</tns:informationen>
\t\t\t<tns:auswahl_aktenzeichen>
\t\t\t\t<tns:aktenzeichen.freitext>${x(d.gericht_aktenzeichen)}</tns:aktenzeichen.freitext>
\t\t\t</tns:auswahl_aktenzeichen>
\t\t</tns:empfaenger>
\t\t<tns:herstellerinformation>
\t\t\t<tns:nameDesProdukts>XNP Sonstige Anträge (Web)</tns:nameDesProdukts>
\t\t\t<tns:herstellerDesProdukts>Notariat Woinar</tns:herstellerDesProdukts>
\t\t\t<tns:version>${x(version)}</tns:version>
\t\t</tns:herstellerinformation>
\t</tns:nachrichtenkopf>
\t<tns:grunddaten>
\t\t<tns:verfahrensdaten>
\t\t\t<tns:verfahrensnummer></tns:verfahrensnummer>
\t\t\t<tns:instanzdaten>
\t\t\t\t<tns:instanznummer>0</tns:instanznummer>
${code("sachgebiet", d.sachgebiet, "2.3", null, 4)}\t\t\t\t<tns:auswahl_instanzbehoerde>
${gericht(d.gericht_code, 5)}\t\t\t\t</tns:auswahl_instanzbehoerde>
\t\t\t\t<tns:aktenzeichen>
\t\t\t\t\t<tns:auswahl_aktenzeichen>
\t\t\t\t\t\t<tns:aktenzeichen.freitext>${x(d.gericht_aktenzeichen)}</tns:aktenzeichen.freitext>
\t\t\t\t\t</tns:auswahl_aktenzeichen>
\t\t\t\t</tns:aktenzeichen>
\t\t\t\t<tns:verfahrensgegenstand>
\t\t\t\t\t<tns:gegenstand>${x(gegenstandXnp(d, az))}</tns:gegenstand>
\t\t\t\t</tns:verfahrensgegenstand>
\t\t\t</tns:instanzdaten>
${notarBeteiligung(notar, az)}\t\t</tns:verfahrensdaten>
\t</tns:grunddaten>
\t<tns:schriftgutobjekte>
${doks}\t</tns:schriftgutobjekte>
</tns:nachricht.gds.uebermittlungSchriftgutobjekte.0005005>
`;
}
