# -*- coding: utf-8 -*-
"""
Posteingang sortieren – Notariat Woinar

Liest die Sammel-PDFs, die der Scanner (PaperStream Capture, durchsuchbares PDF) nach
Y:\\Posteingang legt, zerlegt sie in einzelne Schreiben und legt jedes Schreiben ab:

    Y:\\Posteingang\\Urkunden\\<UVZ-Nr>-<Jahr>\\...pdf   wenn eine UVZ-Nummer erkannt wird
    Y:\\Posteingang\\Vorgänge\\<Vorgangsnr>\\...pdf      wenn eine Vorgangsnummer erkannt wird
    Y:\\Posteingang\\Nicht zugeordnet\\...pdf           wenn nichts sicher erkannt wird

Ohne KI, nur mit festen Regeln (einstellungen.json). Alles läuft lokal, keine Netzverbindung
ins Internet. Die Original-Scans werden nie gelöscht, sondern nach Original-Scans verschoben.

Aufruf:
    posteingang.py                 einmal alle neuen Scans verarbeiten
    posteingang.py --dauerhaft     im Hintergrund laufen und alle paar Sekunden nachsehen
    posteingang.py --probe X.pdf   nur anzeigen, wie X.pdf zerlegt und zugeordnet würde
"""
import csv
import datetime as dt
import json
import os
import re
import shutil
import sys
import time

try:
    import pymupdf as fitz
except ImportError:  # ältere PyMuPDF-Versionen
    import fitz

VERSION = "1.0"

# Windows-Konsole (cp850/cp1252) kann nicht jedes Zeichen darstellen: lieber ersetzen als abstürzen.
for _strom in (sys.stdout, sys.stderr):
    try:
        _strom.reconfigure(errors="replace")
    except Exception:
        pass

if getattr(sys, "frozen", False):
    HIER = os.path.dirname(sys.executable)
else:
    HIER = os.path.dirname(os.path.abspath(__file__))


# --------------------------------------------------------------------------- Einstellungen

def lade_einstellungen(pfad=None):
    pfad = pfad or os.path.join(HIER, "einstellungen.json")
    with open(pfad, encoding="utf-8") as f:
        e = json.load(f)
    e["_muster_uvz"] = [re.compile(m, re.I) for m in e["muster_uvz"]]
    e["_muster_vorgang"] = [re.compile(m, re.I) for m in e["muster_vorgang"]]
    e["_empfaenger"] = [re.compile(m, re.I) for m in e["merkmale_an_uns_adressiert"]]
    return e


# --------------------------------------------------------------------------- Text

ZIFFERN_OCR = str.maketrans({"O": "0", "o": "0", "l": "1", "I": "1", "|": "1", "S": "5", "B": "8"})


def ziffern(s):
    """OCR-Verwechsler in einer Nummer korrigieren (nur innerhalb der Nummer)."""
    return re.sub(r"\D", "", s.translate(ZIFFERN_OCR))


def jahr4(j, heute):
    if not j:
        return None
    j = ziffern(j)
    if len(j) == 2:
        j = "20" + j
    if len(j) != 4:
        return None
    jahr = int(j)
    if jahr < 1990 or jahr > heute.year + 1:
        return None
    return jahr


def normalisiere(text):
    text = text.replace("\u00ad", "").replace("\u2013", "-").replace("\u2014", "-")
    text = re.sub(r"[ \t\u00a0]+", " ", text)
    return text


# --------------------------------------------------------------------------- Seiten-Analyse

class Seite:
    def __init__(self, nr, text, oben, unten, leer):
        self.nr = nr              # 0-basiert
        self.text = text          # ganze Seite
        self.oben = oben          # Text der oberen 45 % (Anschrift, Zeichen, Datum)
        self.unten = unten        # Text der unteren 12 % (Fußzeile, Seitenzahl)
        self.leer = leer
        self.uvz = []             # [(nr, jahr)]
        self.vorgang = []         # [nr]
        self.seitenzahl = None    # (n, von) falls aufgedruckt
        self.start_punkte = 0
        self.gruende = []


def ist_leer(page, text):
    if len(text.strip()) >= 25:
        return False
    # Wenig Text: prüfen, ob überhaupt etwas auf der Seite ist (Foto, Stempel, Handschrift).
    pix = page.get_pixmap(matrix=fitz.Matrix(0.25, 0.25), colorspace=fitz.csGRAY)
    daten = pix.samples
    dunkel = sum(1 for b in daten if b < 160)
    return dunkel / max(1, len(daten)) < 0.004


def lies_seiten(doc):
    seiten = []
    for i, page in enumerate(doc):
        h = page.rect.height
        bloecke = page.get_text("blocks")
        alle, oben, unten = [], [], []
        for b in sorted(bloecke, key=lambda b: (round(b[1]), b[0])):
            t = b[4]
            alle.append(t)
            if b[1] < h * 0.45:
                oben.append(t)
            if b[3] > h * 0.88 or b[1] < h * 0.06:
                unten.append(t)
        text = normalisiere("\n".join(alle))
        seiten.append(Seite(i, text, normalisiere("\n".join(oben)),
                            normalisiere("\n".join(unten)), ist_leer(page, text)))
    return seiten


RE_SEITE_VON = re.compile(r"\bSeite\s*([0-9Il|]{1,2})\s*(?:von|/|aus)\s*([0-9Il|]{1,2})\b", re.I)
RE_SEITE = re.compile(r"\bSeite\s*([0-9]{1,2})\b", re.I)
RE_STRICH = re.compile(r"^\s*-\s*([0-9]{1,2})\s*-\s*$", re.M)
RE_ANREDE = re.compile(r"\b(Sehr geehrte[rs]?|Guten Tag|Hallo)\b", re.I)
RE_DATUM = re.compile(r"\b\d{1,2}\.\s?(\d{1,2}\.|Januar|Februar|März|April|Mai|Juni|Juli|August|"
                      r"September|Oktober|November|Dezember)\s?(19|20)?\d{2}\b", re.I)
RE_ZEICHEN = re.compile(r"\b(Ihr(e)?\s+(Zeichen|Nachricht|Schreiben|Az|Aktenzeichen)|Unser(e)?\s+Zeichen|"
                        r"Aktenzeichen|Gesch(ä|ae)ftszeichen|Az\.|Betreff|Betr\.)", re.I)


def analysiere(seite, e, heute):
    t = seite.text
    # Nummern
    gesehen = set()
    for m in e["_muster_uvz"]:
        for treffer in m.finditer(t):
            nr = ziffern(treffer.group("nr"))
            jahr = jahr4(treffer.groupdict().get("jahr"), heute)
            if not nr or len(nr) > 5 or int(nr) == 0:
                continue
            schluessel = (str(int(nr)), jahr)
            if schluessel not in gesehen:
                gesehen.add(schluessel)
                seite.uvz.append(schluessel)
    for m in e["_muster_vorgang"]:
        for treffer in m.finditer(t):
            nr = ziffern(treffer.group("nr"))
            if nr and len(nr) <= 8 and int(nr) and nr not in seite.vorgang:
                # Nicht die UVZ-Nummer noch einmal als Vorgang zählen
                if any(nr.lstrip("0") == u[0] for u in seite.uvz) and re.search(
                        r"UVZ|UR|Urk", treffer.group(0), re.I):
                    continue
                seite.vorgang.append(nr)

    # Seitenzahl
    m = RE_SEITE_VON.search(t)
    if m:
        a, b = ziffern(m.group(1)), ziffern(m.group(2))
        if a and b and 0 < int(a) <= int(b):
            seite.seitenzahl = (int(a), int(b))
    if not seite.seitenzahl:
        m = RE_STRICH.search(seite.unten) or RE_STRICH.search(seite.oben[:200])
        if m:
            seite.seitenzahl = (int(m.group(1)), None)
        else:
            m = RE_SEITE.search(seite.unten)
            if m:
                seite.seitenzahl = (int(m.group(1)), None)

    # Merkmale einer ersten Briefseite
    punkte = 0
    if any(r.search(seite.oben) for r in e["_empfaenger"]):
        punkte += 2
        seite.gruende.append("an uns adressiert")
    if RE_ANREDE.search(t):
        punkte += 1
        seite.gruende.append("Anrede")
    if RE_DATUM.search(seite.oben):
        punkte += 1
        seite.gruende.append("Datum oben")
    if RE_ZEICHEN.search(seite.oben):
        punkte += 1
        seite.gruende.append("Zeichen/Betreff oben")
    seite.start_punkte = punkte


# --------------------------------------------------------------------------- Zerlegen

def zerlege(seiten, e):
    """Teilt die Seitenfolge in Schreiben. Gibt Liste von Listen von Seiten zurück."""
    schwelle = e.get("schwelle_neues_schreiben", 3)
    schreiben = []
    aktuell = []
    for s in seiten:
        if s.leer:
            continue
        neu = False
        if not aktuell:
            neu = True
        elif s.seitenzahl and s.seitenzahl[0] > 1:
            neu = False   # ausdrücklich Folgeseite
            # außer die Nummer passt nicht zur Zählung des laufenden Schreibens
            vor = aktuell[-1].seitenzahl
            if vor and vor[0] + 1 != s.seitenzahl[0] and s.start_punkte >= schwelle:
                neu = True
        elif s.seitenzahl and s.seitenzahl[0] == 1:
            neu = True
            s.gruende.append("Seite 1")
        else:
            bisher = nummern(aktuell)
            eigene = set(("U",) + u for u in s.uvz) | set(("V", v) for v in s.vorgang)
            if s.start_punkte >= schwelle:
                neu = True
            elif eigene and bisher and not (eigene & bisher) and s.start_punkte >= 1:
                neu = True
                s.gruende.append("andere Nummer")
            # Erwartete Seitenzahl des laufenden Schreibens noch nicht erreicht -> Folgeseite
            erste = aktuell[0].seitenzahl
            if neu and erste and erste[1] and len(aktuell) < erste[1] and not (
                    s.seitenzahl and s.seitenzahl[0] == 1):
                neu = False
        if neu and aktuell:
            schreiben.append(aktuell)
            aktuell = []
        aktuell.append(s)
    if aktuell:
        schreiben.append(aktuell)
    return schreiben


def nummern(seiten):
    r = set()
    for s in seiten:
        r |= set(("U",) + u for u in s.uvz)
        r |= set(("V", v) for v in s.vorgang)
    return r


# --------------------------------------------------------------------------- Prüfen gegen Bestand

class Bestand:
    """Kennt die vorhandenen Urkunden (Schattenarchiv) und Vorgänge (Ordner), um Zufallstreffer
    auszuschließen. Wird pro Durchlauf einmal eingelesen."""

    def __init__(self, e, heute):
        self.e = e
        self.heute = heute
        self._urkunden = {}
        self._vorgaenge = None

    def urkunden(self, jahr):
        if jahr not in self._urkunden:
            menge = set()
            vorlage = self.e.get("urkunden_archiv") or ""
            ordner = vorlage.replace("{jahr}", str(jahr))
            if ordner and os.path.isdir(ordner):
                for name in os.listdir(ordner):
                    m = re.match(r"^\s*[A-Za-z]{0,3}\s*0*(\d{1,5})\s*-\s*(\d{4})", name)
                    if m and int(m.group(2)) == jahr:
                        menge.add(m.group(1))
                # Unterordner (eAbschriften usw.) zählen auch
            self._urkunden[jahr] = menge if (ordner and os.path.isdir(ordner)) else None
        return self._urkunden[jahr]

    def vorgaenge(self):
        if self._vorgaenge is None:
            menge = set()
            vorhanden = False
            for ordner in self.e.get("vorgaenge_ordner", []):
                if os.path.isdir(ordner):
                    vorhanden = True
                    for name in os.listdir(ordner):
                        m = re.match(r"^\s*0*(\d{1,8})\b", name)
                        if m:
                            menge.add(m.group(1))
            self._vorgaenge = menge if vorhanden else None
        return self._vorgaenge

    def uvz_ok(self, nr, jahr):
        """Gibt (nr, jahr) zurück, wenn die Urkunde existiert (bzw. keine Prüfung möglich)."""
        jahre = [jahr] if jahr else [self.heute.year, self.heute.year - 1]
        treffer = []
        for j in jahre:
            u = self.urkunden(j)
            if u is None:
                if jahr:   # keine Prüfung möglich, Jahr bekannt -> annehmen
                    treffer.append((nr, j))
            elif nr in u:
                treffer.append((nr, j))
        return treffer[0] if len(treffer) == 1 else None

    def vorgang_ok(self, nr):
        v = self.vorgaenge()
        if v is None:
            return True
        return nr.lstrip("0") in v


def ordne_zu(seiten, bestand, e):
    """Ergebnis: ("urkunde", "2048-2026") / ("vorgang", "4711") / ("unklar", grund)."""
    uvz, vorgang = [], []
    # Erste Seite zählt zuerst, dann der Rest
    for s in seiten:
        for nr, jahr in s.uvz:
            ok = bestand.uvz_ok(nr, jahr)
            if ok and ok not in uvz:
                uvz.append(ok)
        for v in s.vorgang:
            v = v.lstrip("0")
            if bestand.vorgang_ok(v) and v not in vorgang:
                vorgang.append(v)
    erste_uvz = [bestand.uvz_ok(n, j) for n, j in seiten[0].uvz]
    erste_uvz = [u for u in erste_uvz if u]
    if len(set(erste_uvz)) == 1:
        uvz = [erste_uvz[0]]
    erste_v = [v.lstrip("0") for v in seiten[0].vorgang if bestand.vorgang_ok(v.lstrip("0"))]
    if len(set(erste_v)) == 1:
        vorgang = [erste_v[0]]

    reihenfolge = ["urkunde", "vorgang"] if e.get("vorrang", "urkunde") == "urkunde" else ["vorgang", "urkunde"]
    for art in reihenfolge:
        if art == "urkunde" and uvz:
            if len(uvz) > 1:
                return ("unklar", "mehrere UVZ-Nummern: " + ", ".join(f"{n}/{j}" for n, j in uvz))
            n, j = uvz[0]
            return ("urkunde", e["ordnername_urkunde"].format(nr=n, jahr=j))
        if art == "vorgang" and vorgang:
            if len(vorgang) > 1:
                return ("unklar", "mehrere Vorgangsnummern: " + ", ".join(vorgang))
            return ("vorgang", e["ordnername_vorgang"].format(nr=vorgang[0]))
    gefunden = [f"UVZ {n}/{j or '?'}" for s in seiten for n, j in s.uvz] + \
               [f"Vorgang {v}" for s in seiten for v in s.vorgang]
    if gefunden:
        return ("unklar", "Nummer nicht im Bestand: " + ", ".join(dict.fromkeys(gefunden)))
    return ("unklar", "keine Nummer gefunden")


# --------------------------------------------------------------------------- Ablegen

def freier_name(ordner, stamm):
    pfad = os.path.join(ordner, stamm + ".pdf")
    i = 2
    while os.path.exists(pfad):
        pfad = os.path.join(ordner, f"{stamm} ({i}).pdf")
        i += 1
    return pfad


def schreibe(doc, seiten, ziel):
    neu = fitz.open()
    for s in seiten:
        neu.insert_pdf(doc, from_page=s.nr, to_page=s.nr)
    tmp = ziel + ".tmp"
    neu.save(tmp, garbage=3, deflate=True)
    neu.close()
    os.replace(tmp, ziel)


def zielordner(e, art, name):
    if art == "urkunde":
        return os.path.join(e["ziel_urkunden"], name)
    if art == "vorgang":
        return os.path.join(e["ziel_vorgaenge"], name)
    return e["ziel_unklar"]


def verarbeite_datei(pfad, e, bestand, heute, probe=False):
    doc = fitz.open(pfad)
    seiten = lies_seiten(doc)
    ohne_text = sum(1 for s in seiten if not s.leer and len(s.text.strip()) < 25)
    for s in seiten:
        analysiere(s, e, heute)
    teile = zerlege(seiten, e)
    stempel = dt.datetime.fromtimestamp(os.path.getmtime(pfad)).strftime("%Y-%m-%d %H-%M")
    ergebnisse = []
    for i, teil in enumerate(teile, 1):
        art, wert = ordne_zu(teil, bestand, e)
        seiten_txt = f"{teil[0].nr + 1}-{teil[-1].nr + 1}" if len(teil) > 1 else f"{teil[0].nr + 1}"
        if art == "unklar":
            ordner, grund = zielordner(e, art, None), wert
        else:
            ordner, grund = zielordner(e, art, wert), ""
        stamm = f"Eingang {stempel} Nr {i:02d}"
        ergebnisse.append(dict(teil=teil, art=art, wert=wert if art != "unklar" else "",
                               grund=grund, seiten=seiten_txt, ordner=ordner, stamm=stamm,
                               start=", ".join(teil[0].gruende)))
    if probe:
        doc.close()
        return ergebnisse, ohne_text, len(seiten)
    for r in ergebnisse:
        os.makedirs(r["ordner"], exist_ok=True)
        r["datei"] = freier_name(r["ordner"], r["stamm"])
        schreibe(doc, r["teil"], r["datei"])
    doc.close()
    return ergebnisse, ohne_text, len(seiten)


def protokolliere(e, quelle, ergebnisse, hinweis=""):
    ordner = e["protokoll"]
    os.makedirs(ordner, exist_ok=True)
    datei = os.path.join(ordner, f"Protokoll {dt.date.today():%Y-%m}.csv")
    neu = not os.path.exists(datei)
    with open(datei, "a", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        if neu:
            w.writerow(["Zeit", "Scan", "Seiten", "Zuordnung", "Nummer", "Datei", "Hinweis"])
        jetzt = dt.datetime.now().strftime("%d.%m.%Y %H:%M:%S")
        for r in ergebnisse:
            zu = {"urkunde": "Urkunde", "vorgang": "Vorgang", "unklar": "nicht zugeordnet"}[r["art"]]
            w.writerow([jetzt, os.path.basename(quelle), r["seiten"], zu, r["wert"],
                        os.path.basename(r.get("datei", "")), r["grund"] or hinweis])


def ist_fertig(pfad, warte):
    """Datei ist fertig geschrieben: seit `warte` Sekunden unverändert und nicht gesperrt."""
    try:
        if time.time() - os.path.getmtime(pfad) < warte:
            return False
        with open(pfad, "r+b"):
            pass
        return True
    except OSError:
        return False


def sperre_holen(eingang):
    """Verhindert, dass zwei PCs gleichzeitig sortieren. Eine Sperre älter als 10 Minuten gilt als verwaist."""
    pfad = os.path.join(eingang, "~sortiert-gerade.lock")
    try:
        if os.path.exists(pfad) and time.time() - os.path.getmtime(pfad) > 600:
            os.remove(pfad)
        fd = os.open(pfad, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, os.environ.get("COMPUTERNAME", "PC").encode("utf-8", "replace"))
        os.close(fd)
        return pfad
    except OSError:
        return None


def durchlauf(e, ausgabe=print):
    eingang = e["eingang"]
    if not os.path.isdir(eingang):
        ausgabe(f"Eingangsordner nicht erreichbar: {eingang}")
        return 0
    sperre = sperre_holen(eingang)
    if not sperre:
        ausgabe("Ein anderer PC sortiert gerade.")
        return 0
    try:
        return _durchlauf(e, eingang, ausgabe, sperre)
    finally:
        try:
            os.remove(sperre)
        except OSError:
            pass


def _durchlauf(e, eingang, ausgabe, sperre):
    heute = dt.date.today()
    bestand = Bestand(e, heute)
    anzahl = 0
    for name in sorted(os.listdir(eingang)):
        pfad = os.path.join(eingang, name)
        if not name.lower().endswith(".pdf") or not os.path.isfile(pfad):
            continue
        if not ist_fertig(pfad, e.get("warten_sekunden", 15)):
            continue
        os.utime(sperre)
        t0 = time.time()
        try:
            ergebnisse, ohne_text, n = verarbeite_datei(pfad, e, bestand, heute)
        except Exception as ex:  # defekte Datei: liegen lassen und melden
            ausgabe(f"FEHLER bei {name}: {ex}")
            fehler = os.path.join(e["ziel_unklar"], "Fehler")
            os.makedirs(fehler, exist_ok=True)
            shutil.move(pfad, freier_name(fehler, os.path.splitext(name)[0]))
            continue
        hinweis = "Scan ohne Texterkennung (OCR in PaperStream einschalten)" if ohne_text > n // 2 else ""
        protokolliere(e, pfad, ergebnisse, hinweis)
        archiv = os.path.join(e["archiv"], dt.date.today().strftime("%Y-%m"))
        os.makedirs(archiv, exist_ok=True)
        shutil.move(pfad, freier_name(archiv, os.path.splitext(name)[0]))
        anzahl += 1
        zu = sum(1 for r in ergebnisse if r["art"] != "unklar")
        ausgabe(f"{name}: {n} Seiten -> {len(ergebnisse)} Schreiben, {zu} zugeordnet "
                f"({time.time() - t0:.1f} s)")
    return anzahl


def probe(pfad, e):
    heute = dt.date.today()
    ergebnisse, ohne_text, n = verarbeite_datei(pfad, e, Bestand(e, heute), heute, probe=True)
    print(f"{os.path.basename(pfad)}: {n} Seiten, {len(ergebnisse)} Schreiben")
    for i, r in enumerate(ergebnisse, 1):
        ziel = r["ordner"]
        print(f"  {i:2d}. Seiten {r['seiten']:>7}  -> {ziel}"
              + (f"   [{r['grund']}]" if r["grund"] else "")
              + (f"   (Beginn: {r['start']})" if r["start"] else ""))
    if ohne_text:
        print(f"  Achtung: {ohne_text} Seiten ohne Text – ist die Texterkennung eingeschaltet?")
    return ergebnisse


def main(argv):
    e = lade_einstellungen()
    if len(argv) > 2 and argv[1] == "--probe":
        for p in argv[2:]:
            probe(p, e)
        return
    if len(argv) > 1 and argv[1] == "--dauerhaft":
        print(f"Posteingang sortieren {VERSION} – überwacht {e['eingang']} (Strg+C beendet)")
        while True:
            try:
                durchlauf(e)
            except Exception as ex:
                print("FEHLER:", ex)
            time.sleep(e.get("intervall_sekunden", 20))
    n = durchlauf(e)
    print(f"{n} Scan(s) verarbeitet.")
    if "--warten" in argv:
        input("Fertig. Enter drücken zum Schließen …")


if __name__ == "__main__":
    main(sys.argv)
