// XNP – Sonstige Anträge (Web). Alles läuft im Browser; es werden keine Daten übertragen.
import * as pdfjs from "../vendor/pdf.min.mjs";
import { auslesen } from "./auslesen.js";
import { nachricht, CODES } from "./xjustiz.js";
import { GERICHTE, vorschlagen, merken } from "./gerichte.js";
import { erstellen as anschreibenErstellen } from "./anschreiben.js";
import { ARTEN, SACHGEBIETE, anlagentyp, bezeichnung } from "./arten.js";

export const VERSION = "2.0 (22.10.2026)";
pdfjs.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdf.worker.min.mjs", import.meta.url).href;

const $ = (s) => document.querySelector(s);
const kannOrdner = "showDirectoryPicker" in window;

// ---------- Speicher im Browser (nur auf diesem PC) ----------
const lokal = {
  lesen(k, standard) { try { return JSON.parse(localStorage.getItem(k)) ?? standard; } catch { return standard; } },
  schreiben(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privat-Modus */ } },
};

function idb() {
  return new Promise((ok, fehler) => {
    const r = indexedDB.open("erbausschlagung-xnp", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("ordner");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehler(r.error);
  });
}
async function ordnerSpeichern(k, handle) {
  try {
    const db = await idb();
    db.transaction("ordner", "readwrite").objectStore("ordner").put(handle, k);
  } catch { /* nicht verfügbar */ }
}
async function ordnerLaden(k) {
  try {
    const db = await idb();
    return await new Promise((ok) => {
      const r = db.transaction("ordner").objectStore("ordner").get(k);
      r.onsuccess = () => ok(r.result || null);
      r.onerror = () => ok(null);
    });
  } catch { return null; }
}
async function erlaubt(handle, modus) {
  const opt = { mode: modus };
  if ((await handle.queryPermission(opt)) === "granted") return true;
  return (await handle.requestPermission(opt)) === "granted";
}

// ---------- Zustand ----------
// dokumente: [{ pdf: File, sig: File|null, text: string, mit: bool, bez: string }]
const zustand = { art: "erbausschlagung", dokumente: [], urkunde: -1, anschreibenDatei: null, eingang: null, ziel: null, vorgangName: "" };
const art = () => ARTEN[zustand.art];

// ---------- PDF ----------
async function pdfText(buffer) {
  const doc = await pdfjs.getDocument({ data: buffer, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const inhalt = await (await doc.getPage(i)).getTextContent();
    for (const item of inhalt.items) text += item.str + (item.hasEOL ? "\n" : "");
    text += "\n";
  }
  await doc.destroy();
  return text;
}


function istSignaturZu(pdfName, name) {
  const stamm = pdfName.replace(/\.pdf$/i, "");
  return [`${pdfName}.pkcs7`, `${pdfName}.p7s`, `${stamm}.pkcs7`, `${stamm}.p7s`]
    .map((n) => n.toLowerCase()).includes(name.toLowerCase());
}

// Die Urkunde des Vorgangs: trägt die UVZ-Nr. (bevorzugt die des Ordnernamens), sonst die neueste PDF mit Signatur
function urkundeFinden(doks) {
  const nr = (zustand.vorgangName.match(/^(\d+)/) || [])[1];
  const mitUvz = (dok) => /UVZ\.?-?\s*Nr/.test(dok.text.slice(0, 1500));
  let i = nr ? doks.findIndex((dok) => mitUvz(dok) && new RegExp(`UVZ\\.?-?\\s*Nr\\.?:?\\s*${nr}\\b`).test(dok.text)) : -1;
  if (i < 0) i = doks.findIndex(mitUvz);
  if (i < 0) i = doks.findIndex((dok) => dok.sig);
  return i < 0 ? 0 : i;
}

async function dateienUebernehmen(dateien, nurNeueste = false) {
  let pdfs = dateien.filter((f) => /\.pdf$/i.test(f.name));
  if (!pdfs.length) return meldung("Keine PDF-Datei gefunden.", "warnung");
  const sigZu = (pdf) => dateien.find((f) => istSignaturZu(pdf.name, f.name)) || null;
  pdfs.sort((a, b) => b.lastModified - a.lastModified);
  if (nurNeueste) pdfs = [pdfs.find(sigZu) || pdfs[0]];
  const doks = [];
  for (const pdf of pdfs) {
    let text = "";
    try { text = await pdfText(await pdf.arrayBuffer()); } catch { /* nicht lesbar: bleibt Anlage */ }
    doks.push({ pdf, sig: sigZu(pdf), text, mit: true, bez: bezeichnung(pdf.name) });
  }
  zustand.dokumente = doks;
  zustand.urkunde = urkundeFinden(doks);
  dokumenteAnzeigen();
  urkundeAuslesen();
}

function dokumenteAnzeigen() {
  const tb = $("#dokumente tbody");
  tb.innerHTML = "";
  zustand.dokumente.forEach((dok, i) => {
    const tr = document.createElement("tr");
    const mit = Object.assign(document.createElement("input"), { type: "checkbox", checked: dok.mit, title: "mitschicken" });
    mit.onchange = () => { dok.mit = mit.checked; };
    const urk = Object.assign(document.createElement("input"), { type: "radio", name: "urkunde", checked: i === zustand.urkunde, title: "Das ist die Urkunde" });
    urk.onchange = () => { zustand.urkunde = i; dok.mit = true; dokumenteAnzeigen(); urkundeAuslesen(); };
    const bez = Object.assign(document.createElement("input"), { type: "text", value: i === zustand.urkunde ? "Urkunde" : dok.bez, disabled: i === zustand.urkunde });
    bez.onchange = () => { dok.bez = bez.value.trim(); };
    const sig = document.createElement("span");
    sig.textContent = dok.sig ? "✓ signiert" : "OHNE Signatur";
    sig.className = dok.sig ? "ok" : "fehlt";
    for (const el of [mit, urk, document.createTextNode(dok.pdf.name), bez, sig]) {
      const td = document.createElement("td");
      td.append(el);
      tr.append(td);
    }
    tb.append(tr);
  });
  $("#dokumente").hidden = !zustand.dokumente.length;
}

function urkundeAuslesen() {
  const dok = zustand.dokumente[zustand.urkunde];
  if (!dok) return;
  const d = auslesen(dok.text);
  maskeFuellen(d);
  const fehlt = d.unsicher.filter((u) => art().unterzeichner || !/^(Ausschlagende|Geburtsdatum\/Anschrift)/.test(u));
  if (!art().nachlass) {
    // Bei Nicht-Nachlasssachen nur die allgemeinen Angaben melden
    for (let i = fehlt.length - 1; i >= 0; i--) if (!/^UVZ/.test(fehlt[i])) fehlt.splice(i, 1);
    if (!$("#parteien").value) fehlt.push("Parteien");
  }
  if (!$("#gericht").value) fehlt.push("Gericht");
  const ohneSig = zustand.dokumente.filter((x) => x.mit && !x.sig).map((x) => x.pdf.name);
  const teil1 = fehlt.length ? `Bitte prüfen: ${fehlt.join(", ")}.` : "Alle Angaben erkannt. Bitte trotzdem kurz prüfen.";
  const teil2 = ohneSig.length ? ` Ohne Signaturdatei: ${ohneSig.join(", ")}!` : " Alle Dokumente sind signiert.";
  meldung(teil1 + teil2, ohneSig.length || fehlt.length ? "warnung" : "hinweis");
}

// ---------- Eingangsordner und Vorgänge ----------
const uvzSchluessel = (name) => {
  const m = name.match(/^(\d+)\D+(\d{4})/);
  return m ? Number(m[2]) * 100000 + Number(m[1]) : -1;
};

async function vorgaengeAuflisten() {
  const sel = $("#vorgang");
  sel.innerHTML = "";
  sel.append(new Option("– Vorgang wählen –", ""));
  if (!zustand.eingang || (await zustand.eingang.queryPermission({ mode: "read" })) !== "granted") return;
  const namen = [];
  for await (const e of zustand.eingang.values()) if (e.kind === "directory") namen.push(e.name);
  namen.sort((a, b) => uvzSchluessel(b) - uvzSchluessel(a) || a.localeCompare(b, "de"));
  for (const n of namen) sel.append(new Option(n, n));
}

async function dateienAus(ordner) {
  const dateien = [];
  for await (const e of ordner.values()) if (e.kind === "file") dateien.push(await e.getFile());
  return dateien;
}

async function vorgangLaden() {
  const name = $("#vorgang").value;
  if (!zustand.eingang) return meldung("Bitte zuerst den Eingangsordner wählen.", "warnung");
  if (!(await erlaubt(zustand.eingang, "read"))) return;
  if (!name) { await vorgaengeAuflisten(); return meldung("Bitte den Vorgang (Unterordner) wählen.", "warnung"); }
  zustand.vorgangName = name;
  await dateienUebernehmen(await dateienAus(await zustand.eingang.getDirectoryHandle(name)));
}

async function neuestePdfAusOrdner() {
  if (!zustand.eingang) return meldung("Bitte zuerst den Eingangsordner wählen.", "warnung");
  if (!(await erlaubt(zustand.eingang, "read"))) return;
  zustand.vorgangName = "";
  await dateienUebernehmen(await dateienAus(zustand.eingang), true);
}

// ---------- Antragsart ----------
function artSetzen(schluessel, neu = true) {
  const alt = art();
  zustand.art = ARTEN[schluessel] ? schluessel : "erbausschlagung";
  const a = art();
  $("#art").value = zustand.art;
  lokal.schreiben("art", zustand.art);
  document.querySelectorAll(".nur-nachlass").forEach((el) => { el.hidden = !a.nachlass; });
  document.querySelectorAll(".nicht-nachlass").forEach((el) => { el.hidden = !!a.nachlass; });
  document.querySelectorAll(".nur-unterzeichner").forEach((el) => { el.hidden = !a.unterzeichner; });
  $("#sachgebiet").value = a.sachgebiet;
  if (neu || !$("#gegenstand").value || $("#gegenstand").value === alt.gegenstand) setzen("gegenstand", a.gegenstand);
  $("#parteien").placeholder = a.parteien || "";
  $("#ort-label").textContent = a.ort || "Ort für die Zuständigkeit";
  $("#brieftext").value = lokal.lesen("texte", {})[zustand.art] || a.text;
  if (zustand.dokumente.length) urkundeAuslesen();
}

// ---------- Maske ----------
const FELDER = ["uvz_nr", "uvz_jahr", "urkundsdatum", "gericht_aktenzeichen", "gegenstand", "parteien", "ort",
  "e_vorname", "e_nachname", "e_geburtsname", "e_geburtsdatum", "sterbedatum_von", "sterbedatum_bis", "letzter_wohnort"];

function setzen(id, wert, pruefen = true) {
  const el = $(`#${id}`);
  el.value = wert || "";
  el.classList.toggle("leer", pruefen && !wert);
}

function maskeFuellen(d) {
  const e = d.erblasser || {};
  for (const k of ["uvz_nr", "uvz_jahr", "urkundsdatum"]) setzen(k, d[k]);
  setzen("gericht_aktenzeichen", d.gericht_aktenzeichen, false);
  if (art().nachlass) {
    for (const k of ["sterbedatum_von", "sterbedatum_bis", "letzter_wohnort"]) setzen(k, d[k]);
    for (const k of ["vorname", "nachname", "geburtsdatum"]) setzen(`e_${k}`, e[k]);
    setzen("e_geburtsname", e.geburtsname, false);
  } else {
    $("#parteien").classList.toggle("leer", !$("#parteien").value);
    $("#ort").classList.toggle("leer", !$("#ort").value);
  }
  $("#personen").innerHTML = "";
  d.ausschlagende.forEach(personZeile);
  $("#kinder").textContent = d.kinder.length
    ? d.kinder.map((k) => `${k.vorname} ${k.nachname}${k.geburtsdatum ? `, geb. ${k.geburtsdatum}` : ""}`).join("\n")
    : "–";
  gerichtVorschlagen(true);
  // Vorrang hat das Gericht des Wohnorts; das anschreibende Gericht nur, wenn dafür nichts bekannt ist
  if (!$("#gericht").value && d.gericht_ort && GERICHTE[`AG ${d.gericht_ort}`]) $("#gericht").value = `AG ${d.gericht_ort}`;
  $("#gericht").classList.toggle("leer", !$("#gericht").value);
}

function personZeile(p = {}) {
  const zeile = document.createElement("div");
  zeile.className = "person";
  for (const [k, ph] of [["anrede", "Anrede"], ["vorname", "Vorname(n)"], ["nachname", "Nachname"],
    ["strasse", "Straße Nr."], ["plz", "PLZ"], ["ort", "Ort"]]) {
    const i = document.createElement("input");
    i.dataset.feld = k; i.placeholder = ph; i.value = p[k] || ""; i.setAttribute("aria-label", ph);
    zeile.append(i);
  }
  const weg = document.createElement("button");
  weg.type = "button"; weg.textContent = "✕"; weg.title = "Person entfernen"; weg.className = "klein";
  weg.onclick = () => zeile.remove();
  zeile.append(weg);
  $("#personen").append(zeile);
}

function zustaendigkeitsort() { return (art().nachlass ? $("#letzter_wohnort") : $("#ort")).value.trim(); }

function gerichtVorschlagen(neu = false) {
  const sel = $("#gericht");
  if (sel.value && !neu) return;
  sel.value = vorschlagen(zustaendigkeitsort(), lokal.lesen("orte", {})) || "";
  sel.classList.toggle("leer", !sel.value);
}

function daten() {
  const v = Object.fromEntries(FELDER.map((k) => [k, $(`#${k}`).value.trim()]));
  const a = art();
  const erblasser = { vorname: v.e_vorname, nachname: v.e_nachname, geburtsname: v.e_geburtsname, geburtsdatum: v.e_geburtsdatum };
  return {
    uvz_nr: v.uvz_nr, uvz_jahr: v.uvz_jahr, urkundsdatum: v.urkundsdatum,
    sachgebiet: $("#sachgebiet").value, gegenstand: v.gegenstand,
    parteien: a.nachlass ? [erblasser.nachname, erblasser.vorname].filter(Boolean).join(", ") : v.parteien,
    gericht_code: GERICHTE[$("#gericht").value] || "", gericht_aktenzeichen: v.gericht_aktenzeichen,
    erblasser, sterbedatum_von: v.sterbedatum_von, sterbedatum_bis: v.sterbedatum_bis, letzter_wohnort: v.letzter_wohnort,
    ausschlagende: [...document.querySelectorAll(".person")].map((z) =>
      Object.fromEntries([...z.querySelectorAll("input")].map((i) => [i.dataset.feld, i.value.trim()]))),
  };
}

// ---------- Notardaten ----------
const NOTAR = ["anrede", "vorname", "nachname", "strasse", "plz", "ort"];
function notarLaden() {
  const n = lokal.lesen("notar", {});
  for (const k of NOTAR) $(`#n_${k}`).value = n[k] || "";
  if (!n.anrede) $("#n_anrede").value = "Herr";
  return n;
}
function notar() { return Object.fromEntries(NOTAR.map((k) => [k, $(`#n_${k}`).value.trim()])); }


// ---------- Erstellen ----------
const sauber = (s, max = 38) => s.normalize("NFC").replace(/[^\p{L}\p{N}\-]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, max);

async function erstellen() {
  const d = daten();
  const n = notar();
  const a = art();
  const urk = zustand.dokumente[zustand.urkunde];
  if (!urk) return meldung("Bitte zuerst den Vorgang bzw. die Urkunde (PDF) laden.", "warnung");
  if (!n.nachname || !n.ort) { $("#einstellungen").open = true; return meldung("Bitte unter „Notardaten“ Ihre Angaben eintragen.", "warnung"); }
  if (!d.uvz_nr || !d.uvz_jahr) return meldung("Bitte UVZ-Nr. und Jahr eintragen.", "warnung");
  if (!d.gericht_code) return meldung("Bitte das Gericht auswählen.", "warnung");
  if (!d.parteien) return meldung(a.nachlass ? "Bitte den Erblasser eintragen." : "Bitte die Parteien eintragen.", "warnung");
  if (!d.gegenstand) return meldung("Bitte den Gegenstand eintragen.", "warnung");

  const ordnername = sauber(`${a.gegenstand || a.name} ${d.uvz_nr}_${d.uvz_jahr} - ${d.parteien.split(",")[0]}`, 80);
  const inhalt = {};
  const dokumente = [];
  const anlagenNamen = [];
  const hinzu = (blob, name, sig, klasse, typ) => {
    inhalt[name] = blob;
    if (sig) inhalt[`${name}.pkcs7`] = sig;
    dokumente.push({ datei: name, signatur: sig ? `${name}.pkcs7` : null, klasse, typ });
  };

  const urkName = `${sauber(`${d.uvz_nr}_${d.uvz_jahr}_Urkunde`)}.pdf`;
  hinzu(urk.pdf, urkName, urk.sig, CODES.dokumentklasse_urkunde, CODES.dokumenttyp_urkunde);
  anlagenNamen.push(`${a.gegenstand || "Urkunde"} (UVZ-Nr. ${d.uvz_nr}/${d.uvz_jahr})`);
  const anlagen = zustand.dokumente.filter((x, i) => i !== zustand.urkunde && x.mit);
  anlagen.forEach((x) => anlagenNamen.push(x.bez || bezeichnung(x.pdf.name)));

  const anschreibenAuto = $("#anschreiben-auto").checked;
  if (zustand.anschreibenDatei || anschreibenAuto) {
    const blob = zustand.anschreibenDatei || new Blob([await anschreibenErstellen(d, n, $("#gericht").value, a,
      $("#brieftext").value.trim() || a.text, anlagenNamen)], { type: "application/pdf" });
    hinzu(blob, `${sauber(`Anschreiben_${d.uvz_nr}_${d.uvz_jahr}`)}.pdf`, null, CODES.dokumentklasse_anschreiben, CODES.dokumenttyp_anschreiben);
  }
  anlagen.forEach((x, i) => {
    const bez = x.bez || bezeichnung(x.pdf.name);
    hinzu(x.pdf, `${sauber(`Anlage_${i + 1}_${bez}`, 60)}.pdf`, x.sig, CODES.dokumentklasse_anlage, anlagentyp(bez));
  });
  inhalt["xjustiz_nachricht.xml"] = new Blob([nachricht(d, n, dokumente, VERSION)], { type: "application/xml" });

  lokal.schreiben("orte", merken(zustaendigkeitsort(), $("#gericht").value, lokal.lesen("orte", {})));

  const ohneSig = [urk, ...anlagen].filter((x) => !x.sig).length;
  const hinweis = ohneSig ? ` Achtung: ${ohneSig} Dokument(e) ohne Signaturdatei.` : "";
  if (zustand.ziel && (await erlaubt(zustand.ziel, "readwrite"))) {
    const ordner = await zustand.ziel.getDirectoryHandle(ordnername, { create: true });
    const ablage = await ordner.getDirectoryHandle("attachments", { create: true });
    for (const [name, blob] of Object.entries(inhalt)) {
      const w = await (await ablage.getFileHandle(name, { create: true })).createWritable();
      await w.write(blob);
      await w.close();
    }
    meldung(`XNP-Importdatei „${ordnername}“ erstellt in „${zustand.ziel.name}“. In XNP: Sonstige Anträge → Importieren → Ordner wählen → Empfänger auswählen.${hinweis}`, "erfolg");
  } else {
    const zip = new window.JSZip();
    for (const [name, blob] of Object.entries(inhalt)) zip.file(`${ordnername}/attachments/${name}`, blob);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
    link.download = `${ordnername}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    meldung(`ZIP „${ordnername}.zip“ gespeichert. Bitte entpacken und den Ordner in XNP importieren (Sonstige Anträge → Importieren), dann den Empfänger auswählen.${hinweis}`, "erfolg");
  }
}

// ---------- Oberfläche ----------
function meldung(text, artDerMeldung = "hinweis") {
  const el = $("#meldung");
  el.textContent = text;
  el.className = `meldung ${artDerMeldung}`;
}

async function ordnerWaehlen(k) {
  try {
    const h = await window.showDirectoryPicker({ id: k, mode: k === "ziel" ? "readwrite" : "read" });
    zustand[k] = h;
    await ordnerSpeichern(k, h);
    ordnerAnzeigen();
    if (k === "eingang") await vorgaengeAuflisten();
  } catch { /* abgebrochen */ }
}

function ordnerAnzeigen() {
  $("#eingang-name").textContent = zustand.eingang ? zustand.eingang.name : "nicht gewählt";
  $("#ziel-name").textContent = zustand.ziel ? zustand.ziel.name : (kannOrdner ? "nicht gewählt (dann ZIP-Download)" : "ZIP-Download");
}

async function start() {
  $("#version").textContent = `Version ${VERSION}`;
  for (const [k, a] of Object.entries(ARTEN)) $("#art").append(new Option(a.name, k));
  for (const [c, name] of Object.entries(SACHGEBIETE)) $("#sachgebiet").append(new Option(name, c));
  const sel = $("#gericht");
  sel.append(new Option("– bitte wählen –", ""));
  for (const name of Object.keys(GERICHTE).sort((a, b) => a.localeCompare(b, "de"))) sel.append(new Option(name.replace(/^AG /, "Amtsgericht "), name));
  sel.onchange = () => sel.classList.toggle("leer", !sel.value);

  const n = notarLaden();
  if (!n.nachname) $("#einstellungen").open = true;
  for (const k of NOTAR) $(`#n_${k}`).onchange = () => lokal.schreiben("notar", notar());

  const ausAdresse = new URLSearchParams(location.search).get("art");
  artSetzen(ausAdresse || lokal.lesen("art", "erbausschlagung"));
  $("#art").onchange = () => artSetzen($("#art").value);
  $("#brieftext").onchange = () => {
    const texte = lokal.lesen("texte", {});
    texte[zustand.art] = $("#brieftext").value.trim();
    if (!texte[zustand.art] || texte[zustand.art] === art().text) delete texte[zustand.art];
    lokal.schreiben("texte", texte);
  };

  $("#datei").onchange = (ev) => { zustand.vorgangName = ""; dateienUebernehmen([...ev.target.files]); };
  $("#anschreiben").onchange = (ev) => {
    zustand.anschreibenDatei = ev.target.files[0] || null;
    $("#anschreiben-name").textContent = zustand.anschreibenDatei ? zustand.anschreibenDatei.name : "";
  };
  $("#letzter_wohnort").onchange = () => gerichtVorschlagen();
  $("#ort").onchange = () => gerichtVorschlagen();
  $("#person-neu").onclick = () => personZeile();
  $("#erstellen").onclick = () => erstellen().catch((f) => meldung(`Fehler: ${f.message}`, "fehler"));

  if (kannOrdner) {
    $("#eingang-waehlen").onclick = () => ordnerWaehlen("eingang");
    $("#ziel-waehlen").onclick = () => ordnerWaehlen("ziel");
    $("#vorgang").onchange = () => vorgangLaden();
    $("#vorgang-laden").onclick = () => vorgangLaden();
    $("#neueste").onclick = () => neuestePdfAusOrdner();
    zustand.eingang = await ordnerLaden("eingang");
    zustand.ziel = await ordnerLaden("ziel");
    await vorgaengeAuflisten();
  } else {
    document.querySelectorAll(".nur-ordner").forEach((el) => { el.hidden = true; });
  }
  ordnerAnzeigen();
  meldung(zustand.eingang ? "Antragsart wählen, dann den Vorgang laden." : "Wählen Sie den Eingangsordner oder die Dateien (Urkunde, Anlagen, Signaturdateien).");
}

start();
