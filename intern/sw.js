/* Tools intern: entschlüsselt die Seiten unter app/ im Browser.
   Der Schlüssel liegt nach der Anmeldung (index.html) als nicht exportierbarer
   CryptoKey in der IndexedDB dieses Ursprungs; ohne ihn geht es zur Anmeldung. */
"use strict";
const BASIS = new URL("./", self.location).href;          // …/intern/
const APP = BASIS + "app/";
let inhaltCache = null;                                    // {schluessel, dateien}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("message", e => { if (e.data === "abmelden" || e.data === "neu") inhaltCache = null; });

function db() {
  return new Promise((ok, fehler) => {
    const r = indexedDB.open("tools-intern", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("k");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehler(r.error);
  });
}
async function schluesselHolen() {
  const d = await db();
  return new Promise(ok => {
    const r = d.transaction("k").objectStore("k").get("schluessel");
    r.onsuccess = () => ok(r.result || null);
    r.onerror = () => ok(null);
  });
}
async function entschluesseln(schluessel, puffer) {
  const b = new Uint8Array(puffer);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, schluessel, b.slice(12));
}
async function inhalt(schluessel) {
  if (inhaltCache && inhaltCache.schluessel === schluessel) return inhaltCache;
  const r = await fetch(BASIS + "daten/inhalt.bin", { cache: "no-cache" });
  if (!r.ok) throw new Error("inhalt");
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
    catch { return zurAnmeldung(e.request, pfad); }   // Passwort geändert o. Ä.
    if (pfad === "" || pfad.endsWith("/")) pfad += "index.html";
    let eintrag = verz.dateien[pfad];
    if (!eintrag && verz.dateien[pfad + "/index.html"]) {
      url.pathname += "/";
      return Response.redirect(url.href, 301);
    }
    if (!eintrag) return seite(404, "Nicht gefunden");
    const r = await fetch(BASIS + "daten/" + eintrag.id + ".bin");
    if (!r.ok) return seite(502, "Datei nicht abrufbar");
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
