# Handy-Scan

Vorgelegte Dokumente (Geburtsurkunde, Ausweis usw.) beim Vorgespräch mit dem Handy
fotografieren und direkt als PDF im Vorgangsordner ablegen.

**Läuft nicht über GitHub Pages**, sondern auf dem Büro-PC: `Handy-Scan-Server.ps1` ist ein
kleiner Webserver (Windows PowerShell 5.1, keine Installation nötig), den das Handy im
Büro-WLAN aufruft. Das PDF wird auf dem Handy erzeugt und direkt an den PC geschickt;
keine Cloud, keine fremden Server (Verschwiegenheit, § 26a BNotO).

## Ablage

`<Basisordner>\<Vorgangsnummer> <Bezeichnung>.pdf` – keine Unterordner.

- Basisordner laut `einstellungen.json`, Vorgabe `Y:\Vorgänge`.
- Die Dokumentart (z. B. „Geburtsurkunde“) wird in die Bezeichnung übernommen, dahinter
  ergänzt man z. B. den Namen.
- Gleicher Dateiname → ` (2)`, ` (3)` …

## Scannen

Das Foto wird auf dem Handy mit OpenCV.js (`web/opencv.js`, @techstark/opencv-js 4.10)
ausgewertet: Blatt als größtes Viereck suchen (Kanten in drei Empfindlichkeiten, helle Fläche
global und örtlich), Ecken zum Prüfen/Verschieben anzeigen, perspektivisch gerade ziehen,
Schatten herausrechnen („Dokument“) oder harte Schwelle („Schwarzweiß“).
**Live-Sucher** („Scannen“, ab 1.2): Kamerabild per `getUserMedia`, Blatterkennung laufend auf
480 px, blau umrandet; liegt ein sauberes Viereck sechs Erkennungen lang ruhig, löst die Seite
selbst aus, sucht die Ecken im großen Bild genau und wartet dann auf das nächste Blatt.
`getUserMedia` braucht einen sicheren Ursprung. Weil der Server nur HTTP spricht, wird die
Adresse einmalig in Chrome auf dem Handy freigeschaltet: `chrome://flags` →
„Insecure origins treated as secure“ → `http://<IP des PCs>:8765` → Enabled → Relaunch.
Ohne Freischaltung bleibt „Foto“ (Kamera-App) mit anschließender Erkennung.

## Claude-Vermerk ablegen

Seite `http://localhost:8765/vermerk` (am PC; im Büro-WLAN auch vom Handy): Frage und Antwort
aus Claude einfügen, Vorgangsnummer und Thema wählen → Aktenvermerk-PDF
`<Basisordner>\<Nr> Claude <Thema>.pdf` mit Kopf (Vorgang, Datum, Hinweis „KI-Auskunft, vom
Notar zu prüfen“), Frage, Antwort und Prüfzeile. Das PDF wird im Browser gesetzt (pdf-lib,
Markdown von Claude: Überschriften, Fett/Kursiv, Listen, Tabellen) und über `/api/ablegen`
abgelegt. Die Vorgangsnummer geht nur an den Büro-PC, nie an Claude. An Claude nur ohne Namen
und Anschriften fragen (§ 26a BNotO). Verknüpfung für den Desktop: `Claude-Vermerk ablegen.url`.

## Einrichten (einmalig, am Büro-PC)

1. Ordner z. B. nach `C:\Users\<Name>\Documents\Handy-Scan` kopieren.
2. `Einrichten.cmd` doppelklicken: gibt Port 8765 frei (Administratorrechte, Firewall nur
   für das lokale Netz), fragt eine PIN ab, legt den Autostart an, startet den Server und
   zeigt im Browser einen QR-Code.
3. QR-Code mit dem Handy scannen (oder den auf https://twoinar.github.io/tools/apps/), in Chrome ⋮ → „Zum Startbildschirm hinzufügen“.

`Handy-Scan beenden.cmd` stoppt den Server (z. B. vor einem Update). Protokoll:
`%LOCALAPPDATA%\Handy-Scan\protokoll.txt`.

## Dateien

- `Handy-Scan-Server.ps1` – Server (`/api/ablegen`, `/api/info`, Seiten aus `web/`)
- `web/` – Handy-Seite (`index.html`, `app.js`), Einrichtungsseite `start.html` mit QR-Code,
  Claude-Vermerk (`vermerk.html`, `vermerk.js`);
  `pdf-lib.min.js`, `opencv.js`, `qrcode.js` (qrcode-generator 1.4.4) lokal mitgeliefert
- `einstellungen.json` – Basisordner, Port, PIN
