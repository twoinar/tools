# -*- coding: utf-8 -*-
"""Prüft auf Windows das Einspiel-Skript des Selbst-Updates: wartet auf das Ende des alten Prozesses,
sichert einstellungen.json und kopiert die neuen Dateien. Auf anderen Systemen nur die Versionswahl."""
import os, subprocess, sys, tempfile, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import posteingang as P

rel = [{"tag_name": "posteingang-1.10", "assets": [{"name": "P-1.10.zip", "browser_download_url": "a"}]},
       {"tag_name": "posteingang-1.9", "assets": [{"name": "P-1.9.zip", "browser_download_url": "b"}]},
       {"tag_name": "posteingang-2.0", "draft": True, "assets": [{"name": "P.zip", "browser_download_url": "c"}]},
       {"tag_name": "boegen-9.9", "assets": [{"name": "B.zip", "browser_download_url": "d"}]}]
assert P.neueste_version(rel) == ("1.10", "a"), P.neueste_version(rel)
assert P._version("1.10") > P._version("1.9")

if os.name == "nt":
    tmp = tempfile.mkdtemp()
    quelle, ziel = os.path.join(tmp, "neu"), os.path.join(tmp, "Programm")
    os.makedirs(quelle); os.makedirs(ziel)
    open(os.path.join(quelle, "Posteingang-sortieren.exe"), "w").write("neu")
    open(os.path.join(quelle, "einstellungen.json"), "w").write('{"neu": 1}')
    open(os.path.join(ziel, "einstellungen.json"), "w").write('{"alt": 1}')
    alt = subprocess.Popen(["ping", "-n", "6", "127.0.0.1"], stdout=subprocess.DEVNULL)
    skript = os.path.join(tmp, "einspielen.cmd")
    open(skript, "w", encoding="cp1252").write(P.einspiel_skript(alt.pid, quelle, ziel, starten=False))
    t0 = time.time()
    subprocess.run(["cmd", "/c", skript], check=True, creationflags=0x08000000, timeout=120)
    dauer = time.time() - t0
    assert alt.poll() is not None, "Skript hat nicht auf das Ende des alten Prozesses gewartet"
    assert dauer >= 3, dauer
    assert open(os.path.join(ziel, "Posteingang-sortieren.exe")).read() == "neu"
    assert '"alt"' in open(os.path.join(ziel, "einstellungen.vorher.json")).read()
    assert '"neu"' in open(os.path.join(ziel, "einstellungen.json")).read()
    print(f"Einspiel-Skript OK ({dauer:.1f} s gewartet)")
print("UPDATE-TEST OK")
