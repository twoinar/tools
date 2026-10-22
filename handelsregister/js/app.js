// XNP – Handelsregisteranmeldung (Web). Alles läuft im Browser; es werden keine Daten übertragen.
import * as pdfjs from "../../xnp/vendor/pdf.min.mjs";
import { auslesen, REGISTERGERICHTE } from "./auslesen.js";

export const VERSION = "0.1 (22.10.2026)";
pdfjs.GlobalWorkerOptions.workerSrc = new URL("../../xnp/vendor/pdf.worker.min.mjs", import.meta.url).href;

const $ = (s) => document.querySelector(s);
const FELDER = ["firma", "sitz", "gericht", "registerart", "registernummer", "geschaeftsanschrift", "uvz_nr", "uvz_jahr", "datum"];

// dokumente: [{ pdf: File, sig: File|null, text: string, mit: bool, bez: string }]
const zustand = { dokumente: [], anmeldung: -1, daten: null };

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

// Bezeichnung einer Anlage nach Dateiname oder Inhalt
function bezeichnung(name, text) {
  const s = `${name} ${text.slice(0, 600)}`;
  if (/Gesellschafterbeschluss|Gesellschafterversammlung|Beschluss/i.test(s)) return "Gesellschafterbeschluss";
  if (/Niederlegung/i.test(s)) return "Amtsniederlegung";
  if (/Gesellschafterliste|Liste der Gesellschafter/i.test(s)) return "Gesellschafterliste";
  if (/Abberufung/i.test(s)) return "Abberufung";
  return name.replace(/\.pdf$/i, "");
}

const istAnmeldung = (dok) => /(?:zur Eintragung|angemeldet|melden .{0,60}an)/.test(dok.text) && /HR[AB]\s*\d|Handelsregister/.test(dok.text);

async function dateienUebernehmen(dateien) {
  const pdfs = dateien.filter((f) => /\.pdf$/i.test(f.name));
  if (!pdfs.length) return meldung("Keine PDF-Datei gefunden.", "warnung");
  const doks = [];
  for (const pdf of pdfs) {
    let text = "";
    try { text = await pdfText(await pdf.arrayBuffer()); } catch { /* nicht lesbar: bleibt Anlage */ }
    doks.push({ pdf, sig: dateien.find((f) => istSignaturZu(pdf.name, f.name)) || null, text, mit: true, bez: bezeichnung(pdf.name, text) });
  }
  zustand.dokumente = doks;
  zustand.anmeldung = Math.max(0, doks.findIndex(istAnmeldung));
  dokumenteAnzeigen();
  anmeldungAuslesen();
}

function dokumenteAnzeigen() {
  const tb = $("#dokumente tbody");
  tb.innerHTML = "";
  zustand.dokumente.forEach((dok, i) => {
    const tr = document.createElement("tr");
    const mit = Object.assign(document.createElement("input"), { type: "checkbox", checked: dok.mit, title: "mitschicken" });
    mit.onchange = () => { dok.mit = mit.checked; };
    const anm = Object.assign(document.createElement("input"), { type: "radio", name: "anmeldung", checked: i === zustand.anmeldung, title: "Das ist die Anmeldung" });
    anm.onchange = () => { zustand.anmeldung = i; dok.mit = true; dokumenteAnzeigen(); anmeldungAuslesen(); };
    const bez = Object.assign(document.createElement("input"), { type: "text", value: i === zustand.anmeldung ? "Anmeldung" : dok.bez, disabled: i === zustand.anmeldung });
    bez.onchange = () => { dok.bez = bez.value.trim(); };
    const sig = document.createElement("span");
    sig.textContent = dok.sig ? "✓ signiert" : "OHNE Signatur";
    sig.className = dok.sig ? "ok" : "fehlt";
    for (const el of [mit, anm, document.createTextNode(dok.pdf.name), bez, sig]) {
      const td = document.createElement("td");
      td.append(el);
      tr.append(td);
    }
    tb.append(tr);
  });
  $("#dokumente").hidden = !zustand.dokumente.length;
}

function anmeldungAuslesen() {
  const dok = zustand.dokumente[zustand.anmeldung];
  if (!dok) return;
  const d = auslesen(dok.text);
  zustand.daten = d;
  const sel = $("#gericht");
  if (d.gericht && ![...sel.options].some((o) => o.value === d.gericht)) sel.add(new Option(d.gericht, d.gericht));
  for (const f of FELDER) $(`#${f}`).value = d[f] || "";
  personenAnzeigen("ausgeschieden");
  personenAnzeigen("bestellt");
  $("#vertretung_allgemein").textContent = d.vertretung_allgemein || "– nicht gefunden –";
  markieren();
  const n = d.ausgeschieden.length + d.bestellt.length;
  meldung(d.unsicher.length
    ? `Ausgelesen: ${n} Geschäftsführer-Angabe(n). Bitte prüfen: ${d.unsicher.join(", ")}.`
    : `Ausgelesen: ${n} Geschäftsführer-Angabe(n), alle Felder gefunden.`, d.unsicher.length ? "warnung" : "erfolg");
}

const PERSONENFELDER = [["anrede", "Anrede"], ["vorname", "Vorname(n)"], ["nachname", "Nachname"], ["geburtsname", "Geburtsname"], ["geburtsdatum", "Geburtsdatum"], ["wohnort", "Wohnort"]];

function leerePerson() {
  return { anrede: "Herr", vorname: "", nachname: "", geburtsname: "", geburtsdatum: "", wohnort: "", einzelvertretung: false, befreit181: false, grund: "" };
}

function personenAnzeigen(liste) {
  const ziel = $(`#${liste}`);
  ziel.innerHTML = "";
  const personen = zustand.daten ? zustand.daten[liste] : [];
  personen.forEach((p, i) => {
    const zeile = document.createElement("div");
    zeile.className = "gf";
    for (const [k, titel] of PERSONENFELDER) {
      let el;
      if (k === "anrede") {
        el = document.createElement("select");
        for (const a of ["Herr", "Frau"]) el.add(new Option(a, a, false, p.anrede === a));
      } else {
        el = Object.assign(document.createElement("input"), { value: p[k], placeholder: titel, title: titel });
        if (k !== "geburtsname") el.classList.toggle("leer", !p[k]);
      }
      el.onchange = () => { p[k] = el.value.trim(); if (k !== "geburtsname" && k !== "anrede") el.classList.toggle("leer", !p[k]); };
      zeile.append(el);
    }
    if (liste === "bestellt") {
      for (const [k, titel] of [["einzelvertretung", "einzeln"], ["befreit181", "§ 181 befreit"]]) {
        const box = Object.assign(document.createElement("input"), { type: "checkbox", checked: p[k] });
        box.onchange = () => { p[k] = box.checked; };
        const lab = document.createElement("label");
        lab.append(box, titel);
        zeile.append(lab);
      }
    } else {
      const grund = document.createElement("select");
      for (const g of ["Ausscheiden", "Abberufung", "Amtsniederlegung", "Tod"]) grund.add(new Option(g, g, false, p.grund === g));
      grund.onchange = () => { p.grund = grund.value; };
      zeile.append(grund, document.createElement("span"));
    }
    const weg = Object.assign(document.createElement("button"), { type: "button", className: "klein", textContent: "✕", title: "entfernen" });
    weg.onclick = () => { personen.splice(i, 1); personenAnzeigen(liste); };
    zeile.append(weg);
    ziel.append(zeile);
  });
}

function markieren() {
  for (const f of FELDER) {
    const el = $(`#${f}`);
    el.classList.toggle("leer", !el.value);
  }
}

function meldung(text, art = "") {
  const el = $("#meldung");
  el.textContent = text;
  el.className = `meldung ${art}`;
}

// ---------- Start ----------
$("#version").textContent = `Version ${VERSION}`;
const sel = $("#gericht");
sel.add(new Option("– bitte wählen –", ""));
for (const g of Object.keys(REGISTERGERICHTE)) sel.add(new Option(g, g));
for (const f of FELDER) $(`#${f}`).addEventListener("input", markieren);
for (const b of document.querySelectorAll("[data-neu]")) {
  b.onclick = () => {
    zustand.daten ??= auslesen("");
    zustand.daten[b.dataset.neu].push(leerePerson());
    personenAnzeigen(b.dataset.neu);
  };
}
$("#datei").onchange = (e) => dateienUebernehmen([...e.target.files]);
const ablage = $("#ablage");
window.ondragover = (e) => { e.preventDefault(); ablage.classList.add("aktiv"); };
window.ondragleave = (e) => { if (!e.relatedTarget) ablage.classList.remove("aktiv"); };
window.ondrop = (e) => { e.preventDefault(); ablage.classList.remove("aktiv"); dateienUebernehmen([...e.dataTransfer.files]); };
markieren();
