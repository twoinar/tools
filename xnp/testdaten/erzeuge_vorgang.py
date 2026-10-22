"""Erzeugt einen Test-Vorgang (Erbscheinsantrag) mit ERFUNDENEN Personen: Urkunde + zwei Anlagen.
Die .pkcs7-Dateien sind Platzhalter ohne echte Signatur."""
import os, sys
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

ZIEL = sys.argv[1] if len(sys.argv) > 1 else "Vorgang-4712-2026"

def pdf(name, zeilen):
    c = canvas.Canvas(os.path.join(ZIEL, name), pagesize=A4)
    y = 800
    for z in zeilen:
        c.drawString(60, y, z); y -= 16
    c.save()
    open(os.path.join(ZIEL, name + ".pkcs7"), "wb").write(b"TESTSIGNATUR")

os.makedirs(ZIEL, exist_ok=True)
pdf("A0004712.PDF", [
    "UVZ.-Nr. 4712 für 2026", "", "Erbscheinsantrag", "",
    "Am 02.08.2026 verstarb in Cottbus Herr Otto Testmann, geboren am 04.04.1941.",
    "Der Erblasser hatte seinen letzten gewöhnlichen Aufenthalt in Cottbus.",
    "Ich beantrage einen Erbschein, der mich als Alleinerbin ausweist.", "",
    "Cottbus, den 20. Oktober 2026",
])
pdf("Sterbeurkunde.pdf", ["Sterbeurkunde (Testdokument)", "Otto Testmann, verstorben am 02.08.2026 in Cottbus"])
pdf("Geburtsurkunde_Antragstellerin.pdf", ["Geburtsurkunde (Testdokument)", "Erika Testmann, geboren am 01.01.1970"])
print("geschrieben:", ZIEL)
