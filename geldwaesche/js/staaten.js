// Staatenlisten für die Prüfung. Die Hochrisikoliste muss bei Änderungen der EU-Liste
// (Delegierte Verordnung (EU) 2016/1675 in der jeweils geltenden Fassung) nachgepflegt werden.
// In den Einstellungen der Seite kann sie im Browser überschrieben werden.

export const HOCHRISIKO_STAND = "EU-Liste, anwendbar ab 29.01.2026";

// code: ISO-Ländercode (auch IBAN-Präfix), namen: Schreibweisen im Text (Staat, Adjektiv-Stamm, Städte)
export const HOCHRISIKO = [
  { code: "AF", name: "Afghanistan", muster: ["Afghanistan", "afghanisch", "Kabul"] },
  { code: "DZ", name: "Algerien", muster: ["Algerien", "algerisch", "Algier"] },
  { code: "AO", name: "Angola", muster: ["Angola", "angolanisch", "Luanda"] },
  { code: "BO", name: "Bolivien", muster: ["Bolivien", "bolivianisch", "La Paz", "Santa Cruz de la Sierra"] },
  { code: "VG", name: "Britische Jungferninseln", muster: ["Britischen? Jungferninseln", "British Virgin Islands", "BVI", "Tortola", "Road Town"] },
  { code: "CM", name: "Kamerun", muster: ["Kamerun", "kamerunisch", "Jaunde", "Yaoundé", "Douala"] },
  { code: "CI", name: "Côte d'Ivoire", muster: ["Côte d.Ivoire", "Elfenbeinküste", "ivorisch", "Abidjan"] },
  { code: "KP", name: "Nordkorea", muster: ["Nordkorea", "Demokratischen? Volksrepublik Korea", "nordkoreanisch", "Pjöngjang"] },
  { code: "CD", name: "Demokratische Republik Kongo", muster: ["Demokratischen? Republik Kongo", "Kinshasa"] },
  { code: "HT", name: "Haiti", muster: ["Haiti", "haitianisch", "Port-au-Prince"] },
  { code: "IR", name: "Iran", muster: ["Iran", "iranisch", "Teheran"] },
  { code: "KE", name: "Kenia", muster: ["Kenia", "kenianisch", "Nairobi", "Mombasa"] },
  { code: "LA", name: "Laos", muster: ["Laos", "laotisch", "Vientiane"] },
  { code: "LB", name: "Libanon", muster: ["Libanon", "libanesisch", "Beirut"] },
  { code: "MC", name: "Monaco", muster: ["Monaco", "monegassisch", "Monte Carlo"] },
  { code: "MM", name: "Myanmar", muster: ["Myanmar", "myanmarisch", "Birma", "Burma", "Rangun", "Yangon"] },
  { code: "NA", name: "Namibia", muster: ["Namibia", "namibisch", "Windhuk", "Windhoek"] },
  { code: "NP", name: "Nepal", muster: ["Nepal", "nepalesisch", "Kathmandu"] },
  { code: "RU", name: "Russische Föderation", muster: ["Russland", "Russischen? Föderation", "russisch", "Moskau", "Sankt Petersburg", "St\\. Petersburg"] },
  { code: "SS", name: "Südsudan", muster: ["Südsudan", "südsudanesisch", "Juba"] },
  { code: "SY", name: "Syrien", muster: ["Syrien", "syrisch", "Damaskus", "Aleppo"] },
  { code: "TT", name: "Trinidad und Tobago", muster: ["Trinidad", "Port of Spain"] },
  { code: "VU", name: "Vanuatu", muster: ["Vanuatu", "Port Vila"] },
  { code: "VE", name: "Venezuela", muster: ["Venezuela", "venezolanisch", "Caracas"] },
  { code: "VN", name: "Vietnam", muster: ["Vietnam", "vietnamesisch", "Hanoi", "Ho-Chi-Minh-Stadt", "Saigon"] },
  { code: "YE", name: "Jemen", muster: ["Jemen", "jemenitisch", "Sanaa", "Aden"] },
];

// Weitere Drittstaaten und Offshore-Standorte, die als Risikofaktor (Anlage 2 GwG) angezeigt werden.
// offshore: typischer Sitz von Gesellschaften ohne Geschäftsbetrieb vor Ort.
export const DRITTSTAATEN = [
  { code: "CH", name: "Schweiz", muster: ["Schweiz", "schweizerisch", "Zürich", "Genf", "Zug"] },
  { code: "GB", name: "Vereinigtes Königreich", muster: ["Vereinigten? Königreich", "Großbritannien", "England", "britisch", "London"] },
  { code: "US", name: "USA", muster: ["USA", "Vereinigten Staaten", "US-amerikanisch", "amerikanisch", "New York"] },
  { code: "US", name: "Delaware (USA)", muster: ["Delaware", "Wyoming"], offshore: true },
  { code: "TR", name: "Türkei", muster: ["Türkei", "türkisch", "Istanbul", "Ankara"] },
  { code: "UA", name: "Ukraine", muster: ["Ukraine", "ukrainisch", "Kiew", "Kyjiw"] },
  { code: "BY", name: "Belarus", muster: ["Belarus", "Weißrussland", "belarussisch", "weißrussisch", "Minsk"], sanktionen: true },
  { code: "AE", name: "Vereinigte Arabische Emirate", muster: ["Vereinigten? Arabischen? Emirate", "VAE", "Dubai", "Abu Dhabi", "emiratisch"], offshore: true },
  { code: "CN", name: "China", muster: ["China", "chinesisch", "Peking", "Shanghai"] },
  { code: "HK", name: "Hongkong", muster: ["Hongkong", "Hong Kong"], offshore: true },
  { code: "SG", name: "Singapur", muster: ["Singapur", "Singapore"] },
  { code: "PA", name: "Panama", muster: ["Panama"], offshore: true },
  { code: "SC", name: "Seychellen", muster: ["Seychellen", "Mahé"], offshore: true },
  { code: "KY", name: "Kaimaninseln", muster: ["Kaimaninseln", "Cayman"], offshore: true },
  { code: "JE", name: "Jersey", muster: ["Jersey", "St\\. Helier"], offshore: true },
  { code: "GG", name: "Guernsey", muster: ["Guernsey"], offshore: true },
  { code: "IM", name: "Isle of Man", muster: ["Isle of Man", "Douglas, Isle"], offshore: true },
  { code: "GI", name: "Gibraltar", muster: ["Gibraltar"], offshore: true },
  { code: "BZ", name: "Belize", muster: ["Belize"], offshore: true },
  { code: "MH", name: "Marshallinseln", muster: ["Marshallinseln", "Marshall Islands", "Majuro"], offshore: true },
  { code: "BS", name: "Bahamas", muster: ["Bahamas", "Nassau"], offshore: true },
  { code: "BM", name: "Bermuda", muster: ["Bermuda"], offshore: true },
  { code: "KZ", name: "Kasachstan", muster: ["Kasachstan", "kasachisch", "Astana", "Almaty"] },
  { code: "GE", name: "Georgien", muster: ["Georgien", "georgisch", "Tiflis"] },
  { code: "AM", name: "Armenien", muster: ["Armenien", "armenisch", "Eriwan"] },
  { code: "AZ", name: "Aserbaidschan", muster: ["Aserbaidschan", "aserbaidschanisch", "Baku"] },
  { code: "MD", name: "Moldau", muster: ["Republik Moldau", "Moldawien", "moldauisch", "Chișinău", "Chisinau"] },
  { code: "RS", name: "Serbien", muster: ["Serbien", "serbisch", "Belgrad"] },
  { code: "IL", name: "Israel", muster: ["Israel", "israelisch", "Tel Aviv"] },
  { code: "IN", name: "Indien", muster: ["Indien", "indisch", "Mumbai", "Neu-Delhi"] },
];

// EU- und EWR-Staaten (keine Drittstaaten im Sinne von § 1 Abs. 17 GwG)
export const EU_EWR = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT",
  "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK", "IS", "LI", "NO",
]);

export function hochrisikoListe() {
  try {
    const eigene = JSON.parse(localStorage.getItem("gw_hochrisiko") || "null");
    if (Array.isArray(eigene) && eigene.length) return eigene;
  } catch { /* Browser ohne Speicher: Standardliste */ }
  return HOCHRISIKO;
}

function regex(muster) {
  // Wortanfang; Adjektive dürfen Endungen haben (russisch -> russischer, russischen)
  return new RegExp(`(?<![\\wäöüÄÖÜß])(?:${muster.join("|")})(?:e[nmrs]?)?(?![\\wäöüß])`, "g");
}

// Liefert alle Fundstellen von Staaten im Text: [{ code, name, hochrisiko, offshore, index, wort }]
export function staatenFinden(text, liste = hochrisikoListe()) {
  const treffer = [];
  for (const [quelle, hr] of [[liste, true], [DRITTSTAATEN, false]]) {
    for (const s of quelle) {
      const re = regex(s.muster);
      for (const m of text.matchAll(re)) {
        // "BVI" und "VAE" nur in Großbuchstaben, "Aden"/"Zug"/"Juba"/"Nassau" nur als Ortsangabe
        if (/^(Aden|Zug|Juba|Nassau|Douglas|Genf|Jersey)$/.test(m[0]) && !/(in|aus|nach|von)\s$/.test(text.slice(Math.max(0, m.index - 5), m.index))) continue;
        treffer.push({ code: s.code, name: s.name, hochrisiko: hr, offshore: !!s.offshore, sanktionen: !!s.sanktionen, index: m.index, wort: m[0] });
      }
    }
  }
  return treffer.sort((a, b) => a.index - b.index);
}

export function landZuCode(code) {
  return hochrisikoListe().find((s) => s.code === code) || DRITTSTAATEN.find((s) => s.code === code) || null;
}
