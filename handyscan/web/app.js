// Handy-Scan: Seiten fotografieren, auf dem Handy zu einem PDF zusammensetzen und an den
// Büro-PC schicken. Der PC (Handy-Scan-Server.ps1) legt das PDF im Vorgangsordner ab.
'use strict';

const ARTEN = ['Geburtsurkunde', 'Heiratsurkunde', 'Sterbeurkunde', 'Personalausweis', 'Reisepass',
  'Erbschein', 'Testament', 'Vollmacht', 'Vertrag', 'Sonstiges'];
const MAX_KANTE = 2200;      // längste Bildkante in Pixeln (reicht für gut lesbare A4-Scans)
const JPEG_QUALITAET = 0.82;

const $ = id => document.getElementById(id);
const zustand = {
  nr: '', ordner: [], gewaehlt: '', art: '', filter: 'grau',
  zuschneiden: true,
  seiten: [],                // { quelle: Canvas (verkleinert), drehung: 0..3, bild: dataURL }
};

// ------------------------------------------------------------------ Server
function pin() { try { return localStorage.getItem('handyscan-pin') || ''; } catch { return ''; } }
function pinMerken(p) { try { localStorage.setItem('handyscan-pin', p); } catch { /* egal */ } }

async function api(pfad, optionen = {}) {
  for (let versuch = 0; versuch < 3; versuch++) {
    const headers = Object.assign({}, optionen.headers || {}, { 'X-Pin': pin() });
    let antwort;
    try {
      antwort = await fetch(pfad, Object.assign({}, optionen, { headers }));
    } catch {
      throw new Error('Der Büro-PC antwortet nicht. Ist das Handy im Büro-WLAN und läuft Handy-Scan am PC?');
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

// ------------------------------------------------------------------ Schritt 1: Vorgang
function meldung(el, text, art) {
  el.hidden = !text;
  el.className = 'hinweis' + (art ? ' ' + art : '');
  el.textContent = text || '';
}

async function vorgangPruefen() {
  const nr = $('nr').value.trim().replace(/\D/g, '');
  $('nr').value = nr;
  if (!nr) { meldung($('ordner-info'), 'Bitte die Vorgangsnummer eingeben.', 'schlecht'); return; }
  $('nr-ok').disabled = true;
  meldung($('ordner-info'), 'Suche Vorgangsordner …');
  try {
    const d = await api('/api/ordner?nr=' + encodeURIComponent(nr));
    zustand.nr = d.nr;
    zustand.ordner = d.ordner || [];
    $('bez-feld').hidden = d.gefunden;
    $('ordner-wahl-feld').hidden = zustand.ordner.length < 2;
    if (zustand.ordner.length >= 2) {
      $('ordner-wahl').innerHTML = '';
      for (const o of zustand.ordner) $('ordner-wahl').add(new Option(o, o));
      zustand.gewaehlt = zustand.ordner[0];
      meldung($('ordner-info'), `Mehrere Ordner für Vorgang ${d.nr} gefunden.`, 'gut');
    } else if (d.gefunden) {
      zustand.gewaehlt = zustand.ordner[0];
      meldung($('ordner-info'), `✓ Ablage in: ${zustand.gewaehlt}`, 'gut');
    } else {
      zustand.gewaehlt = '';
      meldung($('ordner-info'), `Für Vorgang ${d.nr} gibt es noch keinen Ordner. Er wird beim Ablegen angelegt.`);
      $('bez').focus();
    }
    for (const s of ['s-dokument', 's-seiten', 's-ablegen']) $(s).hidden = false;
    dateinameZeigen();
  } catch (e) {
    meldung($('ordner-info'), e.message, 'schlecht');
  } finally {
    $('nr-ok').disabled = false;
  }
}

// ------------------------------------------------------------------ Schritt 2: Dokument
function heute() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateiname() {
  const teile = [zustand.art || 'Scan', $('zusatz').value.trim(), heute()].filter(Boolean);
  return teile.join(' ').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
}

function dateinameZeigen() {
  $('dateiname').textContent = dateiname() + '.pdf';
  $('ablegen').disabled = !zustand.nr || zustand.seiten.length === 0;
}

function artenZeigen() {
  for (const a of ARTEN) {
    const b = document.createElement('button');
    b.textContent = a;
    b.addEventListener('click', () => {
      zustand.art = zustand.art === a ? '' : a;
      for (const x of $('arten').children) x.classList.toggle('an', x.textContent === zustand.art);
      dateinameZeigen();
    });
    $('arten').append(b);
  }
}

// ------------------------------------------------------------------ Schritt 3: Seiten
function bildLaden(datei) {
  return new Promise((ok, fehler) => {
    const url = URL.createObjectURL(datei);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); fehler(new Error('Bild nicht lesbar.')); };
    img.src = url;           // Chrome dreht nach EXIF automatisch richtig
  });
}

function verkleinern(img) {
  const f = Math.min(1, MAX_KANTE / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * f);
  c.height = Math.round(img.naturalHeight * f);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// Graustufen mit automatischem Kontrast; „sw“ zusätzlich mit Schwelle
function bearbeiten(quelle, drehung, filter) {
  const quer = drehung % 2 === 1;
  const c = document.createElement('canvas');
  c.width = quer ? quelle.height : quelle.width;
  c.height = quer ? quelle.width : quelle.height;
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  g.rotate(drehung * Math.PI / 2);
  g.drawImage(quelle, -quelle.width / 2, -quelle.height / 2);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const z = zustand.zuschneiden ? zuschnitt(c) : c;
  if (filter === 'farbe') return z;
  return kontrast(z, filter);
}

// Helles Blatt auf dunkler Unterlage: dunklen Rand rundherum abschneiden
function zuschnitt(c) {
  const w = c.width, h = c.height;
  const p = c.getContext('2d').getImageData(0, 0, w, h).data;
  const hell = new Uint8Array(w * h);
  let summe = 0;
  for (let i = 0, j = 0; i < p.length; i += 4, j++) { hell[j] = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000; summe += hell[j]; }
  const schwelle = Math.min(200, Math.max(60, summe / (w * h)));
  const zeilen = new Uint32Array(h), spalten = new Uint32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (hell[y * w + x] > schwelle) { zeilen[y]++; spalten[x]++; }
  const grenzen = (arr, laenge, anteil) => {
    let a = 0, b = arr.length - 1;
    while (a < b && arr[a] < laenge * anteil) a++;
    while (b > a && arr[b] < laenge * anteil) b--;
    return [a, b];
  };
  const [oben, unten] = grenzen(zeilen, w, 0.5);
  const [links, rechts] = grenzen(spalten, h, 0.5);
  const cw = rechts - links + 1, ch = unten - oben + 1;
  // Nur zuschneiden, wenn klar ein Blatt erkannt wurde und wirklich Rand übrig ist
  if (cw * ch < w * h * 0.25 || cw * ch > w * h * 0.97) return c;
  const z = document.createElement('canvas');
  z.width = cw; z.height = ch;
  z.getContext('2d').drawImage(c, links, oben, cw, ch, 0, 0, cw, ch);
  return z;
}

function kontrast(c, filter) {
  const g = c.getContext('2d');
  const bild = g.getImageData(0, 0, c.width, c.height);
  const p = bild.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < p.length; i += 4) {
    const y = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000 | 0;
    p[i] = y; hist[y]++;
  }
  // Untere 1 % → Schwarz, obere 5 % → Weiß (Papier soll weiß werden)
  const n = p.length / 4;
  let lo = 0, hi = 255, summe = 0;
  for (; lo < 255 && (summe += hist[lo]) < n * 0.01; lo++);
  summe = 0;
  for (; hi > 0 && (summe += hist[hi]) < n * 0.05; hi--);
  if (hi - lo < 30) { lo = Math.max(0, lo - 15); hi = Math.min(255, hi + 15); }
  const tab = new Uint8ClampedArray(256);
  const schwelle = (lo + hi) / 2 + (hi - lo) * 0.1;
  for (let v = 0; v < 256; v++) {
    if (filter === 'sw') tab[v] = v < schwelle ? 0 : 255;
    else tab[v] = Math.pow(Math.min(1, Math.max(0, (v - lo) / (hi - lo))), 1.2) * 255;
  }
  for (let i = 0; i < p.length; i += 4) { const v = tab[p[i]]; p[i] = p[i + 1] = p[i + 2] = v; }
  g.putImageData(bild, 0, 0);
  return c;
}

function seiteRendern(s) {
  s.bild = bearbeiten(s.quelle, s.drehung, zustand.filter).toDataURL('image/jpeg', JPEG_QUALITAET);
}

async function bilderHinzu(dateien) {
  for (const datei of dateien) {
    try {
      const s = { quelle: verkleinern(await bildLaden(datei)), drehung: 0, bild: '' };
      seiteRendern(s);
      zustand.seiten.push(s);
    } catch (e) {
      meldung($('meldung'), e.message, 'schlecht');
    }
  }
  seitenZeigen();
}

function seitenZeigen() {
  const box = $('seiten');
  box.innerHTML = '';
  zustand.seiten.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'seite';
    el.innerHTML = `<img alt="Seite ${i + 1}"><span class="nr">Seite ${i + 1}</span>
      <div class="knoepfe"><button title="Nach vorne">◀</button><button title="Drehen">⟳</button><button title="Löschen">🗑</button></div>`;
    el.querySelector('img').src = s.bild;
    const [vor, drehen, weg] = el.querySelectorAll('button');
    vor.disabled = i === 0;
    vor.onclick = () => { zustand.seiten.splice(i - 1, 0, zustand.seiten.splice(i, 1)[0]); seitenZeigen(); };
    drehen.onclick = () => { s.drehung = (s.drehung + 1) % 4; seiteRendern(s); seitenZeigen(); };
    weg.onclick = () => { if (confirm(`Seite ${i + 1} löschen?`)) { zustand.seiten.splice(i, 1); seitenZeigen(); } };
    box.append(el);
  });
  dateinameZeigen();
}

// ------------------------------------------------------------------ Schritt 4: PDF bauen und ablegen
async function pdfBauen() {
  const { PDFDocument } = PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle(dateiname());
  doc.setProducer('Handy-Scan Notariat');
  for (const s of zustand.seiten) {
    const jpg = await doc.embedJpg(s.bild);
    // Längste Seite = A4-Länge (842 pt), Seitenverhältnis wie das Foto
    const f = 842 / Math.max(jpg.width, jpg.height);
    const w = jpg.width * f, h = jpg.height * f;
    doc.addPage([w, h]).drawImage(jpg, { x: 0, y: 0, width: w, height: h });
  }
  return doc.save();
}

async function ablegen() {
  const knopf = $('ablegen');
  knopf.disabled = true;
  meldung($('meldung'), 'PDF wird erstellt und übertragen …');
  try {
    const pdf = await pdfBauen();
    const q = new URLSearchParams({ nr: zustand.nr, bez: $('bez').value.trim(), ordner: zustand.gewaehlt, datei: dateiname() });
    const d = await api('/api/ablegen?' + q, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: pdf });
    meldung($('meldung'), `✓ Abgelegt: ${d.ordner} \\ ${d.datei}`, 'gut');
    // Nächstes Dokument im selben Vorgang
    zustand.seiten = [];
    zustand.art = '';
    zustand.gewaehlt = d.ordner;
    zustand.ordner = [d.ordner];
    $('zusatz').value = '';
    $('bez-feld').hidden = true;
    $('ordner-wahl-feld').hidden = true;
    meldung($('ordner-info'), `✓ Ablage in: ${d.ordner}`, 'gut');
    for (const x of $('arten').children) x.classList.remove('an');
    seitenZeigen();
    window.scrollTo({ top: $('s-dokument').offsetTop - 8, behavior: 'smooth' });
  } catch (e) {
    meldung($('meldung'), 'Nicht abgelegt: ' + e.message, 'schlecht');
  } finally {
    dateinameZeigen();
  }
}

// ------------------------------------------------------------------ Start
artenZeigen();
$('nr-ok').addEventListener('click', vorgangPruefen);
$('nr').addEventListener('keydown', e => { if (e.key === 'Enter') vorgangPruefen(); });
$('nr').addEventListener('input', () => {
  if ($('nr').value.trim().replace(/\D/g, '') !== zustand.nr) {
    zustand.nr = '';
    for (const s of ['s-dokument', 's-seiten', 's-ablegen']) $(s).hidden = true;
    meldung($('ordner-info'), '');
    $('bez-feld').hidden = true;
    $('ordner-wahl-feld').hidden = true;
  }
});
$('ordner-wahl').addEventListener('change', e => { zustand.gewaehlt = e.target.value; });
$('zusatz').addEventListener('input', dateinameZeigen);
$('kamera').addEventListener('change', e => { bilderHinzu([...e.target.files]); e.target.value = ''; });
$('galerie').addEventListener('change', e => { bilderHinzu([...e.target.files]); e.target.value = ''; });
$('filter').addEventListener('click', e => {
  const f = e.target.dataset && e.target.dataset.f;
  if (!f) return;
  zustand.filter = f;
  for (const b of $('filter').children) b.classList.toggle('an', b.dataset.f === f);
  zustand.seiten.forEach(seiteRendern);
  seitenZeigen();
});
$('zuschneiden').addEventListener('change', e => {
  zustand.zuschneiden = e.target.checked;
  zustand.seiten.forEach(seiteRendern);
  seitenZeigen();
});
$('ablegen').addEventListener('click', ablegen);
window.addEventListener('beforeunload', e => { if (zustand.seiten.length) { e.preventDefault(); e.returnValue = ''; } });
api('/api/info').then(d => { $('fuss').textContent = `Handy-Scan ${d.version} · PC ${d.rechner}`; }).catch(() => {});
