# -*- coding: utf-8 -*-
"""
Posteingang sortieren – Notariat Woinar

Liest die Sammel-PDFs, die der Scanner (PaperStream Capture, durchsuchbares PDF) nach
Y:\\Posteingang legt, zerlegt sie in einzelne Schreiben und legt jedes Schreiben ab:

    Y:\\Posteingang\\Urkunden\\<UVZ-Nr>-<Jahr>\\...pdf   wenn eine UVZ-Nummer erkannt wird
    Y:\\Posteingang\\Vorgänge\\<Vorgangsnr>\\...pdf      wenn eine Vorgangsnummer erkannt wird
    Y:\\Posteingang\\Nicht zugeordnet\\...pdf           wenn nichts sicher erkannt wird

Ohne KI, nur mit festen Regeln (einstellungen.json). Alles läuft lokal. Ins Internet gehen nur die
Update-Prüfung (GitHub, nur herunterladen) und, wenn auf diesem PC eingerichtet, der E-Mail-Abruf aus dem
Büro-Postfach (mailabruf.py, Microsoft Graph). Die Original-Scans werden nie gelöscht, sondern nach
Original-Scans verschoben.

Aufruf:
    posteingang.py                 einmal alle neuen Scans verarbeiten
    posteingang.py --dauerhaft     im Hintergrund laufen und alle paar Sekunden nachsehen
    posteingang.py --probe X.pdf   nur anzeigen, wie X.pdf zerlegt und zugeordnet würde
"""
import csv
import datetime as dt
import difflib
import json
import os
import re
import shutil
import sys
import subprocess
import tempfile
import time
import urllib.request
import zipfile

import mailabruf

try:
    import pymupdf as fitz
except ImportError:  # ältere PyMuPDF-Versionen
    import fitz

VERSION = "1.10"
STAND = "10.11.2026"

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
    # Nur oben auf der Seite (Briefkopf, Zeichen, Betreff): blanke Nummern wie „539/2026“; zählen nur,
    # wenn es die Urkunde im Schattenarchiv gibt (Prüfung in ordne_zu)
    e["_muster_uvz_oben"] = [re.compile(m, re.I) for m in e.get("muster_uvz_oben", [])]
    e["_muster_vorgang"] = [re.compile(m, re.I) for m in e["muster_vorgang"]]
    e["_empfaenger"] = [re.compile(m, re.I) for m in e["merkmale_an_uns_adressiert"]]
    e["_arten"] = [(a["name"], a.get("aktion", "vorlegen"), [re.compile(m, re.I) for m in a["muster"]],
                    a.get("bereich", "text")) for a in e.get("arten", [])]
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
        self.uvz_oben = []        # davon im Briefkopf (Ihr Zeichen, Betreff)
        self.vorgang_oben = []
        self.seitenzahl = None    # (n, von) falls aufgedruckt
        self.start_punkte = 0
        self.gruende = []


def ist_leer(page, text):
    if len(text.strip()) >= 25:
        return False
    # Wenig Text: prüfen, ob überhaupt etwas auf der Seite ist (Foto, Stempel, Handschrift).
    # Lieber eine Seite zu viel behalten als eine Zeichnung (Lageplan, Grundriss) wegwerfen:
    # feine Linien zählen mit, Staubkörner und Durchscheinen nicht.
    pix = page.get_pixmap(matrix=fitz.Matrix(0.5, 0.5), colorspace=fitz.csGRAY)
    daten = pix.samples
    dunkel = sum(1 for b in daten if b < 200)
    return dunkel / max(1, len(daten)) < 0.002


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
RE_ANREDE = re.compile(r"\b(Sehr geehrte[rs]?|Guten Tag|Hallo|Liebe[rs]?\s+(Herr|Frau))\b", re.I)
RE_DATUM = re.compile(r"\b\d{1,2}\.\s?(\d{1,2}\.|Januar|Februar|März|April|Mai|Juni|Juli|August|"
                      r"September|Oktober|November|Dezember)\s?(19|20)?\d{2}\b", re.I)
RE_ZEICHEN = re.compile(r"\b(Ihr(e)?\s+(Zeichen|Nachricht|Schreiben|Az|Aktenzeichen)|Unser(e)?\s+Zeichen|"
                        r"Aktenzeichen|Gesch(ä|ae)ftszeichen|Az\.|Betreff|Betr\.)", re.I)


OCR_ZEICHEN = "OolI|SB"   # Zeichen, die die Texterkennung mit Ziffern verwechselt


def _ganze_nummer(t, treffer, gruppe, min_ziffern):
    """Die Nummer muss vollständig erfasst sein: kein Teil einer längeren Ziffernfolge (sonst würde aus
    „l936“ die 936) und genug echte Ziffern (sonst wäre „lo“ eine 10)."""
    a, b = treffer.span(gruppe)
    roh = treffer.group(gruppe)
    vorher = t[a - 1] if a > 0 else " "
    nachher = t[b] if b < len(t) else " "
    for c in (vorher, nachher):
        if c.isdigit() or c in OCR_ZEICHEN or c in OCR_ZEICHEN.lower():
            # Ausnahme: ein Buchstabe direkt dahinter, der kein Verwechsler ist (z. B. „30490Wo“) bleibt erlaubt
            return False
    return sum(ch.isdigit() for ch in roh) >= min(min_ziffern, len(roh))


def _nummern_in(t, e, heute, kopf=False):
    uvz, vorgang = [], []
    # Im Briefkopf zusätzlich blanke Nummern wie „539/2026“ (muster_uvz_oben); die zählen nur, wenn es die
    # Urkunde im Schattenarchiv gibt (ordne_zu prüft jede Nummer gegen den Bestand)
    for m in e["_muster_uvz"] + (e.get("_muster_uvz_oben", []) if kopf else []):
        for treffer in m.finditer(t):
            if not _ganze_nummer(t, treffer, "nr", 2):
                continue
            nr = ziffern(treffer.group("nr"))
            roh_jahr = treffer.groupdict().get("jahr")
            jahr = jahr4(roh_jahr, heute) if roh_jahr else None
            if roh_jahr and (jahr is None or not _ganze_nummer(t, treffer, "jahr", 2)):
                continue   # Jahr erkannt, aber unlesbar oder unmöglich -> lieber gar nicht zuordnen
            if not nr or len(nr) > 5 or int(nr) == 0:
                continue
            schluessel = (str(int(nr)), jahr)
            if schluessel not in uvz:
                uvz.append(schluessel)
    for m in e["_muster_vorgang"]:
        for treffer in m.finditer(t):
            if not _ganze_nummer(t, treffer, "nr", 3):
                continue
            nr = ziffern(treffer.group("nr"))
            if nr and len(nr) <= 8 and int(nr) and nr not in vorgang:
                # Nicht die UVZ-Nummer noch einmal als Vorgang zählen
                if any(nr.lstrip("0") == u[0] for u in uvz) and re.search(
                        r"UVZ|UR|Urk", treffer.group(0), re.I):
                    continue
                vorgang.append(nr)
    return uvz, vorgang


def analysiere(seite, e, heute):
    t = seite.text
    # Nummern (im ganzen Text und gesondert im Briefkopf, der bei mehreren Nummern den Ausschlag gibt)
    seite.uvz, seite.vorgang = _nummern_in(t, e, heute)
    # Briefkopf = alles vor der Anrede (Anschrift, Ihr Zeichen, Datum, Betreff); ohne Anrede die obere Seite
    anrede = RE_ANREDE.search(seite.oben)
    kopf = seite.oben[:anrede.start()] if anrede else seite.oben
    seite.uvz_oben, seite.vorgang_oben = _nummern_in(kopf, e, heute, kopf=True)
    seite.uvz += [u for u in seite.uvz_oben if u not in seite.uvz]

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
        # Ohne Jahr: nur zuordnen, wenn es die Nummer in den letzten drei Jahren genau einmal gibt
        jahre = [jahr] if jahr else [self.heute.year, self.heute.year - 1, self.heute.year - 2]
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

    # Steht im Briefkopf eine Nummer, die es nicht gibt (Tippfehler, Lesefehler), darf keine andere Nummer
    # aus dem Text (z. B. eine Vorurkunde) an ihre Stelle treten.
    kopf_uvz = seiten[0].uvz_oben
    if kopf_uvz and not any(bestand.uvz_ok(n, j) for n, j in kopf_uvz):
        # Steht daneben eine eindeutige Vorgangsnummer im Briefkopf, gehört das Schreiben zum Vorgang
        kopf_v = list(dict.fromkeys(v.lstrip("0") for v in seiten[0].vorgang_oben if bestand.vorgang_ok(v.lstrip("0"))))
        if len(kopf_v) == 1:
            return ("vorgang", e["ordnername_vorgang"].format(nr=kopf_v[0]))
        return ("unklar", "Nummer im Briefkopf nicht im Bestand: " +
                ", ".join(f"UVZ {n}/{j or '?'}" for n, j in kopf_uvz))
    kopf_v = seiten[0].vorgang_oben
    if kopf_v and not kopf_uvz and not any(bestand.vorgang_ok(v.lstrip("0")) for v in kopf_v):
        return ("unklar", "Nummer im Briefkopf nicht im Bestand: " + ", ".join(f"Vorgang {v}" for v in kopf_v))
    # Mehrere Nummern (z. B. „Vorurkunde UVZ-Nr. … “ im Text): gilt die eine Nummer im Briefkopf
    # (Ihr Zeichen, Betreff) der ersten Seite.
    if len(uvz) > 1:
        kopf = [u for u in (bestand.uvz_ok(n, j) for n, j in seiten[0].uvz_oben) if u]
        if len(set(kopf)) == 1:
            uvz = [kopf[0]]
    if len(vorgang) > 1:
        kopf = [v.lstrip("0") for v in seiten[0].vorgang_oben if bestand.vorgang_ok(v.lstrip("0"))]
        if len(set(kopf)) == 1:
            vorgang = [kopf[0]]

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


# --------------------------------------------------------------------------- Art des Schreibens

def bestimme_art(seiten, e):
    """Was für ein Schreiben ist es, und muss es mit der Akte vorgelegt werden?
    Gibt (art, aktion, stichwort) zurück. Die Arten in einstellungen.json werden der Reihe nach geprüft,
    die erste passende gilt. Gesucht wird zuerst auf der ersten Seite, dann im ganzen Schreiben.
    Passt keine Art, gilt "standard_aktion"."""
    erste = seiten[0].text
    ganz = "\n".join(s.text for s in seiten)
    gefunden = None
    for runde in (0, 1):
        for name, aktion, muster, bereich in e.get("_arten", []):
            # "oben": nur Briefkopf/Betreff der ersten Seite (z. B. Absender ist eine Behörde)
            text = seiten[0].oben if bereich == "oben" else (erste if runde == 0 else ganz)
            if bereich == "oben" and runde == 1:
                continue
            for m in muster:
                t = m.search(text)
                if t:
                    gefunden = (name, aktion, t.group(0).strip())
                    break
            if gefunden:
                break
        if gefunden:
            break
    if not gefunden:
        return "", e.get("standard_aktion", "vorlegen"), ""
    if gefunden[1] == "ablegen":
        # Kein Brief darf übersehen werden: Nur ablegen, wenn im ganzen Schreiben nichts auf eine Art hindeutet,
        # die vorgelegt werden muss (z. B. „Zahlungseingang“ auf einem Kontoauszug des Anderkontos).
        for name, aktion, muster, bereich in e.get("_arten", []):
            if aktion == "ablegen" or bereich == "oben":
                continue
            for m in muster:
                t = m.search(ganz)
                if t:
                    return name, aktion, t.group(0).strip()
    return gefunden


def absender(seite, e):
    """Erste sinnvolle Zeile oben auf der ersten Seite (meist der Briefkopf), ohne unsere eigene Anschrift."""
    for zeile in seite.oben.splitlines():
        z = zeile.strip(" -|,.")
        if len(z) < 4 or not re.search(r"[A-Za-zÄÖÜäöü]{3}", z):
            continue
        if any(r.search(z) for r in e["_empfaenger"]):
            continue
        if re.match(r"^(Herrn?\s+Notar|Notar|An\b|Postfach|\d{5}\b)", z, re.I):
            continue
        if re.search(r"(stra(ß|ss)e|str\.|weg|platz|allee|ring)\s*\d", z, re.I):   # Anschriftzeile
            continue
        return z[:60]
    return ""


RE_BETREFF = re.compile(r"^\s*(?:Betreff|Betr\.|Gegenstand)\s*[:.]?\s*(.{4,})$", re.I | re.M)
RE_ANREDE = re.compile(r"^\s*(?:Sehr\s+geehrte|Guten\s+Tag|Hallo|Liebe[rs]?\s)[^\n]*$", re.I | re.M)
RE_GRUSS = re.compile(r"(?:Mit\s+freundlichen|Freundliche\s+Grü|Mit\s+besten\s+Grü|Hochachtungsvoll|Viele\s+Grü)", re.I)
RE_KOPFFELD = re.compile(r"^(?:Unser(?:e)?\s+(?:Zeichen|Az|Aktenzeichen|Nachricht)|Ihr(?:e)?\s+(?:Zeichen|Az|Aktenzeichen|Nachricht\s+vom|Schreiben\s+vom)|Datum|Az|Aktenzeichen|Gesch(?:ä|ae)ftszeichen|Zeichen|Tel|Telefon|Fax|E-?Mail|"
                         r"Durchwahl|Sachbearbeit|Bearbeiter|Kassenzeichen|Steuernummer|Kundennummer|Seite|Vorgang|UVZ|Urk\w*|"
                         r"Herrn?|Frau|Notar\w*|\d)\b|\b\d{5}\s+\w", re.I)
RE_SEITE_X = re.compile(r"\bSeite\s*\d{1,2}(?:\s*(?:von|/)\s*\d{1,2})?\b\s*", re.I)
RE_NUR_DATUM = re.compile(r"^[\w ,.()-]*\d{1,2}\.\s?(?:\d{1,2}\.|[A-Za-zäÄ]+)\s?\d{2,4}\s*$")


def kurzfassung(seiten, laenge=320):
    """Betreff und die ersten Sätze nach der Anrede (ohne KI, nur aus dem Text herausgeschnitten)."""
    t = seiten[0].text
    betreff = ""
    m = RE_BETREFF.search(t)
    if m:
        betreff = " ".join(m.group(1).split())
    a = RE_ANREDE.search(t)
    if a:
        if not betreff:   # oft steht der Betreff (fett, ohne „Betreff:“) direkt über der Anrede
            for z in reversed(t[:a.start()].strip().splitlines()[-3:]):
                z = " ".join(z.split())
                if len(z) >= 8 and not RE_NUR_DATUM.match(z) and not RE_KOPFFELD.search(z) and re.search(r"[A-Za-zäöü]{4}", z):
                    betreff = z
                    break
        rumpf = t[a.end():]
        if len(seiten) > 1 and len(rumpf) < laenge:
            rumpf += "\n" + seiten[1].text
    else:
        rumpf = t[len(seiten[0].oben):] if t.startswith(seiten[0].oben) else t
    g = RE_GRUSS.search(rumpf)
    if g:
        rumpf = rumpf[:g.start()]
    inhalt = " ".join(RE_SEITE_X.sub(" ", rumpf).split())
    if len(inhalt) > laenge:
        schnitt = inhalt[:laenge]
        ende = max(schnitt.rfind(". "), schnitt.rfind("! "), schnitt.rfind("? "))
        inhalt = schnitt[:ende + 1] if ende > laenge // 3 else schnitt.rsplit(" ", 1)[0] + " …"
    return betreff[:150], inhalt


AKTION_TEXT = {"vorlegen": "mit Akte vorlegen", "ablegen": "nur elektronisch ablegen"}


def _dateiteil(text):
    return re.sub(r'[\\/:*?"<>|]+', "", text).strip()[:40]


# --------------------------------------------------------------------------- Dubletten

def _woerter(text):
    return re.findall(r"[a-zäöüß0-9]{2,}", text.lower())


def _text_der_datei(pfad):
    try:
        with fitz.open(pfad) as d:
            return d.page_count, " ".join(p.get_text() for p in d)
    except Exception:
        return None, ""


def finde_dublette(ordner, seiten, e):
    """Liegt in `ordner` schon ein Schreiben mit (fast) gleichem Text? Dann dessen Dateiname.
    Derselbe Brief zweimal gescannt ergibt nie genau dieselbe Datei, aber fast denselben erkannten Text."""
    schwelle = e.get("dubletten_schwelle", 0.95)
    if not schwelle or not os.path.isdir(ordner):
        return None
    neu = _woerter(" ".join(s.text for s in seiten))
    if len(neu) < 15:          # zu wenig Text für einen sicheren Vergleich
        return None
    grenze = time.time() - e.get("dubletten_tage", 30) * 86400
    for name in sorted(os.listdir(ordner)):
        pfad = os.path.join(ordner, name)
        if not name.lower().endswith(".pdf") or not os.path.isfile(pfad):
            continue
        if os.path.getmtime(pfad) < grenze:
            continue
        n, text = _text_der_datei(pfad)
        if n != len(seiten):
            continue
        alt = _woerter(text)
        if not alt or abs(len(alt) - len(neu)) > 0.1 * max(len(alt), len(neu)):
            continue
        # Zahlen (Datum, Aktenzeichen, Beträge) müssen praktisch gleich sein: zwei verschiedene Schreiben
        # mit gleichem Vordruck (z. B. zwei Eintragungsnachrichten) unterscheiden sich gerade darin.
        z_neu, z_alt = {w for w in neu if any(c.isdigit() for c in w)}, {w for w in alt if any(c.isdigit() for c in w)}
        if (z_neu or z_alt) and len(z_neu & z_alt) / len(z_neu | z_alt) < 0.9:
            continue
        if difflib.SequenceMatcher(None, neu, alt, autojunk=False).ratio() >= schwelle:
            return name
    return None


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
    # E-Mail (vom Mail-Abruf): eine Mail ist immer EIN Schreiben, Absender und Betreff aus der Mail
    mail, _ = mailabruf.lies_begleitdatei(pfad)
    if mail:
        teile = [[s for s in seiten if not s.leer] or seiten]
    else:
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
        schreiben_art, aktion, stichwort = bestimme_art(teil, e)
        if art == "unklar":
            aktion = "zuordnen"
        kurz = kurzfassung(teil)
        stamm = f"Mail {stempel} Nr {i:02d}" if mail else f"Eingang {stempel} Nr {i:02d}"
        if schreiben_art:
            stamm += f" - {_dateiteil(schreiben_art)}"
        ergebnisse.append(dict(teil=teil, art=art, wert=wert if art != "unklar" else "",
                               grund=grund, seiten=seiten_txt, ordner=ordner, stamm=stamm,
                               start=", ".join(teil[0].gruende), schreiben_art=schreiben_art,
                               aktion=aktion, stichwort=stichwort,
                               absender=(mail["von"][:60] if mail else absender(teil[0], e)),
                               betreff=((mail["betreff"] or kurz[0]) if mail else kurz[0]), kurz=kurz[1],
                               mail_anhaenge=(mail.get("anhaenge", []) if mail else [])))
    if probe:
        doc.close()
        return ergebnisse, ohne_text, len(seiten)
    for r in ergebnisse:
        doppelt = finde_dublette(r["ordner"], r["teil"], e)
        if doppelt:
            # Nie löschen: Dubletten kommen in einen eigenen Ordner, das Protokoll nennt das Original.
            r["grund"] = f"Dublette von {os.path.basename(r['ordner'])}\\{doppelt}"
            r["ordner"] = e.get("ziel_dubletten") or os.path.join(e["eingang"], "Dubletten")
            r["aktion"] = "dublette"
        os.makedirs(r["ordner"], exist_ok=True)
        r["datei"] = freier_name(r["ordner"], r["stamm"])
        schreibe(doc, r["teil"], r["datei"])
        # Anhänge einer Mail, die keine PDF werden konnten (Word, Excel …), kommen daneben
        for anh in r.get("mail_anhaenge", []):
            if os.path.exists(anh):
                vorne = os.path.splitext(os.path.basename(r["datei"]))[0]   # wie die PDF, ggf. mit „(2)“
                b, x = os.path.splitext(os.path.join(r["ordner"], f"{vorne} - {os.path.basename(anh)}"))
                ziel, k = b + x, 2
                while os.path.exists(ziel):
                    ziel = f"{b} ({k}){x}"
                    k += 1
                shutil.move(anh, ziel)
                r.setdefault("mail_anhang_dateien", []).append(ziel)
        if r["art"] in ("urkunde", "vorgang") and r["aktion"] != "dublette":
            # Laufende Aktendaten für die Nebenakte (§ 43 NotAktVV); darf das Sortieren nie aufhalten
            try:
                import nebenakte
                nebenakte.eintragen(e, r, pfad)
                nebenakte.verbindung_aus_schreiben(e, r, bestand)
            except Exception as ex:
                print("Hinweis: Aktendaten für die Nebenakte nicht geschrieben:", ex)
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
            w.writerow(SPALTEN)
        jetzt = dt.datetime.now().strftime("%d.%m.%Y %H:%M:%S")
        for r in ergebnisse:
            zu = {"urkunde": "Urkunde", "vorgang": "Vorgang", "unklar": "nicht zugeordnet"}[r["art"]]
            w.writerow([jetzt, os.path.basename(quelle), r["seiten"], zu, r["wert"],
                        os.path.basename(r.get("datei", "")), r["grund"] or hinweis,
                        r.get("schreiben_art", ""), r.get("aktion", ""), r.get("absender", ""),
                        r.get("datei", ""), r.get("betreff", ""), r.get("kurz", "")])
    tagesliste(e)


LISTEN_ABSCHNITTE = [
    ("vorlegen", "Mit der Akte vorlegen", "Vollzugsrelevant: bitte ausdrucken bzw. mit der Akte vorlegen."),
    ("zuordnen", "Bitte zuordnen", "Keine sichere UVZ- oder Vorgangsnummer erkannt: liegt in „Nicht zugeordnet“."),
    ("ablegen", "Nur elektronisch abgelegt", "Nichts zu tun, das Schreiben liegt im Ordner der Urkunde bzw. des Vorgangs."),
    ("dublette", "Doppelt gescannt", "Lag schon vor, wurde nach „Dubletten“ gelegt. Nichts zu tun."),
]


def _html(t):
    return (t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def tagesliste(e, tag=None):
    """Schreibt die Tagesliste für die Mitarbeiter (HTML, öffnet im Browser) aus dem Protokoll neu."""
    tag = tag or dt.date.today()
    datei = os.path.join(e["protokoll"], f"Protokoll {tag:%Y-%m}.csv")
    if not os.path.exists(datei):
        return None
    zeilen = []
    with open(datei, encoding="utf-8-sig", newline="") as f:
        for z in csv.reader(f, delimiter=";"):
            if not z or z[0] == "Zeit" or not z[0].startswith(tag.strftime("%d.%m.%Y")):
                continue
            z += [""] * (13 - len(z))
            zeilen.append(z)
    gruppen = {k: [] for k, _, _ in LISTEN_ABSCHNITTE}
    for z in zeilen:
        aktion = z[8] or ("zuordnen" if z[3] == "nicht zugeordnet" else "vorlegen")
        gruppen.setdefault(aktion, []).append(z)
    teile = [f"<!doctype html><html lang='de'><head><meta charset='utf-8'><title>Posteingang {tag:%d.%m.%Y}</title>",
             "<style>body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#222}h1{font-size:22px}"
             "h2{font-size:17px;margin-top:28px;border-bottom:2px solid #1a5fa0;padding-bottom:4px}"
             "p.hinweis{color:#555;margin:4px 0 8px}table{border-collapse:collapse;width:100%}"
             "td,th{border:1px solid #ccc;padding:5px 8px;text-align:left;font-size:14px;vertical-align:top}"
             "th{background:#eef3f8}td.k{width:1%;text-align:center}.leer{color:#777;font-style:italic}"
             "@media print{a{color:#000;text-decoration:none}}</style></head><body>",
             f"<h1>Posteingang {tag:%d.%m.%Y}</h1>",
             f"<p class='hinweis'>Stand {dt.datetime.now():%H:%M} Uhr · {len(zeilen)} Schreiben · "
             "erstellt vom Sortier-Programm (ohne KI, feste Regeln)</p>"]
    for k, titel, hinweis in LISTEN_ABSCHNITTE:
        g = gruppen.get(k, [])
        teile.append(f"<h2>{_html(titel)} ({len(g)})</h2><p class='hinweis'>{_html(hinweis)}</p>")
        if not g:
            teile.append("<p class='leer'>keine</p>")
            continue
        teile.append("<table><tr><th>✓</th><th>Zeit</th><th>Urkunde / Vorgang</th><th>Art</th>"
                     "<th>Absender</th><th>Seiten</th><th>Datei</th></tr>")
        for z in g:
            nummer = (("UVZ " if z[3] == "Urkunde" else "Vorgang ") + z[4]) if z[4] else \
                ("–" if k == "dublette" else _html(z[6]))
            pfad = z[10]
            link = (f"<a href='file:///{_html(pfad.replace(os.sep, '/'))}'>{_html(z[5])}</a>"
                    if pfad else _html(z[5]))
            teile.append(f"<tr><td class='k'>☐</td><td>{_html(z[0][11:16])}</td><td>{nummer}</td>"
                         f"<td>{_html(z[7]) or '–'}{('<br><small>' + _html(z[11]) + '</small>') if z[11] else ''}</td><td>{_html(z[9])}</td><td>{_html(z[2])}</td>"
                         f"<td>{link}</td></tr>")
        teile.append("</table>")
    teile.append("</body></html>")
    ordner = e.get("tageslisten") or os.path.join(e["eingang"], "Tageslisten")
    os.makedirs(ordner, exist_ok=True)
    ziel = os.path.join(ordner, f"Posteingang {tag:%Y-%m-%d}.html")
    tmp = ziel + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write("".join(teile))
    os.replace(tmp, ziel)
    if tag == dt.date.today():   # immer gleicher Name, damit eine Verknüpfung auf dem Desktop reicht
        try:
            shutil.copyfile(ziel, os.path.join(ordner, "Posteingang heute.html"))
        except OSError:
            pass
    return ziel


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


_naechster_mailabruf = [0.0]


def mail_abrufen(e, ausgabe=print, jetzt=False):
    """Neue Mails aus dem Büro-Postfach holen (nur wenn auf diesem PC eingerichtet). Fehler halten das
    Sortieren der Scans nie auf."""
    cfg = e.get("mail") or {}
    if not jetzt and time.time() < _naechster_mailabruf[0]:
        return 0
    _naechster_mailabruf[0] = time.time() + 60 * float(cfg.get("abruf_minuten", mailabruf.STANDARD["abruf_minuten"]))
    try:
        n = mailabruf.abrufen(e, ausgabe)
        if n:
            ausgabe(f"{n} E-Mail(s) aus dem Postfach abgeholt.")
        return n
    except Exception as ex:
        ausgabe(f"E-Mail-Abruf fehlgeschlagen: {ex}")
        return 0


def _durchlauf(e, eingang, ausgabe, sperre):
    mail_abrufen(e, ausgabe)
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
        mail, begleit = mailabruf.lies_begleitdatei(pfad)
        hinweis = "Scan ohne Texterkennung (OCR in PaperStream einschalten)" if ohne_text > n // 2 and not mail else ""
        protokolliere(e, pfad, ergebnisse, hinweis)
        archiv = os.path.join(e["archiv"], dt.date.today().strftime("%Y-%m"))
        os.makedirs(archiv, exist_ok=True)
        ziel_archiv = freier_name(archiv, os.path.splitext(name)[0])
        shutil.move(pfad, ziel_archiv)
        if begleit:
            shutil.move(begleit, os.path.splitext(ziel_archiv)[0] + mailabruf.SIDECAR_ENDUNG)
            try:   # leerer Zwischenordner der Anhänge
                os.rmdir(os.path.join(eingang, "Mail-Anhänge", os.path.splitext(name)[0]))
            except OSError:
                pass
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
              + (f"   <{r['schreiben_art'] or '?'}: {AKTION_TEXT.get(r['aktion'], r['aktion'])}>")
              + (f"   [{r['grund']}]" if r["grund"] else "")
              + (f"   (Beginn: {r['start']})" if r["start"] else ""))
    if ohne_text:
        print(f"  Achtung: {ohne_text} Seiten ohne Text – ist die Texterkennung eingeschaltet?")
    return ergebnisse


# --------------------------------------------------------------------------- Selbst-Update

RELEASES_URL = "https://api.github.com/repos/twoinar/tools/releases?per_page=30"


def _version(t):
    try:
        return tuple(int(x) for x in t.split("."))
    except ValueError:
        return ()


def neueste_version(releases):
    """Aus der Release-Liste von GitHub die höchste posteingang-<Version> mit Zip-Paket: (version, url)."""
    best = None
    for r in releases:
        tag = r.get("tag_name", "")
        if not tag.startswith("posteingang-") or r.get("draft") or r.get("prerelease"):
            continue
        v = tag[len("posteingang-"):]
        url = next((a.get("browser_download_url") for a in r.get("assets", [])
                    if a.get("name", "").lower().endswith(".zip")), None)
        if url and _version(v) and (best is None or _version(v) > _version(best[0])):
            best = (v, url)
    return best


def programmordner(wurzel):
    """Ordner im entpackten Paket, in dem Posteingang-sortieren.exe liegt."""
    for w, _, dateien in os.walk(wurzel):
        if "Posteingang-sortieren.exe" in dateien:
            return w
    return None


def _hole(url, ziel=None):
    req = urllib.request.Request(url, headers={"User-Agent": "Posteingang-sortieren/" + VERSION,
                                               "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=60) as antwort:
        daten = antwort.read()
    if ziel:
        with open(ziel, "wb") as f:
            f.write(daten)
    return daten


def einspiel_skript(pid, quelle, ziel, starten=True, log="nul"):
    """Windows-Skript: warten bis Prozess `pid` beendet ist, Dateien kopieren, neue Version starten.
    (ping statt timeout, weil timeout ohne Konsole sofort abbricht)"""
    start = 'start "Posteingang sortieren" /min "%ZIEL%\\Posteingang-sortieren.exe" --dauerhaft' if starten else ""
    return f"""@echo off
set PID={pid}
set QUELLE={quelle}
set ZIEL={ziel}
set LOG={log}
echo %date% %time% [%COMPUTERNAME%] Update: warte auf Ende von PID %PID% >> "%LOG%"
:warte
tasklist /FI "PID eq %PID%" /NH 2>nul | find " %PID% " >nul && (ping -n 3 127.0.0.1 >nul & goto warte)
if exist "%ZIEL%\\einstellungen.json" copy /y "%ZIEL%\\einstellungen.json" "%ZIEL%\\einstellungen.vorher.json" >nul
set /a VERSUCH=0
:kopiere
copy /y "%QUELLE%\\*" "%ZIEL%" >nul && goto start
set /a VERSUCH+=1
if %VERSUCH% GEQ 30 goto start
ping -n 11 127.0.0.1 >nul
goto kopiere
:start
echo %date% %time% [%COMPUTERNAME%] Update: kopiert (Versuche %VERSUCH%), starte neue Version >> "%LOG%"
{start}
echo %date% %time% [%COMPUTERNAME%] Update: Start-Befehl Ergebnis %ERRORLEVEL% >> "%LOG%"
"""


def pruefe_update(e, ausgabe=print):
    """Lädt eine neuere Version von GitHub (nur herunterladen, es wird nichts hochgeladen) und tauscht
    das Programm in seinem Ordner aus. Gibt True zurück, wenn sich das laufende Programm beenden soll."""
    if not getattr(sys, "frozen", False) or os.name != "nt":
        return False
    try:
        neu = neueste_version(json.loads(_hole(RELEASES_URL)))
    except Exception as ex:
        ausgabe(f"Update-Prüfung nicht möglich: {ex}")
        return False
    if not neu or _version(neu[0]) <= _version(VERSION):
        return False
    version, url = neu
    ausgabe(f"Neue Version {version} gefunden, wird eingespielt …")
    arbeit = tempfile.mkdtemp(prefix="posteingang-update-")
    try:
        zip_pfad = os.path.join(arbeit, "paket.zip")
        _hole(url, zip_pfad)
        with zipfile.ZipFile(zip_pfad) as z:
            namen = z.namelist()
            if not any(n.endswith("Posteingang-sortieren.exe") for n in namen):
                raise ValueError("Paket enthält kein Programm")
            z.extractall(os.path.join(arbeit, "neu"))
        quelle = programmordner(os.path.join(arbeit, "neu"))
        if not quelle:
            raise ValueError("Programm im Paket nicht gefunden")
    except Exception as ex:
        ausgabe(f"Update {version} fehlgeschlagen, alte Version läuft weiter: {ex}")
        shutil.rmtree(arbeit, ignore_errors=True)
        return False
    # Das laufende Programm kann sich nicht selbst überschreiben: ein kleines Skript wartet,
    # bis es beendet ist, kopiert die neuen Dateien und startet die neue Version.
    skript = os.path.join(arbeit, "einspielen.cmd")
    with open(skript, "w", encoding="cp1252", errors="replace") as f:
        f.write(einspiel_skript(os.getpid(), quelle, HIER, log=os.path.join(e["protokoll"], "Programm.log")))
    subprocess.Popen(["cmd", "/c", skript], creationflags=0x08000000)  # CREATE_NO_WINDOW
    return True


SPALTEN = ["Zeit", "Scan", "Seiten", "Zuordnung", "Nummer", "Datei", "Hinweis",
           "Art", "Was tun", "Absender", "Pfad", "Betreff", "Kurzfassung"]


def _datei_suchen(e, z):
    """Wo liegt die Datei einer Protokollzeile? (ältere Zeilen haben noch keinen Pfad)"""
    if z[10] and os.path.isfile(z[10]):
        return z[10]
    if z[6].startswith("Dublette"):
        ordner = e.get("ziel_dubletten") or os.path.join(e["eingang"], "Dubletten")
    elif z[3] == "Urkunde" and z[4]:
        ordner = os.path.join(e["ziel_urkunden"], z[4])
    elif z[3] == "Vorgang" and z[4]:
        ordner = os.path.join(e["ziel_vorgaenge"], z[4])
    else:
        ordner = e["ziel_unklar"]
    pfad = os.path.join(ordner, z[5])
    return pfad if z[5] and os.path.isfile(pfad) else ""


def nachtragen(e, monate=2):
    """Ältere Protokollzeilen (vor 1.3/1.5) um Art, Absender, Betreff und Kurzfassung ergänzen.
    Dateien werden dabei nur gelesen, nicht umbenannt oder verschoben."""
    heute = dt.date.today()
    erste = heute.replace(day=1)
    tage = set()
    for i in range(monate):
        m = (erste - dt.timedelta(days=1) * (31 * i)).replace(day=1) if i else erste
        datei = os.path.join(e["protokoll"], f"Protokoll {m:%Y-%m}.csv")
        if not os.path.exists(datei):
            continue
        with open(datei, encoding="utf-8-sig", newline="") as f:
            zeilen = list(csv.reader(f, delimiter=";"))
        geaendert = bool(zeilen) and zeilen[0] != SPALTEN
        for z in zeilen[1:]:
            if not z or len(z) < 6:
                continue
            z += [""] * (len(SPALTEN) - len(z))
            if z[12]:
                continue
            pfad = _datei_suchen(e, z)
            if not pfad:
                z[12] = "(Datei nicht gefunden)"
            else:
                try:
                    with fitz.open(pfad) as d:
                        seiten = lies_seiten(d)
                    art, aktion, _ = bestimme_art(seiten, e)
                    z[7] = z[7] or art
                    if not z[8]:
                        z[8] = "dublette" if z[6].startswith("Dublette") else \
                            ("zuordnen" if z[3] == "nicht zugeordnet" else aktion)
                    z[9] = z[9] or absender(seiten[0], e)
                    z[10] = pfad
                    z[11], z[12] = kurzfassung(seiten)
                    z[12] = z[12] or "(kein Text erkannt)"
                except Exception as ex:
                    z[12] = f"(nicht lesbar: {ex})"[:80]
            geaendert = True
            try:
                tage.add(dt.datetime.strptime(z[0][:10], "%d.%m.%Y").date())
            except ValueError:
                pass
        if geaendert:
            zeilen[0] = SPALTEN
            tmp = datei + ".tmp"
            with open(tmp, "w", encoding="utf-8-sig", newline="") as f:
                csv.writer(f, delimiter=";").writerows(zeilen)
            os.replace(tmp, datei)
    for t in sorted(tage):
        tagesliste(e, t)
    return len(tage)


class _Log:
    """Ausgabe zusätzlich in Y:\\Posteingang\\Protokoll\\Programm.log (für die Fehlersuche, ohne Briefinhalte)."""
    def __init__(self, ordner, konsole):
        self.datei = os.path.join(ordner, "Programm.log")
        self.konsole = konsole
        try:
            os.makedirs(ordner, exist_ok=True)
            if os.path.exists(self.datei) and os.path.getsize(self.datei) > 1_000_000:
                os.replace(self.datei, self.datei + ".alt")
        except OSError:
            pass

    def write(self, text):
        try:
            self.konsole.write(text)
        except Exception:
            pass
        if text.strip():
            try:
                with open(self.datei, "a", encoding="utf-8") as f:
                    f.write(f"{dt.datetime.now():%d.%m.%Y %H:%M:%S} [{os.environ.get('COMPUTERNAME', '?')}] {text.rstrip()}\n")
            except OSError:
                pass

    def flush(self):
        try:
            self.konsole.flush()
        except Exception:
            pass


def nebenakte_export(e, args):
    """Export Nebenakte (§ 43 NotAktVV): posteingang.py --nebenakte [30471 | 2048/2026 | alle] [--ziel ORDNER] [--still]"""
    import nebenakte
    still = "--still" in args
    ziel = args[args.index("--ziel") + 1] if "--ziel" in args else None
    nummern = [a for i, a in enumerate(args) if not a.startswith("--") and (i == 0 or args[i - 1] != "--ziel")]
    print(f"Export Nebenakte – Postsortierer {VERSION} · Stand {STAND}")
    if not nummern and not still:
        nummern = [input("Vorgangsnummer (z. B. 30471), UVZ-Nr. (z. B. 2048/2026) oder „alle“: ").strip()]
    if nummern == ["alle"]:
        nummern = nebenakte.alle_akten(e)
        print(f"{len(nummern)} Akte(n) werden exportiert.")
    ergebnisse = []
    for n in nummern:
        try:
            r = nebenakte.exportiere(e, n, VERSION, STAND, ziel)
        except ValueError as ex:
            print("FEHLER:", ex)
            ergebnisse.append(None)
            continue
        ergebnisse.append(r)
        a = r["akte"]
        if r["ok"]:
            print(f"OK  {a.aktenzeichen}: {len(a.dokumente)} Schreiben -> {r['ordner']}" + ("  (mit Deckblatt Papierakte)" if r["hybrid"] else ""))
        else:
            print(f"NICHT exportiert {a.aktenzeichen}:")
            for f in r["fehler"]:
                print("   ", f)
        for w in a.warnungen:
            print("   Achtung:", w)
    if len(ergebnisse) == 1 and ergebnisse[0] and not still and hasattr(os, "startfile"):
        os.startfile(ergebnisse[0]["bericht"])
    if not still:
        input("Fertig. Enter drücken zum Schließen …")
    return ergebnisse


def main(argv):
    pfad_einst = os.path.join(HIER, "einstellungen.json")
    e = lade_einstellungen()
    if len(argv) > 2 and argv[1] == "--probe":
        for p in argv[2:]:
            probe(p, e)
        return
    if len(argv) > 1 and argv[1] == "--nebenakte":
        nebenakte_export(e, argv[2:])
        return
    if len(argv) > 1 and argv[1] == "--mail-einrichten":
        mailabruf.einrichten(e)
        input("Enter drücken zum Schließen …")
        return
    if len(argv) > 1 and argv[1] == "--mail-aus":
        mailabruf.ausschalten()
        input("Enter drücken zum Schließen …")
        return
    if len(argv) > 1 and argv[1] == "--nachtragen":
        print(nachtragen(e), "Tag(e) ergänzt.")
        return
    if len(argv) > 1 and argv[1] == "--dauerhaft":
        sys.stdout = _Log(e["protokoll"], sys.stdout)
        sys.stderr = sys.stdout
        print(f"Posteingang sortieren {VERSION} – überwacht {e['eingang']} (Strg+C beendet)")
        stand = os.path.getmtime(pfad_einst)
        naechste_pruefung = time.time() + 60
        try:
            if nachtragen(e):
                print("Ältere Einträge im Protokoll ergänzt.")
        except Exception as ex:
            print("Nachtragen fehlgeschlagen:", ex)
        while True:
            # Geänderte Regeln (einstellungen.json) gelten sofort, ohne Neustart
            try:
                if os.path.getmtime(pfad_einst) != stand:
                    e = lade_einstellungen()
                    stand = os.path.getmtime(pfad_einst)
                    print("Einstellungen neu geladen.")
            except Exception as ex:
                print("Einstellungen fehlerhaft, alte bleiben aktiv:", ex)
            try:
                durchlauf(e)
            except Exception as ex:
                print("FEHLER:", ex)
            minuten = e.get("update_pruefen_minuten", 60)
            if minuten and time.time() >= naechste_pruefung:
                naechste_pruefung = time.time() + minuten * 60
                if pruefe_update(e):
                    print("Neue Version wird gestartet.")
                    return
            time.sleep(e.get("intervall_sekunden", 20))
    n = durchlauf(e)
    print(f"{n} Scan(s) verarbeitet.")
    if "--warten" in argv:
        input("Fertig. Enter drücken zum Schließen …")


if __name__ == "__main__":
    main(sys.argv)
