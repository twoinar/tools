"""Registerabruf für das Claude-Fenster in der Webversion: reicht Anfragen an das gemeinsame Registerportal
(handelsregister.de) weiter und hält dabei die Sitzung (Cookies), so wie Claude-Server.ps1 am PC. Läuft im
Container „tools-register“ und ist nur über tools-web erreichbar (/api/hr/…, hinter dem Login).

- POST /api/hr/neu                    neue Sitzung, Antwort {sitzung, abrufe, grenze}
- POST /api/hr/http?sitzung=&url=…    eine Anfrage ans Portal (Body = Formular, ohne Body GET);
                                      HTML kommt als Text zurück, Dateien bleiben kurz im Speicher
- GET  /api/hr/datei?sitzung=&id=     die Datei aus dem Speicher holen (danach gelöscht)

Nur das Registerportal ist erlaubt. Die Nutzungsordnung erlaubt höchstens 60 Suchen/Abrufe je Stunde; da alle
Anfragen von der Adresse dieses Servers kommen, zählt der Dienst für das ganze Büro und sperrt ab 50.
Gespeichert wird nichts auf der Platte; Sitzungen und Dateien verfallen nach 30 Minuten."""
import gzip, http.cookiejar, json, os, secrets, threading, time, urllib.error, urllib.parse, urllib.request, zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORTAL = os.environ.get("REGISTERPORTAL", "https://www.handelsregister.de").strip().rstrip("/")
GRENZE, FENSTER, HALTEN = 50, 3600, 1800
MAX_DATEI = 40 * 1024 * 1024
AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0"
sperre = threading.Lock()
abrufe = []                 # Zeitpunkte der gezählten Abrufe (ganzes Büro)
sitzungen = {}              # id -> {"oeffner", "zeit", "dateien": {id: (bytes, endung)}}


class OhneFehler(urllib.request.HTTPErrorProcessor):
    """Weiterleitungen folgen, Fehlerseiten des Portals (4xx/5xx) aber wie am PC als Antwort durchreichen."""
    def http_response(self, request, response):
        if 300 <= response.status < 400:
            return super().http_response(request, response)
        return response
    https_response = http_response


class NurPortal(urllib.request.HTTPRedirectHandler):
    """Weiterleitungen nur innerhalb des Registerportals."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not (newurl == PORTAL or newurl.startswith(PORTAL + "/")):
            raise urllib.error.HTTPError(newurl, code, "Weiterleitung aus dem Registerportal heraus", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def aufraeumen():
    jetzt = time.time()
    for k in [k for k, s in sitzungen.items() if jetzt - s["zeit"] > HALTEN]:
        del sitzungen[k]
    abrufe[:] = [z for z in abrufe if jetzt - z < FENSTER]


def endung(daten, typ, disp):
    if daten[:5] == b"%PDF-":
        return ".pdf"
    if "filename" in disp:
        name = disp.split("filename", 1)[1].lstrip("*=").split(";")[0].strip().strip('"')
        if "''" in name:
            name = name.split("''", 1)[1]
        e = os.path.splitext(urllib.parse.unquote(name))[1].lower()
        if 3 <= len(e) <= 6 and e[1:].isalnum():
            return e
    if "zip" in typ:
        return ".zip"
    if "tif" in typ:
        return ".tif"
    return ".bin"


class Dienst(BaseHTTPRequestHandler):
    def antwort(self, code, daten, roh=None, typ="application/json; charset=utf-8"):
        roh = roh if roh is not None else json.dumps(daten, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", typ)
        self.send_header("Content-Length", str(len(roh)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(roh)

    def sitzung(self, q):
        with sperre:
            aufraeumen()
            s = sitzungen.get(q.get("sitzung", [""])[0])
            if s:
                s["zeit"] = time.time()
            return s

    def do_GET(self):
        teile = urllib.parse.urlsplit(self.path)
        q = urllib.parse.parse_qs(teile.query)
        if teile.path != "/api/hr/datei":
            return self.antwort(404, {"ok": False})
        s = self.sitzung(q)
        d = s and s["dateien"].pop(q.get("id", [""])[0], None)
        if not d:
            return self.antwort(404, {"ok": False, "fehler": "Datei nicht mehr da."})
        typ = "application/pdf" if d[1] == ".pdf" else "application/octet-stream"
        return self.antwort(200, None, roh=d[0], typ=typ)

    def do_POST(self):
        teile = urllib.parse.urlsplit(self.path)
        q = urllib.parse.parse_qs(teile.query)
        laenge = min(int(self.headers.get("Content-Length") or 0), 1024 * 1024)
        body = self.rfile.read(laenge) if laenge else b""
        if teile.path == "/api/hr/neu":
            with sperre:
                aufraeumen()
                if len(sitzungen) > 200:
                    return self.antwort(503, {"ok": False, "fehler": "Zu viele offene Abrufe, bitte später."})
                sid = secrets.token_hex(16)
                jar = http.cookiejar.CookieJar()
                sitzungen[sid] = {"zeit": time.time(), "dateien": {},
                                  "oeffner": urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), NurPortal, OhneFehler)}
                return self.antwort(200, {"ok": True, "sitzung": sid, "abrufe": len(abrufe), "grenze": GRENZE})
        if teile.path != "/api/hr/http":
            return self.antwort(404, {"ok": False})
        s = self.sitzung(q)
        if not s:
            return self.antwort(400, {"ok": False, "fehler": "Sitzung abgelaufen, bitte neu abrufen."})
        url = q.get("url", [""])[0]
        if not (url == PORTAL or url.startswith(PORTAL + "/")):
            return self.antwort(400, {"ok": False, "fehler": "Nur das Registerportal ist erlaubt."})
        if q.get("zaehlt", [""])[0] == "1":
            with sperre:
                aufraeumen()
                if len(abrufe) >= GRENZE:
                    frei = int((FENSTER - (time.time() - min(abrufe))) / 60) + 1
                    return self.antwort(429, {"ok": False, "fehler": f"Stundengrenze des Registerportals erreicht ({GRENZE} Abrufe für das ganze Büro). Wieder möglich in etwa {frei} Minuten."})
                abrufe.append(time.time())
        kopf = {"User-Agent": AGENT, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "de-DE,de;q=0.9", "Accept-Encoding": "gzip, deflate"}
        ref = q.get("referer", [""])[0]
        if ref.startswith(PORTAL):
            kopf["Referer"] = ref
        if body:
            kopf["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
            if q.get("ajax", [""])[0] == "1":
                kopf["Faces-Request"], kopf["X-Requested-With"] = "partial/ajax", "XMLHttpRequest"
        try:
            with s["oeffner"].open(urllib.request.Request(url, data=body or None, headers=kopf), timeout=90) as r:
                daten = r.read(MAX_DATEI + 1)
                kod = (r.headers.get("Content-Encoding") or "").lower()
                status, ziel = r.status, r.geturl()
                typ, disp = r.headers.get("Content-Type") or "", r.headers.get("Content-Disposition") or ""
            if kod == "gzip":
                daten = gzip.decompress(daten)
            elif kod == "deflate":
                daten = zlib.decompress(daten)
        except Exception as e:
            print("Register Fehler:", type(e).__name__, e, flush=True)
            return self.antwort(502, {"ok": False, "fehler": f"Registerportal nicht erreichbar: {type(e).__name__}"})
        if len(daten) > MAX_DATEI:
            return self.antwort(413, {"ok": False, "fehler": "Datei zu groß."})
        aus = {"ok": True, "status": status, "url": ziel, "typ": typ, "disposition": disp}
        if daten[:5] != b"%PDF-" and "attachment" not in disp and any(t in typ for t in ("html", "xml", "text")):
            aus["text"] = daten.decode("utf-8", errors="replace")
        else:
            did = secrets.token_hex(16)
            with sperre:
                s["dateien"][did] = (daten, endung(daten, typ, disp))
            aus["datei"], aus["groesse"], aus["endung"] = did, len(daten), s["dateien"][did][1]
        return self.antwort(200, aus)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8081), Dienst).serve_forever()
