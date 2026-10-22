// Oberfläche der Geldwäscheprüfung. Liest die Datei im Browser, nichts verlässt den PC.
import * as pdfjs from "../vendor/pdf.min.mjs";
import { erkennen, euro } from "./erkennen.js";
import { PUNKTE, GRUPPEN, startwert, gesamt, entlastend } from "./regeln.js";
import { HOCHRISIKO_STAND, hochrisikoListe } from "./staaten.js";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdf.worker.min.mjs", import.meta.url).href;

const $ = (s) => document.querySelector(s);
const zustand = { f: null, werte: {}, datei: "" };

function meldung(text, art = "") {
  const el = $("#meldung");
  el.textContent = text;
  el.className = `meldung ${art}`;
}

function speicher(name, wert) {
  try {
    if (wert === undefined) return localStorage.getItem(name) || "";
    localStorage.setItem(name, wert);
  } catch { /* privates Fenster: dann eben nicht merken */ }
  return "";
}

// ---------- Datei lesen ----------
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

async function docxText(buffer) {
  const zip = await window.JSZip.loadAsync(buffer);
  const datei = zip.file("word/document.xml");
  if (!datei) throw new Error("keine Word-Datei");
  const xml = new DOMParser().parseFromString(await datei.async("string"), "application/xml");
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const absaetze = [];
  for (const p of xml.getElementsByTagNameNS(W, "p")) {
    let s = "";
    for (const el of p.getElementsByTagNameNS(W, "*")) {
      if (el.localName === "t") s += el.textContent;
      else if (el.localName === "tab") s += " ";
      else if (el.localName === "br") s += "\n";
    }
    absaetze.push(s);
  }
  return absaetze.join("\n");
}

async function dateiLesen(datei) {
  const name = datei.name.toLowerCase();
  const buffer = await datei.arrayBuffer();
  if (name.endsWith(".pdf")) return pdfText(buffer);
  if (name.endsWith(".docx")) return docxText(buffer);
  if (name.endsWith(".txt")) return new TextDecoder("utf-8").decode(buffer);
  if (name.endsWith(".doc") || name.endsWith(".rtf")) throw new Error("Bitte den Vertrag in Word als .docx oder als PDF speichern.");
  throw new Error("Dateityp wird nicht unterstützt (PDF, DOCX oder TXT).");
}

async function laden(datei) {
  meldung(`Lese ${datei.name} …`);
  try {
    const text = await dateiLesen(datei);
    zustand.datei = datei.name;
    pruefen(text);
  } catch (e) {
    meldung(e.message || "Die Datei konnte nicht gelesen werden.", "fehler");
  }
}

// ---------- Prüfen ----------
function zahl(s) {
  const t = String(s || "").replace(/[€\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function pruefen(text) {
  if (text.replace(/\s/g, "").length < 200) {
    meldung("Im Dokument wurde kaum Text gefunden. Ist es ein Scan ohne Texterkennung? Dann bitte zuerst eine Texterkennung (OCR) laufen lassen oder den Text einfügen.", "warnung");
    return;
  }
  const f = erkennen(text);
  zustand.f = f;
  zustand.werte = {};
  $("#uvz").value = f.uvz;
  $("#urkundsdatum").value = f.urkundsdatum;
  $("#vertragsart").value = f.vertragsart;
  $("#kaufpreis").value = f.kaufpreis != null ? f.kaufpreis.toLocaleString("de-DE", { minimumFractionDigits: 2 }) : "";
  $("#objekt").value = [f.objektart, f.grundbuch && `Grundbuch von ${f.grundbuch}`, f.flurstueck].filter(Boolean).join(", ");
  $("#verkehrswert").value = f.verkehrswertVertrag ? f.verkehrswertVertrag.toLocaleString("de-DE") : "";
  $("#vorerwerb").value = f.vorerwerbDatum;
  $("#vorpreis").value = f.vorpreis ? f.vorpreis.toLocaleString("de-DE") : "";
  for (const id of ["uvz", "kaufpreis"]) $(`#${id}`).classList.toggle("leer", !$(`#${id}`).value);
  beteiligteZeigen(f);
  const ent = entlastend(f);
  $("#entlastend").textContent = ent.length ? `Eher entlastend: ${ent.join("; ")}.` : "";
  $("#ergebnisbereich").hidden = false;
  bewerten(true);
  const n = PUNKTE.filter((p) => zustand.werte[p.id]?.funde.length).length;
  meldung(`${zustand.datei || "Text"} geprüft: ${f.beteiligte.length} Beteiligte erkannt, ${n} Prüfpunkte mit Fundstellen.${f.unsicher.length ? ` Nicht erkannt: ${f.unsicher.join(", ")}.` : ""}`, "erfolg");
}

function beteiligteZeigen(f) {
  const tb = $("#beteiligte tbody");
  tb.replaceChildren();
  if (!f.beteiligte.length) {
    const tr = tb.insertRow();
    const td = tr.insertCell();
    td.colSpan = 5;
    td.textContent = "Keine Beteiligten erkannt – bitte im Vertrag nachsehen.";
  }
  for (const p of f.beteiligte) {
    const tr = tb.insertRow();
    const auff = [];
    if (p.land) auff.push(p.land.name + (p.land.hochrisiko ? " (Hochrisikostaat)" : p.land.offshore ? " (Offshore)" : ""));
    if (p.auslaendisch) auff.push(p.drittstaat ? "Gesellschaft aus Drittstaat" : "ausländische Gesellschaft");
    if (p.vertreten) auff.push("handelt als Vertreter");
    if (p.organ) auff.push("Organ einer Gesellschaft");
    if (p.staatsangehoerigkeit) auff.push(`Staatsangehörigkeit: ${p.staatsangehoerigkeit}`);
    const art = p.art === "Gesellschaft" ? `Gesellschaft (${p.rechtsform})` : p.organ || p.vertreten ? "Person (Vertreter)" : "Person";
    for (const s of [p.name, p.rolle || "?", art, p.wohnort || p.sitz || "", auff.join("; ")]) tr.insertCell().textContent = s;
  }
}

function eingaben() {
  return { verkehrswert: zahl($("#verkehrswert").value), vorpreis: zahl($("#vorpreis").value), vorerwerbDatum: $("#vorerwerb").value };
}

// neu = true: Vorschläge übernehmen; sonst die Auswahl des Notars behalten
function bewerten(neu = false) {
  const f = { ...zustand.f, kaufpreis: zahl($("#kaufpreis").value), urkundsdatum: $("#urkundsdatum").value };
  const e = eingaben();
  for (const p of PUNKTE) {
    const a = p.auto(f, e);
    const alt = zustand.werte[p.id];
    const automatisch = !alt || alt.automatisch;
    zustand.werte[p.id] = {
      ...a, funde: a.funde || [],
      wert: neu || automatisch ? startwert(p, a.vorschlag) : alt.wert,
      automatisch: neu ? true : automatisch,
      begruendung: alt && !neu ? alt.begruendung : "",
    };
  }
  punkteZeigen();
  gesamtZeigen();
}

function punkteZeigen() {
  const ziel = $("#punkte");
  ziel.replaceChildren();
  for (const [g, gruppe] of Object.entries(GRUPPEN)) {
    const h = document.createElement("h3");
    h.className = "gruppe";
    h.textContent = gruppe.titel;
    ziel.append(h);
    for (const p of PUNKTE.filter((x) => x.gruppe === g)) ziel.append(punktElement(p, gruppe));
  }
}

function punktElement(p, gruppe) {
  const w = zustand.werte[p.id];
  const div = document.createElement("div");
  div.className = `punkt ist-${w.wert}${w.funde.length || w.vorschlag === "pruefen" ? " hat-funde" : ""}`;
  const kopf = document.createElement("div");
  kopf.className = "punkt-kopf";
  const titel = document.createElement("div");
  titel.className = "punkt-titel";
  titel.textContent = p.titel + " ";
  if (w.automatisch && w.vorschlag && w.vorschlag !== "pruefen" && !(p.gruppe === "pflicht" && w.vorschlag === "ja")) {
    const m = document.createElement("span");
    m.className = "marke auto";
    m.textContent = "aus Vertrag";
    titel.append(m);
  }
  if (w.vorschlag === "pruefen") {
    const m = document.createElement("span");
    m.className = "marke auto";
    m.textContent = "bitte prüfen";
    titel.append(m);
  }
  const norm = document.createElement("small");
  norm.textContent = p.norm + (p.hilfe ? ` · ${p.hilfe}` : "");
  if (p.link) {
    const a = document.createElement("a");
    a.href = p.link;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = " · Sanktionsliste öffnen";
    norm.append(a);
  }
  titel.append(norm);
  const sel = document.createElement("select");
  sel.setAttribute("aria-label", p.titel);
  for (const [wert, text] of gruppe.werte) sel.add(new Option(text, wert, false, wert === w.wert));
  sel.addEventListener("change", () => {
    w.wert = sel.value;
    w.automatisch = false;
    div.className = `punkt ist-${w.wert}${w.funde.length ? " hat-funde" : ""}`;
    begr.hidden = !(w.wert === "entkraeftet" || w.wert === "ja" || w.begruendung);
    gesamtZeigen();
  });
  kopf.append(titel, sel);
  div.append(kopf);
  if (w.funde.length) {
    const ul = document.createElement("ul");
    ul.className = "funde";
    for (const t of w.funde) ul.appendChild(document.createElement("li")).textContent = t;
    div.append(ul);
  }
  if (w.hinweis) {
    const hp = document.createElement("p");
    hp.className = "hinweis";
    hp.textContent = w.hinweis;
    div.append(hp);
  }
  const begr = document.createElement("textarea");
  begr.rows = 2;
  begr.placeholder = p.gruppe === "melde" ? "Begründung (bei „entkräftet“ erforderlich: welche Tatsachen den Verdacht entkräften)" : "Vermerk";
  begr.value = w.begruendung;
  begr.hidden = !(w.wert === "entkraeftet" || w.wert === "ja" || w.begruendung || p.gruppe === "pflicht" && w.wert === "offen" && w.funde.length);
  begr.addEventListener("input", () => { w.begruendung = begr.value; gesamtZeigen(); });
  div.append(begr);
  // Klick auf den Titel blendet das Vermerkfeld ein
  titel.addEventListener("click", () => { begr.hidden = false; });
  return div;
}

function gesamtZeigen() {
  const g = gesamt(zustand.werte);
  const fehlend = PUNKTE.filter((p) => zustand.werte[p.id].wert === "entkraeftet" && !zustand.werte[p.id].begruendung.trim());
  const box = $("#gesamt");
  box.className = `gesamt stufe-${g.stufe}`;
  box.replaceChildren();
  box.appendChild(document.createElement("h3")).textContent = g.titel;
  box.appendChild(document.createElement("p")).textContent = g.text;
  if (fehlend.length) box.appendChild(document.createElement("p")).textContent = `Bitte Begründung eintragen bei: ${fehlend.map((p) => p.norm).join("; ")}.`;
  vermerkBauen(g);
}

// ---------- Vermerk ----------
function vermerkDaten(g) {
  const f = zustand.f;
  const kopf = [
    ["UVZ-Nr.", $("#uvz").value],
    ["Urkundsdatum", $("#urkundsdatum").value.split("-").reverse().join(".")],
    ["Vertrag", $("#vertragsart").value],
    ["Objekt", $("#objekt").value],
    ["Kaufpreis", zahl($("#kaufpreis").value) != null ? euro(zahl($("#kaufpreis").value)) : ""],
    ["Beteiligte", f.beteiligte.map((p) => `${p.name}${p.rolle ? ` (${p.rolle}${p.organ || p.vertreten ? ", Vertreter" : ""})` : ""}`).join("; ")],
  ].filter(([, v]) => v);
  const gruppen = Object.entries(GRUPPEN).map(([id, gr]) => ({
    titel: gr.titel,
    zeilen: PUNKTE.filter((p) => p.gruppe === id).map((p) => {
      const w = zustand.werte[p.id];
      return { norm: p.norm, titel: p.titel, wert: Object.fromEntries(gr.werte)[w.wert] || w.wert, begruendung: w.begruendung.trim(), funde: w.wert === "nein" || w.wert === "entfaellt" ? [] : w.funde };
    }),
  }));
  return {
    kopf, gruppen, gesamt: g, entlastend: entlastend(f), bemerkung: $("#bemerkung").value.trim(),
    bearbeiter: $("#bearbeiter").value.trim(), datum: new Date().toLocaleDateString("de-DE"), datei: zustand.datei,
  };
}

function vermerkBauen(g) {
  const d = vermerkDaten(g);
  const art = $("#vermerk");
  art.replaceChildren();
  const el = (tag, text, eltern = art) => { const e = eltern.appendChild(document.createElement(tag)); if (text != null) e.textContent = text; return e; };
  el("h1", "Vermerk zur geldwäscherechtlichen Prüfung");
  const t1 = el("table");
  for (const [k, v] of d.kopf) { const tr = t1.insertRow(); tr.insertCell().textContent = k; tr.insertCell().textContent = v; }
  el("h2", `Ergebnis: ${d.gesamt.titel}`);
  el("p", d.gesamt.text);
  if (d.entlastend.length) el("p", `Entlastend: ${d.entlastend.join("; ")}.`);
  for (const gr of d.gruppen) {
    el("h2", gr.titel);
    const t = el("table");
    const kopf = t.createTHead().insertRow();
    for (const s of ["Prüfpunkt", "Ergebnis", "Fundstellen / Begründung"]) kopf.appendChild(document.createElement("th")).textContent = s;
    for (const z of gr.zeilen) {
      const tr = t.insertRow();
      const c1 = tr.insertCell();
      c1.textContent = z.titel;
      el("div", z.norm, c1).className = "klein";
      tr.insertCell().textContent = z.wert;
      const c3 = tr.insertCell();
      if (z.begruendung) el("div", z.begruendung, c3);
      for (const fu of z.funde.slice(0, 4)) el("div", fu, c3).className = "klein";
    }
  }
  if (d.bemerkung) { el("h2", "Weitere Feststellungen"); el("p", d.bemerkung); }
  el("p", `Geprüft am ${d.datum}${d.bearbeiter ? ` von ${d.bearbeiter}` : ""}. Grundlage: ${d.datei || "eingefügter Vertragstext"}. Die automatische Auswertung des Vertragstextes ist eine Hilfe; die Bewertung hat der Notar vorgenommen. Hochrisikostaaten: ${HOCHRISIKO_STAND}.`).className = "klein";
  zustand.vermerk = d;
}

function vermerkText() {
  const d = zustand.vermerk;
  const zeilen = ["VERMERK ZUR GELDWÄSCHERECHTLICHEN PRÜFUNG", ""];
  for (const [k, v] of d.kopf) zeilen.push(`${k}: ${v}`);
  zeilen.push("", `ERGEBNIS: ${d.gesamt.titel}`, d.gesamt.text);
  if (d.entlastend.length) zeilen.push(`Entlastend: ${d.entlastend.join("; ")}.`);
  for (const gr of d.gruppen) {
    zeilen.push("", gr.titel.toUpperCase());
    for (const z of gr.zeilen) {
      zeilen.push(`- ${z.titel} (${z.norm}): ${z.wert}`);
      if (z.begruendung) zeilen.push(`    Begründung: ${z.begruendung}`);
      for (const fu of z.funde.slice(0, 4)) zeilen.push(`    Fundstelle: ${fu}`);
    }
  }
  if (d.bemerkung) zeilen.push("", "WEITERE FESTSTELLUNGEN", d.bemerkung);
  zeilen.push("", `Geprüft am ${d.datum}${d.bearbeiter ? ` von ${d.bearbeiter}` : ""}. Grundlage: ${d.datei || "eingefügter Vertragstext"}.`,
    "Die automatische Auswertung des Vertragstextes ist eine Hilfe; die Bewertung hat der Notar vorgenommen.", `Hochrisikostaaten: ${HOCHRISIKO_STAND}.`);
  return zeilen.join("\r\n");
}

function dateiname() {
  const uvz = $("#uvz").value.replace(/[^\w-]+/g, "-") || "ohne-UVZ";
  return `GwG-Pruefung_${uvz}.txt`;
}

// ---------- Hochrisikoliste ----------
function hrListeZeigen() {
  $("#hr-stand").textContent = speicher("gw_hochrisiko") ? "eigene Liste" : HOCHRISIKO_STAND;
  $("#hr-liste").value = hochrisikoListe().map((s) => `${s.code} ${s.name}: ${s.muster.join(", ")}`).join("\n");
}

function hrListeLesen(text) {
  return text.split("\n").map((z) => z.trim()).filter(Boolean).map((z) => {
    const m = z.match(/^([A-Z]{2})\s+([^:]+?)(?::\s*(.*))?$/);
    if (!m) throw new Error(`Zeile nicht verständlich: ${z}`);
    const muster = (m[3] || m[2]).split(",").map((s) => s.trim()).filter(Boolean);
    try { new RegExp(muster.join("|")); } catch { throw new Error(`Schreibweise nicht verständlich: ${z}`); }
    return { code: m[1], name: m[2].trim(), muster };
  });
}

// ---------- Ereignisse ----------
$("#datei").addEventListener("change", (e) => { if (e.target.files[0]) laden(e.target.files[0]); e.target.value = ""; });
const ablage = $("#ablage");
ablage.addEventListener("dragover", (e) => { e.preventDefault(); ablage.classList.add("ueber"); });
ablage.addEventListener("dragleave", () => ablage.classList.remove("ueber"));
ablage.addEventListener("drop", (e) => {
  e.preventDefault();
  ablage.classList.remove("ueber");
  if (e.dataTransfer.files[0]) laden(e.dataTransfer.files[0]);
});
$("#text-pruefen").addEventListener("click", () => { zustand.datei = ""; pruefen($("#eingabe").value); });
for (const id of ["kaufpreis", "verkehrswert", "vorpreis", "vorerwerb", "urkundsdatum"]) $(`#${id}`).addEventListener("change", () => bewerten(false));
for (const id of ["uvz", "vertragsart", "objekt", "bemerkung", "bearbeiter"]) $(`#${id}`).addEventListener("input", () => gesamtZeigen());
$("#bearbeiter").value = speicher("gw_bearbeiter");
$("#bearbeiter").addEventListener("change", () => speicher("gw_bearbeiter", $("#bearbeiter").value));
$("#rest-nein").addEventListener("click", () => {
  for (const p of PUNKTE) {
    const w = zustand.werte[p.id];
    if (p.gruppe !== "pflicht" && w.wert === "offen") { w.wert = "nein"; w.automatisch = false; }
  }
  punkteZeigen();
  gesamtZeigen();
});
$("#drucken").addEventListener("click", () => window.print());
$("#speichern").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + vermerkText()], { type: "text/plain;charset=utf-8" }));
  a.download = dateiname();
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("#kopieren").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(vermerkText()); meldung("Vermerk in die Zwischenablage kopiert.", "erfolg"); } catch { meldung("Kopieren nicht möglich; bitte „Als Textdatei speichern“ verwenden.", "warnung"); }
});
$("#hr-speichern").addEventListener("click", () => {
  try {
    const liste = hrListeLesen($("#hr-liste").value);
    speicher("gw_hochrisiko", JSON.stringify(liste));
    hrListeZeigen();
    neuErkennen();
    meldung(`Liste mit ${liste.length} Staaten gespeichert.`, "erfolg");
  } catch (e) { meldung(e.message, "fehler"); }
});
$("#hr-zurueck").addEventListener("click", () => {
  try { localStorage.removeItem("gw_hochrisiko"); } catch { /* egal */ }
  hrListeZeigen();
  neuErkennen();
});

// Nach Änderung der Staatenliste: Vertrag neu auswerten, getroffene Auswahl behalten
function neuErkennen() {
  if (!zustand.f) return;
  zustand.f = erkennen(zustand.f.text);
  beteiligteZeigen(zustand.f);
  bewerten(false);
}
hrListeZeigen();
