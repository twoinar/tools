// Claude-Starter: drei Knöpfe (Frage an Claude, BrandenburgViewer, Grundstückswert) und ein schlichter
// Chat. Die Anfrage geht über den kleinen Server Claude-Server.ps1 (POST /api/claude, nur am PC selbst) an die
// Anthropic-API; der Server hängt den API-Schlüssel an. An Claude geht nur, was im Chat getippt wird.
// Die Vorgangsnummer bleibt im Browser und wird nur für die Ablage (/api/ablegen) verwendet.
'use strict';

const $ = id => document.getElementById(id);

const GRUND = 'Du hilfst Notar Thomas Woinar (Notariat in Frankfurt (Oder), Brandenburg) und seinen Mitarbeitern. ' +
  'Antworte auf Deutsch, kurz und knapp, sachlich, mit den einschlägigen Vorschriften (Paragraphen). ' +
  'Formatiere mit einfachem Markdown (Überschriften ###, Listen, Tabellen, **fett**). ' +
  'Die Anfragen sind bewusst anonym: Frage nie nach Namen, Geburtsdaten oder Anschriften der Beteiligten; ' +
  'stehen solche Angaben in der Frage, weise in einem Satz darauf hin, dass sie nicht nötig sind (Verschwiegenheit, § 18 BNotO). ' +
  'Schlage nie vor, das Grundbuch automatisiert oder per KI abzurufen. ' +
  'Recherchiere im Web, wenn es auf aktuelle Gesetzesfassungen, Rechtsprechung, Tabellen (z. B. GNotKG) oder Marktdaten ankommt, und nenne die Quellen.';

const MODULE = {
  frage: {
    titel: 'Frage an Claude',
    platzhalter: 'Frage eingeben … (Enter = senden, Umschalt+Enter = neue Zeile)',
    aufwand: 'medium',
    system: GRUND + ' Typische Fragen: Geschäftswert und Notarkosten nach GNotKG, Grundbuch- und Erbrecht, Gesellschaftsrecht, Formulierungen für Urkunden. ' +
      'Rechne Kosten nachvollziehbar vor (Geschäftswert, Gebührentatbestand KV-Nr., Gebührensatz, Tabelle B).',
    datei: thema => 'Claude ' + (thema || 'Anfrage'),
    ueberschrift: 'Aktenvermerk',
    betreff: thema => `Anfrage an Claude (KI) – ${thema || 'Anfrage'}`,
    hinweis: 'Auskunft eines KI-Assistenten (Claude, Anthropic). Angefragt ohne Namen und Anschriften der Beteiligten. Ergebnis vor Verwendung vom Notar zu prüfen.',
  },
  wert: {
    titel: 'Grundstückswert KI',
    platzhalter: 'Objekt beschreiben: Ort und Straße, Objektart, Grundstücksfläche, Wohnfläche, Baujahr, Modernisierungen, Zustand, Rechte (Wohnungsrecht, Nießbrauch), Anlass. Oder den Erfassungsbogen einfügen. Keine Namen.',
    aufwand: 'high',
    system: GRUND + `

Aufgabe: überschlägige Wertanalyse einer Immobilie (Verkehrswert § 194 BauGB, ImmoWertV 2021). Fehlende Angaben nicht erfragen, sondern mit begründeten, marktüblichen Annahmen arbeiten und diese offenlegen. Nur wenn Ort oder Objektart völlig fehlen, kurz nachfragen.

Recherche (Websuche, Stand heute): Makro- und Mikrolage; Bodenrichtwert (BORIS Brandenburg, Gutachterausschuss); Grundstücksmarktbericht des Landkreises bzw. der kreisfreien Stadt (Sachwertfaktoren, Liegenschaftszinssätze, Vergleichsfaktoren €/m² Wohnfläche); Angebotspreise vergleichbarer Objekte zur Plausibilisierung (Abschlag nennen); NHK 2010 (Anlage 4 ImmoWertV) und Baupreisindex Wohngebäude (2010 = 100).

Verfahren: Ein-/Zweifamilienhaus, DHH/RH: Sachwert führend, Vergleichswert zur Plausibilisierung. Eigentumswohnung: Vergleichswert, Ertragswert zur Plausibilisierung. Mehrfamilienhaus/Gewerbe: Ertragswert. Unbebaut/LuF: Bodenwert.
Kerngrößen: Bodenwert = Fläche × angepasster Bodenrichtwert (Hinterland mit Abschlag). GND Wohngebäude 80 Jahre, RND nach Anlage 2 aus Baujahr und Modernisierungspunkten. Sachwert: BGF (sonst Wohnfläche × 1,5–2,0, Annahme nennen) × NHK 2010 × Baupreisindex/100 × Regionalfaktor, lineare Alterswertminderung, Außenanlagen 2–5 %, Nebengebäude, + Bodenwert, × Sachwertfaktor. Ertragswert: Rohertrag − Bewirtschaftungskosten (Anlage 3) = Reinertrag − Bodenwertverzinsung, × Barwertfaktor, + Bodenwert. Danach besondere objektspezifische Merkmale (§ 8 Abs. 3 ImmoWertV): Instandhaltungsstau, Wohnungsrecht/Nießbrauch (Jahreswert × Leibrentenbarwertfaktor nach aktueller Sterbetafel), Wegerechte, Denkmalschutz. Bei Miteigentums- oder Erbteil Gesamtwert und Anteil, Hinweis auf übliche Abschläge. Ergebnis runden (unter 100.000 € auf 1.000 €, sonst auf 5.000 €), Spanne meist ±10 %. Rechne sorgfältig und prüfe den Wert je m² Wohnfläche gegen die Marktdaten.

Gliederung der Antwort (Markdown):
### Ergebnis (geschätzter Verkehrswert fett, Spanne, führendes Verfahren, Wert je m² Wohnfläche)
### Objekt
### Lage
### Bodenwert (Tabelle)
### <führendes Verfahren> (Rechentabelle, jede Zeile ein Rechenschritt mit Quelle des Ansatzes)
### Plausibilisierung
### Besondere Merkmale
### Annahmen und offene Punkte
Bei Anlass Geschäftswert zusätzlich auf § 46 GNotKG hinweisen. Bei Rückfragen im Verlauf nur die Änderung erläutern und das neue Ergebnis nennen.`,
    datei: () => 'Wertanalyse',
    ueberschrift: 'Wertanalyse',
    betreff: () => 'Überschlägige Verkehrswertschätzung (§ 194 BauGB, ImmoWertV)',
    hinweis: 'Erstellt mit einem KI-Assistenten (Claude, Anthropic). Einverständnis der Beteiligten zur Übermittlung der Objektangaben (ohne Namen) lag vor (bestätigt EINWILLIGUNG). Diese Wertanalyse ist eine überschlägige Schätzung auf Grundlage der eingegebenen Angaben und öffentlich zugänglicher Marktdaten. Sie ist kein Verkehrswertgutachten nach § 194 BauGB und ersetzt nicht die Begutachtung durch einen Sachverständigen oder den Gutachterausschuss.',
  },
};

let modul = null;
let nachrichten = [];   // für die API: Rollen und Inhalte genau so, wie Claude sie geliefert hat
let runden = [];        // für Anzeige und PDF: { frage, antwort, quellen }
let laeuft = false;
let karte = 'https://bb-viewer.geobasis-bb.de/';
let rechner = 'https://twoinar.github.io/boegen/vorgespraech.html?nur=bewertung';
let einwilligung = '';   // Zeitpunkt, zu dem das Einverständnis der Beteiligten bestätigt wurde
let nurZiffern = true;

// ------------------------------------------------------------------ Anzeige
function meldung(text, art) {
  $('meldung').hidden = !text;
  $('meldung').className = 'hinweis' + (art ? ' ' + art : '');
  $('meldung').textContent = text || '';
}

function esc(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
function inline(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<b>${a || b}</b>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(^|[^\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>');
}
function html(md) {   // Markdown → HTML mit denselben Blöcken wie im PDF (bloecke aus aktenvermerk.js)
  let aus = '', liste = null;
  const zu = () => { if (liste) { aus += `</${liste}>`; liste = null; } };
  for (const b of bloecke(md)) {
    if (b.art === 'liste') {
      const art = b.zeichen === '•' ? 'ul' : 'ol';
      if (liste !== art) { zu(); aus += `<${art}>`; liste = art; }
      aus += `<li>${inline(b.text)}</li>`;
      continue;
    }
    zu();
    if (b.art === 'ueberschrift') aus += `<h3>${inline(b.text)}</h3>`;
    else if (b.art === 'absatz') aus += `<p>${inline(b.text).replace(/\n/g, '<br>')}</p>`;
    else if (b.art === 'zitat') aus += `<blockquote>${inline(b.text)}</blockquote>`;
    else if (b.art === 'code') aus += `<pre>${esc(b.zeilen.join('\n'))}</pre>`;
    else if (b.art === 'linie') aus += '<hr>';
    else if (b.art === 'tabelle') aus += '<table>' + b.zeilen.map((z, i) => '<tr>' + z.map(c => i ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`).join('') + '</tr>').join('') + '</table>';
  }
  zu();
  return aus;
}

function blase(art, inhalt) {
  const d = document.createElement('div');
  d.className = 'msg ' + art;
  if (art === 'ich') d.textContent = inhalt; else d.innerHTML = inhalt;
  $('verlauf').append(d);
  $('verlauf').scrollTop = $('verlauf').scrollHeight;
  return d;
}

function antwortHtml(r) {
  let h = html(r.antwort);
  if (r.quellen.length) h += '<p class="quellen">Quellen: ' + r.quellen.map((q, i) => `<a href="${esc(q.url)}" target="_blank" rel="noopener">[${i + 1}] ${esc(q.titel || q.url)}</a>`).join(' · ') + '</p>';
  return h;
}

function nummer() {
  const roh = $('nr').value.trim();
  if (nurZiffern) return roh.replace(/\D/g, '').replace(/^0+/, '');
  return roh.replace(/\//g, '-').replace(/[^\p{L}\d .\-_]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}
function thema() { return $('thema').value.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim(); }

function knoepfe() {
  $('senden').disabled = laeuft || !$('text').value.trim();
  $('ablegen').disabled = laeuft || !runden.some(r => r.antwort) || !nummer();
  $('ablegen').title = nummer() ? `${nummer()} ${modul ? modul.datei(thema()) : ''}.pdf` : 'Erst Vorgangs-Nr. eingeben';
}

// ------------------------------------------------------------------ Ablauf
function starten(name) {
  modul = MODULE[name];
  nachrichten = []; runden = [];
  $('verlauf').textContent = '';
  $('titel').textContent = modul.titel;
  $('text').placeholder = modul.platzhalter;
  $('text').rows = name === 'wert' ? 6 : 2;
  $('thema').hidden = name === 'wert';
  $('thema').value = '';
  meldung('');
  $('start').hidden = true;
  $('chat').hidden = false;
  $('text').focus();
  knoepfe();
}

function zurueck() {
  if (runden.length && !confirm('Chat verwerfen? Nicht abgelegte Antworten gehen verloren.')) return;
  runden = [];
  $('chat').hidden = true;
  $('start').hidden = false;
}

async function anfrage(korper) {
  let r;
  try {
    r = await fetch('/api/claude', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(korper) });
  } catch { throw new Error('Der PC antwortet nicht. Bitte das Claude-Fenster schließen und über das Desktop-Symbol neu öffnen.'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d.error && d.error.message) || d.fehler || `Fehler ${r.status}`);
  return d;
}

async function senden() {
  const frage = $('text').value.trim();
  if (!frage || laeuft) return;
  laeuft = true;
  $('text').value = '';
  meldung('');
  blase('ich', frage);
  const runde = { frage, antwort: '', quellen: [] };
  runden.push(runde);
  nachrichten.push({ role: 'user', content: frage });
  const el = blase('claude', '<p class="denkt">Claude arbeitet …</p>');
  knoepfe();
  try {
    for (let schritt = 0; schritt < 8; schritt++) {
      const d = await anfrage({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        system: modul.system + ` Heute ist der ${new Date().toLocaleDateString('de-DE')}.`,
        messages: nachrichten,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8, user_location: { type: 'approximate', country: 'DE', region: 'Brandenburg', timezone: 'Europe/Berlin' } }],
        output_config: { effort: modul.aufwand },
        fallbacks: 'default',
      });
      // Nach pause_turn setzt Claude dieselbe Antwort fort: Inhalte an dieselbe Nachricht anhängen
      const letzte = nachrichten[nachrichten.length - 1];
      if (letzte.role === 'assistant') letzte.content = letzte.content.concat(d.content || []);
      else nachrichten.push({ role: 'assistant', content: d.content || [] });
      for (const b of d.content || []) {
        if (b.type !== 'text') continue;
        runde.antwort += b.text;
        for (const c of b.citations || []) if (c.url && !runde.quellen.some(q => q.url === c.url)) runde.quellen.push({ url: c.url, titel: c.title });
      }
      el.innerHTML = antwortHtml(runde) + (d.stop_reason === 'pause_turn' ? '<p class="denkt">Claude recherchiert weiter …</p>' : '');
      if (d.stop_reason === 'pause_turn') continue;
      if (d.stop_reason === 'refusal') {
        el.innerHTML += '<p class="denkt">Claude hat die Antwort abgelehnt' + (d.stop_details && d.stop_details.explanation ? ': ' + esc(d.stop_details.explanation) : '.') + '</p>';
      } else if (d.stop_reason === 'max_tokens') {
        el.innerHTML += '<p class="denkt">Antwort war zu lang und wurde abgeschnitten.</p>';
      }
      break;
    }
    if (!runde.antwort) throw new Error('Keine Antwort erhalten.');
  } catch (e) {
    // Fehlgeschlagene Runde zurücknehmen, damit der Verlauf für die API gültig bleibt
    while (nachrichten.length && nachrichten[nachrichten.length - 1].role === 'assistant') nachrichten.pop();
    nachrichten.pop();
    runden.pop();
    el.innerHTML = `<p class="denkt">Fehler: ${esc(e.message)}</p>`;
    $('text').value = frage;
  }
  laeuft = false;
  knoepfe();
  $('text').focus();
}

function abschnitte() {
  const aus = [];
  const mehrere = runden.length > 1;
  runden.forEach((r, i) => {
    if (!r.antwort) return;
    const n = mehrere ? ` ${i + 1}` : '';
    if (modul === MODULE.wert) {
      aus.push({ titel: i ? 'Rückfrage' + n : 'Angaben', text: r.frage });
      aus.push({ titel: 'Wertanalyse' + n, text: r.antwort });
    } else {
      aus.push({ titel: 'Frage' + n, text: r.frage });
      aus.push({ titel: 'Antwort von Claude' + n, text: r.antwort });
    }
  });
  const quellen = [...new Map(runden.flatMap(r => r.quellen).map(q => [q.url, q])).values()];
  if (quellen.length) aus.push({ titel: 'Quellen', text: quellen.map(q => `- ${q.titel ? q.titel + ': ' : ''}${q.url}`).join('\n') });
  return aus;
}

async function ablegen() {
  if (!nummer()) { meldung('Bitte die Vorgangs-Nr. eingeben.', 'schlecht'); return; }
  $('ablegen').disabled = true;
  meldung('Wird abgelegt …');
  try {
    const pdf = await aktenvermerkPdf({
      nummer: nummer(), bezeichnung: modul.datei(thema()), ueberschrift: modul.ueberschrift,
      betreff: modul.betreff(thema()), hinweis: modul.hinweis.replace('EINWILLIGUNG', einwilligung), abschnitte: abschnitte(),
    });
    const q = new URLSearchParams({ nr: nummer(), datei: modul.datei(thema()) });
    const r = await fetch('/api/ablegen?' + q, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: pdf });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.fehler || `Fehler ${r.status}`);
    meldung(`✓ Abgelegt: ${d.datei}`, 'gut');
    runden.forEach(r => { r.abgelegt = true; });
  } catch (e) {
    meldung('Nicht abgelegt: ' + e.message, 'schlecht');
  }
  knoepfe();
}

// ------------------------------------------------------------------ Start
$('k-frage').addEventListener('click', () => starten('frage'));
$('k-wert').addEventListener('click', () => {
  $('ew-haken').checked = false; $('ew-weiter').disabled = true;
  $('start').hidden = true; $('einwilligung').hidden = false;
});
$('ew-haken').addEventListener('change', () => { $('ew-weiter').disabled = !$('ew-haken').checked; });
$('ew-zurueck').addEventListener('click', () => { $('einwilligung').hidden = true; $('start').hidden = false; });
$('ew-weiter').addEventListener('click', () => {
  einwilligung = new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) + ' Uhr';
  $('einwilligung').hidden = true;
  starten('wert');
});
$('k-rechner').addEventListener('click', () => window.open(rechner, '_blank'));
$('k-karte').addEventListener('click', () => window.open(karte, '_blank'));
$('zurueck').addEventListener('click', zurueck);
$('neu').addEventListener('click', () => { const name = modul === MODULE.wert ? 'wert' : 'frage'; if (!runden.length || confirm('Neuen Chat beginnen?')) { runden = []; starten(name); } });
$('senden').addEventListener('click', senden);
$('ablegen').addEventListener('click', ablegen);
$('text').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); senden(); } });
for (const id of ['text', 'nr', 'thema']) $(id).addEventListener('input', knoepfe);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('chat').hidden && !laeuft) zurueck(); });

fetch('/api/claude').then(r => r.json()).then(d => {
  if (d.karte) karte = d.karte;
  if (d.rechner) rechner = d.rechner;
  if (!d.lokal) { $('start-hinweis').textContent = 'Claude geht nur an diesem PC selbst.'; $('k-frage').disabled = $('k-wert').disabled = true; }
  else if (!d.schluessel) { $('start-hinweis').textContent = 'Noch kein API-Schlüssel: einmal „Einrichten.cmd“ im Claude-Ordner starten.'; $('k-frage').disabled = $('k-wert').disabled = true; }
}).catch(() => { $('start-hinweis').textContent = 'Claude-Server läuft nicht. Fenster schließen und das Desktop-Symbol neu anklicken.'; });
fetch('/api/info').then(r => r.json()).then(d => { if (d.nurZiffern === false) nurZiffern = false; }).catch(() => {});
