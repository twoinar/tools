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
             urkunden_archiv=os.path.join(Y, "Scanner", "URKUNDEN", "Urkunden {jahr}"),
             vorgaenge_ordner=[os.path.join(Y, "Vorgänge")])
    P.probe(pfad, e)
    erg, _, _ = P.verarbeite_datei(pfad, e, P.Bestand(e, P.dt.date.today()), P.dt.date.today(), probe=True)
    ist = [("U:" + r["wert"]) if r["art"] == "urkunde" else ("V:" + r["wert"]) if r["art"] == "vorgang" else "unklar" for r in erg]
    ok = ist == erwartet
    print("ERWARTET", erwartet); print("IST     ", ist); print("OK" if ok else "ABWEICHUNG")
    t0 = time.time(); P.durchlauf(e); print(f"Durchlauf {time.time()-t0:.2f}s")
    for wurzel, _, dateien in os.walk(os.path.join(Y, "Posteingang")):
        for d in dateien: print("  ", os.path.relpath(os.path.join(wurzel, d), Y))
    shutil.rmtree(tmp)
    sys.exit(0 if ok else 1)

main()
