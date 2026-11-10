# Posteingang sortieren

Zerlegt die Sammel-PDFs, die der Scanner (Ricoh fi-8170, PaperStream Capture, Auftrag „Posteingang“,
durchsuchbares PDF) nach `Y:\Posteingang` legt, in einzelne Schreiben und legt jedes Schreiben ab:

| erkannt | Ablage |
|---|---|
| UVZ-Nummer, die es im Schattenarchiv gibt | `Y:\Posteingang\Urkunden\<Nr>-<Jahr>\` |
| Vorgangsnummer, zu der es einen Ordner in `Y:\Vorgänge` gibt | `Y:\Posteingang\Vorgänge\<Nr>\` |
| nichts sicher erkannt | `Y:\Posteingang\Nicht zugeordnet\` |

Fehlt der Unterordner, wird er angelegt; gibt es ihn schon, kommt das Schreiben dazu.
Die Original-Scans werden nie gelöscht, sondern nach `Y:\Posteingang\Original-Scans\<Jahr-Monat>\` verschoben.
Jede Zuordnung steht im Protokoll `Y:\Posteingang\Protokoll\Protokoll <Jahr-Monat>.csv` (öffnet in Excel).

**Ohne KI und ohne Internet.** Das Programm arbeitet nur mit festen Regeln (`einstellungen.json`) und liest
den Text, den PaperStream Capture beim Scannen erkannt hat.

## Wie wird zerlegt?
Eine Seite beginnt ein neues Schreiben, wenn sie wie eine erste Briefseite aussieht: oben an das Notariat
adressiert (Woinar), Anrede, Datum oben, „Ihr Zeichen“/Betreff oben (mindestens 3 Punkte, Anschrift zählt 2).
„Seite 1 von 3“ beginnt ein Schreiben, „Seite 2 …“ hängt immer an. Seiten ohne solche Merkmale (Anlagen,
Folgeseiten) gehören zum vorigen Schreiben. Leere Rückseiten fallen weg.

## Wie wird zugeordnet?
- UVZ: „UVZ-Nr. 2048/2026“, „UR-Nr. 2048/26“, „Urkunde Nr. 2048/2026“, „Urkundenrolle Nr.“, „W 2048-2026“,
  „UVZ-Nr. 2048 für 2026“. Ohne Jahr wird im laufenden und im Vorjahr gesucht.
- Kostenrechnung (Bruchnummer): „W 2006/0/1 - 2025“, „W 2048/1/1-2026“ → zur Urkunde 2006-2025 bzw. 2048-2026.
- Vorgang: „Ihr Zeichen: 30513“, „Ihr Az. 30513“, „Vorgang 30513“ (fünfstellig).
- Jede Nummer wird gegen den Bestand geprüft (Schattenarchiv `Y:\Scanner\URKUNDEN\Urkunden <Jahr>`,
  Ordner `Y:\Vorgänge`). Unbekannte Nummern → „Nicht zugeordnet“ (mit Grund im Protokoll).
- Mehrere verschiedene Nummern in einem Schreiben → „Nicht zugeordnet“. Die UVZ hat immer Vorrang (`"vorrang"`).

## Was muss der Mitarbeiter tun? (Tagesliste)
Jedes Schreiben bekommt eine **Art** (z. B. Vorkaufsrecht, Genehmigung, Grundbuchamt, Bank / Löschung,
Zahlung / Bestätigung) und daraus eine **Aufgabe**:

| Aufgabe | wann |
|---|---|
| mit Akte vorlegen | vollzugsrelevant (Vorkaufsrecht, Genehmigungen, Grundbuchamt, Unbedenklichkeitsbescheinigung, Löschung/Treuhand, Register, Vollmachten, Fristen) oder Absender im Briefkopf ist Behörde/Gericht/Bank |
| nur elektronisch ablegen | nur wenn eine Ablage-Regel sicher passt (Zahlungs- und Eingangsbestätigungen, Werbung) |
| bitte zuordnen | keine sichere UVZ-/Vorgangsnummer |
| nichts (Dublette) | schon einmal gescannt |

**Im Zweifel vorlegen:** Passt keine Regel, gilt `standard_aktion` = vorlegen. Ein Brief soll nie übersehen werden;
lieber einmal zu viel vorgelegt.

Die Arten stehen in `einstellungen.json` unter `"arten"` (der Reihe nach geprüft, erste passende gilt;
`"bereich": "oben"` = nur Briefkopf/Betreff der ersten Seite). Die Art steht im Dateinamen
(`Eingang … Nr 03 - Vorkaufsrecht.pdf`) und im Protokoll.

Nach jedem Scan schreibt das Programm die **Tagesliste** `Y:\Posteingang\Tageslisten\Posteingang <Datum>.html`
(und `Posteingang heute.html`): Abschnitte „Mit der Akte vorlegen“, „Bitte zuordnen“, „Nur elektronisch
abgelegt“, „Doppelt gescannt“, je Zeile Uhrzeit, UVZ/Vorgang, Art, Absender, Seiten und Link zur Datei.
Öffnet im Browser, lässt sich ausdrucken und abhaken.

### Tagesliste im Browser (für alle Mitarbeiter)
**https://tools.notariat-woinar.de/tools/posteingang/tagesliste/** (Chrome oder Edge, Verknüpfung auf dem Desktop).
Beim ersten Mal einmal den Ordner `Y:\Posteingang` freigeben („Bearbeitung zulassen“). Danach:
- Tag wählen (‹ › , Kalender, „Heute“); links „Noch offen“ = Tage der letzten 3 Monate, an denen noch etwas
  vorzulegen oder zuzuordnen ist.
- Haken setzen = erledigt; gespeichert mit Name und Uhrzeit in `Y:\Posteingang\Protokoll\Erledigt <JJJJ-MM>.json`,
  das sehen alle. Die Liste aktualisiert sich alle 30 Sekunden (neue Scans, Haken der Kollegen).
- Klick auf die Datei öffnet das PDF.
- Spalte „Inhalt“: Klick klappt die **Kurzfassung** auf (Betreff und die ersten Sätze nach der Anrede, vom
  Sortier-Programm ohne KI aus dem Text geschnitten; steht im Protokoll in den Spalten Betreff/Kurzfassung).

- „Bitte zuordnen“: Knopf **„Zuordnen …“**, UVZ-Nr. (539/2026, W 539/26) oder Vorgangsnummer eintippen; die Seite
  verschiebt das PDF nach Urkunden\<Nr>-<Jahr> bzw. Vorgänge\<Nr> und hakt ab.

1.6: Blanke Nummern („539/2026“) zählen, wenn sie oben im Brief stehen (`muster_uvz_oben`) und die Urkunde im
Schattenarchiv existiert; „W 539/26“ mit zweistelligem Jahr. Programm-Ausgabe und Update-Schritte stehen in
`Y:\Posteingang\Protokoll\Programm.log` (ohne Briefinhalte).

Ab 1.5 ergänzt das Programm beim Start ältere Protokollzeilen (vor 1.3 ohne Art/Absender) um Art, Absender, Betreff
und Kurzfassung (`--nachtragen` macht das von Hand). Die Dateien werden dabei nur gelesen.

Die Seite liest das Protokoll direkt über die Ordnerfreigabe des Browsers. Vom Server kommt nur die Seite;
Post, Namen und Haken bleiben auf Y:. Vorführung mit Beispieldaten im Browser: `…/tagesliste/?demo`.

## Dubletten
Wird ein Schreiben ein zweites Mal gescannt, erkennt das Programm das am fast gleichen Text (mindestens 95 %
gleiche Wörter, Zahlen wie Datum und Aktenzeichen praktisch identisch, gleiche Seitenzahl, Vergleich mit den
Schreiben der letzten 30 Tage im selben Zielordner). Die Dublette wird **nicht gelöscht**, sondern nach
`Y:\Posteingang\Dubletten\` gelegt; das Protokoll nennt die Datei, von der sie eine Dublette ist.
Einstellbar über `dubletten_schwelle` (0 schaltet die Prüfung ab) und `dubletten_tage`.

## Nebenakte (§ 43 NotAktVV)
Beim Ablegen führt der Sortierer in jedem Akten-Ordner eine Datei `_nebenakte.json` (SHA-256, Eingang, Absender,
Betreff, Art, Papieroriginal ja/nein, Imprinter-Nummern, Vollzug). Von Hand können dort unter `"akte"` eingetragen
werden: `abschluss_amtsgeschaeft`, `weitere_aufbewahrung` (`am`, `bis`, `weil`, § 52), `massennummer`,
`geschaeftsgegenstand`, `uvz` (zugehörige Urkunden, z. B. `["2048/2026"]`), `urkunden`
(`{"2048/2026": {"geschaeftsgegenstand": "Grundstückskaufvertrag"}}`), `aufbewahrungsfrist` (7–30).

`Nebenakte exportieren.cmd` fragt nach Vorgangs- oder UVZ-Nummer (oder `alle`) und legt nach `Y:\Nebenakten-Export`
je Akte: `nebenakte.xml` (geprüft gegen `Elektronische_Nebenakte_1.1.0.xsd` der Bundesnotarkammer), `dokumente\`,
`intern.json`, bei Papieroriginalen `Deckblatt Papierakte.pdf`, und `Export-Bericht.html`. Entspricht der Datensatz
nicht dem Schema, gibt es keinen Export, sondern einen Fehlerbericht in verständlichen Sätzen.
Akte = Vorgang; eine Urkunde gehört zum Vorgang, wenn ein Schreiben beide Nummern trägt (gelernt in
`Y:\Posteingang\Verbindungen Urkunde-Vorgang.json`), ein Versand-Vermerk in `Y:\Vorgänge` beide nennt oder sie unter
`"uvz"` eingetragen ist. Imprinter-Nummern: `"imprinter_seiten_je_blatt": 2` setzen, sobald der Scanner leere Seiten
nicht mehr selbst überspringt. Befehlszeile: `Posteingang-sortieren.exe --nebenakte 30471 [--ziel ORDNER] [--still]`.

## E-Mails aus dem Büro-Postfach (ab 1.9)
Ist der Abruf auf dem Post-PC eingerichtet, holt das Programm alle 2 Minuten neue Mails aus dem Posteingang von
post@notar-woinar.de (Microsoft Graph, eigene App-Registrierung von Netsys24, nur für dieses Postfach). Aus jeder
Mail wird **eine** PDF: Kopf (Von, An, Datum, Betreff, Anhänge), Text, dahinter die PDF- und Bild-Anhänge. Sie
wird wie ein Scan einsortiert (Nummer im Betreff oder Text, Absender und Betreff aus der Mail) und steht in der
Tagesliste mit ✉️. Anhänge, die keine PDF werden können (Word, Excel, ZIP …), liegen mit gleichem Namensanfang
neben der PDF und wandern beim „Zuordnen“ mit. Die Original-Mail (.eml) wird in `Y:\Posteingang\Original-Mails\<Monat>`
gesichert.

Danach wird die Mail im Postfach als gelesen markiert und in den Ordner „Verarbeitet“ verschoben. Es wird nie
etwas gelöscht oder gesendet. Einstellbar im Block `"mail"` der `einstellungen.json`: `"nach_abholen"` =
`"verschieben"` / `"markieren"` (nur Kategorie „Posteingang“, bleibt im Posteingang) / `"nichts"`, `"als_gelesen"`,
`"abruf_minuten"`, `"erstabruf_tage"` (beim allerersten Abruf: Mails der letzten N Tage), `"aus": true` schaltet
den Abruf ab. Welche Mails schon abgeholt sind, steht in `Protokoll\Mail-Abruf.json` (nie doppelt).

Einrichten: `E-Mail-Abruf einrichten.cmd` auf dem Post-PC doppelklicken, **unter dem Windows-Benutzer, unter dem
das Sortieren läuft**. Abgefragt werden Postfach, Tenant-ID, Client-ID und Secret (unsichtbare Eingabe) bzw. eine
PFX-Zertifikatsdatei. Die Angaben werden geprüft und verschlüsselt (Windows-DPAPI, nur dieser Benutzer auf diesem
PC) unter `%APPDATA%\Posteingang\mail-zugang.dat` gespeichert, also nicht im Programmordner und nicht auf Y:.
Updates lassen sie unberührt. Ausschalten: `E-Mail-Abruf ausschalten.cmd`.

## Bedienung
- `Posteingang jetzt sortieren.cmd` – sortiert sofort, von jedem PC aus.
- `Automatisch sortieren einrichten.cmd` – einmal auf dem Post-PC: läuft nach jeder Anmeldung minimiert
  im Hintergrund und sieht alle 20 Sekunden nach.
- Probe ohne Verschieben: `Posteingang-sortieren.exe --probe "Y:\...\Scan.pdf"`.

Zwei PCs können nicht gleichzeitig sortieren (Sperrdatei `~sortiert-gerade.lock`).

## Updates
Das Programm im Dauerbetrieb (Post-PC) schaut stündlich bei GitHub nach einer neueren `posteingang-<Version>`
(nur Herunterladen, es wird nichts hochgeladen). Gibt es eine, lädt es das Paket, beendet sich, ein kleines
Skript kopiert die neuen Dateien nach `Y:\Posteingang-Programm` (alte Einstellungen als
`einstellungen.vorher.json`) und startet die neue Version. Geänderte `einstellungen.json` gelten sofort,
ohne Neustart. Abschalten: `"update_pruefen_minuten": 0`.

## Entwicklung
`python test/mail_test.py` prüft den E-Mail-Abruf gegen ein nachgebautes Microsoft Graph (erfundene Mails).
`python test/nebenakte_test.py` prüft den Export (XSD-Prüfung, Deckblatt, Warnungen, Fehler).
`python test/testlauf.py` erzeugt einen erfundenen Poststapel und prüft Zerlegung und Zuordnung.
`python test/grosstest.py --briefe 500` erzeugt viele erfundene Briefe aus allen Bereichen des Notariats
(Grundbuch, Genehmigungen, Banken, Register, Nachlass, Familie, Verwahrung, Kosten, Werbung …) mit typischen
Schwierigkeiten (Lesefehler in Nummern, fremde Aktenzeichen, Vorurkunden im Text, Anlagen, Lagepläne,
mehrseitige Briefe ohne Seitenzahl) und zählt falsche Ablagen, „Nicht zugeordnet“, Zerlegungsfehler und
übersehene Vorlagen.

Seit 1.6: Nummern mit Lesefehlern (O statt 0, l statt 1, S statt 5, B statt 8) werden erkannt, aber nur
vollständig (aus „l936“ wird nie „936“). Bei mehreren Nummern gilt die im Briefkopf (vor der Anrede); gibt es
die Nummer im Briefkopf nicht, wird keine andere Nummer aus dem Text genommen. Eine UVZ ohne Jahr wird nur
zugeordnet, wenn es sie in den letzten drei Jahren genau einmal gibt. Zeichnungen ohne Text (Lagepläne)
gelten nicht mehr als leere Seite. „Ablegen“ nur, wenn im ganzen Schreiben nichts auf eine Vorlage hindeutet.
Die Windows-Version (.exe) baut GitHub Actions (`.github/workflows/posteingang-exe.yml`) und legt sie als
Release `posteingang-<Version>` ab.
