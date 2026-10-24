// Registerabruf aus dem gemeinsamen Registerportal (handelsregister.de): Auszüge (AD, HD, CD) und aus
// den Dokumenten (DK) der neueste Gesellschaftsvertrag und die neueste Gesellschafterliste, direkt in
// den Vorgang. Das Portal ist eine JSF/PrimeFaces-Anwendung ohne Schnittstelle: das Fenster füllt die
// Formulare wie ein Browser aus (Felder samt ViewState), der Server (/api/hr/http) reicht die Anfragen
// nur an das Registerportal weiter und hält die Sitzung. Keine KI beteiligt.
// Ablauf nach dem Vorbild von bundesAPI/handelsregister und lexdoudkin/handelsregister-mcp.
// Nutzungsordnung: höchstens 60 Suchen/Abrufe je Stunde; der Server zählt und sperrt ab 50.
'use strict';

const HR_ARTEN = [
  { k: 'AD', titel: 'Aktueller Abdruck', datei: 'HR aktueller Abdruck' },
  { k: 'HD', titel: 'Historischer Abdruck', datei: 'HR historischer Abdruck' },
  { k: 'CD', titel: 'Chronologischer Abdruck', datei: 'HR chronologischer Abdruck' },
  { k: 'GV', titel: 'Gesellschaftsvertrag (neuester)', datei: 'HR Gesellschaftsvertrag', dk: /gesellschaftsvertrag|satzung|statut|articles of association/i },
  { k: 'GL', titel: 'Gesellschafterliste (neueste)', datei: 'HR Gesellschafterliste', dk: /liste der gesellschafter|gesellschafterliste|list of shareholders/i },
];
let hrLaeuft = false;
let hrWahl = null;   // wartet auf die Auswahl eines Treffers

function hrOeffnen() {
  $('hr-dialog').hidden = false;
  $('hr-log').textContent = '';
  $('hr-treffer').textContent = '';
  const firma = document.querySelector('.kachel.firma input');
  if (firma && firma.value.trim() && !$('hr-firma').value) $('hr-firma').value = firma.value.trim();
  $('hr-firma').focus();
}
function hrMeldung(text, art) {
  const li = document.createElement('li');
  li.textContent = text;
  if (art) li.className = art;
  $('hr-log').append(li);
  li.scrollIntoView({ block: 'nearest' });
  return li;
}

// ---- HTTP über den Server (nur Registerportal)
async function hrHttp(url, params, opt = {}) {
  const q = new URLSearchParams({ url });
  if (opt.zaehlt) q.set('zaehlt', '1');
  if (opt.ajax) q.set('ajax', '1');
  if (opt.referer) q.set('referer', opt.referer);
  const r = await fetch('/api/hr/http?' + q, { method: 'POST', body: params ? params.toString() : '' });
  const d = await r.json().catch(() => ({ ok: false, fehler: `Fehler ${r.status}` }));
  if (!r.ok || d.ok === false) throw new Error(d.fehler || `Fehler ${r.status}`);
  if (d.status >= 400) throw new Error(`Registerportal antwortet mit Fehler ${d.status}`);
  return d;
}
function hrSeite(d) {
  if (d.text === undefined) throw new Error('Registerportal lieferte eine Datei statt einer Seite');
  return { url: d.url, doc: new DOMParser().parseFromString(d.text, 'text/html') };
}
// Felder eines Formulars wie beim Absenden im Browser (ohne Knöpfe; Häkchen/Optionen nur gewählte)
function hrFelder(form) {
  const p = new URLSearchParams();
  for (const el of form.querySelectorAll('input, select, textarea')) {
    const name = el.getAttribute('name');
    if (!name || el.disabled) continue;
    const typ = (el.getAttribute('type') || '').toLowerCase();
    if (el.tagName === 'INPUT') {
      if (['submit', 'button', 'image', 'reset', 'file'].includes(typ)) continue;
      if ((typ === 'checkbox' || typ === 'radio') && !el.checked) continue;
      p.append(name, el.getAttribute('value') ?? (typ === 'checkbox' || typ === 'radio' ? 'on' : ''));
    } else if (el.tagName === 'SELECT') {
      const opts = [...el.options];
      const gew = opts.filter(o => o.selected);
      for (const o of (gew.length ? gew : el.multiple ? [] : opts.slice(0, 1))) p.append(name, o.getAttribute('value') ?? o.textContent);
    } else p.append(name, el.textContent);
  }
  return p;
}
function hrFormular(seite, id) {
  const f = seite.doc.getElementById(id) || seite.doc.querySelector(`form[name="${id}"]`);
  if (!f) throw new Error(`Seite des Registerportals unerwartet (Formular ${id} fehlt)`);
  return f;
}
async function hrAbsenden(seite, id, extra, opt = {}) {
  const f = hrFormular(seite, id);
  const p = hrFelder(f);
  for (const [k, v] of Object.entries(extra || {})) p.set(k, v);
  const ziel = new URL(f.getAttribute('action') || seite.url, seite.url).href;
  return hrHttp(ziel, p, { referer: seite.url, ...opt });
}
function hrFehlertext(seite) {
  const t = [...seite.doc.querySelectorAll('.ui-messages-error-detail, .ui-messages-warn-detail, .ui-message-error-detail, .ui-messages-info-detail')]
    .map(e => e.textContent.trim()).filter(Boolean);
  return [...new Set(t)].join(' ');
}

// ---- Suche
async function hrSuchseite(basis) {
  const s0 = hrSeite(await hrHttp(basis + '/'));
  return hrSeite(await hrAbsenden(s0, 'naviForm', { 'naviForm:erweiterteSucheLink': 'naviForm:erweiterteSucheLink', target: 'erweiterteSucheLink' }));
}
function hrRegisternummer(text) {
  const m = (text || '').trim().match(/^(HRA|HRB|GnR|GsR|PR|VR)\s*(\d+)\s*([A-Za-z]{0,3})$/i);
  if (!m) return null;
  const art = m[1].toUpperCase() === 'GNR' ? 'GnR' : m[1].toUpperCase() === 'GSR' ? 'GsR' : m[1].toUpperCase();
  return { art, nr: m[2] + (m[3] ? ' ' + m[3].toUpperCase() : '') };
}
async function hrSuchen(basis, firma, regnr, option) {
  const s = await hrSuchseite(basis);
  const f = hrFormular(s, 'form');
  const extra = { 'form:schlagwoerter': firma, 'form:schlagwortOptionen': option };
  const knopf = f.querySelector('[name="form:btnSuche"]');
  extra['form:btnSuche'] = knopf ? (knopf.getAttribute('value') || '') : '';
  if (regnr) {
    const art = f.querySelector('[name="form:registerArt_input"]');
    if (art) {
      const o = [...art.options].find(x => (x.getAttribute('value') || x.textContent).trim().toUpperCase() === regnr.art.toUpperCase()
        || x.textContent.trim().toUpperCase() === regnr.art.toUpperCase());
      extra['form:registerArt_input'] = o ? (o.getAttribute('value') ?? o.textContent.trim()) : regnr.art;
    }
    extra['form:registerNummer'] = regnr.nr;
  }
  const erg = hrSeite(await hrAbsenden(s, 'form', extra, { zaehlt: true }));
  const treffer = [...erg.doc.querySelectorAll('tr[data-ri]')].map(tr => {
    const z = [...tr.querySelectorAll(':scope > td')].map(td => td.textContent.replace(/\s+/g, ' ').trim());
    const land = z[3] || '';
    let gericht = z[1] || '';
    if (land && gericht.startsWith(land)) gericht = gericht.slice(land.length).trim();
    const docs = {};
    for (const a of tr.querySelectorAll('a[id]')) {
      const k = a.textContent.trim().toUpperCase();
      if (['AD', 'CD', 'HD', 'DK', 'SI', 'UT'].includes(k)) docs[k] = a.id;
    }
    return { ri: tr.getAttribute('data-ri'), name: z[2] || '', gericht, land, status: z[4] || '', docs };
  });
  return { erg, treffer, meldung: hrFehlertext(erg) };
}
function hrAuswaehlen(treffer) {
  // Mehrere Treffer: Fenster zeigt die Liste, Thomas wählt
  const box = $('hr-treffer');
  box.textContent = '';
  const p = document.createElement('p');
  p.className = 'hilfe';
  p.textContent = `${treffer.length} Treffer – bitte die richtige Gesellschaft anklicken:`;
  box.append(p);
  return new Promise(res => {
    hrWahl = res;
    for (const t of treffer) {
      const b = document.createElement('button');
      b.textContent = t.name;
      const s = document.createElement('small');
      s.textContent = [t.gericht, t.status].filter(Boolean).join(' · ');
      b.append(s);
      b.addEventListener('click', () => { box.textContent = ''; hrWahl = null; res(t); });
      box.append(b);
    }
  });
}

// ---- Dokumente (DK): Baum der eingereichten Dokumente
async function hrDkOeffnen(erg, t) {
  const id = t.docs.DK;
  if (!id) throw new Error('Für diese Gesellschaft gibt es keine Dokumente (DK)');
  const s = hrSeite(await hrAbsenden(erg, 'ergebnissForm', { 'javax.faces.source': id, [id]: id }));
  const f = hrFormular(s, 'dk_form');
  let knopf = [...f.querySelectorAll('button[name], input[type=submit][name]')].find(b => /download|herunterladen/i.test(b.textContent + ' ' + (b.getAttribute('value') || '')))
    || f.querySelector('button[type=submit][name]') || f.querySelector('button[name]');
  return { seite: s, knopf: knopf ? [knopf.getAttribute('name'), knopf.getAttribute('value') || knopf.getAttribute('name')] : null };
}
async function hrDkAufklappen(dk, vs, knoten) {
  const f = hrFormular(dk.seite, 'dk_form');
  const ziel = new URL(f.getAttribute('action') || dk.seite.url, dk.seite.url).href;
  const p = new URLSearchParams({
    'javax.faces.partial.ajax': 'true', 'javax.faces.source': 'dk_form:dktree',
    'javax.faces.partial.execute': 'dk_form:dktree', 'javax.faces.partial.render': 'dk_form:dktree',
    'javax.faces.behavior.event': 'expand', 'javax.faces.partial.event': 'expand',
    'dk_form:dktree_expandNode': knoten, dk_form: 'dk_form', 'javax.faces.ViewState': vs,
  });
  const d = await hrHttp(ziel, p, { ajax: true, referer: dk.seite.url });
  const roh = d.text || '';
  const baum = (roh.match(/id="dk_form:dktree"><!\[CDATA\[([\s\S]*?)\]\]>/) || [])[1] || '';
  const neuVs = (roh.match(/ViewState[^>]*><!\[CDATA\[([\s\S]*?)\]\]>/) || [])[1] || vs;
  const doc = new DOMParser().parseFromString(baum, 'text/html');
  const knotenListe = [...doc.querySelectorAll('li[data-rowkey]')].map(li => {
    const l = li.querySelector('.ui-treenode-label');
    return { key: li.getAttribute('data-rowkey'), label: (l ? l.textContent : li.textContent).replace(/\s+/g, ' ').trim() };
  });
  return { vs: neuVs, knoten: knotenListe };
}
function hrDatum(text) {
  const m = (text || '').match(/(\d{2})[./](\d{2})[./](\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}
// Kategorien suchen und je gewünschter Art das neueste Dokument bestimmen
async function hrDkKatalog(dk, arten) {
  const vsEl = dk.seite.doc.querySelector('input[name="javax.faces.ViewState"]');
  let vs = vsEl ? vsEl.getAttribute('value') : '';
  const alle = new Map();
  const merken = liste => liste.forEach(k => alle.set(k.key, k.label));
  // Startbaum (falls schon aufgeklappt) und die ersten Ebenen
  dk.seite.doc.querySelectorAll('li[data-rowkey]').forEach(li => {
    const l = li.querySelector('.ui-treenode-label');
    alle.set(li.getAttribute('data-rowkey'), (l ? l.textContent : '').replace(/\s+/g, ' ').trim());
  });
  for (const k of ['0', '0_0']) { const r = await hrDkAufklappen(dk, vs, k); vs = r.vs; merken(r.knoten); }
  const ergebnis = {};
  for (const art of arten) {
    const kat = [...alle].find(([key, label]) => art.dk.test(label) && key.split('_').length <= 3);
    if (!kat) { ergebnis[art.k] = null; continue; }
    const r = await hrDkAufklappen(dk, vs, kat[0]);
    vs = r.vs;
    const blaetter = r.knoten.filter(n => n.key.startsWith(kat[0] + '_'));
    if (!blaetter.length) { ergebnis[art.k] = null; continue; }
    blaetter.forEach((b, i) => { b.datum = hrDatum(b.label); b.i = i; });
    blaetter.sort((a, b) => (b.datum || '').localeCompare(a.datum || '') || b.i - a.i);
    ergebnis[art.k] = { kategorie: kat[1], ...blaetter[0] };
  }
  return ergebnis;
}
async function hrDkLaden(erg, t, key) {
  // Frische Dokumentenseite; erst Auswahl melden (Format-Auswahl wird frei), dann als Datei holen
  const dk = await hrDkOeffnen(erg, t);
  if (!dk.knopf) throw new Error('Download-Knopf auf der Dokumentenseite nicht gefunden');
  const basis = { 'dk_form:dktree_selection': key, 'dk_form:dktree_scrollState': '0,0', [dk.knopf[0]]: dk.knopf[1] };
  const s1 = await hrAbsenden(dk.seite, 'dk_form', basis);
  if (s1.datei) return s1;
  const s2 = await hrAbsenden(hrSeite(s1), 'dk_form', { ...basis, 'dk_form:radio_dkbuttons': 'false' }, { zaehlt: true });
  if (!s2.datei) throw new Error('Registerportal lieferte keine Datei' + (s2.text ? ': ' + (hrFehlertext(hrSeite(s2)) || 'Seite statt Dokument') : ''));
  return s2;
}

// ---- Ablauf
async function hrAblegen(d, name) {
  const r = await fetch('/api/hr/ablegen?' + new URLSearchParams({ nr: vorgang, id: d.datei, name }), { method: 'POST' });
  const e = await r.json().catch(() => ({}));
  if (!r.ok || e.ok === false) throw new Error(e.fehler || `Fehler ${r.status}`);
  protokoll(`Registerabruf abgelegt: ${e.datei}`);
  return e.datei;
}
async function hrAbrufen() {
  if (hrLaeuft) return;
  const firma = $('hr-firma').value.trim();
  const regText = $('hr-nummer').value.trim();
  const regnr = hrRegisternummer(regText);
  const arten = HR_ARTEN.filter(a => $('hr-' + a.k).checked);
  $('hr-log').textContent = '';
  if (!firma && !regnr) { hrMeldung('Bitte Firma oder Registernummer (z. B. HRB 12345) eintragen.', 'schlecht'); return; }
  if (regText && !regnr) { hrMeldung('Registernummer bitte so: HRB 12345 (oder HRA, GnR, PR, VR).', 'schlecht'); return; }
  if (!arten.length) { hrMeldung('Bitte mindestens ein Dokument ankreuzen.', 'schlecht'); return; }
  hrLaeuft = true;
  $('hr-los').disabled = true;
  try {
    const info = await (await fetch('/api/hr/neu', { method: 'POST' })).json();
    const basis = (await (await fetch('/api/info')).json()).registerportal || 'https://www.handelsregister.de';
    if (info.abrufe >= info.grenze - arten.length - 1) hrMeldung(`Achtung: ${info.abrufe} von ${info.grenze} Abrufen dieser Stunde verbraucht.`, 'schlecht');
    const suche = `${firma}${regnr ? ` (${regnr.art} ${regnr.nr})` : ''}`;
    protokoll(`Registerabruf: ${suche} – ${arten.map(a => a.k).join(', ')}`);
    let m = hrMeldung(`Suche „${suche}“ …`);
    let s = await hrSuchen(basis, firma, regnr, firma ? '3' : '1');
    if (!s.treffer.length && firma) { m.textContent += ' kein genauer Treffer, suche weiter …'; s = await hrSuchen(basis, firma, regnr, '1'); }
    if (!s.treffer.length) { m.textContent = `Keine Gesellschaft gefunden.${s.meldung ? ' Portal: ' + s.meldung : ''}`; m.className = 'schlecht'; return; }
    m.textContent = `${s.treffer.length} Treffer.`;
    const t = s.treffer.length === 1 ? s.treffer[0] : await hrAuswaehlen(s.treffer);
    if (!t) { hrMeldung('Abgebrochen.'); return; }
    hrMeldung(`${t.name} · ${t.gericht}`, 'gut');
    const kurz = (t.name || firma).replace(/\s+/g, ' ').slice(0, 70);
    const heute = new Date().toLocaleDateString('de-DE');
    for (const a of arten.filter(x => !x.dk)) {
      m = hrMeldung(`${a.titel} …`);
      try {
        if (!t.docs[a.k]) throw new Error('wird für diese Gesellschaft nicht angeboten');
        const d = await hrAbsenden(s.erg, 'ergebnissForm', { 'javax.faces.source': t.docs[a.k], [t.docs[a.k]]: t.docs[a.k] }, { zaehlt: true });
        if (!d.datei) throw new Error('Registerportal lieferte keine Datei' + (d.text ? ' (' + (hrFehlertext(hrSeite(d)) || 'Seite statt Dokument') + ')' : ''));
        m.textContent = `✓ ${a.titel}: ${await hrAblegen(d, `${a.datei} ${kurz} Stand ${heute}`)}`;
        m.className = 'gut';
      } catch (e) { m.textContent = `✗ ${a.titel}: ${e.message}`; m.className = 'schlecht'; }
    }
    const dkArten = arten.filter(x => x.dk);
    if (dkArten.length) {
      m = hrMeldung('Dokumente durchsuchen …');
      let katalog = {};
      try {
        katalog = await hrDkKatalog(await hrDkOeffnen(s.erg, t), dkArten);
        m.textContent = 'Dokumente durchsucht.';
      } catch (e) { m.textContent = `✗ Dokumente: ${e.message}`; m.className = 'schlecht'; }
      for (const a of dkArten) {
        const z = katalog[a.k];
        if (z === undefined) continue;
        m = hrMeldung(`${a.titel} …`);
        try {
          if (!z) throw new Error('nicht in den Dokumenten gefunden');
          const d = await hrDkLaden(s.erg, t, z.key);
          const datum = z.datum ? ' vom ' + z.datum.split('-').reverse().join('.') : '';
          m.textContent = `✓ ${a.titel}${datum}: ${await hrAblegen(d, `${a.datei} ${kurz}${datum}`)}`;
          m.className = 'gut';
        } catch (e) { m.textContent = `✗ ${a.titel}: ${e.message}`; m.className = 'schlecht'; }
      }
    }
    hrMeldung('Fertig.');
  } catch (e) {
    hrMeldung('✗ ' + e.message, 'schlecht');
    hrMeldung('Falls das wieder passiert: bitte die Datei %LOCALAPPDATA%\\Claude-Starter\\register\\letzte-seite.html an Claude schicken (öffentliche Registerdaten).');
  } finally {
    hrLaeuft = false;
    $('hr-los').disabled = false;
    if (hrWahl) { hrWahl = null; $('hr-treffer').textContent = ''; }
  }
}
$('hr-los').addEventListener('click', () => mitVorgang(hrAbrufen));
$('hr-zu').addEventListener('click', () => {
  if (hrWahl) { const w = hrWahl; hrWahl = null; $('hr-treffer').textContent = ''; w(null); }
  if (!hrLaeuft) $('hr-dialog').hidden = true;
});
for (const id of ['hr-firma', 'hr-nummer']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('hr-los').click(); if (e.key === 'Escape') $('hr-zu').click(); });
