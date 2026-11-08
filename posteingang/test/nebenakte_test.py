# -*- coding: utf-8 -*-
"""Test Export Nebenakte (§ 43 NotAktVV) mit erfundener Post: Datensatz muss gegen die XSD der BNotK validieren."""
import json
import os
import shutil
import sys
import tempfile
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import posteingang as P  # noqa: E402
import nebenakte as N  # noqa: E402
from erzeuge_testpost import erzeuge  # noqa: E402
from lxml import etree  # noqa: E402

FEHLER = []


def pruefe(bedingung, text):
    print(("OK    " if bedingung else "FEHLER") + " " + text)
    if not bedingung:
        FEHLER.append(text)


def valide(pfad):
    schema = etree.XMLSchema(etree.parse(N.schema_pfad()))
    ok = schema.validate(etree.parse(pfad))
    if not ok:
        for x in schema.error_log:
            print("     ", x.line, x.message)
    return ok


def main():
    tmp = tempfile.mkdtemp()
    pfad, _ = erzeuge(tmp)
    os.utime(pfad, (time.time() - 60, time.time() - 60))
    Y = os.path.join(tmp, "Y")
    e = P.lade_einstellungen()
    e.update(eingang=os.path.join(Y, "Posteingang"),
             ziel_urkunden=os.path.join(Y, "Posteingang", "Urkunden"),
             ziel_vorgaenge=os.path.join(Y, "Posteingang", "Vorgänge"),
             ziel_unklar=os.path.join(Y, "Posteingang", "Nicht zugeordnet"),
             archiv=os.path.join(Y, "Posteingang", "Original-Scans"),
             protokoll=os.path.join(Y, "Posteingang", "Protokoll"),
             ziel_dubletten=os.path.join(Y, "Posteingang", "Dubletten"),
             tageslisten=os.path.join(Y, "Posteingang", "Tageslisten"),
             urkunden_archiv=os.path.join(Y, "Scanner", "URKUNDEN", "Urkunden {jahr}"),
             vorgaenge_ordner=[os.path.join(Y, "Vorgänge")])
    e["nebenakte"] = dict(e.get("nebenakte", {}), imprinter_seiten_je_blatt=2,
                          export_ordner=os.path.join(Y, "Nebenakten-Export"))
    P.durchlauf(e, ausgabe=lambda *a: None)

    v30471 = os.path.join(Y, "Posteingang", "Vorgänge", "30471")
    akte = N.lade_akte(v30471)
    pruefe(len(akte["dokumente"]) == 1, "Aktendaten beim Ablegen geschrieben (_nebenakte.json)")
    x = akte["dokumente"][0]
    pruefe(len(x["sha256"]) == 64 and x["papier_original"], "SHA-256 und Papieroriginal (Löschungsbewilligung) erfasst")
    pruefe(x["imprinter_von"] == "0003", f"Imprinter-Nummer aus Startnummer + Blatt ({x['imprinter_von']})")

    # Urkunde 2048/2026 gehört zu Vorgang 30471; Aktenangaben von Hand
    akte["akte"] = {"uvz": ["2048/2026"], "abschluss_amtsgeschaeft": "15.12.2026",
                    "urkunden": {"2048/2026": {"geschaeftsgegenstand": "Grundstückskaufvertrag",
                                               "beurkundungsdatum": "2026-10-01"}}}
    N.speichere_akte(v30471, akte)

    r = N.exportiere(e, "30471", P.VERSION, P.STAND)
    pruefe(r["ok"], "Export Vorgang 30471 erstellt " + "; ".join(r["fehler"]))
    xml = os.path.join(r["ordner"], "nebenakte.xml")
    pruefe(valide(xml), "nebenakte.xml validiert gegen Elektronische_Nebenakte_1.1.0.xsd")
    text = open(xml, encoding="utf-8").read()
    pruefe(text.count("<elna:Datei_Referenz>") == 3, "drei Schreiben (Vorgang + zwei zur Urkunde 2048/2026)")
    pruefe("Original in Papierakte" in text and "Vollzug" in text and "UVZ 2048/2026" in text, "Kategorien gesetzt")
    pruefe("Imprinter-Nr. 0003" in text, "Imprinter-Nummer in Betreff_Bezeichnung")
    pruefe("<elna:UVZ_Nr>" in text and "Grundstückskaufvertrag" in text, "Urkunde mit UVZ-Nr. und Geschäftsgegenstand")
    pruefe(os.path.exists(os.path.join(r["ordner"], "Deckblatt Papierakte.pdf")), "Deckblatt Papierakte (hybride Akte)")
    pruefe(len(os.listdir(os.path.join(r["ordner"], "dokumente"))) == 3, "Dokumente kopiert")
    intern = json.load(open(os.path.join(r["ordner"], "intern.json"), encoding="utf-8"))
    pruefe(intern["aufbewahrung_bis"] == "2033-12-31", f"Aufbewahrung bis 31.12.2033 ({intern['aufbewahrung_bis']})")
    bericht = open(r["bericht"], encoding="utf-8").read()
    pruefe(f"Stand {P.STAND}" in bericht and P.VERSION in bericht, "Stand und Version im Bericht")

    # Auch das Prüfskript der Projektdateien akzeptiert den Datensatz
    paket = os.environ.get("NEBENAKTE_PAKET")
    if paket and os.path.exists(os.path.join(paket, "nebenakte_validieren.py")):
        sys.path.insert(0, paket)
        import nebenakte_validieren as V
        V.XSD = type(V.XSD)(N.schema_pfad())
        pruefe(V.validieren(xml), "nebenakte_validieren.py meldet OK")

    # UVZ-Nummer führt zur Akte des Vorgangs
    r2 = N.exportiere(e, "2048/2026", P.VERSION, P.STAND)
    pruefe(r2["ok"] and r2["akte"].aktenzeichen == "30471", "UVZ 2048/2026 -> Akte 30471")

    # Verwahrung + Papier -> Warnung; Verlängerung § 52
    akte["akte"]["massennummer"] = "M 12/2026"
    akte["akte"]["weitere_aufbewahrung"] = {"am": "2026-11-08", "bis": "2040-12-31", "weil": "Rechtsstreit anhängig"}
    N.speichere_akte(v30471, akte)
    r3 = N.exportiere(e, "30471", P.VERSION, P.STAND)
    pruefe(r3["ok"] and valide(os.path.join(r3["ordner"], "nebenakte.xml")), "Export mit Massennummer und § 52 validiert")
    pruefe(any("§ 41 Abs. 3" in w for w in r3["akte"].warnungen), "Warnung Verwahrungsgeschäft mit Papier (§ 41 Abs. 3)")
    pruefe(json.load(open(os.path.join(r3["ordner"], "intern.json"), encoding="utf-8"))["aufbewahrung_bis"] == "2040-12-31",
           "Verlängerung nach § 52 verschiebt Aufbewahrungsende")

    # Geschäftsgegenstand aus dem Ordnernamen (30472 Musterfrau Schenkung)
    r4 = N.exportiere(e, "30472", P.VERSION, P.STAND)
    pruefe(r4["ok"] and "Schenkungsvertrag" in open(os.path.join(r4["ordner"], "nebenakte.xml"), encoding="utf-8").read(),
           "Geschäftsgegenstand Schenkungsvertrag aus Ordnername")

    # Fehler verständlich, kein Export
    akte["akte"]["aufbewahrungsfrist"] = 40
    N.speichere_akte(v30471, akte)
    r5 = N.exportiere(e, "30471", P.VERSION, P.STAND)
    pruefe(not r5["ok"] and any("7 bis 30" in f for f in r5["fehler"]), "unzulässige Frist: kein Export, verständlicher Fehler "
           + "; ".join(r5["fehler"]))
    pruefe(os.path.exists(r5["bericht"]), "Fehlerbericht geschrieben")
    akte["akte"]["aufbewahrungsfrist"] = 7
    akte["akte"]["abschluss_amtsgeschaeft"] = "31.02.2026"
    N.speichere_akte(v30471, akte)
    r6 = N.exportiere(e, "30471", P.VERSION, P.STAND)
    pruefe(not r6["ok"] and any("kein Datum" in f for f in r6["fehler"]), "falsches Datum: verständlicher Fehler")
    akte["akte"]["abschluss_amtsgeschaeft"] = "2026-12-15"
    N.speichere_akte(v30471, akte)

    # Veränderte Datei wird erkannt
    datei = os.path.join(v30471, akte["dokumente"][0]["datei"])
    with open(datei, "ab") as f:
        f.write(b"\n% veraendert\n")
    r7 = N.exportiere(e, "30471", P.VERSION, P.STAND)
    pruefe(any("verändert" in w for w in r7["akte"].warnungen), "veränderte Datei gemeldet (SHA-256)")

    # Gesamtexport: alle Akten validieren
    alle = N.alle_akten(e)
    erg = [N.exportiere(e, n, P.VERSION, P.STAND) for n in alle]
    pruefe(all(x["ok"] and valide(os.path.join(x["ordner"], "nebenakte.xml")) for x in erg),
           f"Gesamtexport: {len(erg)} Akten, alle valide ({', '.join(alle)})")

    # Befehlszeile
    res = P.nebenakte_export(e, ["30472", "--still"])
    pruefe(res and res[0]["ok"], "Befehl --nebenakte 30472 --still")

    if "--behalten" in sys.argv:
        shutil.copytree(os.path.join(Y, "Nebenakten-Export"), sys.argv[-1], dirs_exist_ok=True)
    shutil.rmtree(tmp)
    print("ALLES OK" if not FEHLER else f"{len(FEHLER)} FEHLER")
    sys.exit(1 if FEHLER else 0)


main()
