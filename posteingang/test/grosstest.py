# -*- coding: utf-8 -*-
"""Großtest: erzeugt viele erfundene Briefe aus allen Bereichen eines Notariats, verteilt auf Poststapel
(eine Sammel-PDF je Stapel, wie vom Scanner), lässt den Sortierer darüber laufen und wertet aus.

Nur erfundene Namen, Nummern und Anschriften.

    python test/grosstest.py [--briefe 5000] [--stapel 80] [--seed 1] [--bericht bericht.txt] [--behalten ORDNER]

Fehlerarten in der Auswertung:
  FALSCH      Schreiben liegt in einem falschen Urkunden-/Vorgangsordner (gefährlich)
  UNKLAR      hätte zugeordnet werden können, liegt aber in „Nicht zugeordnet“ (lästig, aber sicher)
  ZERLEGUNG   Seiten falsch auf Schreiben verteilt
  ÜBERSEHEN   Schreiben müsste vorgelegt werden, wurde aber nur elektronisch abgelegt
"""
import argparse
import collections
import datetime as dt
import os
import random
import shutil
import sys
import tempfile
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import posteingang as P  # noqa: E402

fitz = P.fitz
HEUTE = dt.date.today()
J = HEUTE.year

VORNAMEN = ["Anna", "Bernd", "Clara", "Dieter", "Elke", "Frank", "Gisela", "Holger", "Ines", "Jens", "Karin",
            "Lars", "Monika", "Norbert", "Petra", "Ralf", "Sabine", "Torsten", "Ute", "Volker", "Waltraud"]
NACHNAMEN = ["Muster", "Beispiel", "Probe", "Testmann", "Erfunden", "Platzhalter", "Fiktiv", "Modell",
             "Vorlage", "Schablone", "Entwurf", "Skizze", "Attrappe", "Dummy", "Exempel"]
ORTE = ["Musterdorf", "Beispielstadt", "Probehausen", "Testheim", "Erfundenau", "Fiktivwalde", "Modellfelde"]
STRASSEN = ["Hauptstraße", "Lindenallee", "Am Markt", "Gartenweg", "Bahnhofstraße", "Schulplatz", "Ringstraße"]
MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober",
          "November", "Dezember"]
FUELL = [
    "Wir bitten um Kenntnisnahme und weitere Veranlassung.",
    "Für Rückfragen stehen wir Ihnen gern zur Verfügung.",
    "Die Unterlagen sind diesem Schreiben beigefügt.",
    "Bitte geben Sie bei Antwort stets das oben genannte Zeichen an.",
    "Wir danken für die gute Zusammenarbeit.",
    "Eine Abschrift dieses Schreibens erhalten die Beteiligten.",
    "Sollten Sie weitere Angaben benötigen, teilen Sie uns dies bitte mit.",
    "Das Verfahren wird hier unter dem oben genannten Aktenzeichen geführt.",
]


def person(r):
    return f"{r.choice(VORNAMEN)} {r.choice(NACHNAMEN)}"


def datum(r, lang=False):
    d = HEUTE - dt.timedelta(days=r.randint(1, 20))
    if lang:
        return f"{d.day}. {MONATE[d.month - 1]} {d.year}"
    return d.strftime("%d.%m.%Y")


def anschrift(r):
    return f"{r.choice(STRASSEN)} {r.randint(1, 120)}", f"{r.randint(10000, 19999)} {r.choice(ORTE)}"


# --------------------------------------------------------------------------- Bereiche
# Jede Vorlage: (Bereich, Absender-Funktion, Text-Funktion, Bezug, soll_aktion)
#   Bezug: "uvz" (meist mit UVZ), "vorgang" (meist vor der Beurkundung), "beide", "keiner"
#   soll_aktion: "vorlegen" oder "ablegen" (was ein Mensch mit dem Schreiben täte)

def _amt(name):
    return lambda r: name.format(ort=r.choice(ORTE))


VORLAGEN = [
    ("Grundbuch", _amt("Amtsgericht {ort} - Grundbuchamt"), lambda r: [
        "Eintragungsnachricht",
        f"In dem Grundbuch von {r.choice(ORTE)} Blatt {r.randint(100, 9999)} ist folgende Eintragung erfolgt:",
        f"Abteilung III lfd. Nr. {r.randint(1, 9)}: Grundschuld über {r.randint(50, 900)}.000,00 EUR."], "uvz", "vorlegen"),
    ("Grundbuch", _amt("Amtsgericht {ort} - Grundbuchamt"), lambda r: [
        "Zwischenverfügung",
        "Dem Antrag steht ein Hindernis entgegen. Es fehlt die Genehmigung des Mitberechtigten.",
        f"Zur Behebung wird eine Frist bis zum {datum(r)} gesetzt."], "uvz", "vorlegen"),
    ("Grundbuch", _amt("Amtsgericht {ort} - Grundbuchamt"), lambda r: [
        "Vollzugsmitteilung",
        "Die beantragte Auflassung und Eigentumsumschreibung ist vollzogen.",
        f"Kosten: {r.randint(100, 2000)},00 EUR werden gesondert erhoben."], "uvz", "vorlegen"),
    ("Vorkaufsrecht", _amt("Gemeinde {ort} - Der Bürgermeister"), lambda r: [
        "Negativzeugnis nach § 28 BauGB",
        "Ein gesetzliches Vorkaufsrecht besteht nicht bzw. wird nicht ausgeübt."], "uvz", "vorlegen"),
    ("Vorkaufsrecht", _amt("Stadt {ort} - Stadtplanungsamt"), lambda r: [
        "Anfrage zum Vorkaufsrecht",
        "Zur Prüfung des Vorkaufsrechts bitten wir um Übersendung einer vollständigen Abschrift des Vertrages."], "uvz", "vorlegen"),
    ("Genehmigung", _amt("Landkreis {ort} - Untere Landwirtschaftsbehörde"), lambda r: [
        "Genehmigung nach dem Grundstücksverkehrsgesetz",
        f"Die Veräußerung der Flurstücke {r.randint(1, 400)}/{r.randint(1, 20)} wird genehmigt."], "uvz", "vorlegen"),
    ("Genehmigung", _amt("Stadt {ort} - Sanierungsstelle"), lambda r: [
        "Sanierungsrechtliche Genehmigung nach § 144 BauGB",
        "Die Genehmigung wird hiermit erteilt."], "uvz", "vorlegen"),
    ("Genehmigung", lambda r: person(r), lambda r: [
        "Genehmigungserklärung",
        "hiermit genehmige ich alle Erklärungen, die in der Urkunde in meinem Namen abgegeben wurden."], "uvz", "vorlegen"),
    ("WEG", lambda r: f"{r.choice(NACHNAMEN)} Hausverwaltung GmbH", lambda r: [
        "Verwalterzustimmung nach § 12 WEG",
        "Als Verwalter der Wohnungseigentümergemeinschaft stimmen wir der Veräußerung zu.",
        "Der Verwalternachweis (Beschluss mit beglaubigten Unterschriften) liegt bei."], "uvz", "vorlegen"),
    ("Bank", lambda r: f"Sparkasse {r.choice(ORTE)}", lambda r: [
        "Löschungsbewilligung",
        f"Wir übersenden die Löschungsbewilligung für die Grundschuld über {r.randint(20, 400)}.000,00 EUR.",
        f"Die Ablösesumme beträgt {r.randint(5, 300)}.{r.randint(100, 999)},{r.randint(10, 99)} EUR."], "beide", "vorlegen"),
    ("Bank", lambda r: f"{r.choice(['Volksbank', 'Raiffeisenbank', 'Deutsche Kreditbank'])} {r.choice(ORTE)} eG", lambda r: [
        "Treuhandauftrag",
        "Wir übersenden Ihnen die Löschungsunterlagen zu treuen Händen.",
        f"Von den Unterlagen darf erst Gebrauch gemacht werden, wenn {r.randint(10, 200)}.000,00 EUR gezahlt sind."], "uvz", "vorlegen"),
    ("Bank", lambda r: f"Bausparkasse {r.choice(NACHNAMEN)} AG", lambda r: [
        "Finanzierung des Kaufpreises",
        "Wir bitten um Übersendung des Entwurfs der Grundschuldbestellung.",
        "Die Grundschuld soll an erster Rangstelle eingetragen werden."], "vorgang", "vorlegen"),
    ("Finanzamt", _amt("Finanzamt {ort}"), lambda r: [
        "Unbedenklichkeitsbescheinigung",
        "Der Eintragung des Erwerbers als Eigentümer stehen steuerliche Bedenken nicht entgegen.",
        f"Steuernummer {r.randint(10, 99)}/{r.randint(100, 999)}/{r.randint(10000, 99999)}"], "uvz", "vorlegen"),
    ("Finanzamt", _amt("Finanzamt {ort} - Erbschaftsteuerstelle"), lambda r: [
        "Anzeige nach § 34 ErbStG",
        "Wir bestätigen den Eingang Ihrer Anzeige. Eingangsbestätigung zu Ihrer Kenntnis."], "uvz", "ablegen"),
    ("Gutachter", _amt("Gutachterausschuss für Grundstückswerte im Landkreis {ort}"), lambda r: [
        "Kaufpreissammlung",
        "Wir bestätigen den Eingang der Vertragsabschrift. Empfangsbestätigung."], "uvz", "ablegen"),
    ("Vermessung", lambda r: f"Öffentlich bestellter Vermessungsingenieur Dipl.-Ing. {person(r)}", lambda r: [
        "Fortführungsnachweis",
        f"Die Teilungsvermessung des Flurstücks {r.randint(1, 500)} ist abgeschlossen. Das Kataster wurde fortgeführt."], "uvz", "vorlegen"),
    ("Bauamt", _amt("Landkreis {ort} - Bauordnungsamt"), lambda r: [
        "Abgeschlossenheitsbescheinigung",
        "Anliegend erhalten Sie die Abgeschlossenheitsbescheinigung nebst Aufteilungsplänen."], "vorgang", "vorlegen"),
    ("Denkmal", _amt("Landkreis {ort} - Untere Denkmalschutzbehörde"), lambda r: [
        "Denkmalrechtliche Genehmigung",
        "Das Grundstück ist als Baudenkmal eingetragen. Die Genehmigung wird erteilt."], "uvz", "vorlegen"),
    ("Gemeinde", _amt("Amt {ort}"), lambda r: [
        "Anliegerbescheinigung",
        "Erschließungsbeiträge sind für das Grundstück nicht mehr zu erwarten."], "uvz", "vorlegen"),
    ("Register", _amt("Amtsgericht {ort} - Registergericht"), lambda r: [
        "Eintragungsnachricht Handelsregister",
        f"In das Handelsregister B Nr. {r.randint(1000, 29999)} wurde die {r.choice(NACHNAMEN)} GmbH eingetragen."], "uvz", "vorlegen"),
    ("Register", _amt("Amtsgericht {ort} - Registergericht"), lambda r: [
        "Beanstandung",
        "Die Anmeldung kann nicht vollzogen werden. Die Gesellschafterliste ist nicht unterschrieben.",
        f"Frist zur Behebung bis zum {datum(r)}."], "uvz", "vorlegen"),
    ("Register", lambda r: f"Industrie- und Handelskammer {r.choice(ORTE)}", lambda r: [
        "Stellungnahme zur Firmierung",
        "Gegen die beabsichtigte Firmierung bestehen keine Bedenken."], "vorgang", "vorlegen"),
    ("Register", _amt("Amtsgericht {ort} - Vereinsregister"), lambda r: [
        "Vereinsregister",
        "Die Satzungsänderung ist eingetragen worden."], "uvz", "vorlegen"),
    ("Nachlass", _amt("Amtsgericht {ort} - Nachlassgericht"), lambda r: [
        "Erbschein",
        "In der Nachlasssache wird der beantragte Erbschein erteilt. Ausfertigung anbei."], "uvz", "vorlegen"),
    ("Nachlass", _amt("Amtsgericht {ort} - Nachlassgericht"), lambda r: [
        "Erbausschlagung",
        "Die Ausschlagungserklärung ist hier fristgerecht eingegangen. Eingangsbestätigung."], "uvz", "ablegen"),
    ("Nachlass", _amt("Amtsgericht {ort} - Nachlassgericht"), lambda r: [
        "Eröffnungsprotokoll",
        "Das Testament wurde eröffnet. Eine Abschrift des Eröffnungsprotokolls ist beigefügt."], "keiner", "vorlegen"),
    ("ZTR", lambda r: "Bundesnotarkammer - Zentrales Testamentsregister", lambda r: [
        "Registrierungsbestätigung",
        "Die Verwahrangaben zur erbfolgerelevanten Urkunde wurden registriert. Zur Kenntnisnahme."], "uvz", "ablegen"),
    ("ZVR", lambda r: "Bundesnotarkammer - Zentrales Vorsorgeregister", lambda r: [
        "Eintragungsbestätigung",
        "Die Vorsorgevollmacht wurde im Zentralen Vorsorgeregister eingetragen. Zur Kenntnisnahme."], "uvz", "ablegen"),
    ("Familie", _amt("Amtsgericht {ort} - Familiengericht"), lambda r: [
        "Familiengerichtliche Genehmigung",
        "Der Vertrag wird für das minderjährige Kind familiengerichtlich genehmigt. Rechtskraftvermerk folgt."], "uvz", "vorlegen"),
    ("Familie", _amt("Amtsgericht {ort} - Betreuungsgericht"), lambda r: [
        "Betreuungsgerichtliche Genehmigung",
        "Die Erklärungen des Betreuers werden betreuungsgerichtlich genehmigt."], "uvz", "vorlegen"),
    ("Mandant", lambda r: person(r), lambda r: [
        "Ehevertrag",
        "anbei sende ich Ihnen meine Anmerkungen zum Entwurf des Ehevertrages.",
        "Bitte ändern Sie die Regelung zum Zugewinnausgleich."], "vorgang", "vorlegen"),
    ("Mandant", lambda r: person(r), lambda r: [
        "Vollmacht",
        "anbei die unterschriebene Vollmacht zurück. Die Unterschrift ist beglaubigt."], "uvz", "vorlegen"),
    ("Mandant", lambda r: person(r), lambda r: [
        "Testament",
        "ich möchte mein Testament ändern und bitte um einen Termin."], "keiner", "vorlegen"),
    ("Mandant", lambda r: person(r), lambda r: [
        "Kaufvertrag",
        "wir haben noch Fragen zum Entwurf. Wann ist der Besitzübergang?"], "vorgang", "vorlegen"),
    ("Anwalt", lambda r: f"Rechtsanwälte {r.choice(NACHNAMEN)} & {r.choice(NACHNAMEN)}", lambda r: [
        "Ihr Entwurf",
        "namens und in Vollmacht unseres Mandanten nehmen wir zum Entwurf Stellung.",
        "Wir bitten, § 5 wie folgt zu fassen."], "vorgang", "vorlegen"),
    ("Verwahrung", lambda r: f"Sparkasse {r.choice(ORTE)}", lambda r: [
        "Kontoauszug Notaranderkonto",
        f"Kontostand: {r.randint(10, 900)}.{r.randint(100, 999)},00 EUR. Zahlungseingang vom {datum(r)}."], "uvz", "vorlegen"),
    ("Kosten", lambda r: person(r), lambda r: [
        "Kostenrechnung",
        f"anbei die Überweisungsbestätigung über {r.randint(100, 3000)},00 EUR."], "kosten", "ablegen"),
    ("Dienstaufsicht", lambda r: "Der Präsident des Landgerichts",
     lambda r: ["Geschäftsprüfung", "Die nächste Geschäftsprüfung Ihres Amtes ist für das kommende Jahr vorgesehen."],
     "keiner", "vorlegen"),
    ("Kammer", lambda r: "Notarkammer Brandenburg", lambda r: [
        "Rundschreiben", "Wir informieren über die Änderungen im Berufsrecht."], "keiner", "vorlegen"),
    ("Versicherung", lambda r: f"{r.choice(NACHNAMEN)} Versicherung AG", lambda r: [
        "Beitragsrechnung Berufshaftpflicht", f"Der Jahresbeitrag beträgt {r.randint(500, 3000)},00 EUR."],
     "keiner", "vorlegen"),
    ("Werbung", lambda r: f"{r.choice(NACHNAMEN)} Büroservice GmbH", lambda r: [
        "Sonderangebot", "Neue Aktenschränke zu Sonderpreisen! Newsletter abbestellen: Abmelden."], "keiner", "ablegen"),
]


# --------------------------------------------------------------------------- Bezugsnummern

def uvz_text(r, nr, jahr, mit_jahr=True):
    jj = str(jahr)[2:]
    if not mit_jahr:
        return r.choice([f"UVZ-Nr. {nr}", f"UR-Nr. {nr}", f"Urkunde Nr. {nr}"])
    return r.choice([
        f"UVZ-Nr. {nr}/{jahr}", f"UR-Nr. {nr}/{jj}", f"Urkunde Nr. {nr}/{jahr}", f"Urk.-Nr. {nr}/{jahr}",
        f"URNr. {nr}/{jahr}", f"W {nr}-{jahr}", f"UVZ {nr}/{jahr}", f"Nr. {nr}/{jahr} der Urkundenrolle",
        f"UVZ-Nr. {nr} für {jahr}", f"Urkundennummer {nr}/{jahr}", f"UR-Nr. W {nr}/{jahr}", f"UVZ-Nr. {nr}/{jj}",
    ])


def vorgang_text(r, v):
    return r.choice([f"Ihr Zeichen: {v}", f"Ihr Az.: {v}", f"Ihr Aktenzeichen: {v}", f"Vorgang {v}",
                     f"Vorgangs-Nr. {v}", f"Ihr Zeichen: {v}/Wo", f"Ihr Zeichen: {v} Wo", f"Ihre Vorgangsnummer {v}"])


def ocr_fehler(r, s):
    """Typische Lesefehler der Texterkennung in einer Nummer: 0->O, 1->l, 5->S, 8->B."""
    tausch = {"0": "O", "1": "l", "5": "S", "8": "B"}
    stellen = [i for i, c in enumerate(s) if c in tausch]
    if not stellen:
        return s
    i = r.choice(stellen)
    return s[:i] + tausch[s[i]] + s[i + 1:]


FREMDE_ZEICHEN = ["Gb {a}/{b}", "{c} VI {a}/{b}", "HRB {a}", "KD-Nr. {d}", "{d}/{b}", "Vg-{a}", "Kassenzeichen {d}{a}",
                  "SB {a}-{b}", "Akte {d}"]


def fremdes_zeichen(r):
    return r.choice(FREMDE_ZEICHEN).format(a=r.randint(100, 9999), b=str(J)[2:], c=r.randint(1, 9),
                                           d=r.randint(10000, 99999))


# --------------------------------------------------------------------------- Seiten zeichnen

def zeilen_umbrechen(text, breite=88):
    worte, zeile, aus = text.split(), "", []
    for w in worte:
        if len(zeile) + len(w) + 1 > breite:
            aus.append(zeile)
            zeile = w
        else:
            zeile = (zeile + " " + w).strip()
    if zeile:
        aus.append(zeile)
    return aus


def text_seite(doc, zeilen, y=70, x=60, gross=10):
    p = doc.new_page(width=595, height=842)
    for z in zeilen:
        if y > 780:
            break
        p.insert_text((x, y), z, fontsize=gross)
        y += gross + 4
    return p


def fusszeile(p, r, absender_name):
    st, ort = anschrift(r)
    p.insert_text((60, 805), f"{absender_name} · {st} · {ort} · Tel. 0{r.randint(30, 399)} {r.randint(100000, 999999)}",
                  fontsize=7)
    p.insert_text((60, 815), f"IBAN DE{r.randint(10, 99)} {r.randint(1000, 9999)} {r.randint(1000, 9999)} "
                             f"{r.randint(1000, 9999)} {r.randint(1000, 9999)} {r.randint(10, 99)} · "
                             f"USt-IdNr. DE{r.randint(100000000, 999999999)}", fontsize=7)


def erste_seite(doc, r, b):
    p = doc.new_page(width=595, height=842)
    p.insert_text((60, 55), b["absender"], fontsize=13)
    st, ort = anschrift(r)
    p.insert_text((60, 70), f"{st} · {ort}", fontsize=8)
    y = 150
    p.insert_text((60, y), f"{b['absender'][:40]} · {st} · {ort}", fontsize=6)
    y += 16
    for z in b["an"]:
        p.insert_text((60, y), z, fontsize=10)
        y += 14
    y2 = 166
    for z in b["kopf"]:
        p.insert_text((350, y2), z, fontsize=9)
        y2 += 13
    y = max(y, y2) + 30
    if b["betreff"]:
        p.insert_text((60, y), b["betreff"], fontsize=10)
        y += 26
    p.insert_text((60, y), b["anrede"], fontsize=10)
    y += 20
    for z in b["rumpf"]:
        if y > 760:
            break
        p.insert_text((60, y), z, fontsize=10)
        y += 14
    if b["seiten"] == 1:
        p.insert_text((60, min(y + 20, 770)), b["gruss"], fontsize=10)
    if b["fuss"]:
        fusszeile(p, r, b["absender"])
    return p


def seitenzahl(p, art, n, von):
    if art == "von":
        p.insert_text((260, 795), f"Seite {n} von {von}", fontsize=8)
    elif art == "strich":
        p.insert_text((290, 40), f"- {n} -", fontsize=9)


# --------------------------------------------------------------------------- Bestand

def baue_bestand(Y, r):
    """Schattenarchiv mit Urkunden der letzten drei Jahre und Ordner Y:\\Vorgänge."""
    urk = {}
    for j in (J - 2, J - 1, J):
        ordner = os.path.join(Y, "Scanner", "URKUNDEN", f"Urkunden {j}")
        os.makedirs(ordner, exist_ok=True)
        hoechste = 2300 if j < J else 2150
        menge = set(n for n in range(1, hoechste + 1) if r.random() < 0.93)   # ein paar Nummern fehlen (Fehlnummern)
        urk[j] = menge
        for n in menge:
            name = r.choice([f"W{n}-{j}!Urkunde.pdf", f"W {n}-{j}.pdf", f"W{n}-{j}oE.pdf", f"W{n}-{j}.pdf"])
            open(os.path.join(ordner, name), "w").close()
    vorg = set(v for v in range(29000, 30514) if r.random() < 0.9)
    ordner = os.path.join(Y, "Vorgänge")
    os.makedirs(ordner, exist_ok=True)
    for v in vorg:
        os.makedirs(os.path.join(ordner, f"{v} {r.choice(NACHNAMEN)} {r.choice(['Kaufvertrag', 'Schenkung', 'GmbH', 'Testament', 'Vollmacht', 'Grundschuld'])}"),
                    exist_ok=True)
    return urk, vorg


# --------------------------------------------------------------------------- Ein Brief

def neuer_brief(r, urk, vorg, zaehler):
    bereich, abs_f, text_f, bezug, soll_aktion = r.choice(VORLAGEN)
    absender_name = abs_f(r)
    inhalt = text_f(r)
    besonderes = []
    soll = "unklar"
    kopf, rumpf_extra = [], []
    vorhanden_j = [j for j in urk]

    def gueltige_uvz():
        j = r.choices(vorhanden_j, weights=[1, 3, 8])[0]
        return r.choice(sorted(urk[j])), j

    def gueltiger_vorgang():
        return r.choice(sorted(vorg))

    # Wie wird auf uns Bezug genommen?
    if bezug == "beide":
        bezug = r.choice(["uvz", "vorgang"])
    x = r.random()
    ref_uvz = ref_vorgang = None
    if bezug == "uvz":
        if x < 0.84:
            ref_uvz = gueltige_uvz()
        elif x < 0.90:
            ref_uvz = gueltige_uvz()
            ref_vorgang = gueltiger_vorgang()
            besonderes.append("UVZ und Vorgang")
        elif x < 0.94:
            ref_uvz = (r.randint(2400, 2900), J)    # gibt es nicht
            besonderes.append("UVZ nicht im Bestand")
        else:
            besonderes.append("ohne Nummer")
    elif bezug == "vorgang":
        if x < 0.88:
            ref_vorgang = gueltiger_vorgang()
        elif x < 0.93:
            ref_vorgang = r.choice([v for v in range(29000, 30514) if v not in vorg])
            besonderes.append("Vorgang nicht im Bestand")
        else:
            besonderes.append("ohne Nummer")
    elif bezug == "kosten":
        n, j = gueltige_uvz()
        ref_uvz = (n, j)
        besonderes.append("Kostenrechnung")

    nummer_im_kopf = r.random() < 0.75
    if ref_uvz:
        n, j = ref_uvz
        ohne_jahr = bezug != "kosten" and r.random() < 0.04
        if bezug == "kosten":
            t = f"Ihre Kostenrechnung W {n}/{r.randint(0, 3)}/{r.randint(1, 4)} - {j}"
        else:
            t = uvz_text(r, n, j, not ohne_jahr)
        if ohne_jahr:
            besonderes.append("UVZ ohne Jahr")
            treffer = [jj for jj in (J, J - 1, J - 2) if n in urk[jj]]
            if len(treffer) != 1:
                ref_uvz = None   # nicht eindeutig -> darf nicht zugeordnet werden
        if r.random() < 0.05:
            t2 = t.replace(str(n), ocr_fehler(r, str(n)), 1)
            if t2 != t:
                besonderes.append("Lesefehler UVZ")
                t = t2
        if nummer_im_kopf:
            kopf.append(("Ihr Zeichen: " + t) if not t.startswith("Ihre") else t)
        else:
            rumpf_extra.append(f"Wir nehmen Bezug auf Ihre {t}." if not t.startswith("Ihre") else f"Betrifft {t}.")
            besonderes.append("Nummer im Text")
    if ref_vorgang:
        t = vorgang_text(r, ref_vorgang)
        if r.random() < 0.04:
            t2 = t.replace(str(ref_vorgang), ocr_fehler(r, str(ref_vorgang)), 1)
            if t2 != t:
                besonderes.append("Lesefehler Vorgang")
                t = t2
        if nummer_im_kopf or ref_uvz:
            kopf.append(t)
        else:
            rumpf_extra.append(f"In der Sache ({t}) teilen wir mit:")
            besonderes.append("Nummer im Text")

    # Zweite, ältere Urkunde im Text (Vorurkunde) – Bezug bleibt die Urkunde im Kopf
    if ref_uvz and nummer_im_kopf and r.random() < 0.04:
        vn, vj = r.choice(sorted(urk[J - 2])), J - 2
        rumpf_extra.append(f"Die Vorurkunde UVZ-Nr. {vn}/{vj} liegt hier bereits vor.")
        besonderes.append("Vorurkunde im Text")

    if ref_uvz and "UVZ nicht im Bestand" not in besonderes:
        soll = f"U:{ref_uvz[0]}-{ref_uvz[1]}"
    elif ref_vorgang and "Vorgang nicht im Bestand" not in besonderes:
        soll = f"V:{ref_vorgang}"

    kopf.insert(0, "Unser Zeichen: " + fremdes_zeichen(r))
    if r.random() < 0.5:
        kopf.append(f"Datum: {datum(r)}")
    else:
        kopf.append(f"{r.choice(ORTE)}, den {datum(r, lang=True)}")
    if r.random() < 0.3:
        kopf.append(f"Telefon: 0{r.randint(30, 399)} {r.randint(1000, 99999)}-{r.randint(10, 99)}")

    an_varianten = [
        ["Notariat Woinar", "Herrn Notar Thomas Woinar", "Musterstraße 1", "15230 Frankfurt (Oder)"],
        ["Herrn Notar", "Thomas Woinar", "Musterstraße 1", "15230 Frankfurt (Oder)"],
        ["Notar Woinar", "Postfach 1234", "15201 Frankfurt (Oder)"],
        ["An das Notariat", "Th. Woinar", "Musterstraße 1", "15230 Frankfurt (Oder)"],
    ]
    an = r.choice(an_varianten)
    anrede = r.choice(["Sehr geehrter Herr Notar,", "Sehr geehrter Herr Woinar,", "Sehr geehrte Damen und Herren,",
                       "Guten Tag,", "Sehr geehrter Herr Notar Woinar,"])
    if bereich == "Mandant" and r.random() < 0.3:
        anrede = "Lieber Herr Woinar,"
        besonderes.append("private Anrede")
    betreff = inhalt[0]
    if r.random() < 0.6:
        betreff = "Betreff: " + betreff
    rumpf = []
    for satz in rumpf_extra + inhalt[1:] + r.sample(FUELL, r.randint(1, 4)):
        rumpf += zeilen_umbrechen(satz)
    gruss = r.choice(["Mit freundlichen Grüßen", "Hochachtungsvoll", "Freundliche Grüße"])

    seiten = r.choices([1, 2, 3, 4], weights=[60, 25, 10, 5])[0]
    zahl = r.choices(["von", "strich", "keine"], weights=[50, 15, 35])[0] if seiten > 1 else "keine"
    if seiten > 1 and zahl == "keine":
        besonderes.append("mehrseitig ohne Seitenzahl")
    anlagen = []
    if r.random() < 0.18:
        anlagen = r.choices(["grundbuch", "abschrift", "lageplan", "kontoauszug", "vertrag"], k=r.randint(1, 2))
        besonderes += ["Anlage " + a for a in anlagen]
    return dict(nr=zaehler, bereich=bereich, absender=absender_name, kopf=kopf, an=an, anrede=anrede,
                betreff=betreff, rumpf=rumpf, gruss=gruss, seiten=seiten, zahl=zahl, anlagen=anlagen,
                fuss=r.random() < 0.7, soll=soll, soll_aktion=soll_aktion, besonderes=besonderes)


def zeichne_brief(doc, r, b, duplex):
    """Zeichnet den Brief in doc. Gibt die Seitennummern (0-basiert) der Seiten mit Inhalt zurück."""
    inhalt = []

    def rueckseite():
        if duplex:
            if r.random() < 0.06:   # bedruckte Rückseite (AGB, Hinweise)
                text_seite(doc, zeilen_umbrechen("Allgemeine Hinweise zum Datenschutz: Ihre Daten werden nach "
                                                 "den gesetzlichen Vorschriften verarbeitet. " * 4), y=90, gross=7)
                inhalt.append(doc.page_count - 1)
            else:
                p = doc.new_page(width=595, height=842)
                if r.random() < 0.05:   # Durchscheinen / Staub: ein paar Punkte
                    p.draw_circle((300, 400), 1.5, color=(0.5, 0.5, 0.5), fill=(0.5, 0.5, 0.5))

    p = erste_seite(doc, r, b)
    seitenzahl(p, b["zahl"], 1, b["seiten"])
    inhalt.append(doc.page_count - 1)
    rueckseite()
    for s in range(2, b["seiten"] + 1):
        zeilen = []
        for satz in r.sample(FUELL, 4) + ["Im Einzelnen gilt Folgendes:"] + r.sample(FUELL, 3):
            zeilen += zeilen_umbrechen(satz)
        if s == b["seiten"]:
            zeilen += ["", b["gruss"], "", person(r)]
        p = text_seite(doc, zeilen, y=90)
        seitenzahl(p, b["zahl"], s, b["seiten"])
        inhalt.append(doc.page_count - 1)
        rueckseite()
    for a in b["anlagen"]:
        if a == "grundbuch":
            z = [f"Amtsgericht {r.choice(ORTE)}", f"Grundbuch von {r.choice(ORTE)}", f"Blatt {r.randint(100, 9999)}",
                 "Bestandsverzeichnis", f"Gemarkung {r.choice(ORTE)} Flur {r.randint(1, 20)} Flurstück {r.randint(1, 600)}",
                 f"Gebäude- und Freifläche, {r.choice(STRASSEN)} {r.randint(1, 99)}, {r.randint(200, 3000)} m²",
                 f"Abdruck vom {datum(r)}", "Erste Abteilung", f"Eigentümer: {person(r)}, geb. am 01.02.1960"]
            text_seite(doc, z, y=80)
        elif a == "abschrift":   # Abschrift eines Schreibens an jemand anderen – gehört trotzdem dazu
            z = ["Abschrift", b["absender"], "", f"Herrn {person(r)}", f"{anschrift(r)[0]}", f"{anschrift(r)[1]}", "",
                 f"Datum: {datum(r)}", "", "Sehr geehrter Herr " + r.choice(NACHNAMEN) + ",",
                 "zur Information übersenden wir Ihnen eine Abschrift unseres Schreibens an das Notariat.",
                 "Mit freundlichen Grüßen"]
            text_seite(doc, z, y=80)
        elif a == "lageplan":    # nur Zeichnung, kein Text
            p = doc.new_page(width=595, height=842)
            for _ in range(40):
                x0, y0 = r.randint(50, 500), r.randint(50, 780)
                p.draw_rect(fitz.Rect(x0, y0, x0 + r.randint(20, 90), y0 + r.randint(20, 90)), color=(0, 0, 0), width=1.2)
        elif a == "kontoauszug":
            z = ["Kontoauszug", f"Konto DE{r.randint(10, 99)} {r.randint(1000, 9999)} {r.randint(1000, 9999)}"]
            for _ in range(15):
                z.append(f"{datum(r)}  Gutschrift {r.choice(NACHNAMEN)}  {r.randint(10, 9999)},{r.randint(10, 99)} EUR")
            text_seite(doc, z, y=80)
        elif a == "vertrag":     # Kopie aus einem Vertragsentwurf
            z = ["Entwurf", "§ 1 Vertragsgegenstand"] + zeilen_umbrechen(" ".join(r.sample(FUELL, 5))) + \
                ["§ 2 Kaufpreis"] + zeilen_umbrechen(" ".join(r.sample(FUELL, 4)))
            text_seite(doc, z, y=80)
        inhalt.append(doc.page_count - 1)
        rueckseite()
    return inhalt


# --------------------------------------------------------------------------- Lauf

def einstellungen_fuer(Y):
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
    return e


def ist_wert(r):
    if r["aktion"] == "dublette":
        return "dublette"
    return ("U:" + r["wert"]) if r["art"] == "urkunde" else ("V:" + r["wert"]) if r["art"] == "vorgang" else "unklar"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--briefe", type=int, default=5000)
    ap.add_argument("--stapel", type=int, default=80)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--bericht")
    ap.add_argument("--behalten")
    a = ap.parse_args()
    r = random.Random(a.seed)
    tmp = tempfile.mkdtemp()
    Y = os.path.join(tmp, "Y")
    os.makedirs(os.path.join(Y, "Posteingang"))
    urk, vorg = baue_bestand(Y, r)
    e = einstellungen_fuer(Y)

    # Briefe erzeugen
    t0 = time.time()
    stapel = []
    briefe = [neuer_brief(r, urk, vorg, i + 1) for i in range(a.briefe)]
    # Ein paar Briefe werden versehentlich zweimal gescannt (im nächsten Stapel noch einmal)
    for i in range(0, len(briefe), a.stapel):
        teil = briefe[i:i + a.stapel]
        doc = fitz.open()
        duplex = r.random() < 0.8
        sr = random.Random(r.random())
        for b in teil:
            b["seiten_ist"] = zeichne_brief(doc, sr, b, duplex)
        name = os.path.join(Y, "Posteingang", f"Post_{HEUTE:%Y-%m-%d}_{i // a.stapel:04d}.pdf")
        doc.save(name)
        doc.close()
        stapel.append((name, teil))
    seiten_gesamt = sum(fitz.open(n).page_count for n, _ in stapel)
    erzeugen = time.time() - t0

    # Sortieren
    fehler = collections.defaultdict(list)
    zaehl = collections.Counter()
    nach_bereich = collections.defaultdict(collections.Counter)
    nach_besonderem = collections.defaultdict(collections.Counter)
    t0 = time.time()
    zeiten = []
    for name, teil in stapel:
        t1 = time.time()
        bestand = P.Bestand(e, HEUTE)
        erg, _, _ = P.verarbeite_datei(name, e, bestand, HEUTE, probe=False)
        zeiten.append(time.time() - t1)
        # Zerlegung vergleichen: Schreiben über ihre erste Seite zuordnen
        ist_nach_start = {res["teil"][0].nr: res for res in erg}
        ist_seiten = {res["teil"][0].nr: [s.nr for s in res["teil"]] for res in erg}
        for b in teil:
            zaehl["briefe"] += 1
            soll_seiten = b["seiten_ist"]
            res = ist_nach_start.get(soll_seiten[0])
            zerlegung_ok = res is not None and ist_seiten[soll_seiten[0]] == soll_seiten
            bereich_z = nach_bereich[b["bereich"]]
            bereich_z["briefe"] += 1
            for be in b["besonderes"] or ["normal"]:
                nach_besonderem[be]["briefe"] += 1
            if not zerlegung_ok:
                zaehl["ZERLEGUNG"] += 1
                bereich_z["ZERLEGUNG"] += 1
                for be in b["besonderes"] or ["normal"]:
                    nach_besonderem[be]["ZERLEGUNG"] += 1
                ist = "fehlt (in anderes Schreiben geraten)" if res is None else \
                    f"Seiten {[n + 1 for n in ist_seiten[soll_seiten[0]]]}"
                fehler["ZERLEGUNG"].append(f"{os.path.basename(name)} Brief {b['nr']} ({b['bereich']}: {b['betreff']}) "
                                           f"soll Seiten {[n + 1 for n in soll_seiten]}, ist {ist}; {b['besonderes']}")
            if res is None:
                continue
            ist = ist_wert(res)
            if ist == "dublette":
                zaehl["DUBLETTE_FALSCH"] += 1
                fehler["DUBLETTE_FALSCH"].append(f"Brief {b['nr']} ({b['bereich']}) als Dublette abgelegt: {res['grund']}")
                continue
            art = None
            if ist != b["soll"]:
                art = "UNKLAR" if ist == "unklar" else "FALSCH"
            if art:
                zaehl[art] += 1
                bereich_z[art] += 1
                for be in b["besonderes"] or ["normal"]:
                    nach_besonderem[be][art] += 1
                fehler[art].append(f"Brief {b['nr']} ({b['bereich']}: {b['betreff']}) soll {b['soll']}, ist {ist} "
                                   f"[{res['grund']}]; Kopf {b['kopf'][1:-1]}; {b['besonderes']}")
            else:
                zaehl["richtig"] += 1
            if b["soll_aktion"] == "vorlegen" and res["aktion"] == "ablegen":
                zaehl["ÜBERSEHEN"] += 1
                bereich_z["ÜBERSEHEN"] += 1
                fehler["ÜBERSEHEN"].append(f"Brief {b['nr']} ({b['bereich']}: {b['betreff']}) nur abgelegt, "
                                           f"Art {res['schreiben_art']} ({res['stichwort']})")
            if b["soll_aktion"] == "ablegen" and res["aktion"] == "vorlegen" and ist != "unklar":
                zaehl["unnötig vorgelegt"] += 1
    sortieren = time.time() - t0

    # Bericht
    aus = []
    n = zaehl["briefe"]
    aus.append(f"Großtest Postsortierer {P.VERSION}: {n} erfundene Briefe in {len(stapel)} Stapeln, "
               f"{seiten_gesamt} Seiten (mit leeren Rückseiten)")
    aus.append(f"Erzeugen {erzeugen:.0f} s, Sortieren {sortieren:.0f} s "
               f"(je Stapel im Mittel {sum(zeiten) / len(zeiten):.1f} s, längster {max(zeiten):.1f} s)")
    aus.append("")
    aus.append(f"richtig zugeordnet          {zaehl['richtig']:5d}  ({100 * zaehl['richtig'] / n:.2f} %)")
    for k in ("FALSCH", "UNKLAR", "ZERLEGUNG", "ÜBERSEHEN", "DUBLETTE_FALSCH", "unnötig vorgelegt"):
        aus.append(f"{k:<27} {zaehl[k]:5d}  ({100 * zaehl[k] / n:.2f} %)")
    aus.append("")
    aus.append("Nach Bereich (Briefe / falsch / unklar / Zerlegung / übersehen):")
    for k, c in sorted(nach_bereich.items()):
        aus.append(f"  {k:<15} {c['briefe']:5d} {c['FALSCH']:5d} {c['UNKLAR']:5d} {c['ZERLEGUNG']:5d} {c['ÜBERSEHEN']:5d}")
    aus.append("")
    aus.append("Nach Besonderheit (Briefe / falsch / unklar / Zerlegung):")
    for k, c in sorted(nach_besonderem.items(), key=lambda x: -x[1]["briefe"]):
        aus.append(f"  {k:<28} {c['briefe']:5d} {c['FALSCH']:5d} {c['UNKLAR']:5d} {c['ZERLEGUNG']:5d}")
    for k, liste in fehler.items():
        aus.append("")
        aus.append(f"{k} ({len(liste)}), die ersten 40:")
        aus += ["  " + x for x in liste[:40]]
    text = "\n".join(aus)
    print(text)
    if a.bericht:
        with open(a.bericht, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    if a.behalten:
        shutil.copytree(Y, a.behalten, dirs_exist_ok=True)
    shutil.rmtree(tmp)
    return zaehl


if __name__ == "__main__":
    z = main()
    sys.exit(1 if z["FALSCH"] or z["ÜBERSEHEN"] else 0)
