"""Erzeugt aus den Testverträgen (*.txt, ERFUNDENE Personen und Daten) je eine PDF- und eine Word-Fassung."""
import glob, os, textwrap
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import docx

SCHRIFT = "Helvetica"
for pfad in ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/arial.ttf"]:
    if os.path.exists(pfad):
        pdfmetrics.registerFont(TTFont("Text", pfad)); SCHRIFT = "Text"; break

for txt in sorted(glob.glob(os.path.join(os.path.dirname(__file__) or ".", "*.txt"))):
    zeilen = open(txt, encoding="utf-8").read().splitlines()
    stamm = txt[:-4]
    c = canvas.Canvas(stamm + ".pdf", pagesize=A4)
    c.setFont(SCHRIFT, 10); y = 800
    for z in zeilen:
        for teil in textwrap.wrap(z, 95) or [""]:
            if y < 60: c.showPage(); c.setFont(SCHRIFT, 10); y = 800
            c.drawString(60, y, teil); y -= 14
    c.save()
    d = docx.Document()
    for z in zeilen: d.add_paragraph(z)
    d.save(stamm + ".docx")
    print("geschrieben:", stamm + ".pdf/.docx")
