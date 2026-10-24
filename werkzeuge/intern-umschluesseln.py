#!/usr/bin/env python3
"""
Wechselt das Passwort von „Tools intern“, ohne dass der Klartext-Ordner vorliegen muss.

    INTERN_PASSWORT_ALT='…' INTERN_PASSWORT='…' python3 werkzeuge/intern-umschluesseln.py

Entschlüsselt intern/daten/* mit dem alten Passwort in einen temporären Ordner, löscht
intern/schluessel.json (neues Salz) und baut mit intern-bauen.py und dem neuen Passwort neu.
Der temporäre Klartext wird danach gelöscht. Läuft normalerweise über die GitHub-Aktion
„Tools intern: Passwort ändern“ (Passwörter als Secrets, nie im Chat).
"""
import hashlib, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

REPO = Path(__file__).resolve().parent.parent
INTERN = REPO / "intern"


def main():
    alt, neu = os.environ.get("INTERN_PASSWORT_ALT", ""), os.environ.get("INTERN_PASSWORT", "")
    if not alt or len(neu) < 12:
        sys.exit("INTERN_PASSWORT_ALT fehlt oder INTERN_PASSWORT ist kürzer als 12 Zeichen.")
    if alt == neu:
        sys.exit("Das neue Passwort ist dasselbe wie das alte.")
    cfg = json.loads((INTERN / "schluessel.json").read_text())
    roh = hashlib.pbkdf2_hmac("sha256", alt.encode("utf-8"), bytes.fromhex(cfg["salz"]), cfg["iterationen"], dklen=32)
    aes = AESGCM(roh)

    def entschluesseln(datei: Path) -> bytes:
        b = datei.read_bytes()
        return aes.decrypt(b[:12], b[12:], None)

    try:
        verzeichnis = json.loads(entschluesseln(INTERN / "daten" / "inhalt.bin"))["dateien"]
    except Exception:
        sys.exit("Das alte Passwort stimmt nicht.")

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
        (INTERN / "schluessel.json").unlink()
        subprocess.run([sys.executable, str(REPO / "werkzeuge" / "intern-bauen.py"), str(tmp)],
                       env={**os.environ, "INTERN_PASSWORT": neu}, check=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
