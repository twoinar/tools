"""Kleiner Mail-Dienst für die Tools: verschickt eine kurze Benachrichtigung, wenn ein Vorgesprächsbogen
abgelegt wurde. Läuft im Container „tools-mail“ und ist nur über tools-web erreichbar
(POST /api/mail/ablage, hinter dem Login). Empfänger und Text stehen hier fest, die Seite liefert nur
Vorgangsnummer und Bogenart – der Dienst kann also nicht als offener Mailversand missbraucht werden.
Es werden keine Mandantendaten verschickt und nichts gespeichert.

Einstellungen aus /opt/tools/konfig/.env (bash aktualisieren.sh --mail):
MAIL_ABSENDER (Postfach, von dem die Mail kommt), MAIL_AN (Empfänger, mehrere durch Komma getrennt) und
- Microsoft 365 über Microsoft Graph: GRAPH_TENANT, GRAPH_CLIENT_ID, GRAPH_SECRET (App-Registrierung mit der
  Anwendungsberechtigung Mail.Send), oder
- SMTP: MAIL_SERVER, MAIL_PORT (465 = SSL, sonst STARTTLS), MAIL_BENUTZER, MAIL_PASSWORT."""
import json, os, re, smtplib, ssl, time, urllib.parse, urllib.request
from datetime import datetime
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from zoneinfo import ZoneInfo

E_ = lambda k, d="": os.environ.get(k, d).strip().strip("'\"")
BOEGEN = {"klassisch": "Vorgesprächsbogen (klassisch)", "maske": "Vorgesprächsbogen (Maske)"}
VORGANG = re.compile(r"^[0-9A-Za-z][0-9A-Za-z /._-]{0,29}$")
GRENZE, FENSTER, zeiten = 120, 3600, []          # höchstens 120 Mails pro Stunde


def text(vorgang, bogen, erneut):
    try:
        jetzt = datetime.now(ZoneInfo("Europe/Berlin"))
    except Exception:                       # ohne Zeitzonendaten im Container: Serverzeit
        jetzt = datetime.now()
    return (f"Vorgespräch {vorgang} abgelegt",
            f"Guten Tag,\n\nder {BOEGEN[bogen]} zu Vorgang {vorgang} wurde am {jetzt:%d.%m.%Y} um {jetzt:%H:%M} Uhr "
            f"{'erneut ' if erneut else ''}in den Vorgang abgelegt.\n\nDiese Nachricht wurde automatisch verschickt.\n")


def graph(an, betreff, inhalt):
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
    holen(f"https://graph.microsoft.com/v1.0/users/{urllib.parse.quote(E_('MAIL_ABSENDER'))}/sendMail",
          json.dumps(nachricht).encode(), {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})


def eingerichtet():
    return bool(E_("MAIL_AN") and (E_("GRAPH_CLIENT_ID") and E_("MAIL_ABSENDER") or E_("MAIL_SERVER")))


def senden(vorgang, bogen, erneut):
    an = [a.strip() for a in E_("MAIL_AN").split(",") if a.strip()]
    betreff, inhalt = text(vorgang, bogen, erneut)
    if E_("GRAPH_CLIENT_ID"):
        graph(an, betreff, inhalt)
        return an
    m = EmailMessage()
    m["From"], m["To"] = E_("MAIL_ABSENDER") or E_("MAIL_BENUTZER"), ", ".join(an)
    m["Subject"] = betreff
    m["Date"], m["Message-ID"] = formatdate(localtime=True), make_msgid(domain="tools.notariat-woinar.de")
    m.set_content(inhalt)
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

    def do_POST(self):
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
