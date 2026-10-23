# Handy-Scan

Vorgelegte Dokumente (Geburtsurkunde, Ausweis usw.) beim Vorgespräch mit dem Handy
fotografieren und direkt als PDF im Vorgangsordner ablegen.

**Läuft nicht über GitHub Pages**, sondern auf dem Büro-PC: `Handy-Scan-Server.ps1` ist ein
kleiner Webserver (Windows PowerShell 5.1, keine Installation nötig), den das Handy im
Büro-WLAN aufruft. Das PDF wird auf dem Handy erzeugt und direkt an den PC geschickt;
keine Cloud, keine fremden Server (Verschwiegenheit, § 26a BNotO).

## Ablage

`<Basisordner>\<Nummer> <Bezeichnung>\<Dokumentart> <Zusatz> <JJJJ-MM-TT>.pdf`

- Basisordner laut `einstellungen.json`, Vorgabe `Y:\Vorgänge`.
- Gibt es schon einen Ordner, der mit der Vorgangsnummer beginnt (auch mit führenden
  Nullen), wird er genommen; bei mehreren wählt man auf dem Handy. Sonst wird
  `<Nummer> <Bezeichnung>` neu angelegt.
- Gleicher Dateiname → ` (2)`, ` (3)` …

## Einrichten (einmalig, am Büro-PC)

1. Ordner z. B. nach `C:\Users\<Name>\Documents\Handy-Scan` kopieren.
2. `Einrichten.cmd` doppelklicken: gibt Port 8765 frei (Administratorrechte, Firewall nur
   für das lokale Netz), fragt eine PIN ab, legt den Autostart an, startet den Server und
   zeigt im Browser einen QR-Code.
3. QR-Code mit dem Handy scannen, in Chrome ⋮ → „Zum Startbildschirm hinzufügen“.

`Handy-Scan beenden.cmd` stoppt den Server (z. B. vor einem Update). Protokoll:
`%LOCALAPPDATA%\Handy-Scan\protokoll.txt`.

## Dateien

- `Handy-Scan-Server.ps1` – Server (`/api/ordner`, `/api/ablegen`, `/api/info`, Seiten aus `web/`)
- `web/` – Handy-Seite (`index.html`, `app.js`) und Einrichtungsseite `start.html` mit QR-Code;
  `pdf-lib.min.js`, `qrcode.js` (qrcode-generator 1.4.4) lokal mitgeliefert
- `einstellungen.json` – Basisordner, Port, PIN
