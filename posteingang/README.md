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
- Vorgang: „Ihr Zeichen: 4711“, „Ihr Az. 4711“, „Vorgang 4711“.
- Jede Nummer wird gegen den Bestand geprüft (Schattenarchiv `Y:\Scanner\URKUNDEN\Urkunden <Jahr>`,
  Ordner `Y:\Vorgänge`). Unbekannte Nummern → „Nicht zugeordnet“ (mit Grund im Protokoll).
- Mehrere verschiedene Nummern in einem Schreiben → „Nicht zugeordnet“. Vorrang hat die UVZ (`"vorrang"`).

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
