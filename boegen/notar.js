/* ---------- Notardaten: Briefkopf, Fußzeilen und Mitarbeiter für alle Bögen ----------
   Jedes Notariat trägt seine Daten einmal unter „Notardaten“ ein. Sie bleiben in diesem
   Browser (localStorage) und gelten für alle Bögen dieses Ordners; mit „Exportieren“ und
   „Importieren“ lassen sie sich auf die anderen Arbeitsplätze übertragen.               */
const NOTAR_LS = "boegen_notardaten";
const NOTAR_FELDER = [
  ["name",    "Name",                  "z. B. Dr. Max Muster"],
  ["amt",     "Amtsbezeichnung",       ""],
  ["strasse", "Straße und Hausnummer", "z. B. Markt 1"],
  ["ort",     "PLZ und Ort",           "z. B. 14467 Potsdam"],
  ["telefon", "Telefon",               "z. B. (0331) 123 45 67"],
  ["fax",     "Fax",                   ""],
  ["email",   "E-Mail",                "z. B. info@notar-muster.de"],
  ["web",     "Internet",              "z. B. www.notar-muster.de"],
  ["gruss",   "Gruß in Mails",         "leer = Name"],
];

function notarDaten(){
  try{ const d = JSON.parse(localStorage.getItem(NOTAR_LS)); if (d && typeof d === "object") return d; }catch{}
  return {};
}
function notarSpeichern(d){ try{ localStorage.setItem(NOTAR_LS, JSON.stringify(d)); }catch{} }
const notarEingerichtet = () => !!(notarDaten().name || "").trim();

const notarAmt = (d=notarDaten()) => d.amt === "Notarin" ? "Notarin" : "Notar";
const notarName = (d=notarDaten()) => (d.name || "").trim();
/* „Notar Max Muster“ für Fußzeilen und PDF-Autor; leer, solange nichts eingetragen ist */
const notarFuss = (d=notarDaten()) => notarName(d) ? notarAmt(d) + " " + notarName(d) : "";
window.notarFuss = notarFuss;   // für die eingebetteten Module (Erbspiegel)
/* „Der Notar Max Muster“ / „Die Notarin Erika Muster“ */
function notarDerDie(d=notarDaten()){
  const art = notarAmt(d) === "Notarin" ? "Die Notarin" : "Der Notar";
  return notarName(d) ? art + " " + notarName(d) : art;
}
const notarGruss = (d=notarDaten()) => (d.gruss || "").trim() || notarName(d);
/* Kontaktzeilen rechts im Briefkopf; die dritte Zeile getrennt in E-Mail (fett) und Internet */
function notarKontakt(d=notarDaten()){
  const t = s => (s || "").trim();
  return {
    adresse: [t(d.strasse), t(d.ort)].filter(Boolean).join(" · "),
    telefon: [t(d.telefon) && "Tel. " + t(d.telefon), t(d.fax) && "Fax " + t(d.fax)].filter(Boolean).join(" · "),
    email: t(d.email),
    web: t(d.web),
  };
}
function notarKontaktZeilen(d=notarDaten()){
  const k = notarKontakt(d);
  return [k.adresse, k.telefon, [k.email, k.web].filter(Boolean).join(" · ")].filter(Boolean);
}
/* Mitarbeiter für den Mailversand: [Name, E-Mail] und die vorausgewählten Adressen */
const notarMitarbeiter = (d=notarDaten()) =>
  (Array.isArray(d.mitarbeiter) ? d.mitarbeiter : []).filter(m => m && m.email).map(m => [m.name || m.email, m.email]);
const notarStandardEmpfaenger = (d=notarDaten()) =>
  (Array.isArray(d.mitarbeiter) ? d.mitarbeiter : []).filter(m => m && m.email && m.standard).map(m => m.email);

/* Briefkopf und Fußzeilen der Seite füllen */
function notarAnzeigen(){
  const d = notarDaten(), k = notarKontakt(d);
  document.querySelectorAll("[data-notar]").forEach(el => {
    const art = el.dataset.notar;
    if (art === "name") el.textContent = notarName(d) || "Notardaten fehlen";
    else if (art === "amt") el.textContent = notarName(d) ? notarAmt(d) : "bitte oben unter „Notardaten“ eintragen";
    else if (art === "derdie") el.textContent = notarDerDie(d);
    else if (art === "fuss") el.textContent = [notarFuss(d), el.dataset.zusatz].filter(Boolean).join(" · ");
    else if (art === "kontakt"){
      el.textContent = "";
      const zeilen = [k.adresse, k.telefon].filter(Boolean);
      zeilen.forEach((z, i) => { if (i) el.append(document.createElement("br")); el.append(z); });
      if (k.email || k.web){
        if (zeilen.length) el.append(document.createElement("br"));
        if (k.email){ const b = document.createElement("b"); b.textContent = k.email; el.append(b); }
        if (k.web) el.append((k.email ? " · " : "") + k.web);
      }
    }
  });
  const titel = document.documentElement.dataset.titel;
  if (titel) document.title = titel + (notarFuss(d) ? " – " + notarFuss(d) : "");
}

/* ---------- Dialog „Notardaten“ ---------- */
function notarDialogBauen(){
  const st = document.createElement("style");
  st.textContent = `
    #notarDialog{max-width:640px;width:calc(100% - 32px);border:none;border-radius:8px;padding:20px 22px;box-shadow:0 10px 40px rgba(0,0,0,.3);color:#2d3748}
    #notarDialog::backdrop{background:rgba(15,23,42,.45)}
    #notarDialog h2{margin:0 0 4px;font-size:17px;color:#1e3a5f}
    #notarDialog p.nd-info{margin:0 0 12px;font-size:13px;color:#4a5568}
    #notarDialog .nd-gitter{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px 14px}
    #notarDialog label{display:block;font-size:12px;color:#4a5568}
    #notarDialog input[type=text],#notarDialog input[type=email],#notarDialog select{display:block;width:100%;box-sizing:border-box;margin-top:2px;padding:6px 8px;border:1px solid #cbd5e0;border-radius:4px;font:inherit;font-size:14px}
    #notarDialog h3{font-size:14px;margin:16px 0 4px;color:#1e3a5f}
    #notarDialog .nd-ma{display:grid;grid-template-columns:1fr 1.3fr auto auto;gap:6px;align-items:center;margin:4px 0}
    #notarDialog .nd-ma input[type=text],#notarDialog .nd-ma input[type=email]{margin:0}
    #notarDialog .nd-ma label{display:flex;gap:4px;align-items:center;white-space:nowrap}
    #notarDialog .nd-knoepfe{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;justify-content:flex-end}
    #notarDialog .nd-knoepfe .links{margin-right:auto;display:flex;gap:8px;flex-wrap:wrap}
    #notarDialog button{font:inherit;font-size:13px;padding:6px 12px;border-radius:4px;border:1px solid #cbd5e0;background:#fff;color:#1e3a5f;cursor:pointer}
    #notarDialog button.primaer{background:#1e3a5f;color:#fff;border-color:#1e3a5f}
    #notarDialog button.nd-weg{border:none;background:none;color:#c53030;font-size:16px;padding:2px 6px}
    @media (max-width:560px){ #notarDialog .nd-ma{grid-template-columns:1fr 1fr} }
    @media print{ #notarDialog{display:none} }`;
  document.head.appendChild(st);

  const dlg = document.createElement("dialog");
  dlg.id = "notarDialog";
  dlg.innerHTML = `<form method="dialog">
    <h2>Notardaten</h2>
    <p class="nd-info">Erscheinen im Briefkopf, in den Fußzeilen und in den Mails. Sie bleiben nur in diesem Browser gespeichert. Für weitere Arbeitsplätze: hier exportieren und dort importieren.</p>
    <div class="nd-gitter"></div>
    <h3>Mitarbeiter für „Mailen“</h3>
    <p class="nd-info">„vorausgewählt“ ist beim Mailen schon angehakt.</p>
    <div class="nd-liste"></div>
    <button type="button" class="nd-plus">+ Mitarbeiter</button>
    <div class="nd-knoepfe">
      <span class="links"><button type="button" class="nd-export">Exportieren</button><button type="button" class="nd-import">Importieren</button></span>
      <button type="button" class="nd-abbr">Abbrechen</button>
      <button type="submit" class="primaer">Speichern</button>
    </div>
    <input type="file" accept=".json,application/json" hidden>
  </form>`;
  document.body.appendChild(dlg);

  const gitter = dlg.querySelector(".nd-gitter");
  for (const [k, label, ph] of NOTAR_FELDER){
    const l = document.createElement("label"); l.textContent = label;
    let el;
    if (k === "amt"){
      el = document.createElement("select");
      for (const o of ["Notar", "Notarin"]) el.append(new Option(o, o));
    } else {
      el = document.createElement("input"); el.type = k === "email" ? "email" : "text"; el.placeholder = ph; el.autocomplete = "off";
    }
    el.dataset.nd = k; l.append(el); gitter.append(l);
  }
  const liste = dlg.querySelector(".nd-liste");
  const zeile = (m={}) => {
    const z = document.createElement("div"); z.className = "nd-ma";
    z.innerHTML = `<input type="text" placeholder="Name" aria-label="Name"><input type="email" placeholder="E-Mail" aria-label="E-Mail">
      <label><input type="checkbox"> vorausgewählt</label><button type="button" class="nd-weg" title="Entfernen" aria-label="Entfernen">×</button>`;
    const [n, e] = z.querySelectorAll("input:not([type=checkbox])");
    n.value = m.name || ""; e.value = m.email || ""; z.querySelector("input[type=checkbox]").checked = !!m.standard;
    z.querySelector(".nd-weg").onclick = () => z.remove();
    liste.append(z);
  };
  const fuellen = d => {
    dlg.querySelectorAll("[data-nd]").forEach(el => { el.value = d[el.dataset.nd] || (el.tagName === "SELECT" ? "Notar" : ""); });
    liste.textContent = "";
    (Array.isArray(d.mitarbeiter) ? d.mitarbeiter : []).forEach(zeile);
    if (!liste.children.length) zeile();
  };
  const lesen = () => {
    const d = {};
    dlg.querySelectorAll("[data-nd]").forEach(el => { d[el.dataset.nd] = el.value.trim(); });
    d.mitarbeiter = [...liste.children].map(z => {
      const [n, e] = z.querySelectorAll("input:not([type=checkbox])");
      return {name:n.value.trim(), email:e.value.trim(), standard:z.querySelector("input[type=checkbox]").checked};
    }).filter(m => m.email);
    return d;
  };
  dlg.querySelector(".nd-plus").onclick = () => zeile();
  dlg.querySelector(".nd-abbr").onclick = () => dlg.close();
  dlg.querySelector("form").addEventListener("submit", ev => {
    const d = lesen();
    if (!d.name){ ev.preventDefault(); alert("Bitte mindestens den Namen eintragen."); return; }
    notarSpeichern(d); notarAnzeigen();
    document.dispatchEvent(new CustomEvent("notardaten"));
  });
  dlg.querySelector(".nd-export").onclick = () => {
    const blob = new Blob([JSON.stringify({typ:"boegen-notardaten", version:1, daten:lesen()}, null, 1)], {type:"application/json"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Notardaten.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const datei = dlg.querySelector("input[type=file]");
  dlg.querySelector(".nd-import").onclick = () => datei.click();
  datei.onchange = async () => {
    const f = datei.files[0]; datei.value = ""; if (!f) return;
    try{
      const j = JSON.parse(await f.text());
      if (!j || j.typ !== "boegen-notardaten" || !j.daten) throw new Error("Format");
      fuellen(j.daten);
    }catch{ alert("Die Datei enthält keine Notardaten."); }
  };
  return () => { fuellen(notarDaten()); dlg.showModal(); };
}

document.addEventListener("DOMContentLoaded", () => {
  const oeffnen = notarDialogBauen();
  const knopf = document.getElementById("btnNotar");
  if (knopf) knopf.onclick = oeffnen;
  notarAnzeigen();
  if (!notarEingerichtet()) oeffnen();
});
