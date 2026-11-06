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

## Dubletten
Wird ein Schreiben ein zweites Mal gescannt, erkennt das Programm das am fast gleichen Text (mindestens 95 %
gleiche Wörter, Zahlen wie Datum und Aktenzeichen praktisch identisch, gleiche Seitenzahl, Vergleich mit den
Schreiben der letzten 30 Tage im selben Zielordner). Die Dublette wird **nicht gelöscht**, sondern nach
`Y:\Posteingang\Dubletten\` gelegt; das Protokoll nennt die Datei, von der sie eine Dublette ist.
Einstellbar über `dubletten_schwelle` (0 schaltet die Prüfung ab) und `dubletten_tage`.

## Bedienung
- `Posteingang jetzt sortieren.cmd` – sortiert sofort, von jedem PC aus.
- `Automatisch sortieren einrichten.cmd` – einmal auf dem Post-PC: läuft nach jeder Anmeldung minimiert
  im Hintergrund und sieht alle 20 Sekunden nach.
- Probe ohne Verschieben: `Posteingang-sortieren.exe --probe "Y:\...\Scan.pdf"`.

Zwei PCs können nicht gleichzeitig sortieren (Sperrdatei `~sortiert-gerade.lock`).

## Entwicklung
`python test/testlauf.py` erzeugt einen erfundenen Poststapel und prüft Zerlegung und Zuordnung.
Die Windows-Version (.exe) baut GitHub Actions (`.github/workflows/posteingang-exe.yml`) und legt sie als
Release `posteingang-<Version>` ab.
