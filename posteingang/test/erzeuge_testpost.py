# -*- coding: utf-8 -*-
"""Erzeugt einen erfundenen Poststapel (eine Sammel-PDF wie vom Scanner) und eine Bestandsstruktur
(Schattenarchiv + Vorgänge) zum Testen. Nur erfundene Namen."""
import os
import random
import sys

import fitz

BRIEFE = [
    # (Absender, Zeilen oben, Text, Seiten, erwartete Zuordnung)
    ("Amtsgericht Frankfurt (Oder) - Grundbuchamt", "Ihr Zeichen: UR-Nr. 2048/2026\nUnser Zeichen: Gb 1234/26",
     "Eintragungsnachricht. Die beantragte Eintragung ist erfolgt.", 2, "U:2048-2026"),
    ("Sparkasse Oder-Spree", "Ihr Zeichen: 30471\nDatum: 03.11.2026",
     "Wir übersenden die Löschungsbewilligung für die Grundschuld.", 1, "V:30471"),
    ("Stadt Frankfurt (Oder) - Vorkaufsrecht", "Betreff: Kaufvertrag UVZ-Nr. 1925 für 2026",
     "Ein Vorkaufsrecht wird nicht ausgeübt.", 1, "U:1925-2026"),
    ("Werbung GmbH", "Datum: 02.11.2026", "Neue Büromöbel zu Sonderpreisen!", 1, "unklar"),
    ("Finanzamt Frankfurt (Oder)", "Ihr Zeichen: W 2057/2026\nSteuernummer 061/123/45678",
     "Unbedenklichkeitsbescheinigung Grunderwerbsteuer.", 3, "U:2057-2026"),
    ("Landkreis Oder-Spree", "Vorgang 30472", "Genehmigung nach dem Grundstücksverkehrsgesetz.", 1, "V:30472"),
    ("Herr Max Mustermann", "Datum 01.11.2026", "Anbei die unterschriebene Vollmacht zu Ihrer Urkunde Nr. 1999/2026.",
     1, "U:1999-2026"),
    ("Amtsgericht Cottbus - Nachlassgericht", "Ihr Zeichen: UR-Nr. 9999/2026",   # existiert nicht
     "Eingangsbestätigung.", 1, "unklar"),
    ("Deutsche Bank AG", "Ihr Zeichen: UVZ-Nr. 512/25", "Grundschuldbrief anbei.", 2, "U:512-2025"),
    # Kostenrechnungen haben Bruchnummern: W <UVZ>/<a>/<b> - <Jahr>
    ("Frau Erika Beispiel", "Betreff: Ihre Kostenrechnung W 2006/0/1 - 2025", "Anbei die Überweisungsbestätigung.", 1, "U:2006-2025"),
    ("Muster Immobilien GmbH", "Rechnung Nr. W 2048/1/1-2026", "Rückfrage zur Kostenrechnung.", 1, "U:2048-2026"),
]


def brief_seite(doc, absender, oben, text, seite, von, erste, rauschen=False):
    p = doc.new_page(width=595, height=842)
    y = 60
    if erste:
        p.insert_text((60, y), absender, fontsize=11)
        y += 50
        for z in ["Notariat Woinar", "Herrn Notar Thomas Woinar", "Musterstraße 1", "15230 Frankfurt (Oder)"]:
            p.insert_text((60, y), z, fontsize=10)
            y += 14
        y += 20
        for z in oben.split("\n"):
            p.insert_text((330, y), z, fontsize=10)
            y += 14
        y += 30
        p.insert_text((60, y), "Sehr geehrter Herr Notar Woinar,", fontsize=10)
        y += 24
        if rauschen:   # zweiter Scan: Texterkennung liest ein Wort anders
            text = text.replace("die", "dle", 1) if "die" in text else text + " ."
        p.insert_text((60, y), text, fontsize=10)
    else:
        p.insert_text((60, y + 40), "Fortsetzung: weitere Erläuterungen und Anlagen. " * 1, fontsize=10)
        p.insert_text((60, y + 60), "Lorem ipsum dolor sit amet, consetetur sadipscing elitr.", fontsize=10)
    if von > 1:
        p.insert_text((270, 810), f"Seite {seite} von {von}", fontsize=9)


def erzeuge(ziel, rauschen=False, name="Post_2026-11-06_14-30-00_0001.pdf"):
    os.makedirs(os.path.join(ziel, "Y", "Posteingang"), exist_ok=True)
    arch26 = os.path.join(ziel, "Y", "Scanner", "URKUNDEN", "Urkunden 2026")
    arch25 = os.path.join(ziel, "Y", "Scanner", "URKUNDEN", "Urkunden 2025")
    vorg = os.path.join(ziel, "Y", "Vorgänge")
    for d in (arch26, arch25, vorg):
        os.makedirs(d, exist_ok=True)
    for n in ["W2048-2026!Urkunde.pdf", "W1925-2026!Urkunde.pdf", "W 2057-2026.pdf", "W1999-2026oE.pdf"]:
        open(os.path.join(arch26, n), "w").close()
    for n in ["W512-2025!Urkunde.pdf", "W2006-2025!Urkunde.pdf"]:
        open(os.path.join(arch25, n), "w").close()
    for n in ["30471 Mustermann Kaufvertrag", "30472 Musterfrau Schenkung", "29815 Beispiel GmbH"]:
        os.makedirs(os.path.join(vorg, n), exist_ok=True)

    doc = fitz.open()
    erwartet = []
    for absender, oben, text, seiten, soll in BRIEFE:
        for s in range(1, seiten + 1):
            brief_seite(doc, absender, oben, text, s, seiten, s == 1, rauschen)
            doc.new_page(width=595, height=842)   # leere Rückseite (Duplex)
        erwartet.append(soll)
    pfad = os.path.join(ziel, "Y", "Posteingang", name)
    doc.save(pfad)
    return pfad, erwartet


if __name__ == "__main__":
    print(erzeuge(sys.argv[1] if len(sys.argv) > 1 else "testlauf"))
