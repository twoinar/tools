// Erstellt das Anschreiben an das Nachlassgericht als PDF (im Browser, mit pdf-lib).
const { PDFDocument, StandardFonts } = window.PDFLib;

const de = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? iso.split("-").reverse().join(".") : iso || "");

export function erblasserText(d) {
  const e = d.erblasser || {};
  let s = [e.vorname, e.nachname].filter(Boolean).join(" ");
  if (e.geburtsname) s += `, geb. ${e.geburtsname}`;
  if (e.geburtsdatum) s += `, geboren am ${de(e.geburtsdatum)}`;
  const { sterbedatum_von: von, sterbedatum_bis: bis } = d;
  if (von && bis && von !== bis) s += `, verstorben zwischen dem ${de(von)} und dem ${de(bis)}`;
  else if (von) s += `, verstorben am ${de(von)}`;
  if (d.letzter_wohnort) s += `, zuletzt wohnhaft in ${d.letzter_wohnort}`;
  return s;
}

function umbrechen(text, font, groesse, breite) {
  const zeilen = [];
  for (const absatz of text.split("\n")) {
    let zeile = "";
    for (const wort of absatz.split(" ")) {
      const probe = zeile ? `${zeile} ${wort}` : wort;
      if (font.widthOfTextAtSize(probe, groesse) > breite && zeile) {
        zeilen.push(zeile);
        zeile = wort;
      } else {
        zeile = probe;
      }
    }
    zeilen.push(zeile);
  }
  return zeilen;
}

export async function erstellen(d, notar, gerichtName) {
  const doc = await PDFDocument.create();
  const seite = doc.addPage([595, 842]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const links = 70, breite = 455;
  let y = 782;

  const schreiben = (text, { font = normal, groesse = 11, abstand = 15, rechts = false } = {}) => {
    for (const z of umbrechen(text, font, groesse, breite)) {
      const xPos = rechts ? links + breite - font.widthOfTextAtSize(z, groesse) : links;
      seite.drawText(z, { x: xPos, y, size: groesse, font });
      y -= abstand;
    }
  };

  const titel = notar.anrede === "Frau" ? "Notarin" : "Notar";
  schreiben(`${titel} ${notar.vorname} ${notar.nachname} · ${notar.strasse} · ${notar.plz} ${notar.ort}`, { groesse: 8, abstand: 12 });
  y = 700;
  schreiben(gerichtName.replace(/^AG /, "Amtsgericht "));
  schreiben("- Nachlassgericht -");
  y = 600;
  const heute = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  schreiben(`${notar.ort}, ${heute}`, { rechts: true });
  y -= 20;
  schreiben(`Nachlasssache ${erblasserText(d)}`, { font: fett });
  if (d.gericht_aktenzeichen) schreiben(`Ihr Az.: ${d.gericht_aktenzeichen}`, { font: fett });
  schreiben(`Mein Zeichen: UVZ-Nr. ${d.uvz_nr}/${d.uvz_jahr}`, { font: fett });
  y -= 20;
  schreiben("Sehr geehrte Damen und Herren,");
  y -= 15;
  schreiben("ich übersende beiliegende Erbausschlagungserklärung in elektronisch beglaubigter Form " +
    "als Bote für die Beteiligten zur weiteren Verwendung.");
  y -= 15;
  schreiben("Mit freundlichen Grüßen");
  y -= 45;
  schreiben(`${notar.vorname} ${notar.nachname}`);
  schreiben(titel);
  return doc.save();
}
