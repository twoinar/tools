// Erbausschlagung → XNP (Web). Alles läuft im Browser; es werden keine Daten übertragen.
import * as pdfjs from "../vendor/pdf.min.mjs";
import { auslesen } from "./auslesen.js";
import { nachricht, aktenzeichen } from "./xjustiz.js";
import { GERICHTE, vorschlagen, merken } from "./gerichte.js";
import { erstellen as anschreibenErstellen } from "./anschreiben.js";

export const VERSION = "1.7 (22.10.2026)";
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
const zustand = { pdf: null, signatur: null, anschreibenDatei: null, eingang: null, ziel: null };

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

async function dateienUebernehmen(dateien) {
  const pdfs = dateien.filter((f) => /\.pdf$/i.test(f.name));
  if (!pdfs.length) return meldung("Bitte eine PDF-Datei auswählen.", "warnung");
  // Neueste PDF, bevorzugt eine mit Signaturdatei daneben (elektronisch beglaubigte Abschrift)
  const sigZu = (pdf) => dateien.find((f) => istSignaturZu(pdf.name, f.name)) || null;
  pdfs.sort((a, b) => b.lastModified - a.lastModified);
  const pdf = pdfs.find(sigZu) || pdfs[0];
  const sig = sigZu(pdf);
  await laden(pdf, sig);
}

async function laden(pdf, signatur) {
  zustand.pdf = pdf;
  zustand.signatur = signatur;
  $("#pdf-name").textContent = `${pdf.name} – ${signatur ? `signiert (${signatur.name})` : "OHNE Signaturdatei"}`;
  let d;
  try {
    d = auslesen(await pdfText(await pdf.arrayBuffer()));
  } catch (fehler) {
    return meldung(`Die PDF konnte nicht gelesen werden: ${fehler.message}`, "fehler");
  }
  maskeFuellen(d);
  if (!$("#gericht").value) d.unsicher.push("Nachlassgericht");
  const unsicher = d.unsicher.length ? `Bitte prüfen: ${d.unsicher.join(", ")}.` : "Alle Angaben erkannt. Bitte trotzdem kurz prüfen.";
  const sig = signatur ? `Signaturdatei gefunden (${signatur.name}).` : "Keine Signaturdatei neben der PDF gefunden!";
  meldung(`${unsicher} ${sig}`, signatur ? "hinweis" : "warnung");
}

async function neuestePdfAusOrdner() {
  if (!zustand.eingang) return meldung("Bitte zuerst den Ordner der beglaubigten Abschriften wählen.", "warnung");
  if (!(await erlaubt(zustand.eingang, "read"))) return;
  const dateien = [];
  for await (const eintrag of zustand.eingang.values()) {
    if (eintrag.kind === "file") dateien.push(await eintrag.getFile());
  }
  await dateienUebernehmen(dateien);
}

// ---------- Maske ----------
const FELDER = ["uvz_nr", "uvz_jahr", "urkundsdatum", "gericht_aktenzeichen", "e_vorname", "e_nachname",
  "e_geburtsname", "e_geburtsdatum", "sterbedatum_von", "sterbedatum_bis", "letzter_wohnort"];

function setzen(id, wert, pruefen = true) {
  const el = $(`#${id}`);
  el.value = wert || "";
  el.classList.toggle("leer", pruefen && !wert);
}

function maskeFuellen(d) {
  const e = d.erblasser || {};
  for (const k of ["uvz_nr", "uvz_jahr", "urkundsdatum", "sterbedatum_von", "sterbedatum_bis", "letzter_wohnort"]) setzen(k, d[k]);
  for (const k of ["vorname", "nachname", "geburtsdatum"]) setzen(`e_${k}`, e[k]);
  setzen("e_geburtsname", e.geburtsname, false);
  setzen("gericht_aktenzeichen", d.gericht_aktenzeichen, false);
  $("#personen").innerHTML = "";
  d.ausschlagende.forEach(personZeile);
  $("#kinder").textContent = d.kinder.length
    ? d.kinder.map((k) => `${k.vorname} ${k.nachname}, geb. ${k.geburtsdatum}`).join("\n")
    : "–";
  gerichtVorschlagen(true);
  // Vorrang hat das Gericht des letzten Aufenthalts; das anschreibende Gericht nur, wenn dafür nichts bekannt ist (gelb lassen)
  if (!$("#gericht").value && d.gericht_ort && GERICHTE[`AG ${d.gericht_ort}`]) $("#gericht").value = `AG ${d.gericht_ort}`;
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

function gerichtVorschlagen(neu = false) {
  const sel = $("#gericht");
  if (sel.value && !neu) return;
  sel.value = vorschlagen($("#letzter_wohnort").value, lokal.lesen("orte", {})) || "";
  sel.classList.toggle("leer", !sel.value);
}

function daten() {
  const v = Object.fromEntries(FELDER.map((k) => [k, $(`#${k}`).value.trim()]));
  return {
    uvz_nr: v.uvz_nr, uvz_jahr: v.uvz_jahr, urkundsdatum: v.urkundsdatum,
    gericht_code: GERICHTE[$("#gericht").value] || "", gericht_aktenzeichen: v.gericht_aktenzeichen,
    erblasser: { vorname: v.e_vorname, nachname: v.e_nachname, geburtsname: v.e_geburtsname, geburtsdatum: v.e_geburtsdatum },
    sterbedatum_von: v.sterbedatum_von, sterbedatum_bis: v.sterbedatum_bis, letzter_wohnort: v.letzter_wohnort,
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
  if (!zustand.pdf) return meldung("Bitte zuerst die Urkunde (PDF) laden.", "warnung");
  if (!n.nachname || !n.ort) { $("#einstellungen").open = true; return meldung("Bitte unter „Notardaten“ Ihre Angaben eintragen.", "warnung"); }
  if (!d.gericht_code) return meldung("Bitte das Nachlassgericht auswählen.", "warnung");
  if (!d.ausschlagende.length) return meldung("Es ist kein Unterzeichner eingetragen.", "warnung");

  const e = d.erblasser;
  const ordnername = sauber(`Erbausschlagung ${d.uvz_nr}_${d.uvz_jahr} - ${e.nachname}`, 80);
  const urkunde = `${sauber(`${d.uvz_nr}_${d.uvz_jahr}_${d.ausschlagende[0].nachname}`)}.pdf`;
  const dateien = { urkunde, signatur: zustand.signatur ? `${urkunde}.pkcs7` : null };
  const inhalt = { [urkunde]: zustand.pdf };
  if (zustand.signatur) inhalt[dateien.signatur] = zustand.signatur;

  const anschreibenAuto = $("#anschreiben-auto").checked;
  if (zustand.anschreibenDatei || anschreibenAuto) {
    dateien.anschreiben = `${sauber(`Anschreiben_${e.nachname}`)}.pdf`;
    inhalt[dateien.anschreiben] = zustand.anschreibenDatei
      || new Blob([await anschreibenErstellen(d, n, $("#gericht").value)], { type: "application/pdf" });
  }
  inhalt["xjustiz_nachricht.xml"] = new Blob([nachricht(d, n, dateien, VERSION)], { type: "application/xml" });

  lokal.schreiben("orte", merken(d.letzter_wohnort, $("#gericht").value, lokal.lesen("orte", {})));

  if (zustand.ziel && (await erlaubt(zustand.ziel, "readwrite"))) {
    const ordner = await zustand.ziel.getDirectoryHandle(ordnername, { create: true });
    const anlagen = await ordner.getDirectoryHandle("attachments", { create: true });
    for (const [name, blob] of Object.entries(inhalt)) {
      const w = await (await anlagen.getFileHandle(name, { create: true })).createWritable();
      await w.write(blob);
      await w.close();
    }
    meldung(`Importordner „${ordnername}“ erstellt in „${zustand.ziel.name}“. In XNP: Sonstige Anträge → Importieren → Ordner wählen → Empfänger auswählen.`, "erfolg");
  } else {
    const zip = new window.JSZip();
    for (const [name, blob] of Object.entries(inhalt)) zip.file(`${ordnername}/attachments/${name}`, blob);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
    a.download = `${ordnername}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    meldung(`ZIP „${ordnername}.zip“ gespeichert. Bitte entpacken und den Ordner in XNP importieren (Sonstige Anträge → Importieren), dann den Empfänger auswählen.`, "erfolg");
  }
}

// ---------- Oberfläche ----------
function meldung(text, art = "hinweis") {
  const el = $("#meldung");
  el.textContent = text;
  el.className = `meldung ${art}`;
}

async function ordnerWaehlen(k) {
  try {
    const h = await window.showDirectoryPicker({ id: k, mode: k === "ziel" ? "readwrite" : "read" });
    zustand[k] = h;
    await ordnerSpeichern(k, h);
    ordnerAnzeigen();
    if (k === "eingang") await neuestePdfAusOrdner();
  } catch { /* abgebrochen */ }
}

function ordnerAnzeigen() {
  $("#eingang-name").textContent = zustand.eingang ? zustand.eingang.name : "nicht gewählt";
  $("#ziel-name").textContent = zustand.ziel ? zustand.ziel.name : (kannOrdner ? "nicht gewählt (dann ZIP-Download)" : "ZIP-Download");
}

async function start() {
  $("#version").textContent = `Version ${VERSION}`;
  const sel = $("#gericht");
  sel.append(new Option("– bitte wählen –", ""));
  for (const name of Object.keys(GERICHTE).sort((a, b) => a.localeCompare(b, "de"))) sel.append(new Option(name.replace(/^AG /, "Amtsgericht "), name));
  sel.onchange = () => sel.classList.toggle("leer", !sel.value);

  const n = notarLaden();
  if (!n.nachname) $("#einstellungen").open = true;
  for (const k of NOTAR) $(`#n_${k}`).onchange = () => lokal.schreiben("notar", notar());

  $("#datei").onchange = (ev) => dateienUebernehmen([...ev.target.files]);
  $("#anschreiben").onchange = (ev) => {
    zustand.anschreibenDatei = ev.target.files[0] || null;
    $("#anschreiben-name").textContent = zustand.anschreibenDatei ? zustand.anschreibenDatei.name : "";
  };
  $("#letzter_wohnort").onchange = () => gerichtVorschlagen();
  $("#person-neu").onclick = () => personZeile();
  $("#erstellen").onclick = () => erstellen().catch((f) => meldung(`Fehler: ${f.message}`, "fehler"));

  if (kannOrdner) {
    $("#eingang-waehlen").onclick = () => ordnerWaehlen("eingang");
    $("#ziel-waehlen").onclick = () => ordnerWaehlen("ziel");
    $("#neueste").onclick = () => neuestePdfAusOrdner();
    zustand.eingang = await ordnerLaden("eingang");
    zustand.ziel = await ordnerLaden("ziel");
  } else {
    document.querySelectorAll(".nur-ordner").forEach((el) => { el.hidden = true; });
  }
  ordnerAnzeigen();
  meldung(zustand.eingang ? "Klicken Sie auf „Neueste PDF laden“ oder wählen Sie eine Datei." : "Wählen Sie die beglaubigte Abschrift (PDF und Signaturdatei) aus.");
}

start();
