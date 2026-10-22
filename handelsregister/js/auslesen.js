// Liest die Daten einer Handelsregisteranmeldung (GmbH, Geschäftsführerwechsel) aus dem PDF-Text.
// Läuft vollständig im Browser. Was nicht sicher erkannt wird, bleibt leer.

const MONATE = {
  januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7,
  august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};

const DATUM = String.raw`\d{1,2}\.\s?\d{1,2}\.\s?\d{4}`;
const DATUM_LANG = String.raw`\d{1,2}\.\s*[A-Za-zäÄ]+\s+\d{4}`;
// Ort, auch "Frankfurt (Oder)" oder "Berlin-Mitte"
const ORT = String.raw`[A-ZÄÖÜ][\wäöüßÄÖÜ.\-]*(?:\s[A-ZÄÖÜa-zäöü][\wäöüßÄÖÜ.\-]*)*?(?:\s?\([^)]{1,20}\))?`;

// Registergerichte mit dem Kürzel hinter der Registernummer (z. B. "HRB 12345 FF")
export const REGISTERGERICHTE = {
  "AG Cottbus": { kuerzel: "CB" },
  "AG Frankfurt (Oder)": { kuerzel: "FF" },
  "AG Neuruppin": { kuerzel: "NP" },
  "AG Potsdam": { kuerzel: "P" },
  "AG Charlottenburg": { kuerzel: "B" },
};

export function glaetten(text) {
  return text
    .replace(/\r/g, "")
    .replace(/_x000b_|\v/g, "\n")
    .replace(/([\wäöüß])-\n([a-zäöüß])/g, "$1$2")
    .replace(/[ \t]*\n[ \t]*/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s{2,}/g, " ");
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
  // "Dr." gehört zum Vornamenteil
  return [teile.slice(0, -1).join(" "), teile[teile.length - 1]];
}

// Text nach "wird angemeldet" bis zur Unterschrift/Beglaubigung: dort stehen die Anmeldungsgegenstände
function anmeldungsteil(t) {
  const start = t.search(/(?:wird|werden|melde[nt]?) (?:hiermit )?(?:zur Eintragung (?:in das Handelsregister )?)?angemeldet|Wir melden|Ich melde|Zur Eintragung in das Handelsregister/);
  let ende = t.search(/Beglaubigungsvermerk|Die vorstehende[n]? Unterschrift|Hiermit beglaubige/);
  if (ende < 0) ende = t.length;
  return t.slice(start < 0 ? 0 : start, ende);
}

// Eine Person: "Herr/Frau [Dr.] Vorname Nachname, geb[oren] [am] <Datum>, wohnhaft [in] <Ort>"
const PERSON = new RegExp(
  String.raw`(Herrn?|Frau)\s+((?:Dr\.\s*|Prof\.\s*)*[A-ZÄÖÜ][\wäöüßÄÖÜ\-]+(?:\s+[A-ZÄÖÜ][\wäöüßÄÖÜ\-]+){0,4}?)` +
  String.raw`(?:,?\s*geb(?:\.|oren)\s+([A-ZÄÖÜ][\wäöüßÄÖÜ\-]+)(?=,))?` +
  String.raw`,?\s*geb(?:\.|oren)(?:\s+am)?\s+(${DATUM}|${DATUM_LANG})` +
  String.raw`(?:,?\s*(?:wohnhaft|wh\.)(?:\s+in)?\s+(${ORT})(?=[,;.:]|$|\s(?:ist|wurde|hat|als|zum|zur|und|vertritt|-)))?`,
  "g",
);

const AUS = /nicht mehr Geschäftsführer|abberufen|ausgeschieden|niedergelegt|Niederlegung|beendet|Amt (?:als Geschäftsführer(?:in)? )?verloren|verstorben/;
const NEU = /bestellt|neue[rn]? Geschäftsführer|Bestellung/;

function grundAus(satz) {
  if (/niedergelegt|Niederlegung/.test(satz)) return "Amtsniederlegung";
  if (/verstorben/.test(satz)) return "Tod";
  if (/abberufen|Abberufung/.test(satz)) return "Abberufung";
  return "Ausscheiden";
}

// Satzgrenzen: Punkt + Leerzeichen + Großbuchstabe/Ziffer, aber nicht nach Abkürzungen oder Datumsteilen
function saetze(text) {
  return text
    .split(/(?<!\b(?:geb|Dr|Prof|Nr|Abs|Str|bzw|vgl|z\.B|u|ca|St|Fa))(?<!\d)\.\s+(?=[A-ZÄÖÜ0-9§])|;\s+|\s(?=\d{1,2}\.\s+(?:Herr|Frau|Die|Der|Zu|Zum|Zur|Als))/)
    .map((s) => s.trim()).filter(Boolean);
}

export function auslesen(roh) {
  const t = glaetten(roh);
  const d = {
    uvz_nr: "", uvz_jahr: "", datum: "",
    gericht: "", registerart: "HRB", registernummer: "", firma: "", sitz: "", geschaeftsanschrift: "",
    ausgeschieden: [], bestellt: [], vertretung_allgemein: "", unsicher: [],
  };
  let m;

  // UVZ-Nr.: "UVZ.-Nr. 1234 für 2026", "UVZ-Nr. 1234/2026", "UR-Nr. W 1234/2026"
  if ((m = t.match(/(?:UVZ|UR|URNr)\.?-?\s*Nr\.?:?\s*(?:[A-Z]\s*)?(\d+)\s*(?:\/|für|fuer)\s*(\d{4})/))) {
    [, d.uvz_nr, d.uvz_jahr] = m;
  }

  // Registernummer und Gericht
  if ((m = t.match(/\b(HRB|HRA)\s*(\d+)(?:\s*([A-Z]{1,3})\b)?/))) {
    d.registerart = m[1];
    d.registernummer = m[2] + (m[3] ? ` ${m[3]}` : "");
    const k = m[3];
    if (k) d.gericht = Object.keys(REGISTERGERICHTE).find((g) => REGISTERGERICHTE[g].kuerzel === k) || "";
  }
  if ((m = t.match(new RegExp(`Amtsgericht\\s+(${ORT})(?=\\s*(?:-|,|\\s)\\s*(?:Registergericht|Handelsregister|HRB|HRA|$)|\\s*$)`)))) {
    const name = `AG ${m[1].replace(/\s*\(\s*/, " (").trim()}`;
    const treffer = Object.keys(REGISTERGERICHTE).find((g) => g.toLowerCase() === name.toLowerCase());
    if (treffer) d.gericht = treffer;
    else if (!d.gericht) d.gericht = name;
  }

  // Firma und Sitz: "<Firma> GmbH mit (dem) Sitz in <Ort>"
  const FIRMA = String.raw`((?:[\wäöüßÄÖÜ&+.\-]+\s+){0,7}?(?:gGmbH|GmbH(?:\s*&\s*Co\.\s*KG)?|UG\s*\(haftungsbeschränkt\)|Gesellschaft mit beschränkter Haftung))`;
  if ((m = t.match(new RegExp(`${FIRMA}\\s*,?\\s*mit (?:dem )?Sitz in (${ORT})(?=[,;.:]|\\s|$)`)))) {
    d.firma = firmaBereinigen(m[1]);
    d.sitz = m[2].trim();
  } else if ((m = t.match(new RegExp(`${FIRMA}(?:\\s*,\\s*(${ORT})(?=[,;.:]|\\s|$))?`)))) {
    d.firma = firmaBereinigen(m[1]);
    if (m[2] && !/^(?:HRB|HRA|Amtsgericht|Registergericht)/.test(m[2])) d.sitz = m[2].trim();
  }

  // Inländische Geschäftsanschrift
  if ((m = t.match(/Geschäftsanschrift(?: der Gesellschaft)?(?: lautet| ist| befindet sich)?(?: weiterhin| unverändert| nunmehr)?:?\s*(?:in\s+)?([^.;]*?\d{5}\s+[A-ZÄÖÜ][^.;]*?)(?=\.\s|;|$)/))) {
    d.geschaeftsanschrift = m[1].replace(/^[:\s]+/, "").trim();
  }

  // Ort und Datum der Anmeldung (vor dem Beglaubigungsvermerk), sonst Datum im Vermerk
  const teil = anmeldungsteil(t);
  const alleDaten = [...t.matchAll(new RegExp(`${ORT},? (?:den |am )?(${DATUM}|${DATUM_LANG})`, "g"))];
  if (alleDaten.length) d.datum = datumIso(alleDaten[alleDaten.length - 1][1]);

  // Personen nach Sätzen einordnen
  const gesehen = new Set();
  let letzte = null;
  for (const satz of saetze(teil)) {
    const personen = [...satz.matchAll(PERSON)];
    if (!personen.length) {
      // "Er/Sie vertritt die Gesellschaft ..." bezieht sich auf die zuletzt genannte neue Person
      if (letzte && /^(?:Er|Sie|Dieser|Diese|Der Geschäftsführer|Die Geschäftsführerin)\b/.test(satz)) vertretungLesen(satz, letzte);
      continue;
    }
    for (const pm of personen) {
      const [vorname, nachname] = nameTeilen(pm[2]);
      const p = {
        anrede: pm[1].startsWith("Herr") ? "Herr" : "Frau",
        vorname, nachname, geburtsname: pm[3] || "",
        geburtsdatum: datumIso(pm[4]), wohnort: (pm[5] || "").trim(),
        einzelvertretung: false, befreit181: false, grund: "",
      };
      const schluessel = `${p.vorname} ${p.nachname} ${p.geburtsdatum}`;
      if (gesehen.has(schluessel)) continue;
      // Klausel: von der Person bis zur nächsten Person; davor der Satzanfang (z. B. "Zum Geschäftsführer wurde bestellt:")
      const i = personen.indexOf(pm);
      const klausel = satz.slice(pm.index, i + 1 < personen.length ? personen[i + 1].index : satz.length);
      const vorher = satz.slice(i > 0 ? personen[i - 1].index + personen[i - 1][0].length : 0, pm.index);
      const art = AUS.test(klausel) ? "aus" : NEU.test(klausel) ? "neu" : AUS.test(vorher) ? "aus" : NEU.test(vorher) ? "neu" : "";
      if (art === "aus") {
        p.grund = grundAus(klausel + vorher);
        d.ausgeschieden.push(p);
        letzte = null;
      } else if (art === "neu") {
        vertretungLesen(klausel, p);
        d.bestellt.push(p);
        letzte = p;
      } else {
        continue;
      }
      gesehen.add(schluessel);
    }
  }
  // Sätze, die eine neue Person später mit Namen nennen ("Frau Neu vertritt die Gesellschaft stets einzeln")
  for (const satz of saetze(teil)) {
    for (const p of d.bestellt) {
      if (satz.includes(p.nachname) && /vertr|181|mit sich/.test(satz) && !PERSON.test(satz)) vertretungLesen(satz, p);
      PERSON.lastIndex = 0;
    }
  }

  // Allgemeine Vertretungsregelung
  if ((m = teil.match(/(?:Allgemeine Vertretungs(?:regelung|befugnis)[^:]*:\s*)?((?:Ist nur ein|Ist ein|Sind mehrere|Die Gesellschaft hat einen oder mehrere)[^]*?(?:vertreten|vertritt)[^.]*\.(?:\s*Sind mehrere[^.]*\.)?)/))) {
    d.vertretung_allgemein = m[1].trim();
  }

  if (!d.registernummer) d.unsicher.push("Registernummer");
  if (!d.firma) d.unsicher.push("Firma");
  if (!d.ausgeschieden.length && !d.bestellt.length) d.unsicher.push("Geschäftsführer");
  for (const p of [...d.ausgeschieden, ...d.bestellt]) if (!p.geburtsdatum || !p.wohnort) d.unsicher.push(`Angaben zu ${p.vorname} ${p.nachname}`);
  return d;
}

function vertretungLesen(text, p) {
  if (/einzeln|allein|Einzelvertretung/.test(text)) p.einzelvertretung = true;
  if (/§\s*181|mit sich (?:selbst|im eigenen Namen)|Selbstkontrah|Beschränkungen des/.test(text)) p.befreit181 = true;
}

function firmaBereinigen(s) {
  const woerter = s.trim().split(/\s+/);
  // vorn stehende Gerichts-/Registerangaben entfernen ("Registergericht - HRB 1234 FF Muster GmbH")
  let i = 0;
  for (let j = 0; j < woerter.length; j++) {
    if (/^(?:HRB|HRA|Amtsgericht|Registergericht|Handelsregister|-|In|in|Sachen|der|die|Betreff:?|Az\.?:?|\d+|[A-Z]{1,3}|Anmeldung|zum|zur)$/.test(woerter[j])
      && !/GmbH|UG/.test(woerter[j])) i = j + 1;
  }
  return woerter.slice(i).join(" ").replace(/^[,:\s-]+/, "");
}
