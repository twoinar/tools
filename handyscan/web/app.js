// Handy-Scan: Seiten fotografieren, Blatt erkennen und gerade ziehen, auf dem Handy zu einem
// PDF zusammensetzen und an den Büro-PC schicken. Der PC (Handy-Scan-Server.ps1) legt das PDF
// als „<Vorgangsnummer> <Bezeichnung>.pdf“ im Ablageordner ab.
'use strict';

const ARTEN = ['Geburtsurkunde', 'Heiratsurkunde', 'Sterbeurkunde', 'Personalausweis', 'Reisepass',
  'Erbschein', 'Testament', 'Vollmacht', 'Vertrag', 'Sonstiges'];
const MAX_KANTE = 2400;      // längste Kante des Fotos, mit dem gearbeitet wird
const MAX_SEITE = 2200;      // längste Kante der fertigen Seite (gut lesbar bei A4)
const ERKENNUNG_KANTE = 800; // Blatterkennung auf verkleinertem Bild (schneller, robuster)
const JPEG_QUALITAET = 0.82;

const $ = id => document.getElementById(id);
const zustand = {
  nr: '', art: '', filter: 'grau',
  seiten: [],                // { foto: Canvas, ecken: [[x,y]×4], drehung: 0..3, bild: dataURL }
};

// ------------------------------------------------------------------ OpenCV (Blatterkennung)
let cvVersprechen = null;
function cvLaden() {
  if (cvVersprechen) return cvVersprechen;
  cvVersprechen = new Promise((ok, fehler) => {
    const s = document.createElement('script');
    s.src = 'opencv.js';
    s.async = true;
    s.onerror = () => fehler(new Error('Blatterkennung konnte nicht geladen werden.'));
    s.onload = async () => {
      try {
        let c = window.cv;
        // Emscripten-Modul ist „thenable“ und löst sich mit sich selbst auf – ein direktes
        // await würde endlos laufen, daher then entfernen
        if (!c.Mat) c = await new Promise(r => c.then(m => { delete m.then; r(m); }));
        else if (typeof c.then === 'function') delete c.then;
        window.cv = c;
        ok(c);
      } catch (e) { fehler(e); }
    };
    document.head.append(s);
  });
  return cvVersprechen;
}

function abstand(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

// Ecken sortieren: oben links, oben rechts, unten rechts, unten links
function sortiereEcken(p) {
  const summe = p.map(q => q[0] + q[1]), diff = p.map(q => q[1] - q[0]);
  return [
    p[summe.indexOf(Math.min(...summe))], p[diff.indexOf(Math.min(...diff))],
    p[summe.indexOf(Math.max(...summe))], p[diff.indexOf(Math.max(...diff))],
  ];
}

function ganzesBild(c) {
  return [[0, 0], [c.width, 0], [c.width, c.height], [0, c.height]];
}

// Sucht das Blatt als größtes Viereck. Zwei Wege: Kanten (Canny) und helle Fläche (Otsu).
function blattFinden(cv, foto) {
  const f = Math.min(1, ERKENNUNG_KANTE / Math.max(foto.width, foto.height));
  const klein = document.createElement('canvas');
  klein.width = Math.round(foto.width * f);
  klein.height = Math.round(foto.height * f);
  klein.getContext('2d').drawImage(foto, 0, 0, klein.width, klein.height);
  const flaeche = klein.width * klein.height;

  const src = cv.imread(klein), grau = new cv.Mat(), weich = new cv.Mat();
  cv.cvtColor(src, grau, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(grau, weich, new cv.Size(5, 5), 0);
  const kandidaten = [];

  const auswerten = maske => {
    const konturen = new cv.MatVector(), hier = new cv.Mat();
    cv.findContours(maske, konturen, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < konturen.size(); i++) {
      const k = konturen.get(i);
      const a = cv.contourArea(k);
      if (a > flaeche * 0.12 && a < flaeche * 0.995) {
        const huelle = new cv.Mat(), naeherung = new cv.Mat();
        cv.convexHull(k, huelle);
        const umfang = cv.arcLength(huelle, true);
        for (const eps of [0.02, 0.03, 0.05]) {
          cv.approxPolyDP(huelle, naeherung, eps * umfang, true);
          if (naeherung.rows === 4) {
            const p = [];
            for (let j = 0; j < 4; j++) p.push([naeherung.data32S[j * 2] / f, naeherung.data32S[j * 2 + 1] / f]);
            kandidaten.push({ a, p, echt: true });
            break;
          }
        }
        if (naeherung.rows !== 4) {
          // Kein sauberes Viereck: kleinstes umschließendes Rechteck als Notlösung
          const r = cv.minAreaRect(huelle);
          const pts = cv.RotatedRect.points(r).map(q => [q.x / f, q.y / f]);
          kandidaten.push({ a: a * 0.9, p: pts, echt: false });
        }
        huelle.delete(); naeherung.delete();
      }
      k.delete();
    }
    konturen.delete(); hier.delete();
  };

  // Weg 1: Kanten, mit mehreren Empfindlichkeiten (helle Unterlage braucht feine Kanten)
  const kanten = new cv.Mat(), dick = new cv.Mat();
  const kern = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  for (const [u, o] of [[60, 180], [30, 90], [12, 36]]) {
    cv.Canny(weich, kanten, u, o);
    cv.dilate(kanten, dick, kern);
    auswerten(dick);
  }
  // Weg 2: helle Fläche (Papier heller als Unterlage), auch mit örtlicher Schwelle gegen Schatten
  const otsu = new cv.Mat();
  cv.threshold(weich, otsu, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  cv.morphologyEx(otsu, otsu, cv.MORPH_OPEN, kern);
  auswerten(otsu);
  const ort = new cv.Mat();
  cv.adaptiveThreshold(weich, ort, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY, 151, -4);
  cv.morphologyEx(ort, ort, cv.MORPH_OPEN, kern);
  auswerten(ort);
  ort.delete();

  [src, grau, weich, kanten, dick, otsu, kern].forEach(m => m.delete());
  if (!kandidaten.length) return null;
  // Echte Vierecke vor Notlösungen, dann die größte Fläche
  kandidaten.sort((x, y) => (y.echt - x.echt) || (y.a - x.a));
  const p = kandidaten[0].p.map(([x, y]) => [Math.max(0, Math.min(foto.width, x)), Math.max(0, Math.min(foto.height, y))]);
  return sortiereEcken(p);
}

// Blatt anhand der vier Ecken gerade ziehen
function entzerren(cv, foto, ecken) {
  const [tl, tr, br, bl] = ecken;
  let w = Math.max(abstand(tl, tr), abstand(bl, br));
  let h = Math.max(abstand(tl, bl), abstand(tr, br));
  const f = Math.min(1, MAX_SEITE / Math.max(w, h));
  w = Math.max(1, Math.round(w * f)); h = Math.max(1, Math.round(h * f));
  const src = cv.imread(foto), ziel = new cv.Mat();
  const von = cv.matFromArray(4, 1, cv.CV_32FC2, [].concat(tl, tr, br, bl));
  const nach = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
  const m = cv.getPerspectiveTransform(von, nach);
  cv.warpPerspective(src, ziel, m, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  const c = document.createElement('canvas');
  cv.imshow(c, ziel);
  [src, ziel, von, nach, m].forEach(x => x.delete());
  return c;
}

// „Dokument“: Schatten herausrechnen, Papier weiß. „Schwarzweiß“: zusätzlich harte Schwelle.
function aufhellen(cv, c, filter) {
  if (filter === 'farbe') return c;
  const src = cv.imread(c), grau = new cv.Mat(), hg = new cv.Mat(), erg = new cv.Mat();
  cv.cvtColor(src, grau, cv.COLOR_RGBA2GRAY);
  const k = Math.max(15, Math.round(Math.max(c.width, c.height) / 60)) | 1;
  const kern = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(k, k));
  cv.dilate(grau, hg, kern);              // Hintergrund = Papierhelligkeit ohne Schrift
  cv.medianBlur(hg, hg, 21);
  cv.divide(grau, hg, erg, 255);          // Schrift relativ zum Papier → Papier gleichmäßig weiß
  cv.normalize(erg, erg, 0, 255, cv.NORM_MINMAX);
  if (filter === 'sw') {
    cv.threshold(erg, erg, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  } else {
    // etwas mehr Kontrast: helle Grautöne ganz weiß, Schrift kräftiger
    erg.convertTo(erg, -1, 1.25, -45);
  }
  const aus = document.createElement('canvas');
  cv.imshow(aus, erg);
  [src, grau, hg, erg, kern].forEach(x => x.delete());
  return aus;
}

function drehen(c, drehung) {
  if (!drehung) return c;
  const quer = drehung % 2 === 1;
  const d = document.createElement('canvas');
  d.width = quer ? c.height : c.width;
  d.height = quer ? c.width : c.height;
  const g = d.getContext('2d');
  g.translate(d.width / 2, d.height / 2);
  g.rotate(drehung * Math.PI / 2);
  g.drawImage(c, -c.width / 2, -c.height / 2);
  return d;
}

async function seiteRendern(s) {
  let c;
  try {
    const cv = await cvLaden();
    c = aufhellen(cv, drehen(entzerren(cv, s.foto, s.ecken), s.drehung), zustand.filter);
  } catch (e) {
    console.warn(e);
    c = drehen(s.foto, s.drehung);   // ohne Blatterkennung: Foto unverändert
  }
  s.bild = c.toDataURL('image/jpeg', JPEG_QUALITAET);
}

// ------------------------------------------------------------------ Ecken prüfen (Vollbild)
function eckenPruefen(foto, ecken) {
  return new Promise(fertig => {
    const box = $('editor'), cnv = $('editor-bild'), g = cnv.getContext('2d');
    box.hidden = false;
    document.body.classList.add('gesperrt');
    let p = ecken.map(q => q.slice()), aktiv = -1, f = 1;

    const zeichnen = () => {
      const breite = box.clientWidth - 24, hoehe = box.clientHeight - $('editor-knoepfe').offsetHeight - 60;
      f = Math.min(breite / foto.width, hoehe / foto.height);
      cnv.width = Math.round(foto.width * f);
      cnv.height = Math.round(foto.height * f);
      g.drawImage(foto, 0, 0, cnv.width, cnv.height);
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.beginPath();
      g.rect(0, 0, cnv.width, cnv.height);
      p.forEach(([x, y], i) => (i ? g.lineTo(x * f, y * f) : g.moveTo(x * f, y * f)));
      g.closePath();
      g.fill('evenodd');
      g.strokeStyle = '#4493f8'; g.lineWidth = 3;
      g.beginPath();
      p.forEach(([x, y], i) => (i ? g.lineTo(x * f, y * f) : g.moveTo(x * f, y * f)));
      g.closePath(); g.stroke();
      p.forEach(([x, y], i) => {
        g.beginPath(); g.arc(x * f, y * f, i === aktiv ? 18 : 14, 0, Math.PI * 2);
        g.fillStyle = 'rgba(68,147,248,.35)'; g.fill();
        g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke();
      });
    };
    const punkt = e => {
      const r = cnv.getBoundingClientRect();
      return [(e.clientX - r.left) * (cnv.width / r.width) / f, (e.clientY - r.top) * (cnv.height / r.height) / f];
    };
    const runter = e => {
      const q = punkt(e);
      let best = -1, bestD = 45 / f;
      p.forEach((x, i) => { const d = abstand(x, q); if (d < bestD) { bestD = d; best = i; } });
      aktiv = best;
      if (aktiv >= 0) { cnv.setPointerCapture(e.pointerId); zeichnen(); }
    };
    const ziehen = e => {
      if (aktiv < 0) return;
      const [x, y] = punkt(e);
      p[aktiv] = [Math.max(0, Math.min(foto.width, x)), Math.max(0, Math.min(foto.height, y))];
      zeichnen();
    };
    const hoch = () => { aktiv = -1; zeichnen(); };
    const ende = ergebnis => {
      box.hidden = true;
      document.body.classList.remove('gesperrt');
      cnv.removeEventListener('pointerdown', runter);
      cnv.removeEventListener('pointermove', ziehen);
      cnv.removeEventListener('pointerup', hoch);
      window.removeEventListener('resize', zeichnen);
      $('editor-ok').onclick = $('editor-ganz').onclick = $('editor-weg').onclick = null;
      fertig(ergebnis);
    };
    cnv.addEventListener('pointerdown', runter);
    cnv.addEventListener('pointermove', ziehen);
    cnv.addEventListener('pointerup', hoch);
    window.addEventListener('resize', zeichnen);
    $('editor-ok').onclick = () => ende(sortiereEcken(p));
    $('editor-ganz').onclick = () => { p = ganzesBild(foto); zeichnen(); };
    $('editor-weg').onclick = () => ende(null);
    zeichnen();
  });
}

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

// ------------------------------------------------------------------ Anzeige
function meldung(el, text, art) {
  el.hidden = !text;
  el.className = 'hinweis' + (art ? ' ' + art : '');
  el.textContent = text || '';
}

function nummer() { return $('nr').value.trim().replace(/\D/g, '').replace(/^0+/, ''); }

function bezeichnung() {
  return $('zusatz').value.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
}

function dateiname() {
  return [nummer(), bezeichnung() || 'Scan'].filter(Boolean).join(' ');
}

function anzeigen() {
  $('dateiname').textContent = nummer() ? dateiname() + '.pdf' : '–';
  $('ablegen').disabled = !nummer() || zustand.seiten.length === 0 || zustand.arbeitet;
}

// Dokumentart setzt den Anfang der Bezeichnung; dahinter Getipptes bleibt stehen
function artWaehlen(a) {
  const alt = zustand.art;
  let rest = $('zusatz').value;
  if (alt && rest.startsWith(alt)) rest = rest.slice(alt.length);
  rest = rest.trim();
  zustand.art = zustand.art === a ? '' : a;
  $('zusatz').value = zustand.art ? zustand.art + ' ' + rest : rest;
  for (const x of $('arten').children) x.classList.toggle('an', x.textContent === zustand.art);
  const z = $('zusatz');
  z.focus();
  z.setSelectionRange(z.value.length, z.value.length);
  anzeigen();
}

function artenZeigen() {
  for (const a of ARTEN) {
    const b = document.createElement('button');
    b.textContent = a;
    b.addEventListener('click', () => artWaehlen(a));
    $('arten').append(b);
  }
}

// ------------------------------------------------------------------ Seiten
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

async function arbeit(text, fn) {
  zustand.arbeitet = true;
  meldung($('meldung'), text);
  anzeigen();
  try { return await fn(); } finally {
    zustand.arbeitet = false;
    if ($('meldung').textContent === text) meldung($('meldung'), '');
    anzeigen();
  }
}

async function bilderHinzu(dateien) {
  for (const datei of dateien) {
    try {
      const foto = verkleinern(await bildLaden(datei));
      let ecken = ganzesBild(foto);
      await arbeit('Blatt wird erkannt …', async () => {
        try { ecken = blattFinden(await cvLaden(), foto) || ecken; } catch (e) { console.warn(e); }
      });
      if ($('pruefen').checked) {
        ecken = await eckenPruefen(foto, ecken);
        if (!ecken) continue;   // verworfen
      }
      const s = { foto, ecken, drehung: 0, bild: '' };
      await arbeit('Seite wird aufbereitet …', () => seiteRendern(s));
      zustand.seiten.push(s);
      seitenZeigen();
    } catch (e) {
      meldung($('meldung'), e.message, 'schlecht');
    }
  }
}

function seitenZeigen() {
  const box = $('seiten');
  box.innerHTML = '';
  zustand.seiten.forEach((s, i) => {
    const el = document.createElement('div');
    el.className = 'seite';
    el.innerHTML = `<img alt="Seite ${i + 1}"><span class="nr">Seite ${i + 1}</span>
      <div class="knoepfe"><button title="Ecken ändern">⌗</button><button title="Nach vorne">◀</button><button title="Drehen">⟳</button><button title="Löschen">🗑</button></div>`;
    el.querySelector('img').src = s.bild;
    const [ecken, vor, dreh, weg] = el.querySelectorAll('button');
    ecken.onclick = async () => {
      const neu = await eckenPruefen(s.foto, s.ecken);
      if (!neu) return;
      s.ecken = neu;
      await arbeit('Seite wird aufbereitet …', () => seiteRendern(s));
      seitenZeigen();
    };
    vor.disabled = i === 0;
    vor.onclick = () => { zustand.seiten.splice(i - 1, 0, zustand.seiten.splice(i, 1)[0]); seitenZeigen(); };
    dreh.onclick = async () => {
      s.drehung = (s.drehung + 1) % 4;
      await arbeit('Seite wird gedreht …', () => seiteRendern(s));
      seitenZeigen();
    };
    weg.onclick = () => { if (confirm(`Seite ${i + 1} löschen?`)) { zustand.seiten.splice(i, 1); seitenZeigen(); } };
    box.append(el);
  });
  anzeigen();
}

// ------------------------------------------------------------------ PDF bauen und ablegen
async function pdfBauen() {
  const { PDFDocument } = PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle(dateiname());
  doc.setProducer('Handy-Scan Notariat');
  for (const s of zustand.seiten) {
    const jpg = await doc.embedJpg(s.bild);
    // Längste Seite = A4-Länge (842 pt), Seitenverhältnis wie das Blatt
    const f = 842 / Math.max(jpg.width, jpg.height);
    const w = jpg.width * f, h = jpg.height * f;
    doc.addPage([w, h]).drawImage(jpg, { x: 0, y: 0, width: w, height: h });
  }
  return doc.save();
}

async function ablegen() {
  if (!nummer()) { meldung($('meldung'), 'Bitte zuerst die Vorgangsnummer eingeben.', 'schlecht'); return; }
  try {
    const d = await arbeit('PDF wird erstellt und übertragen …', async () => {
      const pdf = await pdfBauen();
      const q = new URLSearchParams({ nr: nummer(), datei: bezeichnung() });
      return api('/api/ablegen?' + q, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: pdf });
    });
    meldung($('meldung'), `✓ Abgelegt: ${d.datei}`, 'gut');
    // Nächstes Dokument im selben Vorgang
    zustand.seiten = [];
    zustand.art = '';
    $('zusatz').value = '';
    for (const x of $('arten').children) x.classList.remove('an');
    seitenZeigen();
  } catch (e) {
    meldung($('meldung'), 'Nicht abgelegt: ' + e.message, 'schlecht');
  }
}

// ------------------------------------------------------------------ Start
artenZeigen();
$('nr').addEventListener('input', anzeigen);
$('zusatz').addEventListener('input', () => {
  if (zustand.art && !$('zusatz').value.startsWith(zustand.art)) {
    zustand.art = '';
    for (const x of $('arten').children) x.classList.remove('an');
  }
  anzeigen();
});
$('kamera').addEventListener('change', e => { bilderHinzu([...e.target.files]); e.target.value = ''; });
$('galerie').addEventListener('change', e => { bilderHinzu([...e.target.files]); e.target.value = ''; });
$('filter').addEventListener('click', async e => {
  const f = e.target.dataset && e.target.dataset.f;
  if (!f || f === zustand.filter) return;
  zustand.filter = f;
  for (const b of $('filter').children) b.classList.toggle('an', b.dataset.f === f);
  await arbeit('Seiten werden aufbereitet …', async () => { for (const s of zustand.seiten) await seiteRendern(s); });
  seitenZeigen();
});
$('ablegen').addEventListener('click', ablegen);
try { $('pruefen').checked = localStorage.getItem('handyscan-pruefen') !== '0'; } catch { /* egal */ }
$('pruefen').addEventListener('change', e => { try { localStorage.setItem('handyscan-pruefen', e.target.checked ? '1' : '0'); } catch { /* egal */ } });
window.addEventListener('beforeunload', e => { if (zustand.seiten.length) { e.preventDefault(); e.returnValue = ''; } });
api('/api/info').then(d => { $('fuss').textContent = `Handy-Scan ${d.version} · PC ${d.rechner} · Ablage ${d.basis}`; }).catch(() => {});
cvLaden().catch(() => meldung($('meldung'), 'Blatterkennung nicht verfügbar – Fotos werden unverändert übernommen.', 'schlecht'));
anzeigen();
