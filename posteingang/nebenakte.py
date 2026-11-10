# -*- coding: utf-8 -*-
"""
Nebenakte – strukturierter Datensatz nach § 43 NotAktVV (Nebenakten-Datensatz-Bekanntmachung-2023)

Der Postsortierer führt beim Ablegen je Akte eine interne Liste (_nebenakte.json im Ablageordner).
Auf Anforderung erzeugt „Export Nebenakte“ je Akte einen Ordner mit
    nebenakte.xml        geprüft gegen das Schema der Bundesnotarkammer (Elektronische_Nebenakte_1.1.0.xsd)
    dokumente\\          alle Schreiben der Akte
    intern.json          was das Schema nicht kennt (SHA-256, Status, Papieroriginal, Imprinter …)
    Deckblatt Papierakte.pdf   nur bei hybrider Akte (§ 44 Abs. 2 NotAktVV)
    Export-Bericht.html  Ergebnis der Prüfung, Warnungen, Aufbewahrungsende

Akte = Vorgang (Aktenzeichen = Vorgangsnummer). Post zu einer Urkunde gehört in die Akte des Vorgangs, aus dem die
Urkunde entstanden ist; ist kein Vorgang bekannt, ist die Urkunde eine eigene Akte (Aktenzeichen W<Nr>-<Jahr>).
Alles läuft lokal, ohne Netz und ohne KI.
"""
import datetime as dt
import hashlib
import html
import json
import os
import re
import shutil
import sys

NS = "http://www.bnotk.de/schemas/elektronische_nebenakte"
SCHEMA_DATEI = "Elektronische_Nebenakte_1.1.0.xsd"
SCHEMA_VERSION = "1.1.0"
AKTE_DATEI = "_nebenakte.json"
VERBINDUNGEN_DATEI = "Verbindungen Urkunde-Vorgang.json"

STANDARD = {
    "export_ordner": "Y:\\Nebenakten-Export",
    "aufbewahrungsfrist": 7,
    # Arten des Sortierers, die zum Vollzug gehören (Kategorie „Vollzug“)
    "vollzug_arten": ["Grundbuchamt", "Genehmigung", "Vorkaufsrecht", "Zustimmung Verwalter",
                      "Unbedenklichkeitsbescheinigung", "Bank / Löschung", "Register / Nachlass",
                      "Verwahrung / Anderkonto"],
    # Stichworte, bei denen das Papieroriginal aufbewahrt wird (Kategorie „Original in Papierakte“)
    "papier_original_muster": ["Grundschuldbrief", "Hypothekenbrief", "L(ö|oe)schungsbewilligung",
                               "Genehmigungserkl(ä|ae)rung", "Verwalterzustimmung", "Vollmacht"],
    # Ordnername in Y:\\Vorgänge -> Geschäftsgegenstand (nur eindeutige Fälle; Wert muss im Schema stehen)
    "geschaeftsgegenstand_aus_ordnername": {
        "Schenkung": "Schenkungsvertrag", "Testament": "Testament", "Erbvertrag": "Erbvertrag",
        "Ehevertrag": "Ehevertrag", "Vorsorgevollmacht": "Vorsorgevollmacht", "Vollmacht": "Vollmacht",
        "Erbausschlagung": "Erbausschlagung", "Bauträger": "Bauträgervertrag", "Erbschein": "Antrag auf Erteilung eines Erbscheins (mit EV)",
        "Teilungserklärung": "Teilungserklärung/Teilungsvertrag nach WEG", "Überlassung": "Überlassungsvertrag",
        "Verwahrung": "Verwahrungsgeschäft", "Handelsregister": "Handelsregisteranmeldung",
        "Vereinsregister": "Vereinsregisteranmeldung", "Löschung": "Löschungsbewilligung"},
    # Imprinter: Seiten je Blatt im Scan (2 bei Duplex). 0 = nicht berechnen (z. B. solange der Scanner leere
    # Seiten selbst überspringt – dann passt die Zählung nicht).
    "imprinter_seiten_je_blatt": 0,
}


def einstellung(e, schluessel):
    return (e.get("nebenakte") or {}).get(schluessel, STANDARD[schluessel])


def programm_ordner():
    if getattr(sys, "frozen", False):
        return getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


def schema_pfad():
    for o in (programm_ordner(), os.path.dirname(sys.executable if getattr(sys, "frozen", False) else __file__)):
        p = os.path.join(o, SCHEMA_DATEI)
        if os.path.exists(p):
            return p
    return os.path.join(programm_ordner(), SCHEMA_DATEI)


# --------------------------------------------------------------------------- Hilfen

def sha256(pfad):
    h = hashlib.sha256()
    with open(pfad, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _json_lesen(pfad, leer):
    try:
        with open(pfad, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return leer
    except (ValueError, OSError) as ex:
        raise ValueError(f"{pfad} ist keine gültige JSON-Datei ({ex})")


def _json_schreiben(pfad, daten):
    tmp = pfad + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(daten, f, ensure_ascii=False, indent=2)
    os.replace(tmp, pfad)


def datum(wert):
    """'2026-11-07', '07.11.2026' oder datetime -> date (sonst ValueError)."""
    if isinstance(wert, dt.datetime):
        return wert.date()
    if isinstance(wert, dt.date):
        return wert
    s = str(wert or "").strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s) or None
    try:
        if m:
            return dt.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$", s)
        if m:
            return dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError:
        pass
    raise ValueError(f"„{s}“ ist kein Datum (TT.MM.JJJJ oder JJJJ-MM-TT)")


MONATE = {"januar": 1, "februar": 2, "märz": 3, "maerz": 3, "april": 4, "mai": 5, "juni": 6, "juli": 7,
          "august": 8, "september": 9, "oktober": 10, "november": 11, "dezember": 12}
RE_BRIEFDATUM = re.compile(r"(?:Datum\s*:?\s*|,\s*(?:den\s+)?)(\d{1,2})\.\s?(\d{1,2}\.|[A-Za-zäÄ]+)\s?((?:19|20)\d{2})\b")


def briefdatum(kopf, eingang):
    """Datum des Schreibens aus dem Briefkopf („Datum: 05.11.2026“, „Musterdorf, den 5. November 2026“).
    Nur wenn eindeutig und plausibel (nicht nach dem Eingang, höchstens ein Jahr davor)."""
    gefunden = set()
    for m in RE_BRIEFDATUM.finditer(kopf or ""):
        t, mo, j = m.groups()
        mo = MONATE.get(mo.lower()) if not mo.endswith(".") else int(mo[:-1])
        try:
            d = dt.date(int(j), int(mo), int(t))
        except (TypeError, ValueError):
            continue
        if eingang - dt.timedelta(days=366) <= d <= eingang:
            gefunden.add(d)
    return gefunden.pop() if len(gefunden) == 1 else None


def imprinter_nummern(e, quelle, teil):
    """Blattnummern des Imprinters für ein Schreiben: Startnummer aus dem Dateinamen des Scans
    (Post_<Datum>_<Zeit>_<Blattzähler>.pdf) plus Blatt im Stapel."""
    je_blatt = einstellung(e, "imprinter_seiten_je_blatt")
    m = re.search(r"_(\d{1,6})\.pdf$", os.path.basename(quelle), re.I)
    if not je_blatt or not m:
        return None, None
    start = int(m.group(1))
    return start + teil[0].nr // je_blatt, start + teil[-1].nr // je_blatt


# --------------------------------------------------------------------------- Laufende Aktendaten

def lade_akte(ordner):
    return _json_lesen(os.path.join(ordner, AKTE_DATEI), {"akte": {}, "dokumente": []})


def speichere_akte(ordner, daten):
    _json_schreiben(os.path.join(ordner, AKTE_DATEI), daten)


def verbindungen_pfad(e):
    return os.path.join(e["eingang"], VERBINDUNGEN_DATEI)


def verbindung_merken(e, uvz, vorgang):
    """UVZ (z. B. '2048-2026') gehört zu Vorgang (z. B. '30471'). Gelernt aus Schreiben, die beide Nummern tragen."""
    pfad = verbindungen_pfad(e)
    v = _json_lesen(pfad, {})
    if v.get(uvz) == vorgang:
        return
    if uvz in v and v[uvz] != vorgang:
        v.setdefault("_widersprueche", {})[uvz] = sorted({v[uvz], vorgang} | set(v.get("_widersprueche", {}).get(uvz, [])))
        _json_schreiben(pfad, v)
        return
    v[uvz] = vorgang
    _json_schreiben(pfad, v)


def eintragen(e, r, quelle, heute=None):
    """Nach dem Ablegen eines Schreibens: Eintrag in _nebenakte.json des Ablageordners."""
    import posteingang as P   # noqa: späte Einbindung (keine Kreisabhängigkeit beim Start)
    teil, ordner, datei = r["teil"], r["ordner"], r["datei"]
    eingang = dt.datetime.fromtimestamp(os.path.getmtime(quelle))
    text = "\n".join(s.text for s in teil)
    papier = next((m.group(0) for m in (re.search(x, text, re.I) for x in einstellung(e, "papier_original_muster")) if m), "")
    von, bis = imprinter_nummern(e, quelle, teil)
    anrede = P.RE_ANREDE.search(teil[0].oben)
    kopf = teil[0].oben[:anrede.start()] if anrede else teil[0].oben
    bd = briefdatum(kopf, eingang.date())
    daten = lade_akte(ordner)
    daten["dokumente"].append({
        "datei": os.path.basename(datei),
        "sha256": sha256(datei),
        "eingang": eingang.strftime("%Y-%m-%dT%H:%M"),
        "briefdatum": bd.isoformat() if bd else "",
        "absender": r.get("absender", ""),
        "betreff": r.get("betreff", ""),
        "art": r.get("schreiben_art", ""),
        "aktion": r.get("aktion", ""),
        "vollzug": r.get("schreiben_art", "") in einstellung(e, "vollzug_arten"),
        "papier_original": bool(papier),
        "papier_grund": papier,
        "imprinter_von": f"{von:04d}" if von is not None else "",
        "imprinter_bis": f"{bis:04d}" if bis is not None else "",
        "original_scan": os.path.basename(quelle),
        "seiten": r.get("seiten", ""),
        "zuordnung": r["art"] + ":" + r["wert"],
        "status": "offen",
    })
    speichere_akte(ordner, daten)


def verbindung_aus_schreiben(e, r, bestand):
    """Trägt ein Schreiben mit Urkunden-Zuordnung auch genau eine gültige Vorgangsnummer, merken wir uns die Verbindung."""
    if r["art"] != "urkunde":
        return
    vorgaenge = {v.lstrip("0") for s in r["teil"] for v in s.vorgang if bestand.vorgang_ok(v.lstrip("0"))}
    if len(vorgaenge) == 1:
        verbindung_merken(e, r["wert"], vorgaenge.pop())


# --------------------------------------------------------------------------- Akte zusammenstellen

class Akte:
    def __init__(self):
        self.aktenzeichen = ""
        self.beschreibung = ""
        self.anlagedatum = None
        self.vorgangsordner = None        # Ordner in Y:\\Vorgänge
        self.ablageordner = []            # [(ordner, uvz oder None)]
        self.uvz = []                     # ['2048-2026']
        self.daten = {}                   # Aktenangaben aus _nebenakte.json („akte“)
        self.dokumente = []               # [(ordner, eintrag)]
        self.fehler = []
        self.warnungen = []


def _vorgangsordner(e, nr):
    for basis in e.get("vorgaenge_ordner", []):
        if not os.path.isdir(basis):
            continue
        for name in os.listdir(basis):
            m = re.match(r"^\s*0*(\d{1,8})\b(.*)$", name)
            if m and m.group(1) == nr.lstrip("0") and os.path.isdir(os.path.join(basis, name)):
                return os.path.join(basis, name), m.group(2).strip(" -_")
    return None, ""


def verbindungen(e):
    """{uvz: vorgang} aus der gelernten Liste, den Aktenangaben der Vorgänge und Versand-Vermerken in Y:\\Vorgänge."""
    v = {k: w for k, w in _json_lesen(verbindungen_pfad(e), {}).items() if not k.startswith("_")}
    for basis in e.get("vorgaenge_ordner", []):
        if not os.path.isdir(basis):
            continue
        for name in os.listdir(basis):
            if name.lower().endswith(".json"):
                try:
                    d = _json_lesen(os.path.join(basis, name), {})
                except ValueError:
                    continue
                if isinstance(d, dict) and d.get("uvz") and d.get("vorgang"):
                    u = re.sub(r"\s*/\s*", "-", str(d["uvz"]).strip())
                    v[u] = str(d["vorgang"]).strip().lstrip("0")
    ziel_v = e.get("ziel_vorgaenge", "")
    if os.path.isdir(ziel_v):
        for nr in os.listdir(ziel_v):
            p = os.path.join(ziel_v, nr, AKTE_DATEI)
            if os.path.exists(p):
                try:
                    for u in _json_lesen(p, {}).get("akte", {}).get("uvz", []):
                        v[re.sub(r"\s*/\s*", "-", str(u).strip())] = nr
                except ValueError:
                    pass
    return v


def normalisiere_nummer(text):
    """'30471' -> ('vorgang','30471'); '2048/2026', 'W2048-2026', 'UVZ 2048/26' -> ('urkunde','2048-2026')."""
    t = text.strip()
    m = re.fullmatch(r"(?:W\s?|UVZ\s*|UR\s*)?0*(\d{1,5})\s*[/-]\s*(\d{2}|\d{4})", t, re.I)
    if m:
        j = m.group(2)
        return "urkunde", f"{int(m.group(1))}-{('20' + j) if len(j) == 2 else j}"
    m = re.fullmatch(r"0*(\d{3,8})", t)
    if m:
        return "vorgang", m.group(1)
    return None, None


def stelle_zusammen(e, art, nr):
    a = Akte()
    verb = verbindungen(e)
    if art == "urkunde" and nr in verb:
        art, nr = "vorgang", verb[nr]
    if art == "vorgang":
        a.aktenzeichen = nr
        a.vorgangsordner, rest = _vorgangsordner(e, nr)
        a.beschreibung = rest or f"Vorgang {nr}"
        a.ablageordner.append((os.path.join(e["ziel_vorgaenge"], e["ordnername_vorgang"].format(nr=nr)), None))
        for u, v in sorted(verb.items()):
            if v == nr:
                n, j = u.split("-")
                a.uvz.append(u)
                a.ablageordner.append((os.path.join(e["ziel_urkunden"], e["ordnername_urkunde"].format(nr=n, jahr=j)), u))
    else:
        n, j = nr.split("-")
        a.aktenzeichen = f"W{n}-{j}"
        a.beschreibung = f"Urkunde UVZ-Nr. {n}/{j}"
        a.uvz.append(nr)
        a.ablageordner.append((os.path.join(e["ziel_urkunden"], e["ordnername_urkunde"].format(nr=n, jahr=j)), nr))

    # Aktenangaben (von Hand gepflegt) aus dem ersten Ablageordner, der welche hat
    for ordner, _ in a.ablageordner:
        try:
            d = lade_akte(ordner)
        except ValueError as ex:
            a.fehler.append(str(ex))
            continue
        if d.get("akte"):
            for k, w in d["akte"].items():
                a.daten.setdefault(k, w)

    # Dokumente: Einträge aus _nebenakte.json, dazu Dateien, die von Hand in den Ordner gelegt wurden
    for ordner, uvz in a.ablageordner:
        if not os.path.isdir(ordner):
            continue
        try:
            eintraege = {x["datei"]: x for x in lade_akte(ordner).get("dokumente", [])}
        except ValueError:
            eintraege = {}
        for name in sorted(os.listdir(ordner)):
            pfad = os.path.join(ordner, name)
            if not os.path.isfile(pfad) or name.startswith(("_", "~")) or name.endswith(".tmp"):
                continue
            x = dict(eintraege.get(name) or _eintrag_ohne_daten(pfad))
            x["_uvz"] = uvz
            a.dokumente.append((ordner, x))
    a.dokumente.sort(key=lambda d: (d[1].get("eingang", ""), d[1]["datei"]))

    # Anlagedatum: Vorgangsordner, sonst erster Eingang, sonst heute
    if a.daten.get("anlagedatum"):
        try:
            a.anlagedatum = datum(a.daten["anlagedatum"])
        except ValueError as ex:
            a.fehler.append(f"Anlagedatum in {AKTE_DATEI}: {ex}")
    if not a.anlagedatum and a.vorgangsordner:
        st = os.stat(a.vorgangsordner)
        a.anlagedatum = dt.date.fromtimestamp(getattr(st, "st_birthtime", None) or st.st_ctime)
    if not a.anlagedatum and a.dokumente:
        a.anlagedatum = datum(a.dokumente[0][1].get("eingang") or dt.date.today())
    if not a.anlagedatum:
        a.anlagedatum = dt.date.today()
    if not a.dokumente:
        a.warnungen.append("Zu dieser Akte liegen im Posteingang keine Schreiben.")
    return a


RE_DATEINAME = re.compile(r"Eingang (\d{4}-\d{2}-\d{2}) (\d{2})-(\d{2}) Nr \d+(?: - (.+?))?(?: \(\d+\))?\.pdf$", re.I)


def _eintrag_ohne_daten(pfad):
    """Für Dateien ohne Eintrag (vor 1.8 abgelegt oder von Hand hineingelegt): was der Dateiname hergibt."""
    name = os.path.basename(pfad)
    m = RE_DATEINAME.match(name)
    if m:
        eingang = f"{m.group(1)}T{m.group(2)}:{m.group(3)}"
        art = m.group(4) or ""
    else:
        eingang = dt.datetime.fromtimestamp(os.path.getmtime(pfad)).strftime("%Y-%m-%dT%H:%M")
        art = ""
    return {"datei": name, "sha256": "", "eingang": eingang, "briefdatum": "", "absender": "", "betreff": "",
            "art": art, "aktion": "", "vollzug": False, "papier_original": False, "papier_grund": "",
            "imprinter_von": "", "imprinter_bis": "", "original_scan": "", "seiten": "", "zuordnung": "",
            "status": "", "ohne_eintrag": True}


# --------------------------------------------------------------------------- XML

def _schema_werte(schema_doc, typ):
    xs = "{http://www.w3.org/2001/XMLSchema}"
    for st in schema_doc.iter(xs + "simpleType"):
        if st.get("name") == typ:
            return [x.get("value") for x in st.iter(xs + "enumeration")]
    return []


def betreff_bezeichnung(x):
    teile = [x.get("absender") or "", x.get("betreff") or x.get("art") or ""]
    t = ": ".join(p for p in teile if p) or os.path.splitext(x["datei"])[0]
    if x.get("imprinter_von"):
        nr = x["imprinter_von"] if x["imprinter_von"] == x.get("imprinter_bis") else f"{x['imprinter_von']}–{x['imprinter_bis']}"
        t += f" (Imprinter-Nr. {nr})"
    return t


def kategorien(e, x):
    k = ["Posteingang"]
    if x.get("vollzug") or x.get("art") in einstellung(e, "vollzug_arten"):
        k.append("Vollzug")
    if x.get("papier_original"):
        k.append("Original in Papierakte")
    if x.get("art"):
        k.append(x["art"])
    if x.get("_uvz"):
        n, j = x["_uvz"].split("-")
        k.append(f"UVZ {n}/{j}")
    return k


def baue_xml(e, a, dateinamen, version, jetzt=None):
    from lxml import etree
    jetzt = jetzt or dt.datetime.now()
    schema_doc = etree.parse(schema_pfad())
    E = lambda tag, text=None, **att: _el(etree, tag, text, att)   # noqa: E731
    wurzel = etree.Element(f"{{{NS}}}Nebenakte_mit_allen_Datenfeldern", nsmap={"elna": NS})
    wurzel.set("Schema_Version", SCHEMA_VERSION)
    wurzel.set("Exportiert_am", jetzt.strftime("%Y-%m-%dT%H:%M:%S"))
    wurzel.set("Exportiert_aus", f"Postsortierer Notariat Woinar {version}")
    wurzel.append(E("Aktenzeichen", a.aktenzeichen))
    if a.beschreibung:
        wurzel.append(E("Beschreibung", a.beschreibung[:255]))
    for v in a.daten.get("verwandte_aktenzeichen", []):
        wurzel.append(E("Verwandte_Aktenzeichen", str(v)))

    vg = E("Vorgang")
    vg.append(E("Vorgangszeichen", a.aktenzeichen))
    beschr = a.beschreibung
    if a.uvz:
        beschr += " – Urkunde(n) " + ", ".join(u.replace("-", "/") for u in a.uvz)
    vg.append(E("Beschreibung", beschr[:255]))
    massen = a.daten.get("massennummer")
    if massen:
        for m in (massen if isinstance(massen, list) else [massen]):
            vg.append(E("Massennummer", str(m)))
    if a.daten.get("abschluss_amtsgeschaeft"):
        vg.append(E("Abschluss_Amtsgeschaeft", datum(a.daten["abschluss_amtsgeschaeft"]).isoformat()))
    vg.append(E("Aufbewahrungsfrist", str(a.daten.get("aufbewahrungsfrist", einstellung(e, "aufbewahrungsfrist")))))
    wa = a.daten.get("weitere_aufbewahrung")
    if wa:
        w = E("Weitere_Aufbewahrung")
        w.append(E("Angeordnet_am", datum(wa.get("am")).isoformat()))
        w.append(E("Angeordnet_bis", datum(wa.get("bis")).isoformat()))
        w.append(E("Angeordnet_weil", str(wa.get("weil", ""))))
        vg.append(w)
    if a.daten.get("sachbearbeiter"):
        vg.append(E("Sachbearbeiter", str(a.daten["sachbearbeiter"])))
    # Urkunden nur, wenn ihr Geschäftsgegenstand bekannt ist (Pflichtfeld im Schema)
    for u, angaben in sorted((a.daten.get("urkunden") or {}).items()):
        gg = (angaben or {}).get("geschaeftsgegenstand")
        if not gg:
            continue
        m = re.match(r"\s*0*(\d+)\s*[/-]\s*(\d{4})", u)
        if not m:
            raise ValueError(f"Urkunde „{u}“ in {AKTE_DATEI}: bitte als Nummer/Jahr schreiben, z. B. 2048/2026")
        uk = E("Urkunde")
        un = E("UVZ_Nr")
        un.append(E("Jahr", m.group(2)))
        un.append(E("Nummer", m.group(1)))
        uk.append(un)
        if angaben.get("beurkundungsdatum"):
            uk.append(E("Beurkundungsdatum", datum(angaben["beurkundungsdatum"]).isoformat()))
        uk.append(E("Geschaeftsgegenstand", gg))
        dok = E("Dokument")
        dok.append(E("Kategorie", "Urkundensammlung"))
        uk.append(dok)
        vg.append(uk)
    for (ordner, x), name in zip(a.dokumente, dateinamen):
        d = E("Dokument")
        for k in kategorien(e, x):
            d.append(E("Kategorie", k))
        info = E("Dokument_Info")
        ref = E("Dokument_Referenz")
        ref.append(E("Datei_Referenz", "dokumente/" + name))
        info.append(ref)
        d.append(info)
        d.append(E("Betreff_Bezeichnung", betreff_bezeichnung(x)))
        d.append(E("Eingangsdatum", datum(x["eingang"]).isoformat()))
        if x.get("briefdatum"):
            d.append(E("Dokumentendatum", datum(x["briefdatum"]).isoformat()))
        vg.append(d)
    gg = a.daten.get("geschaeftsgegenstand") or geschaeftsgegenstand_aus_name(e, a.beschreibung, schema_doc)
    if gg:
        for g in (gg if isinstance(gg, list) else [gg]):
            vg.append(E("Geschaeftsgegenstand", g))
    vg.append(E("Anlagedatum", a.anlagedatum.isoformat()))
    wurzel.append(vg)
    wurzel.append(E("Anlagedatum", a.anlagedatum.isoformat()))
    return etree.ElementTree(wurzel)


def _el(etree, tag, text, att):
    el = etree.Element(f"{{{NS}}}{tag}", **att)
    if text is not None:
        el.text = str(text)
    return el


def geschaeftsgegenstand_aus_name(e, name, schema_doc):
    erlaubt = set(_schema_werte(schema_doc, "Geschaeftsgegenstand_Vorgang"))
    treffer = {w for k, w in einstellung(e, "geschaeftsgegenstand_aus_ordnername").items()
               if re.search(r"\b" + re.escape(k), name or "", re.I) and w in erlaubt}
    return treffer.pop() if len(treffer) == 1 else None


# --------------------------------------------------------------------------- Prüfung

FELDNAMEN = {
    "Aktenzeichen": "Aktenzeichen", "Vorgangszeichen": "Vorgangszeichen", "Beschreibung": "Beschreibung",
    "Aufbewahrungsfrist": "Aufbewahrungsfrist", "Anlagedatum": "Anlagedatum", "Eingangsdatum": "Eingangsdatum",
    "Dokumentendatum": "Datum des Schreibens", "Abschluss_Amtsgeschaeft": "Abschluss des Amtsgeschäfts",
    "Geschaeftsgegenstand": "Geschäftsgegenstand", "Massennummer": "Massennummer",
    "Angeordnet_am": "weitere Aufbewahrung angeordnet am", "Angeordnet_bis": "weitere Aufbewahrung bis",
    "Datei_Referenz": "Dateiname", "Betreff_Bezeichnung": "Betreff", "Kategorie": "Kategorie",
}


def _feld(tag):
    t = re.sub(r"\{[^}]*\}", "", tag or "")
    return FELDNAMEN.get(t, t.replace("_", " "))


def verstaendlich(fehler):
    """Meldung des Prüfprogramms (lxml) -> Satz auf Deutsch."""
    m = fehler.message
    feld = re.search(r"Element '([^']+)'", m)
    f = _feld(feld.group(1)) if feld else "Ein Feld"
    if "maxLength" in m:
        z = re.search(r"length of '(\d+)'.*maximum length of '(\d+)'", m)
        return f"{f} ist zu lang ({z.group(1)} Zeichen, erlaubt sind {z.group(2)})." if z else f"{f} ist zu lang."
    if "minInclusive" in m or "maxInclusive" in m:
        z = re.search(r"'(-?\d+)'", m)
        return f"{f}: Der Wert {z.group(1) if z else ''} ist nicht erlaubt (Aufbewahrungsfrist 7 bis 30 Jahre)."
    if "enumeration" in m:
        z = re.search(r"value '([^']*)'", m)
        return f"{f}: „{z.group(1) if z else ''}“ steht nicht in der Werteliste der Bundesnotarkammer."
    if "xs:date" in m:
        return f"{f} ist kein gültiges Datum."
    if "xs:integer" in m:
        return f"{f} muss eine ganze Zahl sein."
    if "Missing child element" in m:
        z = re.search(r"Expected is .*?\(?\s*\{?[^}]*\}?([A-Za-z_]+)", m)
        return f"In {f} fehlt das Pflichtfeld {_feld(z.group(1)) if z else ''}."
    if "not expected" in m:
        return f"{f} steht an der falschen Stelle oder ist hier nicht erlaubt."
    return f"{f}: {m}"


def pruefe(baum):
    """Gibt [] zurück, wenn der Datensatz dem Schema entspricht, sonst verständliche Fehlermeldungen."""
    from lxml import etree
    schema = etree.XMLSchema(etree.parse(schema_pfad()))
    if schema.validate(baum):
        return []
    return [verstaendlich(x) for x in schema.error_log]


# --------------------------------------------------------------------------- Deckblatt, Bericht

def ist_verwahrung(a):
    return bool(a.daten.get("massennummer")) or a.daten.get("geschaeftsgegenstand") == "Verwahrungsgeschäft" or \
        any(x.get("art") == "Verwahrung / Anderkonto" for _, x in a.dokumente)


def aufbewahrung_bis(e, a):
    frist = int(a.daten.get("aufbewahrungsfrist", einstellung(e, "aufbewahrungsfrist")))
    if not a.daten.get("abschluss_amtsgeschaeft"):
        return None, frist
    ende = dt.date(datum(a.daten["abschluss_amtsgeschaeft"]).year + frist, 12, 31)
    wa = a.daten.get("weitere_aufbewahrung")
    if wa and wa.get("bis"):
        ende = max(ende, datum(wa["bis"]))
    return ende, frist


def deckblatt(pfad, a, export_ordner, version, stand):
    import posteingang as P
    fitz = P.fitz
    doc = fitz.open()
    p = doc.new_page(width=595, height=842)
    y = 70

    def zeile(t, gross=10, fett=False, x=60):
        nonlocal y, p
        if y > 790:
            p = doc.new_page(width=595, height=842)
            y = 60
        t = t.replace("–", "-").replace("—", "-")   # Standardschrift kennt keinen Gedankenstrich
        p.insert_text((x, y), t, fontsize=gross, fontname="hebo" if fett else "helv")
        y += gross + 6

    zeile("Papierakte – Teil einer hybriden Nebenakte", 16, True)
    zeile("(§ 44 Abs. 2 NotAktVV)", 10)
    y += 10
    zeile(f"Aktenzeichen: {a.aktenzeichen}", 13, True)
    zeile(a.beschreibung[:90], 11)
    y += 10
    zeile("Der übrige Teil dieser Nebenakte wird elektronisch geführt:", 10, True)
    for o, _ in a.ablageordner:
        zeile(o, 9, x=75)
    zeile(f"Export vom {dt.date.today():%d.%m.%Y}: {export_ordner}", 9, x=75)
    y += 10
    zeile("In dieser Papierakte liegen folgende Originale:", 10, True)
    for _, x in a.dokumente:
        if x.get("papier_original"):
            imp = f", Imprinter-Nr. {x['imprinter_von']}" if x.get("imprinter_von") else ""
            zeile(f"– Eingang {datum(x['eingang']):%d.%m.%Y}{imp}", 9, x=75)
            zeile(f"   {betreff_bezeichnung(x)[:95]}", 9, x=75)
    p = doc[-1]
    p.insert_text((60, 815), f"Postsortierer {version} · Stand {stand}", fontsize=7, color=(0.4, 0.4, 0.4))
    doc.save(pfad)
    doc.close()


def bericht(pfad, a, ok, fehler, export_ordner, ende, frist, version, stand, pdfa):
    farbe = "#1b7a3a" if ok else "#b3261e"
    teile = [f"""<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Export Nebenakte {html.escape(a.aktenzeichen)}</title>
<style>body{{font:15px/1.5 Segoe UI,Arial,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#222}}
h1{{font-size:22px}} .s{{color:{farbe};font-weight:600}} .w{{background:#fdecea;border-left:4px solid #b3261e;padding:8px 12px;margin:8px 0}}
.h{{background:#fff8e1;border-left:4px solid #e0a000;padding:8px 12px;margin:8px 0}} table{{border-collapse:collapse;width:100%;font-size:13px}}
td,th{{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}} footer{{margin-top:32px;font-size:12px;color:#777}}</style></head><body>
<h1>Export Nebenakte {html.escape(a.aktenzeichen)}</h1><p>{html.escape(a.beschreibung)}</p>
<p class="s">{"Datensatz entspricht dem Schema der Bundesnotarkammer (" + SCHEMA_VERSION + "). Export erstellt." if ok else "Export NICHT erstellt – der Datensatz entspricht nicht dem Schema:"}</p>"""]
    if fehler:
        teile.append("<ul>" + "".join(f"<li>{html.escape(f)}</li>" for f in fehler) + "</ul>")
    for w in a.warnungen:
        teile.append(f'<div class="w">{html.escape(w)}</div>')
    if ok:
        teile.append(f"<p>Ordner: <b>{html.escape(export_ordner)}</b></p>")
    teile.append("<p>Aufbewahrung: " + (f"bis <b>{ende:%d.%m.%Y}</b> ({frist} Jahre nach Abschluss, § 50 NotAktVV"
                                         + (", verlängert nach § 52" if a.daten.get("weitere_aufbewahrung") else "") + ")"
                                         if ende else f"{frist} Jahre ab Abschluss – Abschluss des Amtsgeschäfts ist noch nicht eingetragen") + ".</p>")
    teile.append(f'<div class="h">Dateiformat: {html.escape(pdfa)}</div>')
    teile.append("<table><tr><th>Eingang</th><th>Schreiben</th><th>Kategorie</th><th>Prüfwert</th></tr>")
    for _, x in a.dokumente:
        teile.append(f"<tr><td>{datum(x['eingang']):%d.%m.%Y}</td><td>{html.escape(betreff_bezeichnung(x))}<br><small>{html.escape(x['datei'])}</small></td>"
                     f"<td>{html.escape(', '.join(kategorien({}, x)))}</td><td><small>{html.escape(x.get('_pruefung', ''))}</small></td></tr>")
    teile.append(f"</table><footer>Postsortierer {html.escape(version)} · Stand {html.escape(stand)} · Schema BNotK {SCHEMA_VERSION}</footer></body></html>")
    with open(pfad, "w", encoding="utf-8") as f:
        f.write("".join(teile))


def _pdfa_hinweis(pfade):
    import posteingang as P
    mit = 0
    for p in pfade:
        try:
            with P.fitz.open(p) as d:
                if "pdfaid" in (d.get_xml_metadata() or ""):
                    mit += 1
        except Exception:
            pass
    if pfade and mit == len(pfade):
        return "alle Dateien tragen eine PDF/A-Kennung (Konformität nicht geprüft)."
    return (f"PDF ({mit} von {len(pfade)} mit PDF/A-Kennung, Konformität nicht geprüft). "
            "Allgemein gebräuchliches Format nach Ziff. 2 der Bekanntmachung.")


# --------------------------------------------------------------------------- Export

def exportiere(e, nummer, version, stand, ziel_basis=None, jetzt=None):
    """Exportiert eine Akte. Rückgabe: dict(ok, akte, fehler, ordner, bericht)."""
    jetzt = jetzt or dt.datetime.now()
    art, nr = normalisiere_nummer(nummer)
    if not art:
        raise ValueError(f"„{nummer}“ ist weder eine Vorgangsnummer (z. B. 30471) noch eine UVZ-Nummer (z. B. 2048/2026).")
    a = stelle_zusammen(e, art, nr)
    fehler = list(a.fehler)

    # Prüfwerte: hat sich eine Datei seit dem Ablegen verändert?
    for ordner, x in a.dokumente:
        ist = sha256(os.path.join(ordner, x["datei"]))
        if x.get("sha256") and x["sha256"] != ist:
            x["_pruefung"] = "VERÄNDERT"
            a.warnungen.append(f"{x['datei']} wurde nach dem Ablegen verändert (Prüfwert stimmt nicht mehr).")
        else:
            x["_pruefung"] = "unverändert" if x.get("sha256") else "neu berechnet"
        x["sha256_export"] = ist

    hybrid = any(x.get("papier_original") for _, x in a.dokumente)
    if hybrid and ist_verwahrung(a):
        a.warnungen.insert(0, "Verwahrungsgeschäft mit Papieroriginalen: Nach § 41 Abs. 3 NotAktVV ist die Nebenakte "
                              "einheitlich zu führen (nur Papier ODER nur elektronisch). Betroffen: " +
                           ", ".join(x["datei"] for _, x in a.dokumente if x.get("papier_original")))
    if any(x.get("ohne_eintrag") for _, x in a.dokumente):
        a.warnungen.append("Einige Dateien wurden ohne Eintrag des Sortierers gefunden (vor Fassung 1.8 abgelegt "
                           "oder von Hand hineingelegt); Absender und Betreff fehlen dort.")

    # Dateinamen im Export (Kollisionen zwischen Ordnern vermeiden)
    namen, gesehen = [], set()
    for ordner, x in a.dokumente:
        n = x["datei"]
        if n.lower() in gesehen:
            stamm, end = os.path.splitext(n)
            n = f"{stamm} ({x.get('_uvz') or a.aktenzeichen}){end}"
        gesehen.add(n.lower())
        namen.append(n)

    try:
        baum = baue_xml(e, a, namen, version, jetzt)
        fehler += pruefe(baum)
    except ValueError as ex:
        fehler.append(str(ex))
        baum = None
    ende, frist = (None, einstellung(e, "aufbewahrungsfrist"))
    try:
        ende, frist = aufbewahrung_bis(e, a)
    except ValueError as ex:
        fehler.append(f"Abschluss/Aufbewahrung in {AKTE_DATEI}: {ex}")

    basis = ziel_basis or einstellung(e, "export_ordner")
    os.makedirs(basis, exist_ok=True)
    ok = not fehler
    if ok:
        ziel = os.path.join(basis, f"{a.aktenzeichen} ({jetzt:%Y-%m-%d})")
        i = 2
        while os.path.exists(ziel) or os.path.exists(ziel + ".entsteht"):
            ziel = os.path.join(basis, f"{a.aktenzeichen} ({jetzt:%Y-%m-%d}) {i}")
            i += 1
        tmp = ziel + ".entsteht"
        os.makedirs(os.path.join(tmp, "dokumente"))
        for (ordner, x), n in zip(a.dokumente, namen):
            shutil.copy2(os.path.join(ordner, x["datei"]), os.path.join(tmp, "dokumente", n))
        baum.write(os.path.join(tmp, "nebenakte.xml"), xml_declaration=True, encoding="UTF-8", pretty_print=True)
        intern = {"aktenzeichen": a.aktenzeichen, "exportiert_am": jetzt.isoformat(timespec="seconds"),
                  "version": version, "schema": SCHEMA_VERSION, "akte": a.daten, "hybrid": hybrid,
                  "aufbewahrung_bis": ende.isoformat() if ende else "",
                  "dokumente": [dict({k: w for k, w in x.items() if not k.startswith("_")}, export_datei="dokumente/" + n,
                                     herkunft=ordner, pruefung=x.get("_pruefung", ""))
                                for (ordner, x), n in zip(a.dokumente, namen)],
                  "warnungen": a.warnungen}
        _json_schreiben(os.path.join(tmp, "intern.json"), intern)
        if hybrid:
            deckblatt(os.path.join(tmp, "Deckblatt Papierakte.pdf"), a, ziel, version, stand)
        pdfa = _pdfa_hinweis([os.path.join(tmp, "dokumente", n) for n in namen])
        bericht(os.path.join(tmp, "Export-Bericht.html"), a, True, [], ziel, ende, frist, version, stand, pdfa)
        os.replace(tmp, ziel)
        berichtsdatei = os.path.join(ziel, "Export-Bericht.html")
    else:
        ziel = ""
        berichtsdatei = os.path.join(basis, f"FEHLER {a.aktenzeichen} ({jetzt:%Y-%m-%d %H-%M-%S}).html")
        bericht(berichtsdatei, a, False, fehler, "", ende, frist, version, stand, "nicht geprüft (kein Export)")
    return dict(ok=ok, akte=a, fehler=fehler, ordner=ziel, bericht=berichtsdatei, hybrid=hybrid)


def alle_akten(e):
    """Alle Aktenzeichen, zu denen Post abgelegt ist (für den Gesamtexport, z. B. § 4 Abs. 2 NotAktVV)."""
    verb = verbindungen(e)
    nummern = set()
    if os.path.isdir(e["ziel_vorgaenge"]):
        nummern |= {n for n in os.listdir(e["ziel_vorgaenge"]) if n.isdigit()}
    if os.path.isdir(e["ziel_urkunden"]):
        for n in os.listdir(e["ziel_urkunden"]):
            if re.fullmatch(r"\d+-\d{4}", n):
                nummern.add(verb.get(n) or n)
    return sorted(nummern)
