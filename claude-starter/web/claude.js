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
let rechner = '';   // Grundstückswert-Rechner: aus Tools intern, sonst Einstellung „Wertrechner“
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
// Grundstück des Vorgangs: aus dem Vorgesprächsbogen (falls abgelegt) oder hier eingegeben
let objekt = { adresse: '', lat: null, lon: null, lage: '', quelle: '' };
let zuletzt = 0;
function nummerSauber(roh) {
  roh = (roh || '').trim();
  if (nurZiffern) return roh.replace(/\D/g, '').replace(/^0+/, '');
  return roh.replace(/\//g, '-').replace(/[^\p{L}\d .\-_]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}
// Letzten Vorgang merken, damit er nach dem Schließen des Fensters wieder oben steht
function vorgangMerken() { try { localStorage.setItem('claude-vorgang', JSON.stringify({ nr: vorgang, zeit: zuletzt })); } catch { /* egal */ } }
function vorgangHolen() {
  try { const v = JSON.parse(localStorage.getItem('claude-vorgang') || 'null'); if (v && v.nr) { vorgang = v.nr; zuletzt = v.zeit || 0; } } catch { /* egal */ }
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
async function vorgangOk() {
  const nr = nummerSauber($('vg-eingabe').value);
  if (!nr) { $('vg-eingabe').focus(); return; }
  const neu = nr !== vorgang;
  if (neu && runden.length) { runden = []; nachrichten = []; zeige('start'); }
  vorgang = nr;
  zuletzt = Date.now();
  if (neu || !objekt.adresse) { objekt = { adresse: '', lat: null, lon: null, lage: '', quelle: '' }; objektGeladen = objektLaden(nr); }
  vorgangMerken();
  $('vg-dialog').hidden = true;
  vorgangZeigen();
  await objektGeladen;
  const w = vorgangWeiter; vorgangWeiter = null;
  if (w) w();
}
// Führt aktion aus, sobald ein Vorgang feststeht. zuletzt = letzte Bestätigung; alle 30 Minuten wird
// nachgefragt (Wunsch Thomas): beim nächsten Klick und, falls das Fenster offen bleibt, auch von selbst.
const NOCH = () => `Noch Vorgang ${vorgang}? Bestätigen oder neue Nummer eintragen.`;
function mitVorgang(aktion) {
  if (!vorgang) return vorgangFragen(aktion);
  if (Date.now() - zuletzt > PAUSE_MIN * 60000) return vorgangFragen(aktion, NOCH());
  aktion();
}
let ruheBis = 0;   // nach „Abbrechen“ fragt der Zeitgeber erst 5 Minuten später wieder
setInterval(() => {
  if (vorgang && $('vg-dialog').hidden && Date.now() > ruheBis && Date.now() - zuletzt > PAUSE_MIN * 60000) vorgangFragen(null, NOCH());
}, 20000);
// Anschrift und Lage aus dem Vorgesprächsbogen des Vorgangs lesen (eingebettete Daten der Bögen)
async function objektLaden(nr) {
  try {
    const r = await fetch('/api/vorgespraech?' + new URLSearchParams({ nr }));
    if (!r.ok || nr !== vorgang) return;
    const name = decodeURIComponent(r.headers.get('X-Datei') || '');
    const doc = await PDFLib.PDFDocument.load(await r.arrayBuffer(), { updateMetadata: false });
    const lies = k => { try { const roh = doc.getInfoDict().lookup(PDFLib.PDFName.of(k)); return roh && roh.decodeText ? JSON.parse(roh.decodeText()) : null; } catch { return null; } };
    const bb = lies('WoinarBedarfsbewertung');
    const S = bb ? (bb.S || (bb.objekte && bb.objekte[0]) || null) : null;
    if (S && S.anschrift) {
      const lage = [S.gemarkung && 'Gemarkung ' + S.gemarkung, S.flur && 'Flur ' + (+S.flur), S.flurstueck && 'Flurstück ' + S.flurstueck].filter(Boolean).join(', ');
      objekt = { adresse: S.anschrift, lat: S.lat || null, lon: S.lon || null, lage, quelle: name };
      return;
    }
    // Vorgesprächsmaske: Grundstücke mit Datenabruf per Adresse
    const mk = lies('WoinarMaske');
    const g0 = mk && Array.isArray(mk.grundstuecke) ? mk.grundstuecke.find(g => g && g.anschrift) : null;
    if (g0) {
      const lage = [g0.gemarkung && 'Gemarkung ' + g0.gemarkung, g0.flur && 'Flur ' + (+g0.flur || g0.flur), g0.flurstueck && 'Flurstück ' + g0.flurstueck].filter(Boolean).join(', ');
      objekt = { adresse: g0.anschrift, lat: g0.lat || null, lon: g0.lon || null, lage, quelle: name };
      return;
    }
    const gw = lies('WoinarGeschaeftswert');
    const pos = gw && Array.isArray(gw.pos) ? gw.pos.find(p => p.bez && /\d/.test(p.bez) && (p.art === 'grund' || p.typ === 'grund' || /stra|weg|platz|flur|gemarkung/i.test(p.bez))) : null;
    if (pos) objekt = { adresse: pos.bez, lat: null, lon: null, lage: '', quelle: name };
  } catch { /* kein Bogen oder nicht lesbar: Adresse wird eingegeben */ }
}
function objektQuelle() {
  if (!objekt.adresse) return '';
  return (objekt.quelle ? `Aus dem Vorgesprächsbogen (${objekt.quelle})` : 'Im Fenster eingegeben') + (objekt.lage ? ` · ${objekt.lage}` : '');
}
function objektAdresse(neu) {
  neu = (neu || '').trim();
  if (neu && neu !== objekt.adresse) objekt = { adresse: neu, lat: null, lon: null, lage: '', quelle: '' };
}

// BrandenburgViewer: zur Adresse springen (mit Koordinaten aus dem Bogen genau aufs Grundstück)
async function karteOeffnen() {
  await objektGeladen;
  $('kd-adresse').value = objekt.adresse;
  $('kd-quelle').textContent = objektQuelle();
  $('karte-dialog').hidden = false;
  $('kd-adresse').focus();
}
// Ebenen-IDs aus der config.json des BrandenburgViewers (Masterportal 2): [ID, Transparenz in %]
const BB_EBENEN = [['7004', 0], ['586', 40], ['73', 0], ['149', 0]];
function karteZeigen(mitAdresse) {
  $('karte-dialog').hidden = true;
  let url = karte;
  const p = new URLSearchParams();
  if (/bb-viewer\.geobasis-bb\.de/.test(karte)) {
    // Ebenen gleich einschalten: Luftbild mit Topographie, Bodenrichtwerte Bauland (halb durchsichtig), Fluren, Flurstücke
    p.set('layerIDs', BB_EBENEN.map(e => e[0]).join(','));
    p.set('visibility', BB_EBENEN.map(() => 'true').join(','));
    p.set('transparency', BB_EBENEN.map(e => e[1]).join(','));
  }
  if (mitAdresse) {
    objektAdresse($('kd-adresse').value);
    if (objekt.lat && objekt.lon) {
      p.set('marker', `${objekt.lon},${objekt.lat}`);
      p.set('projection', 'EPSG:4326');
      p.set('zoomLevel', '11');   // 1:2.500, Flurstücke sind ab 1:5.000 sichtbar
    } else if (objekt.adresse) {
      // Adresssuche des Viewers: „Straße,Hausnummer“; der Ort hilft bei gleichen Straßennamen
      const m = objekt.adresse.match(/^(.*?)\s+(\d+\s*[a-zA-Z]?)\s*(?:,\s*(?:\d{5}\s+)?(.*))?$/);
      p.set('query', m ? `${m[1]},${m[2].replace(/\s+/g, '')}${m[3] ? ' ' + m[3] : ''}` : objekt.adresse);
    }
  }
  // Kommas in den Werten nicht kodieren (layerIDs=7004,586,…), so wie der Viewer sie erwartet
  const teile = [...p].map(([k, v]) => k + '=' + encodeURIComponent(v).replace(/%2C/g, ','));
  if (teile.length) url += (url.includes('?') ? '&' : '?') + teile.join('&');
  protokoll(`BrandenburgViewer geöffnet${mitAdresse && objekt.adresse ? ` (${objekt.adresse})` : ''}`);
  window.open(url, '_blank', 'noopener');
}
$('kd-ok').addEventListener('click', () => karteZeigen(true));
$('kd-leer').addEventListener('click', () => karteZeigen(false));
$('kd-abbruch').addEventListener('click', () => { $('karte-dialog').hidden = true; });
$('kd-adresse').addEventListener('keydown', e => { if (e.key === 'Enter') karteZeigen(true); if (e.key === 'Escape') $('kd-abbruch').click(); });

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
  } catch { throw new Error(WEB ? 'Der Server antwortet nicht (Internet?).' : 'Der PC antwortet nicht. Bitte das Claude-Fenster schließen und über das Desktop-Symbol neu öffnen.'); }
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

// ------------------------------------------------------------------ Downloads und gezogene PDFs ablegen
// Bleibt am PC: der Server kopiert die Datei aus Downloads in den Vorgang, nichts geht an Claude.
async function downloadsZeigen() {
  const liste = $('dl-liste');
  liste.textContent = 'Wird geladen …';
  $('dl-hinweis').textContent = `Die neuesten PDFs aus Downloads. Anklicken legt eine Kopie im Vorgang ${vorgang} ab.`;
  $('dl-dialog').hidden = false;
  try {
    const d = await (await fetch('/api/downloads', { cache: 'no-store' })).json();
    liste.textContent = '';
    if (!d.dateien || !d.dateien.length) { liste.textContent = `Keine PDF aus den letzten 24 Stunden in ${d.ordner || 'Downloads'}.`; return; }
    for (const f of d.dateien) {
      const b = document.createElement('button');
      b.textContent = f.name;
      const s = document.createElement('small');
      s.textContent = `${f.zeit} Uhr · ${f.kb} KB`;
      b.append(s);
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          const r = await fetch('/api/download-ablegen?' + new URLSearchParams({ nr: vorgang, name: f.name }), { method: 'POST' });
          const e = await r.json().catch(() => ({}));
          if (!r.ok || e.ok === false) throw new Error(e.fehler || `Fehler ${r.status}`);
          s.textContent = `✓ abgelegt: ${e.datei}`;
          protokoll(`Download abgelegt: ${e.datei}`);
        } catch (err) { s.textContent = '✗ ' + err.message; b.disabled = false; }
      });
      liste.append(b);
    }
  } catch { liste.textContent = 'Downloads konnten nicht gelesen werden.'; }
}
$('dl-abbruch').addEventListener('click', () => { $('dl-dialog').hidden = true; });

let ziehen = 0;
document.addEventListener('dragenter', e => { if ([...e.dataTransfer.types].includes('Files')) { ziehen++; $('ablegen-ziel').hidden = false; } });
document.addEventListener('dragleave', () => { if (--ziehen <= 0) { ziehen = 0; $('ablegen-ziel').hidden = true; } });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  ziehen = 0; $('ablegen-ziel').hidden = true;
  const dateien = [...e.dataTransfer.files];
  if (!dateien.length) return;
  mitVorgang(async () => {
    const ergebnis = [];
    for (const f of dateien) {
      const daten = await f.arrayBuffer();
      if (!/\.pdf$/i.test(f.name) || new TextDecoder().decode(daten.slice(0, 5)) !== '%PDF-') { ergebnis.push(`✗ ${f.name}: nur PDF`); continue; }
      try {
        const q = new URLSearchParams({ nr: vorgang, datei: f.name.replace(/\.pdf$/i, '') });
        const r = await fetch('/api/ablegen?' + q, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: daten });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.ok === false) throw new Error(d.fehler || `Fehler ${r.status}`);
        ergebnis.push(`✓ ${d.datei}`);
        protokoll(`PDF ins Fenster gezogen und abgelegt: ${d.datei}`);
      } catch (err) { ergebnis.push(`✗ ${f.name}: ${err.message}`); }
    }
    alert(`Im Vorgang ${vorgang}:\n` + ergebnis.join('\n'));
  });
});

// ------------------------------------------------------------------ Start: Kacheln
// art: ki = Eingaben gehen an Claude (Anthropic, USA); pc = bleibt auf diesem PC bzw. im Browser;
// web = fremde Webseite, Eingaben gehen an deren Betreiber (nicht an eine KI).
const MARKEN = { ki: '🟠 KI – geht an Claude (USA)', pc: '🟢 bleibt am PC', web: '🔵 Webseite – nicht KI' };
// ------------------------------------------------------------------ Tools intern
// Die internen Tools (tools/intern, verschlüsselt auf GitHub Pages) laufen hier unter /intern/app/ über
// einen eigenen Service Worker. Der Schlüssel liegt nach einmaliger Anmeldung (/intern/) als nicht
// exportierbarer Schlüssel in der IndexedDB dieses PCs; danach kein Passwort mehr.
// Als Webseite auf dem IONOS-Server (browser-api.js) liegen Tools intern unter /tools/intern/ derselben Adresse.
const WEB = window.CLAUDE_WEB || null;
const INTERN_DATEN = WEB ? WEB.internDaten : 'https://twoinar.github.io/tools/intern/';
const INTERN_SW = WEB ? WEB.internSw : '/intern/sw.js';
const INTERN_APP = WEB ? WEB.internApp : location.origin + '/intern/app/';
const INTERN_ANMELDUNG = WEB ? WEB.internAnmeldung : location.origin + '/intern/';
let intern = { status: 'laedt', gruppen: [], dateien: {} };
const VORGESPRAECH_MASKE = (WEB ? location.origin : 'https://twoinar.github.io') + '/boegen/vorgespraech-maske.html';
const ORDNER_ICONS = { xnp: '📨', geldwaesche: '🔍', erbausschlagung: '⚖️', apps: '📲' };
const BOEGEN = {
  'vorgespraech.html': { icon: '📝', titel: 'Vorgesprächsbogen klassisch' }, 'vollzug.html': { icon: '📋' }, 'erbspiegel.html': { icon: '🌳' },
  'geschaeftswert.html': { icon: '💶' }, 'bewertung.html': { icon: '🧮', titel: 'Grundstückswert lokal' }, 'kosten.html': { icon: '🧾' },
};
function internDb() {
  return new Promise((ok, fehler) => {
    const r = indexedDB.open('tools-intern', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('k');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehler(r.error);
  });
}
async function internSchluessel() {
  const d = await internDb();
  return new Promise(ok => { const r = d.transaction('k').objectStore('k').get('schluessel'); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); });
}
async function internEntschluesseln(k, puffer) {
  const b = new Uint8Array(puffer);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12) }, k, b.slice(12));
}
async function internLaden() {
  try {
    if (navigator.serviceWorker) await navigator.serviceWorker.register(INTERN_SW);
    const k = await internSchluessel();
    if (!k) { intern.status = 'anmelden'; return; }
    const holen = async pfad => { const r = await fetch(INTERN_DATEN + pfad, { cache: 'no-cache' }); if (!r.ok) throw new Error('netz'); return r.arrayBuffer(); };
    let verz;
    try { verz = JSON.parse(new TextDecoder().decode(await internEntschluesseln(k, await holen('daten/inhalt.bin')))); }
    catch (e) { intern.status = e.message === 'netz' ? 'netz' : 'anmelden'; return; }
    intern.dateien = verz.dateien || {};
    // Übersicht (app/index.html) lesen und ihre Links als Kacheln übernehmen, gruppiert nach Überschriften.
    // Die Bögen-Übersicht wird ausgepackt (jeder Bogen eine Kachel), Handy-Scan bleibt draußen, Doppeltes nur einmal.
    const lesen = async pfad => {
      const d = intern.dateien[pfad];
      return d ? new DOMParser().parseFromString(new TextDecoder().decode(await internEntschluesseln(k, await holen('daten/' + d.id + '.bin'))), 'text/html') : null;
    };
    const basis = INTERN_APP, appPfad = new URL(INTERN_APP).pathname;
    const gruppen = [], gesehen = new Set();
    let akt = null;
    const kachelAus = (el, ordner) => {
      const href = el.getAttribute('href');
      if (!href || /^(https?:|mailto:|#|\/|\?)/.test(href)) return null;
      const url = new URL(href, basis + ordner);
      if (!url.href.startsWith(basis) || url.pathname.replace(/index\.html$/, '') === appPfad) return null;
      const small = el.querySelector('small');
      const text = small ? small.textContent.trim() : '';
      const ohne = el.cloneNode(true);
      ohne.querySelectorAll('small').forEach(x => x.remove());
      const titel = ohne.textContent.replace(/\s+/g, ' ').trim();
      if (!titel) return null;
      const m = titel.match(/^(\p{Extended_Pictographic}\uFE0F?)\s*(.*)$/u);
      return { icon: m ? m[1] : '', titel: m ? m[2] : titel, text, art: 'pc', url: url.href, pfad: url.pathname.slice(appPfad.length) };
    };
    const aufnehmen = (kachel, gruppe) => {
      if (/handy/i.test(kachel.titel + ' ' + kachel.pfad)) return;
      const pfad = kachel.pfad.replace(/(^|\/)index\.html$/, '$1');
      const name = kachel.titel.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
      if (gesehen.has('p:' + pfad + new URL(kachel.url).search) || gesehen.has('t:' + name)) return;
      gesehen.add('p:' + pfad + new URL(kachel.url).search); gesehen.add('t:' + name);
      const bogen = BOEGEN[pfad.split('/').pop()];
      if (/^boegen\//.test(pfad) && bogen) { if (bogen.titel) kachel.titel = bogen.titel; if (!kachel.icon) kachel.icon = bogen.icon; }
      if (/^boegen\/vorgespraech\.html$/.test(pfad)) kachel.mitNr = true;
      if (!kachel.icon) kachel.icon = ORDNER_ICONS[pfad.split('/')[0]] || '🧰';
      gruppe.kacheln.push(kachel);
    };
    const dom = await lesen('index.html');
    for (const el of dom && dom.body ? dom.body.querySelectorAll('h2, h3, a[href]') : []) {
      if (el.tagName !== 'A') { akt = { titel: el.textContent.trim(), kacheln: [] }; gruppen.push(akt); continue; }
      const kachel = kachelAus(el, '');
      if (!kachel) continue;
      if (!akt) { akt = { titel: 'Tools intern', kacheln: [] }; gruppen.push(akt); }
      // Verweis auf eine Übersichtsseite der Bögen: deren einzelne Bögen als eigene Gruppe
      const unter = kachel.pfad.replace(/index\.html$/, '');
      if (/^boegen\/?$/.test(unter) || (/b[öo]gen/i.test(kachel.titel) && unter.endsWith('/'))) {
        const ordner = unter.endsWith('/') ? unter : unter + '/';
        const sub = await lesen(ordner + 'index.html');
        if (sub && sub.body) {
          const g = { titel: 'Bögen', kacheln: [] };
          gruppen.push(g);
          for (const a of sub.body.querySelectorAll('a[href]')) { const kk = kachelAus(a, ordner); if (kk && kk.pfad !== ordner + 'index.html' && kk.pfad !== ordner) aufnehmen(kk, g); }
          akt = { titel: akt.titel, kacheln: [] }; gruppen.push(akt);
          continue;
        }
      }
      aufnehmen(kachel, akt);
    }
    // Neue Vorgesprächsmaske (öffentliche Bögen-Seite; Ablageordner merkt sich der Browser je Adresse)
    for (const g of gruppen) {
      const i = g.kacheln.findIndex(k => /boegen\/vorgespraech\.html$/.test(k.pfad));
      if (i >= 0) { g.kacheln.splice(i + 1, 0, { icon: '🧭', titel: 'Vorgesprächsbogen Maske', text: 'zum Durchklicken: Beteiligte, Sachverhalt, …', art: 'pc', url: VORGESPRAECH_MASKE, pfad: '', mitNr: true }); break; }
    }
    intern.gruppen = [];
    for (const g of gruppen.filter(x => x.kacheln.length)) {
      const da = intern.gruppen.find(x => x.titel === g.titel);
      if (da) da.kacheln.push(...g.kacheln); else intern.gruppen.push(g);
    }
    if (intern.dateien['boegen/bewertung.html'] && !rechner) rechner = basis + 'boegen/bewertung.html';
    if (intern.dateien['boegen/vorgespraech.html'] && !rechner) rechner = basis + 'boegen/vorgespraech.html?nur=bewertung';
    intern.status = 'ok';
  } catch { intern.status = 'netz'; }
}

function gruppen() {
  const liste = [{ titel: 'Claude', kacheln: [
    { icon: '💬', titel: 'Frage an Claude', text: 'Rechtsfragen, Kosten, Formulierungen', art: 'ki', aktion: () => starten('frage'), ki: true },
    { icon: '🏠', titel: 'Grundstückswert KI', text: 'Sachwert, Ertragswert, Bedarfswert', art: 'ki', aktion: wertKi, ki: true },
  ] }];
  if (intern.status === 'ok') {
    const g = intern.gruppen.map(x => ({ titel: x.titel, kacheln: x.kacheln.slice() }));
    if (rechner && !g.some(x => x.kacheln.some(k => k.titel === 'Grundstückswert lokal' || k.url.includes('nur=bewertung')))) {
      if (!g.length) g.push({ titel: 'Tools intern', kacheln: [] });
      g[0].kacheln.unshift({ icon: '🧮', titel: 'Grundstückswert lokal', text: 'Rechner aus den Bögen', art: 'pc', url: rechner });
    }
    liste.push(...g);
  } else {
    const text = { laedt: 'wird geladen …', anmelden: 'einmal mit Passwort verbinden, danach ohne', netz: 'gerade nicht erreichbar (Internet?)' }[intern.status];
    liste.push({ titel: 'Tools intern', kacheln: [{ icon: '🔒', titel: 'Tools intern verbinden', text, art: 'pc', url: INTERN_ANMELDUNG, selbst: true }] });
  }
  liste.push({ titel: 'Ablage', kacheln: [
    { icon: '📥', titel: 'Download in den Vorgang', text: 'z. B. abgerufene Bilanz; oder PDF ins Fenster ziehen', art: 'pc', aktion: downloadsZeigen },
  ] });
  liste.push({ titel: 'Karten und Register', kacheln: [
    { icon: '🗺️', titel: 'BrandenburgViewer', text: 'springt zum Grundstück des Vorgangs', art: 'web', aktion: karteOeffnen },
    // Registerabruf nur am PC: die Abrufgrenze des Registerportals gilt je Internetanschluss
    ...(WEB ? [] : [{ icon: '🏛️', titel: 'Registerabruf', text: 'Auszüge, Gesellschaftsvertrag, Gesellschafterliste in den Vorgang', art: 'web', aktion: () => hrOeffnen() }]),
    { icon: '🏢', titel: 'Bilanzen und Firmendaten', text: '', art: 'web', firma: true },
    { icon: '📜', titel: 'Gesetze im Internet', text: 'Bundesrecht', art: 'web', url: 'https://www.gesetze-im-internet.de/' },
  ] });
  return liste;
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
      if (k.selbst) t.addEventListener('click', () => { location.href = k.url; });
      else if (k.url) t.addEventListener('click', () => mitVorgang(() => {
        protokoll(`${k.titel} geöffnet`);
        // Vorgesprächsbögen übernehmen die Vorgangsnummer aus #vorgang= (Hash geht nicht an den Server)
        const ziel = k.mitNr ? k.url.split('#')[0] + '#vorgang=' + encodeURIComponent(vorgang) : k.url;
        window.open(ziel, '_blank', 'noopener');
      }));
      else { t.addEventListener('click', () => mitVorgang(k.aktion)); if (k.ki && kiAus) { t.disabled = true; t.title = kiAus; } }
      el.querySelector('.kacheln').append(t);
    }
    box.append(el);
  }
}
// Firmensuche: Name eintippen, Knopf öffnet das Register; der Name liegt dann in der Zwischenablage
// (Strg+V ins Suchfeld). Geht nur an die Register-Webseite, nicht an Claude.
const REGISTER = [
  { name: 'Unternehmensregister', text: 'Jahresabschlüsse ab 2022', url: 'https://www.unternehmensregister.de/de/search/register-information', weg: 'im Suchfeld Strg+V' },
  // Das Handelsregister lässt keinen Direktaufruf der Suche zu (Sitzung nötig, sonst „Seite nicht gefunden“),
  // daher Startseite, dort links „Normale Suche“.
  { name: 'Handelsregister', text: 'Registerauszüge, Dokumente', url: 'https://www.handelsregister.de/', weg: 'links „Normale Suche“, dann im Feld Firma Strg+V' },
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
        try { await navigator.clipboard.writeText(name); info.textContent = `„${name}“ kopiert – ${r.weg}.`; }
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
$('ew-weiter').addEventListener('click', async () => {
  await objektGeladen;
  einwilligung = new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) + ' Uhr';
  $('wf-adresse').value = objekt.adresse;
  $('wf-quelle').textContent = objektQuelle();
  $('wf-sonst').value = '';
  $('wf-los').disabled = !objekt.adresse;
  zeige('wertform');
  $('wf-adresse').focus();
});
$('wf-zurueck').addEventListener('click', () => zeige('start'));
$('wf-adresse').addEventListener('input', () => { $('wf-los').disabled = !$('wf-adresse').value.trim(); });
$('wf-adresse').addEventListener('keydown', e => { if (e.key === 'Enter' && !$('wf-los').disabled) $('wf-los').click(); });
$('wf-los').addEventListener('click', () => {
  objektAdresse($('wf-adresse').value);
  const zeilen = [`Adresse: ${objekt.adresse}`];
  if (objekt.lage) zeilen.push(`Lage laut Vorgesprächsbogen: ${objekt.lage}`);
  zeilen.push(`Wertermittlungsstichtag: ${new Date().toLocaleDateString('de-DE')}`);
  if ($('wf-sonst').value.trim()) zeilen.push(`Bekannt: ${$('wf-sonst').value.trim()}`);
  starten('wert');
  protokoll(`Grundstückswert KI gestartet für ${objekt.adresse} (Einverständnis der Beteiligten bestätigt ${einwilligung})`);
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
$('vg-abbruch').addEventListener('click', () => { $('vg-dialog').hidden = true; vorgangWeiter = null; ruheBis = Date.now() + 5 * 60000; });
$('vg-eingabe').addEventListener('keydown', e => { if (e.key === 'Enter') vorgangOk(); if (e.key === 'Escape') $('vg-abbruch').click(); });
vorgangHolen();
vorgangZeigen();
let objektGeladen = vorgang ? objektLaden(vorgang) : Promise.resolve();
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('vg-dialog').hidden && !$('chat').hidden && !laeuft) zurueck(); });

fetch('/api/claude').then(r => r.json()).then(d => {
  if (d.karte) karte = d.karte;
  if (d.rechner) rechner = d.rechner;
  if (!d.lokal) kiAus = 'Claude geht nur an diesem PC selbst.';
  else if (!d.schluessel) kiAus = 'Noch kein API-Schlüssel: einmal „Einrichten.cmd“ im Claude-Ordner starten.';
  if (kiAus) $('start-hinweis').textContent = kiAus;
}).catch(() => { kiAus = 'Claude-Server läuft nicht. Fenster schließen und das Desktop-Symbol neu anklicken.'; $('start-hinweis').textContent = kiAus; })
  .finally(() => { startZeigen(); internLaden().then(startZeigen); });
fetch('/api/info').then(r => r.json()).then(d => { if (d.nurZiffern === false) nurZiffern = false; }).catch(() => {});
