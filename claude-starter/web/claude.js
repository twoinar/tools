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
    datei: () => 'Claude Frage',
    ueberschrift: 'Aktenvermerk',
    betreff: frage => `Anfrage an Claude (KI): ${frage}`,
    hinweis: 'Auskunft eines KI-Assistenten (Claude, Anthropic). Angefragt ohne Namen und Anschriften der Beteiligten. Ergebnis vor Verwendung vom Notar zu prüfen.',
  },
  wert: {
    titel: 'Grundstückswert KI',
    platzhalter: 'Rückfragen von Claude hier beantworten … (Enter = senden)',
    aufwand: 'high',
    system: GRUND + `

Aufgabe: überschlägige Bewertung einer Immobilie. Die Eingabe kommt aus einem Formular; Pflicht ist nur die Adresse.

Ablauf:
1. Recherchiere zuerst selbst (Websuche, Stand Stichtag): Objekt und Lage zur Adresse (Gemeinde, Lagequalität, Bebauung, soweit öffentlich erkennbar); Bodenrichtwert (BORIS Brandenburg, Gutachterausschuss); Grundstücksmarktbericht des Landkreises bzw. der kreisfreien Stadt (Sachwertfaktoren, Liegenschaftszinssätze, Vergleichsfaktoren, Mieten); marktübliche Miete; NHK 2010 (Anlage 4 ImmoWertV), Baupreisindex Wohngebäude (2010 = 100); für das Steuerrecht die Anlagen zum BewG (Anlage 21–25) und ggf. vom Gutachterausschuss veröffentlichte Sachwertfaktoren/Liegenschaftszinssätze.
2. Fehlen danach Angaben, ohne die keine belastbare Schätzung möglich ist (typisch: Objektart, Wohnfläche, Baujahr, Grundstücksfläche), stelle höchstens sechs kurze, nummerierte Fragen und rechne noch nicht. Weniger wichtige Lücken füllst du mit begründeten, marktüblichen Annahmen und legst sie offen.
3. Sonst rechne und gib IMMER alle drei Werte aus:
   a) Verkehrswert nach dem Sachwertverfahren (§§ 35 ff. ImmoWertV): BGF (sonst Wohnfläche × 1,5–2,0, Annahme nennen) × NHK 2010 × Baupreisindex/100 × Regionalfaktor, lineare Alterswertminderung (GND 80 J., RND nach Anlage 2 aus Baujahr und Modernisierung), Außenanlagen 2–5 %, + Bodenwert, × Sachwertfaktor.
   b) Verkehrswert nach dem Ertragswertverfahren (§§ 27 ff. ImmoWertV): Rohertrag (Ist- oder marktübliche Miete) − Bewirtschaftungskosten (Anlage 3) = Reinertrag − Bodenwertverzinsung, × Barwertfaktor (Liegenschaftszins, RND), + Bodenwert.
   c) Bedarfswert (Grundbesitzwert) für die Schenkung- und Erbschaftsteuer nach §§ 176 ff. BewG: Bodenwert § 179 BewG; Wohnungseigentum, Ein- und Zweifamilienhäuser im Vergleichswertverfahren (§ 183) nur, wenn der Gutachterausschuss Vergleichswerte/-faktoren veröffentlicht, sonst Sachwertverfahren §§ 189–191 BewG (Regelherstellungskosten Anlage 24, Baupreisindex, Alterswertminderung, Wertzahl Anlage 25 bzw. Sachwertfaktor des Gutachterausschusses); Mietwohngrundstücke, Geschäftsgrundstücke mit üblicher Miete im Ertragswertverfahren §§ 184–188 BewG (Liegenschaftszins § 188, Bewirtschaftungskosten Anlage 23, Vervielfältiger Anlage 21); Mindestwert Bodenwert. Weise auf den Nachweis eines niedrigeren gemeinen Werts (§ 198 BewG) hin, wenn der Bedarfswert über dem Verkehrswert liegt.
   Bei Eigentumswohnungen zusätzlich den Vergleichswert. Belastungen (Wohnungsrecht, Nießbrauch): beim Verkehrswert als besonderes Merkmal (§ 8 Abs. 3 ImmoWertV, Jahreswert × Leibrentenbarwertfaktor nach aktueller Sterbetafel); für die Schenkungsteuer den Kapitalwert nach §§ 14, 15 BewG gesondert ausweisen (Abzug als Gegenleistung/Auflage). Bei Anteilen Gesamtwert und Anteil.
   Runden (unter 100.000 € auf 1.000 €, sonst auf 5.000 €); Spanne ±10 % beim Verkehrswert. Rechne sorgfältig und prüfe den Wert je m² Wohnfläche gegen die Marktdaten.

Gliederung der Antwort mit Ergebnis (Markdown):
### Ergebnis
Tabelle mit den Zeilen: Verkehrswert Sachwertverfahren | Verkehrswert Ertragswertverfahren | Bedarfswert Schenkungsteuer (BewG) – jeweils Betrag, Spanne bzw. Verfahren; darunter ein Satz, welcher Verkehrswert für diese Objektart führend ist, und der Wert je m² Wohnfläche.
### Objekt und Lage
### Bodenwert (Tabelle)
### Sachwertverfahren (Rechentabelle, jede Zeile ein Rechenschritt mit Quelle des Ansatzes)
### Ertragswertverfahren (Rechentabelle)
### Bedarfswert nach BewG (Rechentabelle)
### Rechte und Lasten
### Annahmen und offene Punkte
Bei Rückfragen im Verlauf nur die Änderung erläutern und die neue Ergebnistabelle zeigen.`,
    datei: () => 'Wertanalyse KI',
    ueberschrift: 'Wertanalyse',
    betreff: () => 'Überschlägige Wertermittlung: Sachwert, Ertragswert (ImmoWertV), Bedarfswert (BewG)',
    hinweis: 'Erstellt mit einem KI-Assistenten (Claude, Anthropic). Einverständnis der Beteiligten zur Übermittlung der Objektangaben (ohne Namen) lag vor (bestätigt EINWILLIGUNG). Diese Wertanalyse ist eine überschlägige Schätzung auf Grundlage der eingegebenen Angaben und öffentlich zugänglicher Marktdaten. Sie ist kein Verkehrswertgutachten nach § 194 BauGB und keine Feststellung des Finanzamts; sie ersetzt nicht die Begutachtung durch einen Sachverständigen oder den Gutachterausschuss.',
  },
};

let modul = null;
let chatName = '';      // Dateiname dieses Chats im Vorgang (ohne Nummer), wird nach jeder Antwort überschrieben
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

// ------------------------------------------------------------------ Vorgang
// Alles, was im Fenster passiert, gehört zum aktuellen Vorgang: Chats als PDF, geöffnete Links als
// Zeile im Protokoll. Die Nummer bleibt am PC. Nach einer längeren Pause fragt das Fenster nach.
const PAUSE_MIN = 30;
let vorgang = '';
let zuletzt = 0;
function nummerSauber(roh) {
  roh = (roh || '').trim();
  if (nurZiffern) return roh.replace(/\D/g, '').replace(/^0+/, '');
  return roh.replace(/\//g, '-').replace(/[^\p{L}\d .\-_]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}
function vorgangZeigen() {
  $('vg-nr').textContent = vorgang || '–';
  $('vg-leiste').classList.toggle('leer', !vorgang);
}
let vorgangWeiter = null;
function vorgangFragen(weiter, grund) {
  vorgangWeiter = weiter;
  $('vg-frage').textContent = grund || 'Zu welchem Vorgang?';
  $('vg-eingabe').value = vorgang;
  $('vg-dialog').hidden = false;
  $('vg-eingabe').focus();
  $('vg-eingabe').select();
}
function vorgangOk() {
  const nr = nummerSauber($('vg-eingabe').value);
  if (!nr) { $('vg-eingabe').focus(); return; }
  const neu = nr !== vorgang;
  if (neu && runden.length) { runden = []; nachrichten = []; zeige('start'); }
  vorgang = nr;
  zuletzt = Date.now();
  $('vg-dialog').hidden = true;
  vorgangZeigen();
  const w = vorgangWeiter; vorgangWeiter = null;
  if (w) w();
}
// Führt aktion aus, sobald ein Vorgang feststeht (beim ersten Klick bzw. nach langer Pause fragen)
function mitVorgang(aktion) {
  if (!vorgang) return vorgangFragen(aktion);
  if (Date.now() - zuletzt > PAUSE_MIN * 60000) return vorgangFragen(aktion, `Noch Vorgang ${vorgang}? Sonst neue Nummer eintragen.`);
  zuletzt = Date.now();
  aktion();
}
function protokoll(text) {
  if (!vorgang) return;
  fetch('/api/protokoll?' + new URLSearchParams({ nr: vorgang }), { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: text })
    .catch(() => {});
}

function knoepfe() {
  $('senden').disabled = laeuft || !$('text').value.trim();
}

// ------------------------------------------------------------------ Ablauf
function starten(name) {
  modul = MODULE[name];
  nachrichten = []; runden = [];
  $('verlauf').textContent = '';
  $('titel').textContent = modul.titel;
  $('text').placeholder = modul.platzhalter;
  $('text').rows = 2;
  chatName = modul.datei() + ' ' + new Date().toLocaleString('sv-SE').slice(0, 16).replace(':', '-');
  meldung('');
  zeige('chat');
  $('text').focus();
  knoepfe();
}

function zurueck() {
  if (laeuft && !confirm('Claude arbeitet noch. Trotzdem zurück?')) return;
  runden = [];
  zeige('start');
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
    speichern();
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

// Nach jeder Antwort automatisch im Vorgang speichern (gleiche Datei, wird fortgeschrieben)
async function speichern() {
  if (!vorgang || !runden.some(r => r.antwort)) return;
  const erste = runden[0].frage.replace(/\s+/g, ' ');
  try {
    const pdf = await aktenvermerkPdf({
      nummer: vorgang, bezeichnung: chatName, ueberschrift: modul.ueberschrift,
      betreff: modul.betreff(erste.length > 90 ? erste.slice(0, 90) + ' …' : erste),
      hinweis: modul.hinweis.replace('EINWILLIGUNG', einwilligung), abschnitte: abschnitte(),
    });
    const q = new URLSearchParams({ nr: vorgang, datei: chatName, ersetzen: '1' });
    const r = await fetch('/api/ablegen?' + q, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: pdf });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.fehler || `Fehler ${r.status}`);
    meldung(`✓ Im Vorgang ${vorgang} gespeichert: ${d.datei}`, 'gut');
  } catch (e) {
    meldung('Nicht im Vorgang gespeichert: ' + e.message, 'schlecht');
  }
}

// ------------------------------------------------------------------ Start: Kacheln
// art: ki = Eingaben gehen an Claude (Anthropic, USA); pc = bleibt auf diesem PC bzw. im Browser;
// web = fremde Webseite, Eingaben gehen an deren Betreiber (nicht an eine KI).
const MARKEN = { ki: '🟠 KI – geht an Claude (USA)', pc: '🟢 bleibt am PC', web: '🔵 Webseite – nicht KI' };
let links = {
  boegen: 'https://twoinar.github.io/boegen/',
  tools: 'https://twoinar.github.io/tools/',
  kosten: 'https://twoinar.github.io/kostenrechner/',
  portal: 'http://localhost:8765/',
};
function gruppen() {
  const b = links.boegen, t = links.tools;
  return [
    { titel: 'Claude', kacheln: [
      { icon: '💬', titel: 'Frage an Claude', text: 'Rechtsfragen, Kosten, Formulierungen', art: 'ki', aktion: () => starten('frage'), ki: true },
      { icon: '🏠', titel: 'Grundstückswert KI', text: 'Sachwert, Ertragswert, Bedarfswert', art: 'ki', aktion: wertKi, ki: true },
    ] },
    { titel: 'Vorgespräch und Bewertung', kacheln: [
      { icon: '📋', titel: 'Vorgesprächsbogen', text: 'mit Erbspiegel und Kosten', art: 'pc', url: b + 'vorgespraech.html' },
      { icon: '🧮', titel: 'Grundstückswert lokal', text: 'Rechner aus den Bögen', art: 'pc', url: rechner },
      { icon: '🌳', titel: 'Erbspiegel', text: 'gesetzliche Erbfolge', art: 'pc', url: b + 'vorgespraech.html?nur=erbspiegel' },
      { icon: '⚖️', titel: 'Geschäftswert', text: 'nach GNotKG', art: 'pc', url: b + 'vorgespraech.html?nur=geschaeftswert' },
      { icon: '💶', titel: 'Kostenrechner', text: 'GNotKG, auch offline', art: 'pc', url: links.kosten },
    ] },
    { titel: 'Vollzug und Register', kacheln: [
      { icon: '✅', titel: 'Vollzugsbogen', text: 'Vollzug und Verteiler', art: 'pc', url: b + 'vollzug.html' },
      { icon: '📨', titel: 'XNP – Sonstige Anträge', text: 'Erbausschlagung, Erbschein u. a.', art: 'pc', url: t + 'xnp/' },
      { icon: '🔍', titel: 'Geldwäscheprüfung', text: 'Kaufvertrag nach GwG', art: 'pc', url: t + 'geldwaesche/' },
    ] },
    { titel: 'Büro', kacheln: [
      { icon: '📘', titel: 'Büro-Portal', text: 'Handbuch und Anleitungen', art: 'pc', url: links.portal },
      { icon: '📷', titel: 'Handy-Scan', text: 'Scans in den Vorgang', art: 'pc', url: links.portal + 'scan' },
      { icon: '🔒', titel: 'Tools intern', text: 'mit Passwort', art: 'pc', url: t + 'intern/' },
    ] },
    { titel: 'Karten und Register', kacheln: [
      { icon: '🗺️', titel: 'BrandenburgViewer', text: 'Karten, Luftbilder, Flurstücke', art: 'web', url: karte },
      { icon: '📍', titel: 'BORIS Brandenburg', text: 'Bodenrichtwerte', art: 'web', url: 'https://www.boris-brandenburg.de/' },
      { icon: '🏢', titel: 'Bilanzen und Firmendaten', text: '', art: 'web', firma: true },
      { icon: '📜', titel: 'Gesetze im Internet', text: 'Bundesrecht', art: 'web', url: 'https://www.gesetze-im-internet.de/' },
    ] },
  ];
}
let kiAus = '';   // Grund, warum die KI-Kacheln gesperrt sind
function startZeigen() {
  const box = $('gruppen');
  box.textContent = '';
  const legende = document.createElement('p');
  legende.className = 'hilfe';
  legende.textContent = Object.values(MARKEN).join('  ·  ');
  box.append(legende);
  for (const g of gruppen()) {
    const el = document.createElement('section');
    el.className = 'gruppe';
    el.innerHTML = '<h2></h2><div class="kacheln"></div>';
    el.querySelector('h2').textContent = g.titel;
    for (const k of g.kacheln) {
      if (k.firma) { el.querySelector('.kacheln').append(firmaKachel(k)); continue; }
      const t = document.createElement('button');
      t.className = 'kachel';
      t.innerHTML = '<b></b><small></small><span class="marke"></span>';
      t.querySelector('b').textContent = `${k.icon} ${k.titel}`;
      t.querySelector('small').textContent = k.text;
      t.querySelector('.marke').textContent = MARKEN[k.art];
      t.querySelector('.marke').classList.add(k.art);
      if (k.url) t.addEventListener('click', () => mitVorgang(() => { protokoll(`${k.titel} geöffnet (${k.url})`); window.open(k.url, '_blank', 'noopener'); }));
      else { t.addEventListener('click', () => mitVorgang(k.aktion)); if (k.ki && kiAus) { t.disabled = true; t.title = kiAus; } }
      el.querySelector('.kacheln').append(t);
    }
    box.append(el);
  }
}
// Firmensuche: Name eintippen, Knopf öffnet das Register; der Name liegt dann in der Zwischenablage
// (Strg+V ins Suchfeld). Geht nur an die Register-Webseite, nicht an Claude.
const REGISTER = [
  { name: 'Unternehmensregister', text: 'Jahresabschlüsse ab 2022', url: 'https://www.unternehmensregister.de/de/search/register-information' },
  { name: 'Bundesanzeiger', text: 'ältere Abschlüsse', url: 'https://www.bundesanzeiger.de/pub/de/suchen' },
  { name: 'Handelsregister', text: 'Registerauszüge, Dokumente', url: 'https://www.handelsregister.de/rp_web/normalesuche.xhtml' },
];
function firmaKachel(k) {
  const d = document.createElement('div');
  d.className = 'kachel firma';
  d.innerHTML = '<b></b><input placeholder="Firmenname" autocomplete="off"><div class="register"></div><small></small><span class="marke"></span>';
  d.querySelector('b').textContent = `${k.icon} ${k.titel}`;
  d.querySelector('.marke').textContent = MARKEN[k.art];
  d.querySelector('.marke').classList.add(k.art);
  const feld = d.querySelector('input'), info = d.querySelector('small');
  info.textContent = 'Name eintippen, Register wählen, dort mit Strg+V einfügen.';
  for (const r of REGISTER) {
    const knopf = document.createElement('button');
    knopf.textContent = r.name;
    knopf.title = r.text;
    knopf.addEventListener('click', () => mitVorgang(async () => {
      const name = feld.value.trim();
      protokoll(`${r.name}: Suche${name ? ` nach „${name}“` : ''} geöffnet`);
      if (name) {
        try { await navigator.clipboard.writeText(name); info.textContent = `„${name}“ kopiert – im Suchfeld Strg+V.`; }
        catch { info.textContent = `Bitte „${name}“ im Suchfeld eintippen.`; }
      }
      window.open(r.url, '_blank', 'noopener');
    }));
    d.querySelector('.register').append(knopf);
  }
  feld.addEventListener('keydown', e => { if (e.key === 'Enter') d.querySelector('.register button').click(); });
  return d;
}
function zeige(id) { for (const v of ['start', 'einwilligung', 'wertform', 'chat']) $(v).hidden = v !== id; }

// Grundstückswert KI: Einverständnis → Formular (Adresse zuerst) → Chat
function wertKi() {
  $('ew-haken').checked = false; $('ew-weiter').disabled = true;
  zeige('einwilligung');
}
$('ew-haken').addEventListener('change', () => { $('ew-weiter').disabled = !$('ew-haken').checked; });
$('ew-zurueck').addEventListener('click', () => zeige('start'));
$('ew-weiter').addEventListener('click', () => {
  einwilligung = new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) + ' Uhr';
  for (const el of $('wertform').querySelectorAll('input, select, textarea')) el.value = '';
  $('wf-stichtag').value = new Date().toISOString().slice(0, 10);
  $('wf-los').disabled = true;
  zeige('wertform');
  $('wf-adresse').focus();
});
$('wf-zurueck').addEventListener('click', () => zeige('start'));
$('wf-adresse').addEventListener('input', () => { $('wf-los').disabled = !$('wf-adresse').value.trim(); });
$('wf-los').addEventListener('click', () => {
  const felder = [['Adresse', 'wf-adresse'], ['Objektart', 'wf-art'], ['Wertermittlungsstichtag', 'wf-stichtag'],
    ['Grundstücksfläche (m²)', 'wf-flaeche'], ['Wohnfläche (m²)', 'wf-wohnflaeche'], ['Baujahr', 'wf-baujahr'],
    ['Jahresnettokaltmiete (€)', 'wf-miete'], ['Bodenrichtwert (€/m²)', 'wf-brw'], ['Zu bewertender Anteil', 'wf-anteil'],
    ['Modernisierungen und Zustand', 'wf-zustand'], ['Rechte und Lasten', 'wf-rechte'], ['Sonstiges', 'wf-sonst']];
  const zeilen = felder.map(([n, id]) => {
    let v = $(id).value.trim();
    if (id === 'wf-stichtag' && v) v = v.split('-').reverse().join('.');
    return `${n}: ${v || '(unbekannt – bitte recherchieren oder nachfragen)'}`;
  });
  starten('wert');
  protokoll(`Grundstückswert KI gestartet (Einverständnis der Beteiligten bestätigt ${einwilligung})`);
  $('text').value = 'Bitte bewerten:\n' + zeilen.join('\n');
  senden();
});

$('zurueck').addEventListener('click', zurueck);
$('neu').addEventListener('click', () => {
  if (laeuft) return;
  runden = [];
  if (modul === MODULE.wert) $('ew-weiter').click(); else starten('frage');
});
$('senden').addEventListener('click', senden);
$('text').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); senden(); } });
$('text').addEventListener('input', knoepfe);
$('vg-wechseln').addEventListener('click', () => vorgangFragen(null, 'Neuer Vorgang:'));
$('vg-ok').addEventListener('click', vorgangOk);
$('vg-abbruch').addEventListener('click', () => { $('vg-dialog').hidden = true; vorgangWeiter = null; });
$('vg-eingabe').addEventListener('keydown', e => { if (e.key === 'Enter') vorgangOk(); if (e.key === 'Escape') $('vg-abbruch').click(); });
vorgangZeigen();
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('vg-dialog').hidden && !$('chat').hidden && !laeuft) zurueck(); });

fetch('/api/claude').then(r => r.json()).then(d => {
  if (d.karte) karte = d.karte;
  if (d.rechner) rechner = d.rechner;
  if (d.links) Object.assign(links, d.links);
  if (!d.lokal) kiAus = 'Claude geht nur an diesem PC selbst.';
  else if (!d.schluessel) kiAus = 'Noch kein API-Schlüssel: einmal „Einrichten.cmd“ im Claude-Ordner starten.';
  if (kiAus) $('start-hinweis').textContent = kiAus;
}).catch(() => { kiAus = 'Claude-Server läuft nicht. Fenster schließen und das Desktop-Symbol neu anklicken.'; $('start-hinweis').textContent = kiAus; })
  .finally(startZeigen);
fetch('/api/info').then(r => r.json()).then(d => { if (d.nurZiffern === false) nurZiffern = false; }).catch(() => {});
