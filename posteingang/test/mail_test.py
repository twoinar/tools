# -*- coding: utf-8 -*-
"""Test des E-Mail-Abrufs gegen ein nachgebautes Microsoft Graph (läuft lokal, nur erfundene Mails).

Prüft: Anmeldung, Abholen, PDF aus Text + PDF-/Bild-Anhängen, Word-Anhang daneben, .eml-Sicherung,
Einsortieren (UVZ im Betreff, Vorgang im Text, unklar), Absender/Betreff im Protokoll, gelesen +
Verschieben nach „Verarbeitet“, keine doppelte Abholung, nie Löschen/Senden.
"""
import base64, csv, json, os, sys, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

if os.name != "nt":   # unter Windows (Build) wird die echte DPAPI-Verschlüsselung mitgeprüft
    os.environ["POSTEINGANG_TEST_OHNE_DPAPI"] = "1"
srv_port = [0]
os.environ["POSTEINGANG_GRAPH_URL"] = "http://127.0.0.1:{port}/v1.0"
os.environ["POSTEINGANG_LOGIN_URL"] = "http://127.0.0.1:{port}"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

try:
    import pymupdf as fitz
except ImportError:
    import fitz

POSTFACH = "post@notar-woinar.de"
JETZT = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 600))


def pdf_mit(text):
    d = fitz.open()
    p = d.new_page()
    p.insert_text((72, 90), "Amtsgericht Beispielstadt - Grundbuchamt", fontsize=11)
    y = 130
    for z in text.split("\n"):
        p.insert_text((72, y), z, fontsize=11)
        y += 16
    b = d.tobytes()
    d.close()
    return b


def png():
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 60, 40), False)
    pix.set_rect(pix.irect, (200, 30, 30))
    return pix.tobytes("png")


MAILS = [
    {"id": "AAA1", "internetMessageId": "<1@test>", "subject": "UVZ 539/2026 – Eintragungsnachricht",
     "from": {"emailAddress": {"name": "Grundbuchamt Beispielstadt", "address": "gba@justiz.example"}},
     "toRecipients": [{"emailAddress": {"name": "Notariat", "address": POSTFACH}}], "ccRecipients": [],
     "receivedDateTime": JETZT, "hasAttachments": True,
     "body": {"contentType": "text", "content": "Sehr geehrter Herr Notar,\r\n\r\nanbei die Eintragungsnachricht.\r\n\r\nMit freundlichen Grüßen\r\nGrundbuchamt"},
     "_anh": [("Eintragungsnachricht.pdf", pdf_mit("Eintragungsnachricht\nIhr Zeichen: UVZ 539/2026\nDie Eintragung ist erfolgt.")),
              ("Foto.png", png()), ("Stellungnahme.docx", b"PK\x03\x04erfunden")]},
    {"id": "AAA2", "internetMessageId": "<2@test>", "subject": "Rückfrage Kaufvertrag",
     "from": {"emailAddress": {"name": "Erika Musterfrau", "address": "erika@example.org"}},
     "toRecipients": [{"emailAddress": {"name": "", "address": POSTFACH}}], "ccRecipients": [],
     "receivedDateTime": JETZT, "hasAttachments": False,
     "body": {"contentType": "text", "content": "Guten Tag,\n\nzu Ihrem Vorgang 30471 habe ich noch eine Frage zum Termin.\n\nViele Grüße\nErika Musterfrau"}},
    {"id": "AAA3", "internetMessageId": "<3@test>", "subject": "Newsletter November",
     "from": {"emailAddress": {"name": "Verlag", "address": "info@verlag.example"}},
     "toRecipients": [], "ccRecipients": [], "receivedDateTime": JETZT, "hasAttachments": False,
     "body": {"contentType": "html", "content": "<html><head><style>p{}</style></head><body><p>Neues aus der Praxis.</p><script>x()</script></body></html>"}},
]
POST = {m["id"]: m for m in MAILS}
LOG = []
ORDNER = {}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _antwort(self, code, daten=None, roh=None):
        b = roh if roh is not None else json.dumps(daten or {}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _pruefe(self):
        if self.headers.get("Authorization") != "Bearer TESTTOKEN":
            self._antwort(401, {"error": {"message": "kein Token"}})
            return False
        return True

    def do_POST(self):
        laenge = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(laenge)
        u = urlparse(self.path)
        LOG.append(("POST", unquote(u.path)))
        if u.path.endswith("/oauth2/v2.0/token"):
            f = parse_qs(body.decode())
            if f.get("client_secret") == ["geheim"] and f.get("grant_type") == ["client_credentials"]:
                return self._antwort(200, {"access_token": "TESTTOKEN", "expires_in": 3600})
            return self._antwort(401, {"error_description": "falsches Secret"})
        if not self._pruefe():
            return
        teile = unquote(u.path).split("/")
        if u.path.endswith("/mailFolders"):
            name = json.loads(body)["displayName"]
            ORDNER[name] = "F-" + name
            return self._antwort(201, {"id": ORDNER[name], "displayName": name})
        if teile[-1] == "move":
            mid = teile[-2]
            POST[mid]["_ordner"] = json.loads(body)["destinationId"]
            return self._antwort(201, {"id": mid})
        self._antwort(404, {"error": {"message": "unbekannt"}})

    def do_PATCH(self):
        laenge = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(laenge))
        LOG.append(("PATCH", unquote(urlparse(self.path).path)))
        if not self._pruefe():
            return
        mid = unquote(urlparse(self.path).path).split("/")[-1]
        POST[mid].update(body)
        self._antwort(200, {"id": mid})

    def do_DELETE(self):
        LOG.append(("DELETE", self.path))
        self._antwort(405)

    def do_GET(self):
        u = urlparse(self.path)
        pfad = unquote(u.path)
        LOG.append(("GET", pfad))
        if not self._pruefe():
            return
        assert f"/users/{POSTFACH}/" in pfad, pfad
        rest = pfad.split(f"/users/{POSTFACH}", 1)[1]
        q = parse_qs(u.query)
        if rest == "/mailFolders/inbox/messages":
            liste = [{k: v for k, v in m.items() if not k.startswith("_")} for m in MAILS if not m.get("_ordner")]
            return self._antwort(200, {"value": liste[: int(q.get("$top", ["10"])[0])]})
        if rest == "/mailFolders/inbox":
            return self._antwort(200, {"totalItemCount": len(MAILS), "unreadItemCount": 1})
        if rest == "/mailFolders":
            name = q["$filter"][0].split("'")[1]
            return self._antwort(200, {"value": [{"id": ORDNER[name], "displayName": name}] if name in ORDNER else []})
        t = rest.strip("/").split("/")
        if t[0] == "messages":
            m = POST[t[1]]
            if len(t) == 3 and t[2] == "$value":
                return self._antwort(200, roh=f"Subject: {m['subject']}\r\n\r\nerfundene Mail\r\n".encode())
            if len(t) == 3 and t[2] == "attachments":
                return self._antwort(200, {"value": [
                    {"@odata.type": "#microsoft.graph.fileAttachment", "id": f"A{i}", "name": n, "isInline": False,
                     "contentType": "application/octet-stream", "size": len(b)} for i, (n, b) in enumerate(m.get("_anh", []))]})
            if len(t) == 4 and t[2] == "attachments":
                n, b = m["_anh"][int(t[3][1:])]
                return self._antwort(200, {"@odata.type": "#microsoft.graph.fileAttachment", "name": n,
                                           "contentBytes": base64.b64encode(b).decode()})
        self._antwort(404, {"error": {"message": "unbekannt " + rest}})


def main():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
    port = srv.server_address[1]
    for k in ("POSTEINGANG_GRAPH_URL", "POSTEINGANG_LOGIN_URL"):
        os.environ[k] = os.environ[k].replace("{port}", str(port))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    import mailabruf
    mailabruf.GRAPH = os.environ["POSTEINGANG_GRAPH_URL"]
    mailabruf.LOGIN = os.environ["POSTEINGANG_LOGIN_URL"]
    import posteingang as P

    tmp = tempfile.mkdtemp()
    os.environ["APPDATA"] = os.path.join(tmp, "AppData")
    Y = os.path.join(tmp, "Y")
    for d in [os.path.join(Y, "Posteingang"), os.path.join(Y, "Scanner", "URKUNDEN", "Urkunden 2026"),
              os.path.join(Y, "Vorgänge", "30471 Musterfrau")]:
        os.makedirs(d, exist_ok=True)
    open(os.path.join(Y, "Scanner", "URKUNDEN", "Urkunden 2026", "W 539-2026.pdf"), "wb").close()
    e = P.lade_einstellungen()
    e.update(eingang=os.path.join(Y, "Posteingang"),
             ziel_urkunden=os.path.join(Y, "Posteingang", "Urkunden"),
             ziel_vorgaenge=os.path.join(Y, "Posteingang", "Vorgänge"),
             ziel_unklar=os.path.join(Y, "Posteingang", "Nicht zugeordnet"),
             archiv=os.path.join(Y, "Posteingang", "Original-Scans"),
             protokoll=os.path.join(Y, "Posteingang", "Protokoll"),
             ziel_dubletten=os.path.join(Y, "Posteingang", "Dubletten"),
             tageslisten=os.path.join(Y, "Posteingang", "Tageslisten"),
             urkunden_archiv=os.path.join(Y, "Scanner", "URKUNDEN", "Urkunden {jahr}"),
             vorgaenge_ordner=[os.path.join(Y, "Vorgänge")])
    e.setdefault("nebenakte", {})["export_ordner"] = os.path.join(Y, "Nebenakten-Export")
    ok = True

    def pruefe(name, bed, info=""):
        nonlocal ok
        print(f"{name}: {'OK' if bed else 'ABWEICHUNG'} {info}")
        ok = ok and bool(bed)

    # Ohne Zugang: nichts passiert, kein Netz
    pruefe("OHNE ZUGANG", P.mail_abrufen(e, jetzt=True) == 0 and not LOG)
    # Falsches Secret: Fehler wird gemeldet, Sortieren läuft weiter
    mailabruf.zugang_speichern({"postfach": POSTFACH, "tenant": "t-1", "client_id": "c-1", "secret": "falsch"})
    meldungen = []
    P._naechster_mailabruf[0] = 0
    P.durchlauf(e, ausgabe=meldungen.append)
    pruefe("FALSCHES SECRET", any("abgelehnt" in m for m in meldungen), meldungen[:1])
    mailabruf.zugang_speichern({"postfach": POSTFACH, "tenant": "t-1", "client_id": "c-1", "secret": "geheim"})
    P._naechster_mailabruf[0] = 0
    meldungen = []
    P.durchlauf(e, ausgabe=meldungen.append)
    print("\n".join("  " + m for m in meldungen))

    eingang = os.path.join(Y, "Posteingang")
    u = os.path.join(eingang, "Urkunden", "539-2026")
    v = os.path.join(eingang, "Vorgänge", "30471")
    nz = os.path.join(eingang, "Nicht zugeordnet")
    du = sorted(os.listdir(u)) if os.path.isdir(u) else []
    pruefe("URKUNDE AUS BETREFF", any(d.startswith("Mail ") and d.endswith(".pdf") for d in du), du)
    pruefe("WORD-ANHANG DANEBEN", any(d.endswith("Stellungnahme.docx") for d in du))
    pdf = [d for d in du if d.endswith(".pdf")]
    if pdf:
        with fitz.open(os.path.join(u, pdf[0])) as d:
            text = "\n".join(p.get_text() for p in d)
            seiten = len(d)
        pruefe("PDF MIT ANHÄNGEN", seiten == 3 and "Eintragungsnachricht" in text and "Grundbuchamt Beispielstadt" in text
               and "Stellungnahme.docx" in text and "Grüßen" in text, f"{seiten} Seiten")
    pruefe("VORGANG AUS TEXT", os.path.isdir(v) and any(d.startswith("Mail ") for d in os.listdir(v)))
    pruefe("UNKLAR", os.path.isdir(nz) and sum(d.startswith("Mail ") for d in os.listdir(nz)) == 1)
    rest = [d for d in os.listdir(eingang) if os.path.isfile(os.path.join(eingang, d))]
    pruefe("EINGANG LEER", not rest, rest)
    pruefe("ANHANG-ZWISCHENORDNER LEER", os.path.isdir(os.path.join(eingang, "Mail-Anhänge")) and not os.listdir(os.path.join(eingang, "Mail-Anhänge")))
    emls = [f for _, _, fs in os.walk(os.path.join(eingang, "Original-Mails")) for f in fs]
    pruefe("EML GESICHERT", len(emls) == 3, emls)
    proto = os.path.join(e["protokoll"], f"Protokoll {P.dt.date.today():%Y-%m}.csv")
    with open(proto, encoding="utf-8-sig", newline="") as f:
        z = list(csv.reader(f, delimiter=";"))[1:]
    b = {r[11]: r for r in z}
    gba, erika, news = (b.get("UVZ 539/2026 – Eintragungsnachricht"), b.get("Rückfrage Kaufvertrag"), b.get("Newsletter November"))
    pruefe("PROTOKOLL", len(z) == 3 and gba and erika and news and gba[9].startswith("Grundbuchamt Beispielstadt")
           and gba[3] == "Urkunde" and erika[3] == "Vorgang" and news[8] == "zuordnen", [(r[9], r[11], r[8]) for r in z])
    pruefe("KURZFASSUNG", erika and "Frage zum Termin" in erika[12], erika and erika[12][:80])
    pruefe("GELESEN + VERSCHOBEN", all(m.get("isRead") and m.get("_ordner") == "F-Verarbeitet" for m in MAILS))
    pruefe("NIE LÖSCHEN/SENDEN", not any(a == "DELETE" or "sendMail" in p or p.endswith("/send") for a, p in LOG))
    # Zweiter Abruf: nichts Neues, auch wenn eine Mail wieder im Posteingang auftaucht (z. B. zurückgeschoben)
    MAILS[1].pop("_ordner")
    P._naechster_mailabruf[0] = 0
    vorher = len(z)
    P.durchlauf(e, ausgabe=lambda m: None)
    with open(proto, encoding="utf-8-sig", newline="") as f:
        z2 = list(csv.reader(f, delimiter=";"))[1:]
    pruefe("KEINE DOPPELTE ABHOLUNG", len(z2) == vorher and MAILS[1].get("_ordner") == "F-Verarbeitet", (len(z2), vorher, MAILS[1].get("_ordner")))
    # Intervall: direkt danach kein neuer Abruf
    n = len(LOG)
    P.durchlauf(e, ausgabe=lambda m: None)
    pruefe("INTERVALL", len(LOG) == n)
    # Zugang liegt außerhalb des Programmordners (Update überschreibt ihn nicht)
    pruefe("ZUGANG IN APPDATA", mailabruf.zugang_pfad().startswith(os.environ["APPDATA"]))
    with open(mailabruf.zugang_pfad(), "rb") as f:
        roh = f.read()
    pruefe("ZUGANG VERSCHLÜSSELT", os.name != "nt" or b"geheim" not in roh)
    pruefe("ZUGANG LESBAR", mailabruf.zugang_laden()["secret"] == "geheim")
    # Zertifikat statt Secret (falls Netsys24 eines ausstellt): JWT muss mit dem Schlüssel prüfbar sein
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa, padding
        from cryptography.hazmat.primitives.serialization import pkcs12
        import datetime as dt
        k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        n = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Test")])
        c = (x509.CertificateBuilder().subject_name(n).issuer_name(n).public_key(k.public_key())
             .serial_number(1).not_valid_before(dt.datetime(2026, 1, 1)).not_valid_after(dt.datetime(2030, 1, 1))
             .sign(k, hashes.SHA256()))
        pfx = os.path.join(tmp, "test.pfx")
        with open(pfx, "wb") as f:
            f.write(pkcs12.serialize_key_and_certificates(b"t", k, c, None, serialization.BestAvailableEncryption(b"pw")))
        jwt = mailabruf._zertifikat_assertion({"zertifikat_pfx": pfx, "pfx_passwort": "pw", "client_id": "c-1"}, "https://x/token")
        a, b, sig = jwt.split(".")
        pad = lambda x: base64.urlsafe_b64decode(x + "=" * (-len(x) % 4))
        k.public_key().verify(pad(sig), (a + "." + b).encode(), padding.PKCS1v15(), hashes.SHA256())
        kopf = json.loads(pad(a))
        pruefe("ZERTIFIKAT", kopf["alg"] == "RS256" and pad(kopf["x5t"]) == c.fingerprint(hashes.SHA1())
               and json.loads(pad(b))["iss"] == "c-1")
    except ImportError:
        print("ZERTIFIKAT: übersprungen (cryptography fehlt)")
    srv.shutdown()
    print("\nGESAMT", "OK" if ok else "FEHLER")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
