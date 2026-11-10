# -*- coding: utf-8 -*-
"""
E-Mail-Abruf für den Postsortierer – Notariat Woinar

Holt neue E-Mails aus dem Büro-Postfach (z. B. post@notar-woinar.de) über Microsoft Graph ab,
macht aus jeder Mail eine PDF (Kopfzeilen + Text + PDF-/Bild-Anhänge) und legt sie nach
Y:\\Posteingang. Dort sortiert der Postsortierer sie wie einen Scan ein (ein Schreiben je Mail).

- Zugang (Tenant, Client-ID, Secret oder Zertifikat) liegt NUR auf dem Post-PC, verschlüsselt für den
  angemeldeten Windows-Benutzer (DPAPI) unter %APPDATA%\\Posteingang\\mail-zugang.dat.
  Einrichten: Posteingang-sortieren.exe --mail-einrichten
- Nach dem Abholen: als gelesen markieren und in den Ordner „Verarbeitet“ verschieben (einstellbar).
  Es wird nie etwas gelöscht oder gesendet.
- Die Original-Mail (.eml) kommt nach Y:\\Posteingang\\Original-Mails\\<Monat>.
"""
import base64
import datetime as dt
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

try:
    import pymupdf as fitz
except ImportError:
    import fitz

GRAPH = os.environ.get("POSTEINGANG_GRAPH_URL", "https://graph.microsoft.com/v1.0")
LOGIN = os.environ.get("POSTEINGANG_LOGIN_URL", "https://login.microsoftonline.com")
NUR_TEST_OHNE_DPAPI = os.environ.get("POSTEINGANG_TEST_OHNE_DPAPI") == "1"

STANDARD = {
    "nach_abholen": "verschieben",     # verschieben | markieren (Kategorie „Posteingang“) | nichts
    "ordner_verarbeitet": "Verarbeitet",
    "als_gelesen": True,
    "abruf_minuten": 2,
    "hoechstens_je_abruf": 25,
    "erstabruf_tage": 1,               # beim allerersten Abruf: Mails der letzten N Tage
    "anhang_typen_pdf": [".pdf"],
    "anhang_typen_bild": [".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".gif"],
}

SIDECAR_ENDUNG = ".mail.json"


# --------------------------------------------------------------------------- Zugang (lokal, verschlüsselt)

def zugang_pfad():
    basis = os.environ.get("APPDATA") or os.path.expanduser("~")
    return os.path.join(basis, "Posteingang", "mail-zugang.dat")


def _dpapi(daten, schuetzen):
    """Windows DPAPI (CryptProtectData/CryptUnprotectData), an den angemeldeten Benutzer gebunden."""
    if NUR_TEST_OHNE_DPAPI:
        return daten
    import ctypes
    from ctypes import wintypes

    class BLOB(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    puffer = ctypes.create_string_buffer(daten, len(daten))
    ein = BLOB(len(daten), ctypes.cast(puffer, ctypes.POINTER(ctypes.c_char)))
    aus = BLOB()
    crypt = ctypes.windll.crypt32
    f = crypt.CryptProtectData if schuetzen else crypt.CryptUnprotectData
    if not f(ctypes.byref(ein), None, None, None, None, 0x1, ctypes.byref(aus)):  # 0x1 = UI_FORBIDDEN
        raise OSError("Zugangsdaten konnten nicht ver-/entschlüsselt werden (anderer Windows-Benutzer?)")
    try:
        return ctypes.string_at(aus.pbData, aus.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(aus.pbData)


def zugang_speichern(z, pfad=None):
    pfad = pfad or zugang_pfad()
    os.makedirs(os.path.dirname(pfad), exist_ok=True)
    with open(pfad, "wb") as f:
        f.write(_dpapi(json.dumps(z).encode("utf-8"), True))


def zugang_laden(pfad=None):
    pfad = pfad or zugang_pfad()
    if not os.path.exists(pfad):
        return None
    with open(pfad, "rb") as f:
        return json.loads(_dpapi(f.read(), False).decode("utf-8"))


# --------------------------------------------------------------------------- Graph

class GraphFehler(Exception):
    pass


def _b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


def _zertifikat_assertion(z, token_url):
    """Client-Assertion (JWT, RS256) aus einer PFX-Datei, falls Netsys24 ein Zertifikat statt Secret gibt."""
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives.serialization import pkcs12
    with open(z["zertifikat_pfx"], "rb") as f:
        schluessel, zert, _ = pkcs12.load_key_and_certificates(f.read(), (z.get("pfx_passwort") or "").encode() or None)
    x5t = _b64url(zert.fingerprint(hashes.SHA1()))
    kopf = {"alg": "RS256", "typ": "JWT", "x5t": x5t}
    jetzt = int(time.time())
    inhalt = {"aud": token_url, "iss": z["client_id"], "sub": z["client_id"], "jti": str(uuid.uuid4()),
              "nbf": jetzt - 60, "exp": jetzt + 600}
    teil = _b64url(json.dumps(kopf).encode()) + "." + _b64url(json.dumps(inhalt).encode())
    sig = schluessel.sign(teil.encode(), padding.PKCS1v15(), hashes.SHA256())
    return teil + "." + _b64url(sig)


class Graph:
    def __init__(self, z):
        self.z = z
        self.token = None
        self.ablauf = 0
        self.postfach = urllib.parse.quote(z["postfach"])

    def _token(self):
        if self.token and time.time() < self.ablauf - 120:
            return self.token
        url = f"{LOGIN}/{self.z['tenant']}/oauth2/v2.0/token"
        felder = {"client_id": self.z["client_id"], "scope": "https://graph.microsoft.com/.default",
                  "grant_type": "client_credentials"}
        if self.z.get("zertifikat_pfx"):
            felder["client_assertion_type"] = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
            felder["client_assertion"] = _zertifikat_assertion(self.z, url)
        else:
            felder["client_secret"] = self.z["secret"]
        req = urllib.request.Request(url, data=urllib.parse.urlencode(felder).encode(), method="POST")
        try:
            with urllib.request.urlopen(req, timeout=30) as a:
                d = json.loads(a.read())
        except urllib.error.HTTPError as ex:
            raise GraphFehler(f"Anmeldung bei Microsoft abgelehnt ({ex.code}): {_fehlertext(ex)}")
        self.token = d["access_token"]
        self.ablauf = time.time() + int(d.get("expires_in", 3600))
        return self.token

    def anfrage(self, methode, pfad, daten=None, roh=False, kopf=None):
        url = pfad if pfad.startswith("http") else f"{GRAPH}/users/{self.postfach}{pfad}"
        h = {"Authorization": "Bearer " + self._token(), "Prefer": 'IdType="ImmutableId"'}
        h.update(kopf or {})
        body = None
        if daten is not None:
            body = json.dumps(daten).encode()
            h["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=body, headers=h, method=methode)
        try:
            with urllib.request.urlopen(req, timeout=120) as a:
                inhalt = a.read()
        except urllib.error.HTTPError as ex:
            raise GraphFehler(f"{methode} {pfad.split('?')[0]}: {ex.code} {_fehlertext(ex)}")
        if roh:
            return inhalt
        return json.loads(inhalt) if inhalt else {}


def _fehlertext(ex):
    try:
        d = json.loads(ex.read())
        return (d.get("error_description") or d.get("error", {}).get("message") or "")[:300]
    except Exception:
        return ""


# --------------------------------------------------------------------------- Zustand

def zustand_pfad(e):
    return os.path.join(e["protokoll"], "Mail-Abruf.json")


def zustand_laden(e):
    try:
        with open(zustand_pfad(e), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def zustand_speichern(e, z):
    os.makedirs(e["protokoll"], exist_ok=True)
    grenze = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=60)).isoformat()
    aus = dict(z, erledigt={k: v for k, v in z.get("erledigt", {}).items() if v >= grenze})
    tmp = zustand_pfad(e) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(aus, f, ensure_ascii=False, indent=1)
    os.replace(tmp, zustand_pfad(e))


# --------------------------------------------------------------------------- Mail → PDF

def _adresse(a):
    a = (a or {}).get("emailAddress") or {}
    name, mail = a.get("name") or "", a.get("address") or ""
    if name and mail and name.lower() != mail.lower():
        return f"{name} <{mail}>"
    return name or mail


def _html(t):
    return (t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _ortszeit(iso):
    try:
        t = dt.datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return t.astimezone()   # Zeitzone des PCs (Europe/Berlin)
    except Exception:
        return dt.datetime.now()


def mail_als_pdf(m, anhaenge, cfg):
    """Gibt (fitz.Document, nicht_umgewandelte_anhaenge[(name, bytes)]) zurück."""
    zeit = _ortszeit(m.get("receivedDateTime", ""))
    kopf = [("Von", _adresse(m.get("from"))),
            ("An", ", ".join(_adresse(x) for x in m.get("toRecipients", []))),
            ("Cc", ", ".join(_adresse(x) for x in m.get("ccRecipients", []))),
            ("Datum", zeit.strftime("%d.%m.%Y %H:%M Uhr")),
            ("Betreff", m.get("subject") or "(ohne Betreff)")]
    pdf_anh, bild_anh, rest = [], [], []
    for name, daten in anhaenge:
        endung = os.path.splitext(name)[1].lower()
        if endung in cfg["anhang_typen_pdf"]:
            pdf_anh.append((name, daten))
        elif endung in cfg["anhang_typen_bild"]:
            bild_anh.append((name, daten))
        else:
            rest.append((name, daten))
    if anhaenge:
        kopf.append(("Anhänge", ", ".join(n for n, _ in anhaenge)))
    text = (m.get("body") or {}).get("content") or ""
    if (m.get("body") or {}).get("contentType", "text").lower() == "html":
        text = _html_zu_text(text)
    text = re.sub(r"\r\n?", "\n", text).strip()

    html = ["<p style='font-size:9pt;color:#555'>E-Mail an das Notariat, abgeholt aus dem Postfach</p>",
            "<table style='font-size:10pt;margin-bottom:8pt'>"]
    for k, v in kopf:
        if v:
            html.append(f"<tr><td style='font-weight:bold;padding-right:8pt;vertical-align:top'>{k}:</td>"
                        f"<td>{_html(v)}</td></tr>")
    html.append("</table><hr/>")
    for absatz in re.split(r"\n\s*\n", text) or [""]:
        html.append("<p style='font-size:10.5pt;margin:0 0 6pt 0'>" + _html(absatz).replace("\n", "<br/>") + "</p>")
    if rest:
        html.append("<hr/><p style='font-size:9pt'>Weitere Anhänge (liegen als Datei neben dieser PDF): "
                    + _html(", ".join(n for n, _ in rest)) + "</p>")

    import io
    story = fitz.Story("".join(html))
    flaeche = fitz.paper_rect("a4")
    rahmen = flaeche + (56, 56, -56, -56)
    puffer = io.BytesIO()
    schreiber = fitz.DocumentWriter(puffer)
    weiter = True
    while weiter:
        geraet = schreiber.begin_page(flaeche)
        weiter, _ = story.place(rahmen)
        story.draw(geraet)
        schreiber.end_page()
    schreiber.close()
    doc = fitz.open("pdf", puffer.getvalue())

    for name, daten in pdf_anh:
        try:
            with fitz.open("pdf", daten) as a:
                doc.insert_pdf(a)
        except Exception:
            rest.append((name, daten))
    for name, daten in bild_anh:
        try:
            with fitz.open(stream=daten, filetype=os.path.splitext(name)[1].lstrip(".").lower()) as b:
                with fitz.open("pdf", b.convert_to_pdf()) as a:
                    doc.insert_pdf(a)
        except Exception:
            rest.append((name, daten))
    return doc, rest


def _html_zu_text(h):
    h = re.sub(r"(?is)<(script|style|head)[^>]*>.*?</\1>", " ", h)
    h = re.sub(r"(?i)<br\s*/?>", "\n", h)
    h = re.sub(r"(?i)</(p|div|tr|li|h\d)>", "\n\n", h)
    h = re.sub(r"<[^>]+>", " ", h)
    import html as _h
    h = _h.unescape(h)
    h = re.sub(r"[ \t\u00a0]+", " ", h)
    return re.sub(r"\n\s*\n\s*(\n\s*)+", "\n\n", h)


def _dateiname(s, n=60):
    s = re.sub(r'[\\/:*?"<>|\r\n\t]+', " ", s or "").strip(" .")
    return re.sub(r"\s+", " ", s)[:n].strip(" .") or "Anhang"


# --------------------------------------------------------------------------- Abruf

def _ordner_id(g, name, cache):
    if name in cache:
        return cache[name]
    q = urllib.parse.quote(f"displayName eq '{name}'")
    d = g.anfrage("GET", f"/mailFolders?$filter={q}&$select=id,displayName")
    if d.get("value"):
        fid = d["value"][0]["id"]
    else:
        fid = g.anfrage("POST", "/mailFolders", {"displayName": name})["id"]
    cache[name] = fid
    return fid


def _anhaenge(g, mid):
    d = g.anfrage("GET", f"/messages/{mid}/attachments?$select=id,name,contentType,size,isInline")
    aus = []
    for a in d.get("value", []):
        typ = a.get("@odata.type", "")
        name = _dateiname(a.get("name") or "Anhang", 80)
        if a.get("isInline") and typ.endswith("fileAttachment") and (a.get("contentType") or "").startswith("image/"):
            continue   # Logos/Bilder aus der Signatur
        if typ.endswith("fileAttachment"):
            voll = g.anfrage("GET", f"/messages/{mid}/attachments/{a['id']}")
            aus.append((name, base64.b64decode(voll.get("contentBytes") or "")))
        elif typ.endswith("itemAttachment"):   # angehängte Mail
            roh = g.anfrage("GET", f"/messages/{mid}/attachments/{a['id']}/$value", roh=True)
            aus.append((name if name.lower().endswith(".eml") else name + ".eml", roh))
        # referenceAttachment (Link auf OneDrive): nur im Kopf genannt, nicht abrufbar
    return aus


def abrufen(e, ausgabe=print, zugang=None):
    """Holt neue Mails ab. Gibt die Zahl der abgelegten Mails zurück. Läuft unter der Sperre des Sortierers."""
    z = zugang or zugang_laden()
    if not z:
        return 0
    cfg = dict(STANDARD, **(e.get("mail") or {}))
    if cfg.get("aus"):
        return 0
    zust = zustand_laden(e)
    if not zust.get("seit"):
        zust["seit"] = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=cfg["erstabruf_tage"])).strftime("%Y-%m-%dT%H:%M:%SZ")
    erledigt = zust.setdefault("erledigt", {})
    g = Graph(z)
    filt = urllib.parse.quote(f"receivedDateTime ge {zust['seit']}")
    felder = "id,internetMessageId,subject,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments,body"
    pfad = (f"/mailFolders/inbox/messages?$filter={filt}&$orderby=receivedDateTime%20asc"
            f"&$top={int(cfg['hoechstens_je_abruf'])}&$select={felder}")
    d = g.anfrage("GET", pfad, kopf={"Prefer": 'IdType="ImmutableId", outlook.body-content-type="text"'})
    cache = {}
    anzahl = 0
    for m in d.get("value", []):
        schluessel = m.get("internetMessageId") or m["id"]
        if schluessel in erledigt:
            _nachbehandeln(g, m, cfg, cache, ausgabe)   # z. B. Verschieben war beim letzten Mal gescheitert
            continue
        anhaenge = _anhaenge(g, m["id"]) if m.get("hasAttachments") else []
        doc, rest = mail_als_pdf(m, anhaenge, cfg)
        zeit = _ortszeit(m.get("receivedDateTime", ""))
        kurz = hashlib.sha1(schluessel.encode("utf-8", "replace")).hexdigest()[:6]
        stamm = f"Mail_{zeit:%Y-%m-%d_%H-%M-%S}_{kurz}"
        eingang = e["eingang"]
        # Original-Mail (.eml) sichern, nie löschen
        archiv = os.path.join(e["eingang"], "Original-Mails", zeit.strftime("%Y-%m"))
        os.makedirs(archiv, exist_ok=True)
        eml = os.path.join(archiv, stamm + ".eml")
        try:
            with open(eml, "wb") as f:
                f.write(g.anfrage("GET", f"/messages/{m['id']}/$value", roh=True))
        except GraphFehler as ex:
            ausgabe(f"Mail-Original nicht gesichert ({ex}), Mail wird trotzdem abgelegt.")
            eml = ""
        # Anhänge, die keine PDF werden können (Word, Excel, …): bis zum Einsortieren neben die PDF
        rest_dateien = []
        if rest:
            ablage = os.path.join(eingang, "Mail-Anhänge", stamm)
            os.makedirs(ablage, exist_ok=True)
            for name, daten in rest:
                p = os.path.join(ablage, name)
                with open(p, "wb") as f:
                    f.write(daten)
                rest_dateien.append(p)
        meta = {"von": _adresse(m.get("from")), "von_adresse": ((m.get("from") or {}).get("emailAddress") or {}).get("address", ""),
                "betreff": m.get("subject") or "", "eingang": zeit.strftime("%Y-%m-%d %H-%M"),
                "eml": eml, "anhaenge": rest_dateien}
        # Erst die Begleitdatei, dann die PDF (der Sortierer nimmt nur fertige PDFs)
        with open(os.path.join(eingang, stamm + SIDECAR_ENDUNG), "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=1)
        tmp = os.path.join(eingang, stamm + ".pdf.tmp")
        doc.save(tmp, garbage=3, deflate=True)
        doc.close()
        ziel = os.path.join(eingang, stamm + ".pdf")
        os.replace(tmp, ziel)
        try:   # Dateizeit = Eingang der Mail (gilt für Dateinamen und Nebenakte)
            os.utime(ziel, (time.time(), zeit.timestamp()))
        except OSError:
            pass
        erledigt[schluessel] = m.get("receivedDateTime") or dt.datetime.now(dt.timezone.utc).isoformat()
        zustand_speichern(e, zust)
        anzahl += 1
        _nachbehandeln(g, m, cfg, cache, ausgabe)
    return anzahl


def _nachbehandeln(g, m, cfg, cache, ausgabe):
    try:
        if cfg["nach_abholen"] == "markieren":
            g.anfrage("PATCH", f"/messages/{m['id']}", {"categories": ["Posteingang"], **({"isRead": True} if cfg["als_gelesen"] else {})})
            return
        if cfg["als_gelesen"]:
            g.anfrage("PATCH", f"/messages/{m['id']}", {"isRead": True})
        if cfg["nach_abholen"] == "verschieben":
            g.anfrage("POST", f"/messages/{m['id']}/move", {"destinationId": _ordner_id(g, cfg["ordner_verarbeitet"], cache)})
    except GraphFehler as ex:
        ausgabe(f"Mail abgelegt, aber im Postfach nicht verschoben/markiert: {ex}")


def lies_begleitdatei(pdf_pfad):
    p = os.path.splitext(pdf_pfad)[0] + SIDECAR_ENDUNG
    if not os.path.exists(p):
        return None, None
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f), p
    except (OSError, ValueError):
        return None, p


# --------------------------------------------------------------------------- Einrichten

def einrichten(e):
    import getpass
    print("E-Mail-Abruf einrichten (die Angaben bleiben verschlüsselt auf diesem PC).")
    print("Wichtig: unter dem Windows-Benutzer ausführen, unter dem das Sortieren läuft.\n")
    alt = zugang_laden() or {}
    def frage(text, schluessel, standard=""):
        vorschlag = alt.get(schluessel) or standard
        w = input(f"{text}" + (f" [{vorschlag}]" if vorschlag and schluessel != "secret" else "") + ": ").strip()
        return w or vorschlag
    z = {"postfach": frage("Postfach", "postfach", "post@notar-woinar.de"),
         "tenant": frage("Tenant-ID (Verzeichnis-ID)", "tenant"),
         "client_id": frage("Client-ID (Anwendungs-ID)", "client_id")}
    pfx = input("Zertifikat (PFX-Datei) – leer lassen, wenn ein Secret verwendet wird: ").strip().strip('"')
    if pfx:
        z["zertifikat_pfx"] = pfx
        z["pfx_passwort"] = getpass.getpass("Kennwort der PFX-Datei (unsichtbar, ggf. leer): ")
    else:
        z["secret"] = getpass.getpass("Client-Secret (Eingabe unsichtbar): ").strip() or alt.get("secret", "")
    print("\nVerbindung wird geprüft …")
    try:
        g = Graph(z)
        d = g.anfrage("GET", "/mailFolders/inbox?$select=totalItemCount,unreadItemCount")
        print(f"Verbindung in Ordnung: Posteingang mit {d.get('totalItemCount', '?')} Mails "
              f"({d.get('unreadItemCount', '?')} ungelesen).")
    except Exception as ex:
        print("Verbindung fehlgeschlagen:", ex)
        if input("Trotzdem speichern? (j/n): ").strip().lower() != "j":
            return False
    zugang_speichern(z)
    print("Gespeichert unter", zugang_pfad())
    print("Das Sortieren holt jetzt alle paar Minuten neue Mails ab (beim ersten Mal die des letzten Tages).")
    return True


def ausschalten():
    p = zugang_pfad()
    if os.path.exists(p):
        os.remove(p)
        print("E-Mail-Abruf auf diesem PC ausgeschaltet (Zugangsdaten gelöscht).")
    else:
        print("E-Mail-Abruf war auf diesem PC nicht eingerichtet.")


if __name__ == "__main__":
    print("Bitte über Posteingang-sortieren.exe --mail-einrichten aufrufen.")
    sys.exit(1)
