"""Kleiner Mail-Dienst für die Tools: verschickt eine kurze Benachrichtigung, wenn ein Vorgesprächsbogen
abgelegt wurde. Läuft im Container „tools-mail“ und ist nur über tools-web erreichbar
(POST /api/mail/ablage, hinter dem Login). Empfänger und Text stehen hier fest, die Seite liefert nur
Vorgangsnummer und Bogenart – der Dienst kann also nicht als offener Mailversand missbraucht werden.
Es werden keine Mandantendaten verschickt und nichts gespeichert.

Dazu „Vollzugsbogen direkt senden“ (POST /api/mail/vollzug, ebenfalls hinter dem Login): der Vollzugsbogen geht
als PDF an Mitarbeiter. Empfänger nur aus dem eigenen Haus (MAIL_DOMAIN, Vorgabe notar-woinar.de), höchstens 10,
PDF bis 3 MB. Der Bogen enthält Namen von Beteiligten; er wird nur durchgereicht, nicht gespeichert.
GET /api/mail/status sagt der Seite, ob der Versand eingerichtet ist.

Einstellungen aus /opt/tools/konfig/.env (bash aktualisieren.sh --mail):
MAIL_ABSENDER (Postfach, von dem die Mail kommt), MAIL_AN (Empfänger, mehrere durch Komma getrennt) und
- Microsoft 365 über Microsoft Graph: GRAPH_TENANT, GRAPH_CLIENT_ID, GRAPH_SECRET (App-Registrierung mit der
  Anwendungsberechtigung Mail.Send), oder
- SMTP: MAIL_SERVER, MAIL_PORT (465 = SSL, sonst STARTTLS), MAIL_BENUTZER, MAIL_PASSWORT."""
import base64, json, os, re, smtplib, ssl, time, urllib.parse, urllib.request
from datetime import datetime
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from zoneinfo import ZoneInfo

E_ = lambda k, d="": os.environ.get(k, d).strip().strip("'\"")
BOEGEN = {"klassisch": "Vorgesprächsbogen (klassisch)", "maske": "Vorgesprächsbogen (Maske)"}
VORGANG = re.compile(r"^[0-9A-Za-z][0-9A-Za-z /._-]{0,29}$")
GRENZE, FENSTER, zeiten = 120, 3600, []          # höchstens 120 Mails pro Stunde
ADRESSE = re.compile(r"^[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+)$")
DATEI = re.compile(r"^[^\\/:*?\"<>|\x00-\x1f]{1,120}\.pdf$")
MAX_PDF = 3 * 1024 * 1024


def text(vorgang, bogen, erneut):
    try:
        jetzt = datetime.now(ZoneInfo("Europe/Berlin"))
    except Exception:                       # ohne Zeitzonendaten im Container: Serverzeit
        jetzt = datetime.now()
    return (f"Vorgespräch {vorgang} abgelegt",
            f"Guten Tag,\n\nder {BOEGEN[bogen]} zu Vorgang {vorgang} wurde am {jetzt:%d.%m.%Y} um {jetzt:%H:%M} Uhr "
            f"{'erneut ' if erneut else ''}in den Vorgang abgelegt.\n\nDiese Nachricht wurde automatisch verschickt.\n")


def graph(an, betreff, inhalt, anhang=None):
    def holen(url, daten, kopf):
        r = urllib.request.Request(url, data=daten, headers=kopf, method="POST")
        with urllib.request.urlopen(r, timeout=20) as a:
            return a.read()
    tok = json.loads(holen(f"https://login.microsoftonline.com/{E_('GRAPH_TENANT')}/oauth2/v2.0/token",
                           urllib.parse.urlencode({"client_id": E_("GRAPH_CLIENT_ID"), "client_secret": E_("GRAPH_SECRET"),
                                                   "scope": "https://graph.microsoft.com/.default", "grant_type": "client_credentials"}).encode(),
                           {"Content-Type": "application/x-www-form-urlencoded"}))["access_token"]
    nachricht = {"message": {"subject": betreff, "body": {"contentType": "Text", "content": inhalt},
                             "toRecipients": [{"emailAddress": {"address": a}} for a in an]}, "saveToSentItems": True}
    if anhang:
        nachricht["message"]["attachments"] = [{"@odata.type": "#microsoft.graph.fileAttachment", "name": anhang[0],
                                                "contentType": "application/pdf", "contentBytes": base64.b64encode(anhang[1]).decode()}]
    holen(f"https://graph.microsoft.com/v1.0/users/{urllib.parse.quote(E_('MAIL_ABSENDER'))}/sendMail",
          json.dumps(nachricht).encode(), {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})


def eingerichtet():
    return bool(E_("MAIL_AN") and (E_("GRAPH_CLIENT_ID") and E_("MAIL_ABSENDER") or E_("MAIL_SERVER")))


def versand_eingerichtet():
    return bool(E_("GRAPH_CLIENT_ID") and E_("MAIL_ABSENDER") or E_("MAIL_SERVER"))


def senden(vorgang, bogen, erneut):
    an = [a.strip() for a in E_("MAIL_AN").split(",") if a.strip()]
    betreff, inhalt = text(vorgang, bogen, erneut)
    return verschicken(an, betreff, inhalt)


def verschicken(an, betreff, inhalt, anhang=None):
    if E_("GRAPH_CLIENT_ID"):
        graph(an, betreff, inhalt, anhang)
        return an
    m = EmailMessage()
    m["From"], m["To"] = E_("MAIL_ABSENDER") or E_("MAIL_BENUTZER"), ", ".join(an)
    m["Subject"] = betreff
    m["Date"], m["Message-ID"] = formatdate(localtime=True), make_msgid(domain="tools.notariat-woinar.de")
    m.set_content(inhalt)
    if anhang:
        m.add_attachment(anhang[1], maintype="application", subtype="pdf", filename=anhang[0])
    port, ctx = int(E_("MAIL_PORT", "587") or 587), ssl.create_default_context()
    s = smtplib.SMTP_SSL(E_("MAIL_SERVER"), port, context=ctx, timeout=20) if port == 465 else smtplib.SMTP(E_("MAIL_SERVER"), port, timeout=20)
    with s:
        if port != 465:
            s.starttls(context=ctx)
        if E_("MAIL_BENUTZER"):
            s.login(E_("MAIL_BENUTZER"), E_("MAIL_PASSWORT"))
        s.send_message(m)
    return an


class Dienst(BaseHTTPRequestHandler):
    def antwort(self, code, daten):
        roh = json.dumps(daten, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(roh)))
        self.end_headers()
        self.wfile.write(roh)

    def do_GET(self):
        if self.path != "/api/mail/status":
            return self.antwort(404, {"fehler": "unbekannt"})
        return self.antwort(200, {"vollzug": versand_eingerichtet(), "absender": E_("MAIL_ABSENDER")})

    def vollzug(self):
        try:
            d = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length") or 0), 6 * 1024 * 1024)) or b"{}")
            pdf = base64.b64decode(str(d.get("pdf", "")), validate=True)
        except Exception:
            return self.antwort(400, {"fehler": "ungültige Anfrage"})
        domain = E_("MAIL_DOMAIN", "notar-woinar.de").lower()
        an = [str(a).strip() for a in (d.get("an") or []) if str(a).strip()]
        if not an or len(an) > 10 or any(not ADRESSE.match(a) or ADRESSE.match(a).group(1).lower() != domain for a in an):
            return self.antwort(400, {"fehler": f"Empfänger nur mit Adressen @{domain}"})
        name = str(d.get("dateiname", "")).strip()
        if not DATEI.match(name) or pdf[:5] != b"%PDF-" or len(pdf) > MAX_PDF:
            return self.antwort(400, {"fehler": "Anhang ungültig oder größer als 3 MB"})
        betreff = re.sub(r"[\r\n]+", " ", str(d.get("betreff", "")))[:200].strip() or "Vollzugsbogen"
        inhalt = str(d.get("text", ""))[:5000]
        if not versand_eingerichtet():
            return self.antwort(503, {"fehler": "Mailversand auf dem Server noch nicht eingerichtet"})
        jetzt = time.time()
        zeiten[:] = [z for z in zeiten if jetzt - z < FENSTER]
        if len(zeiten) >= GRENZE:
            return self.antwort(429, {"fehler": "zu viele Mails in der letzten Stunde"})
        zeiten.append(jetzt)
        try:
            verschicken(an, betreff, inhalt, (name, pdf))
        except Exception as e:
            mehr = e.read().decode(errors="replace")[:500] if hasattr(e, "read") else ""
            print("Versand fehlgeschlagen:", type(e).__name__, e, mehr, flush=True)
            return self.antwort(502, {"fehler": f"Versand fehlgeschlagen ({type(e).__name__})"})
        print(f"Vollzugsbogen an {len(an)} Empfänger verschickt", flush=True)
        return self.antwort(200, {"ok": True, "an": an})

    def do_POST(self):
        if self.path == "/api/mail/vollzug":
            return self.vollzug()
        if self.path != "/api/mail/ablage":
            return self.antwort(404, {"fehler": "unbekannt"})
        try:
            d = json.loads(self.rfile.read(min(int(self.headers.get("Content-Length") or 0), 2000)) or b"{}")
        except Exception:
            return self.antwort(400, {"fehler": "ungültige Anfrage"})
        vorgang, bogen = str(d.get("vorgang", "")).strip(), str(d.get("bogen", ""))
        if not VORGANG.match(vorgang) or bogen not in BOEGEN:
            return self.antwort(400, {"fehler": "Vorgangsnummer oder Bogen ungültig"})
        if not eingerichtet():
            return self.antwort(503, {"fehler": "Mailversand auf dem Server noch nicht eingerichtet"})
        jetzt = time.time()
        zeiten[:] = [z for z in zeiten if jetzt - z < FENSTER]
        if len(zeiten) >= GRENZE:
            return self.antwort(429, {"fehler": "zu viele Benachrichtigungen in der letzten Stunde"})
        zeiten.append(jetzt)
        try:
            an = senden(vorgang, bogen, bool(d.get("erneut")))
        except Exception as e:
            mehr = e.read().decode(errors="replace")[:500] if hasattr(e, "read") else ""
            print("Versand fehlgeschlagen:", type(e).__name__, e, mehr, flush=True)
            return self.antwort(502, {"fehler": f"Versand fehlgeschlagen ({type(e).__name__})"})
        print(f"Benachrichtigung zu Vorgang {vorgang} verschickt", flush=True)
        return self.antwort(200, {"ok": True, "an": an})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Dienst).serve_forever()
