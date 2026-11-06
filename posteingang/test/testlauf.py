# -*- coding: utf-8 -*-
"""Testlauf mit erfundenem Poststapel: prüft Zerlegung und Zuordnung."""
import json, os, shutil, sys, tempfile, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import posteingang as P
from erzeuge_testpost import erzeuge

def main():
    tmp = tempfile.mkdtemp()
    pfad, erwartet = erzeuge(tmp)
    os.utime(pfad, (time.time() - 60, time.time() - 60))
    e = P.lade_einstellungen()
    Y = os.path.join(tmp, "Y")
    e.update(eingang=os.path.join(Y, "Posteingang"),
             ziel_urkunden=os.path.join(Y, "Posteingang", "Urkunden"),
             ziel_vorgaenge=os.path.join(Y, "Posteingang", "Vorgänge"),
             ziel_unklar=os.path.join(Y, "Posteingang", "Nicht zugeordnet"),
             archiv=os.path.join(Y, "Posteingang", "Original-Scans"),
             protokoll=os.path.join(Y, "Posteingang", "Protokoll"),
             ziel_dubletten=os.path.join(Y, "Posteingang", "Dubletten"),
             urkunden_archiv=os.path.join(Y, "Scanner", "URKUNDEN", "Urkunden {jahr}"),
             vorgaenge_ordner=[os.path.join(Y, "Vorgänge")])
    P.probe(pfad, e)
    erg, _, _ = P.verarbeite_datei(pfad, e, P.Bestand(e, P.dt.date.today()), P.dt.date.today(), probe=True)
    ist = [("U:" + r["wert"]) if r["art"] == "urkunde" else ("V:" + r["wert"]) if r["art"] == "vorgang" else "unklar" for r in erg]
    ok = ist == erwartet
    print("ERWARTET", erwartet); print("IST     ", ist); print("OK" if ok else "ABWEICHUNG")
    t0 = time.time(); P.durchlauf(e); print(f"Durchlauf {time.time()-t0:.2f}s")
    # Derselbe Stapel noch einmal gescannt (leicht abweichende Texterkennung): alles muss als Dublette erkannt werden
    def zaehle():
        r = {}
        for wurzel, _, dateien in os.walk(os.path.join(Y, "Posteingang")):
            for d in dateien:
                if d.startswith("Eingang"):
                    teil = os.path.relpath(wurzel, os.path.join(Y, "Posteingang")).split(os.sep)[0]
                    r[teil] = r.get(teil, 0) + 1
        return r
    vorher = zaehle()
    pfad2, _ = erzeuge(tmp, rauschen=True, name="Post_2026-11-06_14-40-00_0002.pdf")
    os.utime(pfad2, (time.time() - 60, time.time() - 60))
    P.durchlauf(e)
    nachher = zaehle()
    dub_ok = nachher.get("Dubletten", 0) == len(erwartet) and \
        all(nachher.get(k, 0) == v for k, v in vorher.items())
    print("DUBLETTEN", nachher.get("Dubletten", 0), "von", len(erwartet), "OK" if dub_ok else "ABWEICHUNG")
    ok = ok and dub_ok
    for wurzel, _, dateien in os.walk(os.path.join(Y, "Posteingang")):
        for d in dateien: print("  ", os.path.relpath(os.path.join(wurzel, d), Y))
    shutil.rmtree(tmp)
    sys.exit(0 if ok else 1)

main()
