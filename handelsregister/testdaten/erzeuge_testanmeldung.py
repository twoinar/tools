"""Erzeugt eine Test-Handelsregisteranmeldung (Geschäftsführerwechsel) mit ERFUNDENEN Personen
samt Gesellschafterbeschluss. Die .pkcs7-Dateien sind Platzhalter ohne echte Signatur."""
import os, sys
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

ZIEL = sys.argv[1] if len(sys.argv) > 1 else "GF-Wechsel-815-2026"

def pdf(name, zeilen):
    c = canvas.Canvas(os.path.join(ZIEL, name), pagesize=A4)
    y = 800
    for z in zeilen:
        if z == "<seite>":
            c.showPage(); y = 800; continue
        c.drawString(60, y, z); y -= 16
    c.save()
    open(os.path.join(ZIEL, name + ".pkcs7"), "wb").write(b"TESTSIGNATUR")

os.makedirs(ZIEL, exist_ok=True)
pdf("W815-2026.pdf", [
    "UVZ.-Nr. 815 für 2026", "",
    "An das", "Amtsgericht Frankfurt (Oder)", "- Registergericht -", "",
    "HRB 12345 FF", "Muster Bau GmbH mit dem Sitz in Frankfurt (Oder)", "",
    "Zur Eintragung in das Handelsregister wird angemeldet:", "",
    "1. Herr Max Altmann, geboren am 01.02.1960, wohnhaft in Berlin, ist nicht mehr",
    "Geschäftsführer.",
    "2. Frau Dr. Erika Neumann, geb. Schulze, geboren am 3. April 1975, wohnhaft in",
    "Frankfurt (Oder), ist zur Geschäftsführerin bestellt worden.", "",
    "Allgemeine Vertretungsregelung: Ist nur ein Geschäftsführer bestellt, vertritt er die",
    "Gesellschaft allein. Sind mehrere Geschäftsführer bestellt, wird die Gesellschaft durch",
    "zwei Geschäftsführer gemeinsam oder durch einen Geschäftsführer gemeinsam mit einem",
    "Prokuristen vertreten.", "",
    "Die Geschäftsführerin Dr. Erika Neumann vertritt die Gesellschaft stets einzeln und ist",
    "von den Beschränkungen des § 181 BGB befreit.", "",
    "Die inländische Geschäftsanschrift lautet unverändert: Testweg 1, 15230 Frankfurt (Oder).", "",
    "Frankfurt (Oder), den 20. Oktober 2026",
    "<seite>",
    "Beglaubigungsvermerk",
    "Die vorstehende Unterschrift von Frau Dr. Erika Neumann, geboren am 3. April 1975,",
    "wohnhaft in Frankfurt (Oder), beglaubige ich.",
    "Frankfurt (Oder), den 20. Oktober 2026",
])
pdf("Gesellschafterbeschluss.pdf", [
    "Gesellschafterbeschluss der Muster Bau GmbH (Testdokument)",
    "Herr Max Altmann wird als Geschäftsführer abberufen. Frau Dr. Erika Neumann wird bestellt.",
])
print("geschrieben:", ZIEL)
