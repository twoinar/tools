#!/usr/bin/env python3
"""
Erzeugt die Kollegen-Fassung der Vorgesprächsmaske (boegen/vorgespraech-maske.html).

    python3 werkzeuge/maske-kollegen.py <twoinar/boegen>/vorgespraech-maske.html [<version>]

Quelle ist Thomas' Maske aus twoinar/boegen. Ersetzt werden Briefkopf, Auftragstext, Fußzeilen,
Mitarbeiterliste und Mailgruß durch die Notardaten aus boegen/notar.js. Die PDF-Vorlage und die
eingebetteten Module (Erbspiegel, Bedarfsbewertung) kommen aus der Kollegen-Fassung des klassischen
Bogens (boegen/vorgespraech.html). Jede Ersetzung muss genau einmal passen, sonst bricht das
Skript ab – dann hat sich die Quelle geändert und das Skript muss angepasst werden.
"""
import re, sys, time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ZIEL = REPO / "boegen" / "vorgespraech-maske.html"
KLASSISCH = REPO / "boegen" / "vorgespraech.html"


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    s = Path(sys.argv[1]).read_text(encoding="utf-8")
    version = sys.argv[2] if len(sys.argv) > 2 else "1.0"
    k = KLASSISCH.read_text(encoding="utf-8")

    def ersetzen(alt, neu, anzahl=1):
        nonlocal s
        n = s.count(alt)
        if n != anzahl:
            sys.exit(f"Erwartet {anzahl}x, gefunden {n}x: {alt[:80]!r}")
        s = s.replace(alt, neu)

    # Titel, notar.js, Knopf „Notardaten“
    ersetzen('<html lang="de">', '<html lang="de" data-titel="Vorgesprächsbogen Maske">')
    ersetzen('<title>Vorgesprächsbogen Maske – Notar Thomas Woinar</title>',
             '<title>Vorgesprächsbogen Maske</title>\n<script src="notar.js"></script>')
    ersetzen('title="Kopie für die Vorgangsakte, dort sucht auch das Claude-Fenster"',
             'title="zusätzliche Kopie, z. B. für die Vorgangsakte"')
    ersetzen('  <button type="button" class="primary" id="btnAblegen">',
             '  <button type="button" id="btnNotar" title="Name, Anschrift und Mitarbeiter des Notariats">Notardaten</button>\n'
             '  <button type="button" class="primary" id="btnAblegen">')

    # Briefkopf, Auftragstext und Fußzeile der Seite
    ersetzen('''    <div class="name"><h1>Thomas Woinar</h1><p>Notar</p></div>
    <div class="kontakt">Gubener Str. 14 · 15230 Frankfurt (Oder)<br>
      Tel. (0335) 500 86 35 · Fax (0335) 500 86 39<br>
      <b>notar@woinar.com</b> · www.notar-woinar.de</div>''',
             '''    <div class="name"><h1 data-notar="name"></h1><p data-notar="amt"></p></div>
    <div class="kontakt" data-notar="kontakt"></div>''')
    ersetzen('<p class="einleitung">Der Notar Thomas Woinar wird hiermit beauftragt und bevollmächtigt:</p>',
             '<p class="einleitung"><span data-notar="derdie">Der Notar</span> wird hiermit beauftragt und bevollmächtigt:</p>')
    ersetzen('<footer class="fuss">Notar Thomas Woinar · Sachverhaltsaufnahme und Entwurfsauftrag</footer>',
             '<footer class="fuss" data-notar="fuss" data-zusatz="Sachverhaltsaufnahme und Entwurfsauftrag">Sachverhaltsaufnahme und Entwurfsauftrag</footer>')

    # Mitarbeiter und Gruß aus den Notardaten (wie im klassischen Bogen der Kollegen)
    s, n = re.subn(r'/\* ---------- E-Mail an Mitarbeiter \(Outlook-Entwurf mit Anhang\) ----------\n'
                   r'   Mitarbeiterliste hier pflegen: Name und E-Mail-Adresse\. *\*/\n'
                   r'const MITARBEITER = \[\n(?:  \[.*\],\n)+\];\n// standardmäßig angehakt:\n'
                   r'const STANDARD_EMPFAENGER = \[[^\]]*\];\n',
                   '/* ---------- E-Mail an Mitarbeiter (Outlook-Entwurf mit Anhang) ----------\n'
                   '   Die Mitarbeiter kommen aus den Notardaten (notar.js).                    */\n'
                   'let MITARBEITER = [];\n', s)
    if n != 1:
        sys.exit("Mitarbeiterliste nicht gefunden")
    ersetzen('''MITARBEITER.forEach(([n,a])=>{
  const l=document.createElement("label"); l.className="cb";
  l.innerHTML='<input type="checkbox"><span></span><small></small>';
  l.querySelector("input").value=a; l.querySelector("span").textContent=n; l.querySelector("small").textContent=a;
  mailListe.appendChild(l);
});''', '''function mailListeAufbauen(){
  MITARBEITER = notarMitarbeiter();
  mailListe.textContent = "";
  MITARBEITER.forEach(([n,a])=>{
    const l=document.createElement("label"); l.className="cb";
    l.innerHTML='<input type="checkbox"><span></span><small></small>';
    l.querySelector("input").value=a; l.querySelector("span").textContent=n; l.querySelector("small").textContent=a;
    mailListe.appendChild(l);
  });
  return MITARBEITER.length > 0;
}''')
    ersetzen('z.push("","Viele Grüße","Thomas Woinar");', 'z.push("","Viele Grüße",notarGruss());')
    ersetzen('  const zuletzt = STANDARD_EMPFAENGER;',
             '  if (!mailListeAufbauen()){ meldung("Bitte zuerst unter „Notardaten“ die Mitarbeiter mit E-Mail-Adresse eintragen.","err"); return; }\n'
             '  const zuletzt = notarStandardEmpfaenger();')

    # Fußzeilen der Berechnungsseiten
    ersetzen('seite.drawText("Notar Thomas Woinar", {x:W-M-fN.widthOfTextAtSize("Notar Thomas Woinar",7), y:M-24, size:7, font:fN, color:GRAU});',
             'seite.drawText(pdfText(notarFuss()), {x:W-M-fN.widthOfTextAtSize(pdfText(notarFuss()),7), y:M-24, size:7, font:fN, color:GRAU});', 2)

    # PDF der Maske: Briefkopf aus den Notardaten auf jede Seite, Texte aus den Notardaten
    ersetzen('  // Briefkopf mit Siegel und die „Wichtigen Hinweise“ unverändert aus der Vorlage',
             '  // Kopf mit Wappen und die „Wichtigen Hinweise“ aus der Vorlage, Name und Anschrift aus den Notardaten')
    ersetzen('const neueSeite = () => { s = doc.addPage([W, H]); s.drawPage(kopfSeite, {x: KOPF.left, y: KOPF.bottom}); seitenListe.push(s); y = 726; };',
             '''const kd = notarKontakt(), kname = notarName();
  function briefkopf(){
    if (kname){
      s.drawText(t(kname), {x: 91.21616, y: 795.75, size: 18, font: fB, color: BLAU});
      s.drawText(t(notarAmt()), {x: 91.21616, y: 777.86, size: 11, font: fN, color: GRAU});
    }
    [[kd.adresse, 798.05], [kd.telefon, 787.05]].forEach(([z, py]) => { if (z) s.drawText(t(z), {x: X1 - breite(z, fN, 8), y: py, size: 8, font: fN, color: GRAU}); });
    const em = t(kd.email), web = t(kd.web ? (kd.email ? " · " : "") + kd.web : "");
    let px = X1 - fB.widthOfTextAtSize(em, 8) - fN.widthOfTextAtSize(web, 8);
    if (em){ s.drawText(em, {x: px, y: 776.05, size: 8, font: fB, color: GRAU}); px += fB.widthOfTextAtSize(em, 8); }
    if (web) s.drawText(web, {x: px, y: 776.05, size: 8, font: fN, color: GRAU});
  }
  const neueSeite = () => { s = doc.addPage([W, H]); s.drawPage(kopfSeite, {x: KOPF.left, y: KOPF.bottom}); briefkopf(); seitenListe.push(s); y = 726; };''')
    ersetzen('text("Der Notar Thomas Woinar wird hiermit beauftragt und bevollmächtigt:", X0, y, {gr: 9, c: GRAU});',
             'text(notarDerDie() + " wird hiermit beauftragt und bevollmächtigt:", X0, y, {gr: 9, c: GRAU});')
    ersetzen('sp.drawText(t("Notar Thomas Woinar · Sachverhaltsaufnahme und Entwurfsauftrag"),',
             'sp.drawText(t([notarFuss(), "Sachverhaltsaufnahme und Entwurfsauftrag"].filter(Boolean).join(" · ")),')
    ersetzen('doc.setAuthor("Notar Thomas Woinar");', 'if (notarFuss()) doc.setAuthor(t(notarFuss()));')

    # PDF-Vorlage und Module aus dem klassischen Bogen der Kollegen
    def block(muster, text):
        m = re.search(muster, text)
        if not m:
            sys.exit(f"Nicht gefunden: {muster}")
        return m
    vorlage = block(r'const VORLAGE_B64 = "[^"]+";', k).group(0)
    s = re.sub(r'const VORLAGE_B64 = "[^"]+";', lambda _: vorlage, s, count=1)
    for modul in ("erbspiegelQuelle", "bewertungQuelle"):
        muster = rf'<script type="text/plain" id="{modul}">[^<]+</script>'
        neu = block(muster, k).group(0)
        block(muster, s)
        s = re.sub(muster, lambda _: neu, s, count=1)

    # Version
    s, n = re.subn(r'Version [\d.]+ · Stand \d\d\.\d\d\.\d{4}', f'Version {version} · Stand {time.strftime("%d.%m.%Y")}', s)
    if n != 1:
        sys.exit("Versionszeile nicht gefunden")

    ZIEL.write_text(s, encoding="utf-8")
    print(f"{ZIEL} geschrieben ({len(s)} Zeichen).")


if __name__ == "__main__":
    main()
