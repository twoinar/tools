// Amtsgerichte im Land Brandenburg mit XJustiz-Code (Codeliste gds.gerichte 3.6).
export const GERICHTE = {
  "AG Bad Freienwalde": "G1202", "AG Bad Liebenwerda": "G1101", "AG Bernau": "G1204",
  "AG Brandenburg an der Havel": "G1302", "AG Cottbus": "G1103", "AG Eberswalde": "G1205",
  "AG Eisenhüttenstadt": "G1206", "AG Frankfurt (Oder)": "G1207", "AG Fürstenwalde": "G1208",
  "AG Guben": "G1107", "AG Königs Wusterhausen": "G1305", "AG Luckenwalde": "G1307",
  "AG Lübben": "G1110", "AG Nauen": "G1308", "AG Neuruppin": "G1309", "AG Oranienburg": "G1310",
  "AG Perleberg": "G1311", "AG Potsdam": "G1312", "AG Prenzlau": "G1209", "AG Rathenow": "G1315",
  "AG Schwedt": "G1210", "AG Senftenberg": "G1111", "AG Strausberg": "G1212", "AG Zehdenick": "G1303",
  "AG Zossen": "G1317",
};

const schluessel = (ort) => ort.toLowerCase().replace(/\bot\b/g, " ").replace(/\s+/g, " ").trim();

// Vorschlag: 1. früher für diesen Ort gewählt (im Browser gemerkt), 2. Ort ist selbst Gerichtssitz.
export function vorschlagen(wohnort, gemerkt) {
  if (!wohnort) return "";
  const w = schluessel(wohnort);
  if (gemerkt[w] && GERICHTE[gemerkt[w]]) return gemerkt[w];
  for (const name of Object.keys(GERICHTE)) {
    const sitz = schluessel(name.replace(/^AG /, "")).split(" (")[0];
    if (w.startsWith(sitz)) return name;
  }
  return "";
}

export function merken(wohnort, gericht, gemerkt) {
  if (wohnort && gericht) gemerkt[schluessel(wohnort)] = gericht;
  return gemerkt;
}
