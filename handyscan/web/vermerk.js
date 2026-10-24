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

// ------------------------------------------------------------------ Text aufbereiten
// Die Standardschrift im PDF kennt nur WinAnsi (Latin-1 plus „“‚‘’–—…€• usw.).
// Zeichen außerhalb werden ersetzt, Emojis fallen weg.
const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const ERSATZ = {
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '⇔': '<=>', '≈': 'ca.', '≙': '=', '≠': '!=',
  '≤': '<=', '≥': '>=', '−': '-', '‐': '-', '‑': '-', '×': 'x', '✓': '[x]', '✔': '[x]', '✗': '[ ]', '✘': '[ ]',
  '☐': '[ ]', '☑': '[x]', ' ': ' ', ' ': ' ', ' ': ' ', '​': '', '⁠': '', '﻿': '',
  '\t': '    ', '‒': '-', '―': '—', '′': "'", '″': '"', '∑': 'Summe', '√': 'Wurzel', '∞': 'unendlich',
  '▪': '•', '◦': '•', '‣': '•', '●': '•', '○': 'o', '■': '•', '□': '[ ]', '⚠': '(!)', 'ℹ': '(i)',
};
function winAnsi(s) {
  let aus = '';
  for (const z of s.normalize('NFC')) {
    const c = z.codePointAt(0);
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.includes(z)) aus += z;
    else if (z in ERSATZ) aus += ERSATZ[z];
    else if (c === 0xfe0f || c === 0x200d) continue;
    else if (c < 0x20) continue;
    else aus += '';   // unbekannt (z. B. Emoji): weglassen
  }
  return aus;
}

// Zeilenweise Markdown → Blöcke: überschrift, absatz, liste, zitat, code, linie, tabelle, leer
function bloecke(md) {
  const zeilen = md.replace(/\r\n?/g, '\n').split('\n');
  const aus = [];
  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i];
    let m;
    if (/^\s*```/.test(z)) {
      const code = [];
      for (i++; i < zeilen.length && !/^\s*```/.test(zeilen[i]); i++) code.push(zeilen[i]);
      aus.push({ art: 'code', zeilen: code });
    } else if (/^\s*\|.*\|\s*$/.test(z)) {
      const zeilenT = [];
      for (; i < zeilen.length && /^\s*\|.*\|\s*$/.test(zeilen[i]); i++) {
        const zellen = zeilen[i].trim().slice(1, -1).split('|').map(x => x.trim());
        if (zellen.every(x => /^:?-{2,}:?$/.test(x))) continue;   // Trennzeile |---|
        zeilenT.push(zellen);
      }
      i--;
      aus.push({ art: 'tabelle', zeilen: zeilenT });
    } else if ((m = z.match(/^\s*(#{1,6})\s+(.*)$/))) {
      aus.push({ art: 'ueberschrift', stufe: m[1].length, text: m[2].replace(/\s*#+\s*$/, '') });
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(z)) {
      aus.push({ art: 'linie' });
    } else if ((m = z.match(/^(\s*)([-*+•])\s+(.*)$/))) {
      aus.push({ art: 'liste', ebene: Math.min(3, Math.floor(m[1].replace(/\t/g, '  ').length / 2)), zeichen: '•', text: m[3] });
    } else if ((m = z.match(/^(\s*)(\d{1,3}[.)]|[a-z][.)])\s+(.*)$/))) {
      aus.push({ art: 'liste', ebene: Math.min(3, Math.floor(m[1].length / 2)), zeichen: m[2], text: m[3] });
    } else if ((m = z.match(/^\s*>\s?(.*)$/))) {
      aus.push({ art: 'zitat', text: m[1] });
    } else if (z.trim() === '') {
      aus.push({ art: 'leer' });
    } else {
      // Fortsetzungszeile eines Absatzes (einfacher Zeilenumbruch) gehört zum vorigen Absatz
      const vor = aus[aus.length - 1];
      if (vor && vor.art === 'absatz') vor.text += '\n' + z.trim();
      else aus.push({ art: 'absatz', text: z.trim() });
    }
  }
  return aus;
}

// Inline: **fett**, __fett__, *kursiv*, _kursiv_, `code`, [Text](Link) → Läufe {text, fett, kursiv, mono}
function laeufe(text, grund = {}) {
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, url) => (t === url ? t : `${t} (${url})`));
  text = text.replace(/<br\s*\/?>/gi, '\n');
  const aus = [];
  const re = /(\*\*|__)(.+?)\1|`([^`]+)`|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)|(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w])/g;
  let pos = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > pos) aus.push(Object.assign({}, grund, { text: text.slice(pos, m.index) }));
    if (m[2] !== undefined) aus.push(...laeufe(m[2], Object.assign({}, grund, { fett: true })));
    else if (m[3] !== undefined) aus.push(Object.assign({}, grund, { text: m[3], mono: true }));
    else aus.push(...laeufe(m[4] !== undefined ? m[4] : m[5], Object.assign({}, grund, { kursiv: true })));
    pos = re.lastIndex;
  }
  if (pos < text.length) aus.push(Object.assign({}, grund, { text: text.slice(pos) }));
  return aus.map(l => Object.assign(l, { text: winAnsi(l.text) }));
}

// ------------------------------------------------------------------ PDF setzen
const A4 = [595.28, 841.89];
const RAND = { links: 62, rechts: 56, oben: 56, unten: 60 };
const BREITE = A4[0] - RAND.links - RAND.rechts;
const GRAU = 0.38;

async function pdfBauen() {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const name = `${nummer() || '–'} ${bezeichnung()}`;
  doc.setTitle(name);
  doc.setSubject('Aktenvermerk über Anfrage an Claude (KI)');
  doc.setProducer('Handy-Scan Notariat – Claude-Vermerk');
  const F = {
    n: await doc.embedFont(StandardFonts.Helvetica),
    f: await doc.embedFont(StandardFonts.HelveticaBold),
    k: await doc.embedFont(StandardFonts.HelveticaOblique),
    fk: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
    m: await doc.embedFont(StandardFonts.Courier),
  };
  const schrift = l => (l.mono ? F.m : l.fett && l.kursiv ? F.fk : l.fett ? F.f : l.kursiv ? F.k : F.n);
  const schwarz = rgb(0, 0, 0), grau = rgb(GRAU, GRAU, GRAU), linie = rgb(0.75, 0.75, 0.75);

  let seite, y;
  const seiten = [];
  function neueSeite() {
    seite = doc.addPage(A4);
    seiten.push(seite);
    y = A4[1] - RAND.oben;
  }
  function platz(h) { if (y - h < RAND.unten) neueSeite(); }

  // Läufe in Zeilen umbrechen: Ergebnis [[{text, font, groesse}], ...]
  function umbrechen(ls, breite, groesse) {
    const zeilen = [[]];
    let rest = breite;
    const neueZeile = () => { zeilen.push([]); rest = breite; };
    for (const l of ls) {
      const font = schrift(l);
      const gr = l.mono ? groesse * 0.95 : groesse;
      for (const [ti, teil] of l.text.split('\n').entries()) {
        if (ti > 0) neueZeile();
        for (const wort of teil.split(/(?<= )/)) {
          if (wort === '') continue;
          let w = font.widthOfTextAtSize(wort, gr);
          const z = zeilen[zeilen.length - 1];
          if (w > rest && z.length) {
            neueZeile();
            if (wort.trim() === '') continue;
          }
          // Überlanges Wort hart trennen
          let stueck = zeilen[zeilen.length - 1].length ? wort : wort.replace(/^ +/, '');
          while (font.widthOfTextAtSize(stueck, gr) > rest && stueck.length > 1) {
            let n = stueck.length - 1;
            while (n > 1 && font.widthOfTextAtSize(stueck.slice(0, n), gr) > rest) n--;
            zeilen[zeilen.length - 1].push({ text: stueck.slice(0, n), font, gr });
            neueZeile();
            stueck = stueck.slice(n);
          }
          w = font.widthOfTextAtSize(stueck, gr);
          zeilen[zeilen.length - 1].push({ text: stueck, font, gr });
          rest -= w;
        }
      }
    }
    return zeilen;
  }

  function zeileZeichnen(z, x, yy, farbe = schwarz) {
    for (const t of z) {
      if (t.text) seite.drawText(t.text, { x, y: yy, size: t.gr, font: t.font, color: farbe });
      x += t.font.widthOfTextAtSize(t.text, t.gr);
    }
  }

  function absatz(ls, { x = RAND.links, breite = BREITE, groesse = 10.5, abstand = 1.38, farbe = schwarz, vorspann = null } = {}) {
    const zh = groesse * abstand;
    const zeilen = umbrechen(ls, breite, groesse);
    zeilen.forEach((z, i) => {
      platz(zh);
      y -= zh;
      if (i === 0 && vorspann) seite.drawText(vorspann.text, { x: vorspann.x, y: y + 2, size: groesse, font: vorspann.font || F.n, color: farbe });
      zeileZeichnen(z, x, y + 2, farbe);
    });
  }

  function tabelle(zeilenT) {
    const n = Math.max(...zeilenT.map(z => z.length));
    const pad = 4, gr = 9.5, zh = gr * 1.3;
    // Spaltenbreite nach Textlänge, jede Spalte mindestens 12 %
    const laenge = Array.from({ length: n }, (_, j) => Math.max(4, ...zeilenT.map(z => Math.min(60, (z[j] || '').length))));
    const summe = laenge.reduce((a, b) => a + b, 0);
    let breiten = laenge.map(l => Math.max(BREITE * 0.12, BREITE * l / summe));
    const k = BREITE / breiten.reduce((a, b) => a + b, 0);
    breiten = breiten.map(b => b * k);
    zeilenT.forEach((z, r) => {
      const zellen = breiten.map((b, j) => umbrechen(laeufe(z[j] || '', r === 0 ? { fett: true } : {}), b - 2 * pad, gr));
      const h = Math.max(...zellen.map(c => c.length)) * zh + 2 * pad;
      platz(h);
      let x = RAND.links;
      zellen.forEach((c, j) => {
        seite.drawRectangle({ x, y: y - h, width: breiten[j], height: h, borderColor: linie, borderWidth: 0.6,
          color: r === 0 ? rgb(0.93, 0.93, 0.93) : undefined });
        c.forEach((zl, i) => zeileZeichnen(zl, x + pad, y - pad - (i + 1) * zh + 3));
        x += breiten[j];
      });
      y -= h;
    });
    y -= 4;
  }

  function markdown(md) {
    let leer = false;
    for (const b of bloecke(md)) {
      if (b.art === 'leer') { if (!leer) y -= 5; leer = true; continue; }
      leer = false;
      if (b.art === 'ueberschrift') {
        const gr = b.stufe <= 1 ? 13 : b.stufe === 2 ? 12 : 11;
        platz(gr * 3);
        y -= 4;
        absatz(laeufe(b.text, { fett: true }), { groesse: gr });
        y -= 1;
      } else if (b.art === 'absatz') {
        absatz(laeufe(b.text));
      } else if (b.art === 'liste') {
        const einzug = 14 + b.ebene * 14;
        const zeichen = b.zeichen === '•' ? (b.ebene ? '–' : '•') : b.zeichen;
        absatz(laeufe(b.text), { x: RAND.links + einzug, breite: BREITE - einzug,
          vorspann: { text: zeichen, x: RAND.links + einzug - (zeichen.length > 1 ? 15 : 10) } });
      } else if (b.art === 'zitat') {
        absatz(laeufe(b.text, { kursiv: true }), { x: RAND.links + 14, breite: BREITE - 14, farbe: grau });
      } else if (b.art === 'code') {
        for (const z of b.zeilen) absatz([{ text: winAnsi(z) || ' ', mono: true }], { x: RAND.links + 8, breite: BREITE - 8, groesse: 9.5, abstand: 1.25 });
        y -= 3;
      } else if (b.art === 'linie') {
        platz(10);
        y -= 5;
        seite.drawLine({ start: { x: RAND.links, y }, end: { x: RAND.links + BREITE, y }, thickness: 0.6, color: linie });
        y -= 5;
      } else if (b.art === 'tabelle' && b.zeilen.length) {
        y -= 3;
        tabelle(b.zeilen);
      }
    }
  }

  function zwischentitel(text) {
    platz(40);
    y -= 12;
    absatz([{ text, fett: true }], { groesse: 11.5 });
    y -= 3;
    seite.drawLine({ start: { x: RAND.links, y: y + 1 }, end: { x: RAND.links + BREITE, y: y + 1 }, thickness: 0.8, color: schwarz });
    y -= 6;
  }

  // Kopf
  neueSeite();
  const jetzt = new Date();
  const datum = jetzt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const zeit = jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  absatz([{ text: 'Aktenvermerk', fett: true }], { groesse: 17 });
  y -= 4;
  absatz(laeufe(`**Vorgang:** ${nummer() || '–'}      **Datum:** ${datum}, ${zeit} Uhr`));
  absatz(laeufe(`**Betreff:** Anfrage an Claude (KI) – ${winAnsi(thema() || 'Anfrage')}`));
  y -= 4;
  absatz([{ text: 'Auskunft eines KI-Assistenten (Claude, Anthropic). Angefragt ohne Namen und Anschriften der Beteiligten. Keine Rechtsberatung durch Dritte; Ergebnis vor Verwendung vom Notar zu prüfen.' }],
    { groesse: 8.5, farbe: grau });

  const frage = $('frage').value.trim();
  if (frage) { zwischentitel('Frage'); markdown(frage); }
  zwischentitel('Antwort von Claude');
  markdown($('antwort').value.trim());

  // Prüfvermerk
  platz(60);
  y -= 30;
  absatz([{ text: 'Geprüft / übernommen: ______________________________   Datum, Zeichen: ________________' }], { groesse: 9.5 });

  // Fußzeile auf jeder Seite
  seiten.forEach((s, i) => {
    const text = winAnsi(`${name}  ·  Seite ${i + 1} von ${seiten.length}`);
    s.drawText(text, { x: RAND.links, y: RAND.unten - 30, size: 8, font: F.n, color: grau });
  });
  return doc.save();
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
