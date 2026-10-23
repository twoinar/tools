#!/usr/bin/env python3
"""
Baut den verschlüsselten Bereich „Tools intern“.

    INTERN_PASSWORT='…' python3 werkzeuge/intern-bauen.py <quellordner> [<zielordner>]

<quellordner> enthält die internen Seiten im Klartext (index.html, boegen/, xnp/, …).
<zielordner> ist standardmäßig intern/ im Repository. Dort entstehen
  schluessel.json  Salz und Iterationen für die Schlüsselableitung (nicht geheim)
  daten/*.bin      jede Datei einzeln mit AES-256-GCM verschlüsselt
  daten/inhalt.bin verschlüsseltes Verzeichnis: Pfad -> Datei-ID, Typ
index.html (Anmeldung) und sw.js (entschlüsselt im Browser) liegen fest in intern/
und werden hier nicht verändert.

Der Klartext gehört NICHT in dieses (öffentliche) Repository.

Gleiche Datei + gleiches Passwort ergibt dieselbe .bin-Datei (deterministische IV aus
HMAC über den Inhalt). So wachsen spätere Neubauten das Repository nur um geänderte
Dateien. Bei neuem Passwort ändert sich alles; das Salz bleibt, solange schluessel.json
existiert – für ein neues Salz die Datei vorher löschen.
"""
import hashlib, hmac, json, mimetypes, os, secrets, sys, time
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ITERATIONEN = 600_000
TYPEN = {
    ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
    ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".woff2": "font/woff2", ".woff": "font/woff", ".ico": "image/x-icon",
    ".apk": "application/vnd.android.package-archive", ".zip": "application/zip",
    ".cmd": "application/octet-stream", ".ps1": "application/octet-stream", ".url": "application/octet-stream",
    ".py": "text/plain; charset=utf-8", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pkcs7": "application/pkcs7-signature", ".PDF": "application/pdf",
}
AUSLASSEN = {".git", ".github", "__pycache__", ".DS_Store"}


def typ(p: Path) -> str:
    return TYPEN.get(p.suffix) or TYPEN.get(p.suffix.lower()) or mimetypes.guess_type(p.name)[0] or "application/octet-stream"


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    quelle = Path(sys.argv[1]).resolve()
    ziel = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "intern"
    passwort = os.environ.get("INTERN_PASSWORT", "")
    if len(passwort) < 12:
        sys.exit("INTERN_PASSWORT fehlt oder ist kürzer als 12 Zeichen.")

    schluessel_datei = ziel / "schluessel.json"
    alt = json.loads(schluessel_datei.read_text()) if schluessel_datei.exists() else {}
    salz = bytes.fromhex(alt["salz"]) if alt.get("salz") else secrets.token_bytes(16)
    roh = hashlib.pbkdf2_hmac("sha256", passwort.encode("utf-8"), salz, ITERATIONEN, dklen=64)
    aes, mac = AESGCM(roh[:32]), roh[32:]   # der Browser leitet nur die ersten 32 Byte ab

    def verschluesseln(daten: bytes) -> bytes:
        iv = hmac.new(mac, b"iv" + daten, hashlib.sha256).digest()[:12]
        return iv + aes.encrypt(iv, daten, None)

    daten_ordner = ziel / "daten"
    daten_ordner.mkdir(parents=True, exist_ok=True)
    verzeichnis, behalten = {}, set()
    for p in sorted(quelle.rglob("*")):
        if p.is_dir() or any(t in AUSLASSEN for t in p.relative_to(quelle).parts):
            continue
        rel = p.relative_to(quelle).as_posix()
        inhalt = p.read_bytes()
        kennung = hmac.new(mac, b"id" + rel.encode() + b"\0" + inhalt, hashlib.sha256).hexdigest()[:24]
        datei = daten_ordner / f"{kennung}.bin"
        if not datei.exists():
            datei.write_bytes(verschluesseln(inhalt))
        behalten.add(datei.name)
        verzeichnis[rel] = {"id": kennung, "typ": typ(p), "groesse": len(inhalt)}

    stand = time.strftime("%Y-%m-%dT%H:%M:%S")
    (daten_ordner / "inhalt.bin").write_bytes(
        verschluesseln(json.dumps({"stand": stand, "dateien": verzeichnis}, ensure_ascii=False).encode()))
    behalten.add("inhalt.bin")
    for alt_datei in daten_ordner.glob("*.bin"):
        if alt_datei.name not in behalten:
            alt_datei.unlink()
    schluessel_datei.write_text(json.dumps(
        {"salz": salz.hex(), "iterationen": ITERATIONEN, "stand": stand}, indent=2) + "\n")
    print(f"{len(verzeichnis)} Dateien verschlüsselt nach {daten_ordner} (Stand {stand}).")


if __name__ == "__main__":
    main()
