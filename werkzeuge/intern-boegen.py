#!/usr/bin/env python3
"""
Bringt die Bögen in „Tools intern“ auf den Stand von twoinar/boegen, ohne dass der
Klartext-Ordner vorliegen muss.

    INTERN_PASSWORT='…' python3 werkzeuge/intern-boegen.py <ordner-mit-twoinar-boegen>

Entschlüsselt intern/daten/* mit dem (unveränderten) Passwort in einen temporären Ordner,
ersetzt dort boegen/*.html durch die Dateien aus twoinar/boegen (neue wie die
Vorgesprächsmaske kommen dazu) und baut mit intern-bauen.py und demselben Passwort neu.
Ist inhaltlich nichts neu, bleibt intern/ unverändert. Der temporäre Klartext wird danach
gelöscht. Läuft normalerweise über die GitHub-Aktion „Tools intern: Bögen aktualisieren“.
"""
import hashlib, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

REPO = Path(__file__).resolve().parent.parent
INTERN = REPO / "intern"


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    quelle = Path(sys.argv[1]).resolve()
    passwort = os.environ.get("INTERN_PASSWORT", "")
    if len(passwort) < 12:
        sys.exit("INTERN_PASSWORT fehlt oder ist kürzer als 12 Zeichen.")
    neue = {p.name: p.read_bytes() for p in sorted(quelle.glob("*.html"))}
    if "vorgespraech.html" not in neue:
        sys.exit(f"{quelle} enthält keine Bögen (vorgespraech.html fehlt).")

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
        for name, inhalt in neue.items():
            ziel = tmp / "boegen" / name
            if not ziel.exists() or ziel.read_bytes() != inhalt:
                ziel.parent.mkdir(parents=True, exist_ok=True)
                ziel.write_bytes(inhalt)
                geaendert.append(name)
        if not geaendert:
            print("Tools intern: Bögen sind schon aktuell, nichts zu tun.")
            return
        print("Tools intern: neu bzw. geändert: " + ", ".join(geaendert))
        subprocess.run([sys.executable, str(REPO / "werkzeuge" / "intern-bauen.py"), str(tmp)],
                       env={**os.environ, "INTERN_PASSWORT": passwort}, check=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
