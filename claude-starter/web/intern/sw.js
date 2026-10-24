/* Tools intern im Claude-Fenster (Kopie von tools/intern/sw.js): entschlüsselt die Seiten unter app/
   im Browser. Die verschlüsselten Dateien kommen von GitHub Pages (DATEN), die Seite selbst von localhost.
   Der Schlüssel liegt nach der Anmeldung (index.html) als nicht exportierbarer
   CryptoKey in der IndexedDB dieses Ursprungs; ohne ihn geht es zur Anmeldung. */
"use strict";
const BASIS = new URL("./", self.location).href;          // …/intern/
const APP = BASIS + "app/";
const DATEN = "https://tools.notariat-woinar.de/tools/intern/";   // verschlüsselte Dateien (IONOS-Server, ohne Login lesbar)
let inhaltCache = null;                                    // {schluessel, dateien}
let schluesselCache = null;                                // geladener CryptoKey

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("message", e => { if (e.data === "abmelden" || e.data === "neu") { inhaltCache = null; schluesselCache = null; } });

function db() {
  return new Promise((ok, fehler) => {
    const r = indexedDB.open("tools-intern", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("k");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehler(r.error);
  });
}
async function schluesselLoeschen() {
  schluesselCache = null; inhaltCache = null;
  const d = await db();
  return new Promise(ok => { const t = d.transaction("k", "readwrite"); t.objectStore("k").delete("schluessel"); t.oncomplete = ok; t.onerror = ok; });
}
async function schluesselHolen() {
  if (schluesselCache) return schluesselCache;
  const d = await db();
  return new Promise(ok => {
    const r = d.transaction("k").objectStore("k").get("schluessel");
    r.onsuccess = () => { schluesselCache = r.result || null; ok(schluesselCache); };
    r.onerror = () => ok(null);
  });
}
async function entschluesseln(schluessel, puffer) {
  const b = new Uint8Array(puffer);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, schluessel, b.slice(12));
}
async function inhalt(schluessel) {
  if (inhaltCache && inhaltCache.schluessel === schluessel) return inhaltCache;
  let r;
  try { r = await fetch(DATEN + "daten/inhalt.bin", { cache: "no-cache" }); } catch { throw new Error("netz"); }
  if (!r.ok) throw new Error("netz");
  const json = JSON.parse(new TextDecoder().decode(await entschluesseln(schluessel, await r.arrayBuffer())));
  inhaltCache = { schluessel, dateien: json.dateien };
  return inhaltCache;
}
function zurAnmeldung(req, pfad) {
  if (req.mode === "navigate") return Response.redirect(BASIS + "?weiter=" + encodeURIComponent(pfad), 302);
  return new Response("Nicht angemeldet", { status: 401 });
}
function seite(status, text) {
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${text}</title><body style="font:16px system-ui;margin:40px auto;max-width:520px;padding:0 16px">
<h1>${text}</h1><p><a href="${APP}">Zur Übersicht</a> · <a href="${BASIS}">Anmeldung</a></p>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || !url.href.startsWith(APP)) return;
  e.respondWith((async () => {
    let pfad = decodeURIComponent(url.pathname.slice(new URL(APP).pathname.length));
    const schluessel = await schluesselHolen();
    if (!schluessel) return zurAnmeldung(e.request, pfad);
    let verz;
    try { verz = await inhalt(schluessel); }
    catch (err) {
      if (err.message === "netz") return seite(503, "Keine Verbindung");
      await schluesselLoeschen();                     // Passwort geändert: alter Schlüssel passt nicht mehr
      return zurAnmeldung(e.request, pfad);
    }
    if (pfad === "" || pfad.endsWith("/")) pfad += "index.html";
    let eintrag = verz.dateien[pfad];
    if (!eintrag && verz.dateien[pfad + "/index.html"]) {
      url.pathname += "/";
      return Response.redirect(url.href, 301);
    }
    if (!eintrag) return seite(404, "Nicht gefunden");
    let r = await fetch(DATEN + "daten/" + eintrag.id + ".bin").catch(() => null);
    if (r && r.status === 404) {                      // Bereich wurde inzwischen neu gebaut: Verzeichnis neu laden
      inhaltCache = null;
      try { verz = await inhalt(schluessel); } catch { return seite(503, "Keine Verbindung"); }
      eintrag = verz.dateien[pfad];
      if (!eintrag) return seite(404, "Nicht gefunden");
      r = await fetch(DATEN + "daten/" + eintrag.id + ".bin").catch(() => null);
    }
    if (!r || !r.ok) return seite(502, "Datei nicht abrufbar");
    try {
      const klar = await entschluesseln(schluessel, await r.arrayBuffer());
      const kopf = { "Content-Type": eintrag.typ, "Cache-Control": "no-store" };
      if (/\.(apk|zip|cmd|ps1|url|docx)$/i.test(pfad)) kopf["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(pfad.split("/").pop())}`;
      return new Response(klar, { headers: kopf });
    } catch {
      return seite(500, "Entschlüsseln fehlgeschlagen");
    }
  })());
});
