// Claude-Fenster als Webseite (IONOS-Server, https://tools.notariat-woinar.de/tools/claude-starter/web/claude.html).
// Am PC beantwortet Claude-Server.ps1 die Aufrufe /api/…; auf dem Server übernimmt das diese Datei im Browser:
// - Claude: über den Proxy des Servers (/api/claude/v1/messages), der den API-Schlüssel einsetzt;
// - Ablage, Vorgesprächsbogen, Downloads: über die Ordnerfreigabe des Browsers (Chrome/Edge),
//   die Dateien gehen also direkt vom Browser nach Y:\Vorgänge und nie über den Server.
// Am PC selbst (localhost) tut diese Datei nichts.
'use strict';

(() => {
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;

  window.CLAUDE_WEB = {
    internDaten: '/tools/intern/',
    internSw: '/tools/intern/sw.js',
    internApp: location.origin + '/tools/intern/app/',
    internAnmeldung: location.origin + '/tools/intern/',
  };

  const echtesFetch = window.fetch.bind(window);
  const MAX_BYTES = 50 * 1024 * 1024;
  const einst = (() => {
    const e = { vorgangsordner: false, nurZiffern: true };   // wie Einrichten.ps1: Dateien direkt in Y:\Vorgänge
    try { Object.assign(e, JSON.parse(localStorage.getItem('claude-web-einstellungen') || '{}')); } catch { /* Vorgabe */ }
    return e;
  })();

  // ------------------------------------------------------------------ Ordner (File System Access)
  function db() {
    return new Promise((ok, fehler) => {
      const r = indexedDB.open('claude-web', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('ordner');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fehler(r.error);
    });
  }
  async function ordnerHolen(name) {
    try {
      const d = await db();
      return await new Promise(ok => { const r = d.transaction('ordner').objectStore('ordner').get(name); r.onsuccess = () => ok(r.result || null); r.onerror = () => ok(null); });
    } catch { return null; }
  }
  async function ordnerMerken(name, h) {
    const d = await db();
    await new Promise((ok, fehler) => { const t = d.transaction('ordner', 'readwrite'); t.objectStore('ordner').put(h, name); t.oncomplete = ok; t.onerror = () => fehler(t.error); });
  }
  const modus = name => ({ mode: name === 'vorgaenge' ? 'readwrite' : 'read' });
  async function freigegeben(name) {
    const h = await ordnerHolen(name);
    return h && (await h.queryPermission(modus(name))) === 'granted' ? h : null;
  }
  // Nur aus einem Klick heraus aufrufen (der Browser fragt dann nach)
  async function ordnerFreigeben(name) {
    if (!window.showDirectoryPicker) throw new Error('Dieser Browser kann keine Ordner freigeben. Bitte Chrome oder Edge nehmen.');
    let h = await ordnerHolen(name);
    if (h && (await h.requestPermission(modus(name))) === 'granted') return h;
    h = await window.showDirectoryPicker({ id: 'claude-' + name, mode: modus(name).mode, startIn: name === 'downloads' ? 'downloads' : 'documents' });
    await ordnerMerken(name, h);
    return h;
  }

  // Leiste oben: Vorgänge-Ordner einmal je Sitzung freigeben (Chrome merkt es sich auf Wunsch dauerhaft)
  async function leisteZeigen() {
    let l = document.getElementById('web-ordner');
    if (await freigegeben('vorgaenge')) { if (l) l.remove(); return; }
    if (!l) {
      l = document.createElement('div');
      l.id = 'web-ordner';
      l.style.cssText = 'background:#fff4e5;border-bottom:1px solid #f0c27b;padding:8px 16px;font:14px system-ui,sans-serif;display:flex;gap:12px;align-items:center;flex-wrap:wrap';
      l.innerHTML = '<span></span><button type="button"></button>';
      document.body.prepend(l);
      l.querySelector('button').addEventListener('click', async () => {
        try { await ordnerFreigeben('vorgaenge'); leisteZeigen(); }
        catch (e) { if (e.name !== 'AbortError') l.querySelector('span').textContent = e.message; }
      });
    }
    const h = await ordnerHolen('vorgaenge');
    l.querySelector('span').textContent = h
      ? `Ablage im Ordner „${h.name}“ für diese Sitzung freigeben, damit Chats und PDFs im Vorgang landen.`
      : 'Einmal den Vorgänge-Ordner (Y:\\Vorgänge) wählen, damit Chats und PDFs im Vorgang landen.';
    l.querySelector('button').textContent = h ? 'Freigeben' : 'Ordner wählen';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', leisteZeigen); else leisteZeigen();

  async function vorgaenge() {
    const h = await freigegeben('vorgaenge');
    if (!h) { leisteZeigen(); throw new Error('Vorgänge-Ordner nicht freigegeben (oben auf „Freigeben“ klicken).'); }
    return h;
  }

  // ------------------------------------------------------------------ Hilfen wie in Claude-Server.ps1
  function nummer(s) {
    s = (s || '').trim();
    if (einst.nurZiffern) return /^\d{1,9}$/.test(s) ? (s.replace(/^0+/, '') || null) : null;
    s = s.replace(/\//g, '-').replace(/\s+/g, ' ').trim();
    return /^[\p{L}\d][\p{L}\d .\-_]{0,39}$/u.test(s) ? s : null;
  }
  function sauber(s, max = 80) {
    s = (s || '').replace(/[\\/:*?"<>|\x00-\x1F]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '').trim();
    return s.length > max ? s.slice(0, max).trim() : s;
  }
  async function gibt(ordner, name) {
    try { await ordner.getFileHandle(name); return true; } catch { return false; }
  }
  async function vorgangsordner(basis, nr) {
    for await (const [name, h] of basis.entries()) if (h.kind === 'directory' && (name === nr || name.startsWith(nr + ' '))) return h;
    return basis.getDirectoryHandle(nr, { create: true });
  }
  // Ziel für eine Datei im Vorgang: Ordner, Dateiname, Anzeige wie am PC
  async function ziel(nr, bez, endung, ersetzen) {
    const basis = await vorgaenge();
    let ordner = basis, datei = bez.startsWith(nr + ' ') ? bez : `${nr} ${bez}`;
    if (einst.vorgangsordner) { ordner = await vorgangsordner(basis, nr); datei = bez; }
    let name = datei + endung;
    if (!ersetzen) for (let i = 2; await gibt(ordner, name); i++) name = `${datei} (${i})${endung}`;
    return { ordner, name, anzeige: einst.vorgangsordner ? `${ordner.name}\\${name}` : name };
  }
  async function schreiben(ordner, name, daten) {
    const w = await (await ordner.getFileHandle(name, { create: true })).createWritable();
    await w.write(daten);
    await w.close();
  }
  async function koerper(init) {
    const b = init && init.body;
    if (b == null) return new Uint8Array(0);
    if (typeof b === 'string') return new TextEncoder().encode(b);
    if (b instanceof Blob) return new Uint8Array(await b.arrayBuffer());
    if (b instanceof ArrayBuffer) return new Uint8Array(b);
    if (ArrayBuffer.isView(b)) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    return new TextEncoder().encode(String(b));
  }
  const istPdf = d => d.length >= 5 && String.fromCharCode(...d.slice(0, 5)) === '%PDF-';
  const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  const zwei = n => String(n).padStart(2, '0');

  // ------------------------------------------------------------------ die einzelnen Aufrufe
  const API = {
    'GET /api/claude': async () => json(200, { ok: true, schluessel: true, lokal: true }),

    // Gleiche Anfrage wie am PC; den Schlüssel setzt der Server ein
    'POST /api/claude': async (q, init) => {
      try {
        return await echtesFetch('/api/claude/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'anthropic-version': '2026-10-21', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
          body: init.body,
        });
      } catch { return json(502, { ok: false, fehler: 'Der Server antwortet nicht (Internet?).' }); }
    },

    'GET /api/info': async () => {
      const h = await ordnerHolen('vorgaenge');
      return json(200, { ok: true, version: 'Web', rechner: location.hostname, basis: h ? h.name : '', basisOk: !!(await freigegeben('vorgaenge')), nurZiffern: einst.nurZiffern, registerportal: 'https://www.handelsregister.de' });
    },

    'POST /api/ablegen': async (q, init) => {
      const nr = nummer(q.get('nr'));
      if (!nr) return json(400, { ok: false, fehler: 'Vorgangsnummer fehlt oder ist ungültig.' });
      const daten = await koerper(init);
      if (!daten.length || daten.length > MAX_BYTES) return json(413, { ok: false, fehler: 'Datei leer oder zu groß.' });
      if (!istPdf(daten)) return json(400, { ok: false, fehler: 'Es kam kein PDF an.' });
      const z = await ziel(nr, sauber(q.get('datei'), 120) || 'Claude ' + new Date().toLocaleString('sv-SE').slice(0, 16).replace(':', '-'), '.pdf', q.get('ersetzen') === '1');
      await schreiben(z.ordner, z.name, daten);
      return json(200, { ok: true, datei: z.anzeige });
    },

    // Neuester Vorgesprächsbogen „<Nr> … Vorgespr….pdf“ (auch im Unterordner des Vorgangs)
    'GET /api/vorgespraech': async q => {
      const nr = nummer(q.get('nr'));
      const basis = nr && await freigegeben('vorgaenge');
      if (!basis) return json(404, { ok: false });
      const muster = new RegExp('^0*' + nr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b.*Vorgespr.*\\.pdf$', 'i');
      let beste = null;
      const pruefen = async (ordner, imVorgang) => {
        for await (const [name, h] of ordner.entries()) {
          if (h.kind !== 'file' || !/\.pdf$/i.test(name) || !(muster.test(name) || (imVorgang && /Vorgespr/i.test(name)))) continue;
          const f = await h.getFile();
          if (!beste || f.lastModified > beste.lastModified) beste = f;
        }
      };
      await pruefen(basis, false);
      for await (const [name, h] of basis.entries()) if (h.kind === 'directory' && (name === nr || name.startsWith(nr + ' '))) await pruefen(h, true);
      if (!beste) return json(404, { ok: false, fehler: 'Kein Vorgesprächsbogen im Vorgang.' });
      return new Response(beste, { status: 200, headers: { 'Content-Type': 'application/pdf', 'X-Datei': encodeURIComponent(beste.name) } });
    },

    // Die neuesten PDFs aus Downloads (letzte 24 Stunden); den Ordner wählt man beim ersten Mal aus
    'GET /api/downloads': async () => {
      let h = await freigegeben('downloads');
      if (!h) {
        try { h = await ordnerFreigeben('downloads'); }
        catch (e) { return json(403, { ok: false, fehler: e.name === 'AbortError' ? 'Kein Ordner gewählt.' : e.message }); }
      }
      const grenze = Date.now() - 24 * 3600000, liste = [];
      for await (const [name, e] of h.entries()) {
        if (e.kind !== 'file' || !/\.pdf$/i.test(name)) continue;
        const f = await e.getFile();
        if (f.lastModified > grenze) liste.push(f);
      }
      liste.sort((a, b) => b.lastModified - a.lastModified);
      const zeit = t => { const d = new Date(t); return `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}. ${zwei(d.getHours())}:${zwei(d.getMinutes())}`; };
      return json(200, { ok: true, ordner: h.name, dateien: liste.slice(0, 8).map(f => ({ name: f.name, kb: Math.ceil(f.size / 1024), zeit: zeit(f.lastModified) })) });
    },

    'POST /api/download-ablegen': async q => {
      const nr = nummer(q.get('nr'));
      if (!nr) return json(400, { ok: false, fehler: 'Vorgangsnummer fehlt oder ist ungültig.' });
      const name = q.get('name') || '';
      if (!/\.pdf$/i.test(name) || /[\\/]/.test(name)) return json(400, { ok: false, fehler: 'Ungültiger Dateiname.' });
      const dl = await freigegeben('downloads');
      if (!dl) return json(403, { ok: false, fehler: 'Downloads nicht freigegeben.' });
      let f;
      try { f = await (await dl.getFileHandle(name)).getFile(); } catch { return json(404, { ok: false, fehler: 'Datei nicht mehr in Downloads.' }); }
      const z = await ziel(nr, sauber(name.replace(/\.pdf$/i, ''), 120) || 'Download', '.pdf', false);
      await schreiben(z.ordner, z.name, f);
      return json(200, { ok: true, datei: z.anzeige });
    },
  };

  window.fetch = async (eingabe, init = {}) => {
    const roh = typeof eingabe === 'string' ? eingabe : eingabe instanceof URL ? eingabe.href : eingabe.url;
    const url = new URL(roh, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/') || url.pathname.startsWith('/api/claude/v1/')) return echtesFetch(eingabe, init);
    const methode = (init.method || (eingabe instanceof Request ? eingabe.method : 'GET')).toUpperCase();
    if (url.pathname.startsWith('/api/hr/')) return json(501, { ok: false, fehler: 'Der Registerabruf geht nur im Claude-Fenster am PC (Desktop-Symbol).' });
    const f = API[methode + ' ' + url.pathname];
    if (!f) return json(404, { ok: false, fehler: 'Nicht gefunden.' });
    try { return await f(url.searchParams, init); }
    catch (e) { return json(500, { ok: false, fehler: e.message || String(e) }); }
  };
})();
