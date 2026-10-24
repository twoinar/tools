// Claude-Vermerk: Frage und Antwort aus Claude (Markdown) einfügen, im Browser als Aktenvermerk-PDF
// setzen und über denselben Weg wie die Scans an den PC schicken. Der PC (Handy-Scan-Server.ps1)
// legt es als „<Vorgangsnummer> Claude <Thema>.pdf“ im Ablageordner ab.
'use strict';

const THEMEN = ['Geschäftswert', 'Kosten', 'Rechtsfrage', 'Formulierung', 'Steuern', 'Sonstiges'];

const $ = id => document.getElementById(id);

// ------------------------------------------------------------------ Server (wie app.js)
function pin() { try { return localStorage.getItem('handyscan-pin') || ''; } catch { return ''; } }
function pinMerken(p) { try { localStorage.setItem('handyscan-pin', p); } catch { /* egal */ } }

async function api(pfad, optionen = {}) {
  for (let versuch = 0; versuch < 3; versuch++) {
    const headers = Object.assign({}, optionen.headers || {}, { 'X-Pin': pin() });
    let antwort;
    try {
      antwort = await fetch(pfad, Object.assign({}, optionen, { headers }));
    } catch {
      throw new Error('Der Büro-PC antwortet nicht. Läuft Handy-Scan am PC?');
    }
    const daten = await antwort.json().catch(() => ({}));
    if (antwort.status === 403 && daten.pin) {
      const p = prompt(versuch ? 'PIN falsch. Bitte PIN erneut eingeben:' : 'Bitte die Handy-Scan-PIN eingeben:');
      if (p === null) throw new Error('Ohne PIN geht es nicht.');
      pinMerken(p.trim());
      continue;
    }
    if (!antwort.ok || daten.ok === false) throw new Error(daten.fehler || `Fehler ${antwort.status}`);
    return daten;
  }
  throw new Error('PIN falsch.');
}

// ------------------------------------------------------------------ Anzeige
function meldung(text, art) {
  const el = $('meldung');
  el.hidden = !text;
  el.className = 'hinweis' + (art ? ' ' + art : '');
  el.textContent = text || '';
}

let nurZiffern = true;
function nummer() {
  const roh = $('nr').value.trim();
  if (nurZiffern) return roh.replace(/\D/g, '').replace(/^0+/, '');
  return roh.replace(/\//g, '-').replace(/[^\p{L}\d .\-_]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}
function thema() { return $('thema').value.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim(); }
function bezeichnung() { return 'Claude ' + (thema() || 'Anfrage'); }

function anzeigen() {
  $('dateiname').textContent = nummer() ? `${nummer()} ${bezeichnung()}.pdf` : '–';
  $('ablegen').disabled = !nummer() || !$('antwort').value.trim();
  $('vorschau').disabled = !$('antwort').value.trim();
}

function themenZeigen() {
  for (const t of THEMEN) {
    const b = document.createElement('button');
    b.textContent = t;
    b.addEventListener('click', () => {
      $('thema').value = t === 'Sonstiges' ? '' : t;
      for (const x of $('arten').children) x.classList.toggle('an', x === b);
      $('thema').focus();
      anzeigen();
    });
    $('arten').append(b);
  }
}

// ------------------------------------------------------------------ PDF (aktenvermerk.js)
const KI_HINWEIS = 'Auskunft eines KI-Assistenten (Claude, Anthropic). Angefragt ohne Namen und Anschriften der Beteiligten. Keine Rechtsberatung durch Dritte; Ergebnis vor Verwendung vom Notar zu prüfen.';

function pdfBauen() {
  return aktenvermerkPdf({
    nummer: nummer(), bezeichnung: bezeichnung(), betreff: `Anfrage an Claude (KI) – ${thema() || 'Anfrage'}`, hinweis: KI_HINWEIS,
    abschnitte: [{ titel: 'Frage', text: $('frage').value }, { titel: 'Antwort von Claude', text: $('antwort').value }],
  });
}

// ------------------------------------------------------------------ Ablegen
async function vorschau() {
  try {
    const pdf = await pdfBauen();
    const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    meldung('Vorschau nicht möglich: ' + e.message, 'schlecht');
  }
}

async function ablegen() {
  if (!nummer()) { meldung('Bitte zuerst die Vorgangsnummer eingeben.', 'schlecht'); return; }
  $('ablegen').disabled = true;
  meldung('PDF wird erstellt und abgelegt …');
  try {
    const pdf = await pdfBauen();
    const q = new URLSearchParams({ nr: nummer(), datei: bezeichnung() });
    const d = await api('/api/ablegen?' + q, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: pdf });
    meldung(`✓ Abgelegt: ${d.datei}`, 'gut');
    $('frage').value = '';
    $('antwort').value = '';
  } catch (e) {
    meldung('Nicht abgelegt: ' + e.message, 'schlecht');
  }
  anzeigen();
}

// ------------------------------------------------------------------ Start
themenZeigen();
for (const id of ['nr', 'thema', 'antwort', 'frage']) $(id).addEventListener('input', anzeigen);
$('thema').addEventListener('input', () => { for (const x of $('arten').children) x.classList.toggle('an', x.textContent === thema()); });
// „Aus Zwischenablage“ geht nur am PC (localhost); im WLAN per http sperrt der Browser das
if (navigator.clipboard && navigator.clipboard.readText && window.isSecureContext) {
  for (const [knopf, feld] of [['frage-holen', 'frage'], ['antwort-holen', 'antwort']]) {
    $(knopf).hidden = false;
    $(knopf).addEventListener('click', async () => {
      try { $(feld).value = await navigator.clipboard.readText(); anzeigen(); }
      catch { meldung('Zwischenablage nicht lesbar – bitte mit Strg+V einfügen.', 'schlecht'); }
    });
  }
}
$('vorschau').addEventListener('click', vorschau);
$('ablegen').addEventListener('click', ablegen);
window.addEventListener('beforeunload', e => { if ($('antwort').value.trim()) { e.preventDefault(); e.returnValue = ''; } });
api('/api/info').then(d => {
  $('fuss').textContent = `Handy-Scan ${d.version} · PC ${d.rechner} · Ablage ${d.basis || '(nicht eingestellt)'}`;
  if (d.nurZiffern === false) { nurZiffern = false; $('nr').inputMode = 'text'; $('nr').removeAttribute('pattern'); anzeigen(); }
}).catch(() => {});
anzeigen();
