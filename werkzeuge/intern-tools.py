#!/usr/bin/env python3
"""
Übernimmt öffentliche Tools unverändert auch nach „Tools intern“, ohne Klartext-Ordner.

    INTERN_PASSWORT='…' python3 werkzeuge/intern-tools.py

Welche Tools, steht in werkzeuge/intern-tools.json:
  ordner  öffentlicher Ordner im Repository (wird nach intern/<ordner>/ kopiert)
  titel   Text der Karte in der Übersicht von Tools intern (darf mit einem Emoji beginnen –
          das Claude-Fenster nimmt es als Kachel-Symbol)
  text    Unterzeile der Karte
  nach    die Karte wird hinter dem Link eingefügt, dessen href diesen Text enthält
          (sonst vor </main> bzw. </body>)
Entschlüsselt intern/daten/* in einen temporären Ordner, ersetzt dort <ordner>/ durch den
öffentlichen Stand, ergänzt die Karte (nur wenn noch kein Link auf <ordner>/ da ist) und baut
mit intern-bauen.py und demselben Passwort neu. Ohne Änderung bleibt intern/ unverändert.
Läuft über die GitHub-Aktion „Tools intern: öffentliche Tools übernehmen“.
"""
import filecmp, hashlib, html, json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

REPO = Path(__file__).resolve().parent.parent
INTERN = REPO / "intern"


def main():
    passwort = os.environ.get("INTERN_PASSWORT", "")
    if len(passwort) < 12:
        sys.exit("INTERN_PASSWORT fehlt oder ist kürzer als 12 Zeichen.")
    liste = json.loads((REPO / "werkzeuge" / "intern-tools.json").read_text(encoding="utf-8"))

    cfg = json.loads((INTERN / "schluessel.json").read_text())
    roh = hashlib.pbkdf2_hmac("sha256", passwort.encode("utf-8"), bytes.fromhex(cfg["salz"]), cfg["iterationen"], dklen=32)
    aes = AESGCM(roh)

    def entschluesseln(datei: Path) -> bytes:
        b = datei.read_bytes()
        return aes.decrypt(b[:12], b[12:], None)

    try:
        verzeichnis = json.loads(entschluesseln(INTERN / "daten" / "inhalt.bin"))["dateien"]
    except Exception:
        sys.exit("Das Passwort stimmt nicht.")

    tmp = Path(tempfile.mkdtemp(prefix="intern-"))
    try:
        for rel, info in verzeichnis.items():
            ziel = (tmp / rel).resolve()
            if tmp.resolve() not in ziel.parents:
                sys.exit(f"Ungültiger Pfad im Verzeichnis: {rel}")
            inhalt = entschluesseln(INTERN / "daten" / f"{info['id']}.bin")
            if len(inhalt) != info["groesse"]:
                sys.exit(f"Größe passt nicht: {rel}")
            ziel.parent.mkdir(parents=True, exist_ok=True)
            ziel.write_bytes(inhalt)

        geaendert = []
        index = tmp / "index.html"
        for t in liste:
            ordner = t["ordner"].strip("/")
            quelle = REPO / ordner
            if not quelle.is_dir():
                sys.exit(f"Ordner fehlt im Repository: {ordner}")
            ziel = tmp / ordner
            if not ziel.exists() or filecmp.dircmp(quelle, ziel).diff_files or _abweichend(quelle, ziel):
                shutil.rmtree(ziel, ignore_errors=True)
                shutil.copytree(quelle, ziel)
                geaendert.append(ordner + "/")
            if index.exists():
                s = index.read_text(encoding="utf-8")
                if not re.search(r'href="(\./)?' + re.escape(ordner) + r'(/|/index\.html)?"', s):
                    s = _karte_einfuegen(s, ordner, t)
                    index.write_text(s, encoding="utf-8")
                    geaendert.append("Karte " + ordner)
        if not geaendert:
            print("Tools intern: öffentliche Tools sind schon aktuell, nichts zu tun.")
            return
        print("Tools intern: neu bzw. geändert: " + ", ".join(geaendert))
        subprocess.run([sys.executable, str(REPO / "werkzeuge" / "intern-bauen.py"), str(tmp)],
                       env={**os.environ, "INTERN_PASSWORT": passwort}, check=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _abweichend(a: Path, b: Path) -> bool:
    fa = sorted(p.relative_to(a).as_posix() for p in a.rglob("*") if p.is_file())
    fb = sorted(p.relative_to(b).as_posix() for p in b.rglob("*") if p.is_file())
    if fa != fb:
        return True
    return any((a / r).read_bytes() != (b / r).read_bytes() for r in fa)


def _karte_einfuegen(s: str, ordner: str, t: dict) -> str:
    klasse = "karte"
    pos = -1
    if t.get("nach"):
        m = re.search(r'<a\b[^>]*href="[^"]*' + re.escape(t["nach"]) + r'[^"]*"[^>]*>.*?</a>', s, re.S)
        if m:
            pos = m.end()
            k = re.search(r'class="([^"]*)"', m.group(0))
            if k:
                klasse = k.group(1)
    if pos < 0:
        k = re.search(r'<a\b[^>]*class="([^"]*karte[^"]*)"', s)
        if k:
            klasse = k.group(1)
        pos = s.rfind("</main>")
        if pos < 0:
            pos = s.rfind("</body>")
    karte = (f'\n  <a class="{html.escape(klasse)}" href="{ordner}/">{html.escape(t["titel"])}'
             f'<small>{html.escape(t.get("text", ""))}</small></a>')
    return s[:pos] + karte + s[pos:]


if __name__ == "__main__":
    main()
