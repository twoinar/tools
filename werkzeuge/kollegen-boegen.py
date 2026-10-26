#!/usr/bin/env python3
"""
Erzeugt die Kollegen-Fassung aller Bögen (boegen/) aus Thomas' Bögen in twoinar/boegen.

    python3 werkzeuge/kollegen-boegen.py <Ordner von twoinar/boegen>

Thomas' Bögen sind die Vorlage; jede Änderung dort kommt so auch bei den Kollegen an. Ersetzt werden nur
die Daten des Notariats Woinar (Briefkopf, Auftragstext, Fußzeilen, Mitarbeiter, Gruß) durch die
Notardaten aus boegen/notar.js, dazu die Teile, die nur hinter dem Login des Notariats funktionieren
(KI über den Server, Mail-Benachrichtigung): Die Kollegen nutzen die KI mit eigenem API-Schlüssel.
Die PDF-Vorlage des klassischen Bogens (ohne Briefkopf) bleibt die der Kollegen-Fassung.

Jede Ersetzung muss genau so oft passen wie angegeben, sonst bricht das Skript ab – dann hat sich die
Quelle geändert und das Skript muss angepasst werden. Zum Schluss wird geprüft, dass keine Daten des
Notariats Woinar übrig sind.
"""
import base64, re, subprocess, sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ZIEL = REPO / "boegen"

KOPF_ALT = '''    <div class="name"><h1>Thomas Woinar</h1><p>Notar</p></div>
    <div class="kontakt">Gubener Str. 14 · 15230 Frankfurt (Oder)<br>
      Tel. (0335) 500 86 35 · Fax (0335) 500 86 39<br>
      <b>notar@woinar.com</b> · www.notar-woinar.de</div>'''
KOPF_NEU = '''    <div class="name"><h1 data-notar="name"></h1><p data-notar="amt"></p></div>
    <div class="kontakt" data-notar="kontakt"></div>'''
NOTARDATEN_KNOPF = '  <button type="button" id="btnNotar" title="Name, Anschrift und Mitarbeiter des Notariats">Notardaten</button>\n'
MITARBEITER_MUSTER = (r'/\* ---------- E-Mail an Mitarbeiter \(Outlook-Entwurf mit Anhang\) ----------\n'
                      r'   Mitarbeiterliste hier pflegen: Name und E-Mail-Adresse\. *\*/\n'
                      r'const MITARBEITER = \[\n(?:  \[.*\],\n)+\];\n')
MITARBEITER_NEU = ('/* ---------- E-Mail an Mitarbeiter (Outlook-Entwurf mit Anhang) ----------\n'
                   '   Die Mitarbeiter kommen aus den Notardaten (notar.js).                    */\n'
                   'let MITARBEITER = [];\n')
MAILLISTE_ALT = '''MITARBEITER.forEach(([n,a])=>{
  const l=document.createElement("label"); l.className="cb";
  l.innerHTML='<input type="checkbox"><span></span><small></small>';
  l.querySelector("input").value=a; l.querySelector("span").textContent=n; l.querySelector("small").textContent=a;
  mailListe.appendChild(l);
});'''
MAILLISTE_NEU = '''function mailListeAufbauen(){
  MITARBEITER = notarMitarbeiter();
  mailListe.textContent = "";
  MITARBEITER.forEach(([n,a])=>{
    const l=document.createElement("label"); l.className="cb";
    l.innerHTML='<input type="checkbox"><span></span><small></small>';
    l.querySelector("input").value=a; l.querySelector("span").textContent=n; l.querySelector("small").textContent=a;
    mailListe.appendChild(l);
  });
  return MITARBEITER.length > 0;
}'''
OHNE_MITARBEITER = '  if (!mailListeAufbauen()){ meldung("Bitte zuerst unter „Notardaten“ die Mitarbeiter mit E-Mail-Adresse eintragen.","err"); return; }\n'

# Übrig bleiben dürfen nur technische Schlüssel (WoinarVorgespraech, woinar-bedarfsbewertung …) und die
# gemeinsame Adresse tools.notariat-woinar.de (Kostenrechner, dort liegen auch die Kollegen-Bögen).
VERBOTEN = ["Thomas Woinar", "Notariats Thomas", "Gubener", "500 86", "notar@woinar", "@notar-woinar.de",
            '"/api/', "localhost:8766", "Claude-Fenster", "tools.notariat-woinar.de/boegen/"]


class Datei:
    def __init__(self, name, text):
        self.name, self.s = name, text

    def ersetzen(self, alt, neu, anzahl=1):
        n = self.s.count(alt)
        if n != anzahl:
            sys.exit(f"{self.name}: erwartet {anzahl}x, gefunden {n}x: {alt[:90]!r}")
        self.s = self.s.replace(alt, neu)

    def muster(self, muster, neu, anzahl=1, flags=0):
        self.s, n = re.subn(muster, lambda _: neu, self.s, flags=flags)
        if n != anzahl:
            sys.exit(f"{self.name}: Muster {anzahl}x erwartet, {n}x gefunden: {muster[:90]!r}")

    def zwischen(self, anfang, ende, neu):
        """Ersetzt den Text von anfang (einschließlich) bis ende (ausschließlich)."""
        i = self.s.find(anfang)
        j = self.s.find(ende, i)
        if i < 0 or j < 0 or self.s.count(anfang) != 1:
            sys.exit(f"{self.name}: Abschnitt nicht eindeutig: {anfang[:60]!r}")
        self.s = self.s[:i] + neu + self.s[j:]


def modul_lesen(html, id_):
    m = re.search(rf'<script type="text/plain" id="{id_}">([^<]+)</script>', html)
    if not m:
        sys.exit(f"Modul {id_} nicht gefunden")
    return base64.b64decode(m.group(1).strip()).decode("utf-8")


def modul_setzen(d, id_, text):
    neu = base64.b64encode(text.encode("utf-8")).decode("ascii")
    d.muster(rf'<script type="text/plain" id="{id_}">[^<]+</script>', f'<script type="text/plain" id="{id_}">{neu}</script>')


def erbspiegel(text):
    d = Datei("Erbspiegel-Modul", text)
    d.ersetzen("<title>Erbspiegel – Notar Thomas Woinar</title>", "<title>Erbspiegel</title>")
    d.ersetzen("   Erbspiegel – Notar Thomas Woinar", "   Erbspiegel")
    d.ersetzen('const DATENSCHLUESSEL="WoinarErbspiegel";',
               '/* Fußzeile aus den Notardaten des Bogens (notar.js im umgebenden Fenster) */\n'
               'const notarFussText = () => { try{ return (parent !== window && parent.notarFuss) ? parent.notarFuss() : ""; }catch{ return ""; } };\n'
               'const DATENSCHLUESSEL="WoinarErbspiegel";')
    d.ersetzen('page.drawText(pdfText("Notar Thomas Woinar"),{x:W-M-fN.widthOfTextAtSize("Notar Thomas Woinar",6.5),y:ly-4,size:6.5,font:fN,color:GRAU});',
               'page.drawText(pdfText(notarFussText()),{x:W-M-fN.widthOfTextAtSize(pdfText(notarFussText()),6.5),y:ly-4,size:6.5,font:fN,color:GRAU});')
    d.ersetzen('doc.setAuthor("Notar Thomas Woinar");', 'if (notarFussText()) doc.setAuthor(pdfText(notarFussText()));')
    return d.s


def bewertung(text):
    d = Datei("Bewertungs-Modul", text)
    d.ersetzen("<title>Bedarfsbewertung – Notar Thomas Woinar</title>", "<title>Bedarfsbewertung</title>")
    d.ersetzen(KOPF_ALT, '''    <div class="name"><h1>Bedarfsbewertung</h1><p>Grundbesitz</p></div>
    <div class="kontakt"></div>''')
    d.ersetzen("Notar Thomas Woinar · Bedarfsbewertung Grundbesitz", "Bedarfsbewertung Grundbesitz")
    d.ersetzen(" – bitte Thomas Woinar Bescheid geben.", "")
    d.ersetzen("des Notariats Thomas Woinar in Frankfurt (Oder), Land Brandenburg", "eines Notariats im Land Brandenburg")
    # KI nur mit eigenem Schlüssel (Server und Claude-Fenster gibt es nur im Notariat Woinar)
    d.zwischen("/* Anfrage an Claude: zuerst über den Server", "let kiVerlauf = [];", '''/* Anfrage an Claude mit dem eigenen API-Schlüssel (einmal je Arbeitsplatz unter „? Hilfe“ → „API-Schlüssel“) */
const KI_OHNE = "Für die KI bitte zuerst unter „? Hilfe“ → „API-Schlüssel“ einen eigenen Schlüssel von Anthropic eintragen.";
async function kiSenden(body){
  const schl = kiSchl();
  if (!schl){ const k = document.getElementById("kiSchl"); if (k) k.hidden = false; throw Object.assign(new Error(KI_OHNE), { ohne:true }); }
  return fetch("https://api.anthropic.com/v1/messages", { method:"POST",
    headers:{ "content-type":"application/json", "x-api-key":schl, "anthropic-version":"2023-06-01",
              "anthropic-beta":"server-side-fallback-2026-07-01", "anthropic-dangerous-direct-browser-access":"true" }, body });
}
''')
    return d.s


def gemeinsam(d):
    """Teile, die im klassischen Bogen und in der Maske gleich sind."""
    d.ersetzen('title="Kopie für die Vorgangsakte, dort sucht auch das Claude-Fenster"', 'title="zusätzliche Kopie, z. B. für die Vorgangsakte"')
    ohne_benachrichtigung(d)
    d.ersetzen("(#vorgang=4711/2026, z. B. vom Claude-Fenster)", "(#vorgang=4711/2026)")


def ohne_benachrichtigung(d):
    """Die Mail-Benachrichtigung nach dem Ablegen gibt es nur auf dem Server des Notariats Woinar."""
    d.zwischen("async function ablageMelden(erneut){", "\n/* ---------- Entwurf automatisch sichern",
               "async function ablageMelden(erneut){}   // Kollegen-Fassung: keine Benachrichtigung über den Server\n")


def klassisch(quelle, alt):
    d = Datei("vorgespraech.html", quelle)
    d.ersetzen('<html lang="de">', '<html lang="de" data-titel="Vorgespräch">')
    d.ersetzen("<title>Vorgespräch – Notar Thomas Woinar</title>", '<title>Vorgespräch</title>\n<script src="notar.js"></script>')
    d.ersetzen('  <button type="button" class="primary" id="btnAblegen">', NOTARDATEN_KNOPF + '  <button type="button" class="primary" id="btnAblegen">')
    d.ersetzen(KOPF_ALT, KOPF_NEU)
    d.ersetzen('<p class="einleitung">Der Notar Thomas Woinar wird hiermit beauftragt und bevollmächtigt:</p>',
               '<p class="einleitung"><span data-notar="derdie">Der Notar</span> wird hiermit beauftragt und bevollmächtigt:</p>')
    d.ersetzen('<footer class="fuss">Notar Thomas Woinar · Sachverhaltsaufnahme und Entwurfsauftrag</footer>',
               '<footer class="fuss" data-notar="fuss" data-zusatz="Sachverhaltsaufnahme und Entwurfsauftrag">Sachverhaltsaufnahme und Entwurfsauftrag</footer>')
    # PDF-Vorlage ohne Briefkopf; Briefkopf, Auftragstext und Fußzeile schreibt notarInVorlage
    vorlage = re.search(r'const VORLAGE_B64 = "[^"]+";', alt)
    funktion = re.search(r'/\* Briefkopf, Auftragstext und Fußzeile aus den Notardaten in die PDF-Vorlage.*?\n}\n', alt, re.S)
    if not vorlage or not funktion:
        sys.exit("PDF-Vorlage oder notarInVorlage in der bisherigen Kollegen-Fassung nicht gefunden")
    d.muster(r'const VORLAGE_B64 = "[^"]+";', vorlage.group(0))
    m = re.search(r'const dateiname = \(\) => [^\n]*\n', d.s)
    if not m:
        sys.exit("dateiname nicht gefunden")
    d.s = d.s[:m.end()] + "\n" + funktion.group(0) + d.s[m.end():]
    d.ersetzen('  if (typeof erbspiegelMitnehmen === "function") await erbspiegelMitnehmen(doc);',
               '  await notarInVorlage(doc);\n  if (typeof erbspiegelMitnehmen === "function") await erbspiegelMitnehmen(doc);')
    # Mitarbeiter und Gruß aus den Notardaten
    d.muster(MITARBEITER_MUSTER + r'// standardmäßig angehakt:\nconst STANDARD_EMPFAENGER = \[[^\]]*\];\n', MITARBEITER_NEU + "\n")
    d.ersetzen(MAILLISTE_ALT, MAILLISTE_NEU)
    d.ersetzen('z.push("","Viele Grüße","Thomas Woinar");', 'z.push("","Viele Grüße",notarGruss());')
    d.ersetzen('  const zuletzt = STANDARD_EMPFAENGER;', OHNE_MITARBEITER + '  const zuletzt = notarStandardEmpfaenger();')
    # Fußzeilen der Berechnungsseiten, Fenstertitel der Einzelmodule
    d.ersetzen('seite.drawText("Notar Thomas Woinar", {x:W-M-fN.widthOfTextAtSize("Notar Thomas Woinar",7), y:M-24, size:7, font:fN, color:GRAU});',
               'seite.drawText(pdfText(notarFuss()), {x:W-M-fN.widthOfTextAtSize(pdfText(notarFuss()),7), y:M-24, size:7, font:fN, color:GRAU});', 2)
    d.ersetzen('  document.title = MOD.t + " – Notar Thomas Woinar";',
               '  document.documentElement.dataset.titel = MOD.t; document.title = MOD.t + (notarFuss() ? " – " + notarFuss() : "");')
    gemeinsam(d)
    # Module allgemein
    modul_setzen(d, "erbspiegelQuelle", erbspiegel(modul_lesen(d.s, "erbspiegelQuelle")))
    modul_setzen(d, "bewertungQuelle", bewertung(modul_lesen(d.s, "bewertungQuelle")))
    return d.s


def vollzug(quelle):
    d = Datei("vollzug.html", quelle)
    d.ersetzen('<html lang="de">', '<html lang="de" data-titel="Vollzugsbogen">')
    d.ersetzen("<title>Vollzugsbogen – Notar Thomas Woinar</title>", '<title>Vollzugsbogen</title>\n<script src="notar.js"></script>')
    # „Versand übernehmen“ gehört zum Word-Makro des Notariats Woinar
    d.ersetzen('<button type="button" id="btnVersand" title=', '<button type="button" id="btnVersand" hidden title=')
    d.ersetzen('  <button type="button" class="primary" id="btnAblegen">', NOTARDATEN_KNOPF + '  <button type="button" class="primary" id="btnAblegen">')
    d.ersetzen(KOPF_ALT, KOPF_NEU)
    d.ersetzen('<footer class="fuss">Notar Thomas Woinar · Vollzugsbogen</footer>',
               '<footer class="fuss" data-notar="fuss" data-zusatz="Vollzugsbogen">Vollzugsbogen</footer>')
    d.ersetzen('"https://tools.notariat-woinar.de/boegen/vorgespraech.html"', '"https://tools.notariat-woinar.de/tools/boegen/vorgespraech.html"')
    d.ersetzen('''    page.drawText("Thomas Woinar",{x:ML+ww+12, y:H-62, size:17, font:fB, color:BLAU});
    page.drawText("Notar",{x:ML+ww+12, y:H-77, size:10, font:fN, color:GRAU});
    ["Gubener Str. 14 · 15230 Frankfurt (Oder)","Tel. (0335) 500 86 35 · Fax (0335) 500 86 39","notar@woinar.com · www.notar-woinar.de"]''',
               '''    if (notarName()){
      page.drawText(pdfText(notarName()),{x:ML+ww+12, y:H-62, size:17, font:fB, color:BLAU});
      page.drawText(notarAmt(),{x:ML+ww+12, y:H-77, size:10, font:fN, color:GRAU});
    }
    notarKontaktZeilen().map(pdfText)''')
    d.ersetzen('pg.drawText(pdfText("Notar Thomas Woinar · Vollzugsbogen" + (v("uvz_nr") ? " · UVZ-Nr. "+v("uvz_nr") : "")),',
               'pg.drawText(pdfText([notarFuss(), "Vollzugsbogen"].filter(Boolean).join(" · ") + (v("uvz_nr") ? " · UVZ-Nr. "+v("uvz_nr") : "")),')
    d.ersetzen('  doc.setAuthor("Notar Thomas Woinar");', '  if (notarFuss()) doc.setAuthor(pdfText(notarFuss()));')
    d.muster(MITARBEITER_MUSTER, MITARBEITER_NEU)
    d.ersetzen(MAILLISTE_ALT, MAILLISTE_NEU)
    d.ersetzen('z.push("","Viele Grüße","Thomas Woinar");', 'z.push("","Viele Grüße",notarGruss());')
    d.ersetzen('  const zuletzt = (lsGet("vb_mail_empfaenger")||"").split(",").filter(Boolean);',
               OHNE_MITARBEITER + '  const zuletzt = lsGet("vb_mail_empfaenger") ? lsGet("vb_mail_empfaenger").split(",").filter(Boolean) : notarStandardEmpfaenger();')
    return d.s


def pruefen(name, text):
    teile = [text] + [base64.b64decode(m).decode("utf-8") for m in re.findall(r'<script type="text/plain" id="\w+">([^<]+)</script>', text)]
    for t in teile:
        for v in VERBOTEN:
            if v in t:
                i = t.find(v)
                sys.exit(f"{name}: „{v}“ ist übrig geblieben: …{t[max(0, i - 80):i + 80]!r}…")


def version(text):
    m = re.search(r'Version [\d.]+ · Stand \d\d\.\d\d\.\d{4}', text)
    return m.group(0) if m else None


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    q = Path(sys.argv[1])
    alt = (ZIEL / "vorgespraech.html").read_text(encoding="utf-8")
    k = klassisch((q / "vorgespraech.html").read_text(encoding="utf-8"), alt)
    v = vollzug((q / "vollzug.html").read_text(encoding="utf-8"))
    for name, text in (("vorgespraech.html", k), ("vollzug.html", v)):
        pruefen(name, text)
        (ZIEL / name).write_text(text, encoding="utf-8")
        print(f"boegen/{name} geschrieben ({version(text)})")
    # Maske: eigenes Skript (nimmt PDF-Vorlage und Module aus dem eben erzeugten klassischen Bogen)
    mq = (q / "vorgespraech-maske.html").read_text(encoding="utf-8")
    mv = re.search(r'Version ([\d.]+) · Stand', mq)
    subprocess.run([sys.executable, str(REPO / "werkzeuge" / "maske-kollegen.py"), str(q / "vorgespraech-maske.html"), mv.group(1) if mv else "1.0"], check=True)
    d = Datei("vorgespraech-maske.html", (ZIEL / "vorgespraech-maske.html").read_text(encoding="utf-8"))
    ohne_benachrichtigung(d)
    d.ersetzen("(#vorgang=4711/2026, z. B. vom Claude-Fenster)", "(#vorgang=4711/2026)")
    d.ersetzen("in dem auch das Claude-Fenster sucht.", "z. B. in die Vorgangsakte.")
    pruefen("vorgespraech-maske.html", d.s)
    (ZIEL / "vorgespraech-maske.html").write_text(d.s, encoding="utf-8")


if __name__ == "__main__":
    main()
