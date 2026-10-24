# Claude-Starter

Eigenes Fenster für Claude auf dem Büro-PC, unabhängig von Handy-Scan. Desktop-Symbol „Claude“
→ drei Knöpfe:

- **Frage an Claude** – schlichter Chat (mit Websuche), Antworten kurz und mit Vorschriften.
- **BrandenburgViewer** – öffnet `Kartenlink` (Vorgabe https://bb-viewer.geobasis-bb.de/).
- **Grundstückswert KI** – überschlägige Wertanalyse nach ImmoWertV (wie der Skill „Wertanalyse“).
  Vorher bestätigen, dass die Beteiligten mit der Übermittlung an Claude einverstanden sind; die
  Bestätigung steht mit Zeitpunkt im PDF.
- **Grundstückswert lokal** – öffnet den Grundstückswert-Rechner aus den Bögen (`Wertrechner`, Vorgabe
  https://twoinar.github.io/boegen/vorgespraech.html?nur=bewertung). Rechnet nur im Browser, nichts geht an Claude.

„Im Vorgang ablegen“ setzt den Chat als PDF und legt ihn im Ablageordner ab:
`<Nr> Claude <Thema>.pdf` bzw. `<Nr> Wertanalyse.pdf`. An Claude geht nur der getippte Text, die
Vorgangsnummer bleibt am PC. Keine Namen der Beteiligten eingeben (§ 18 BNotO, DSGVO).

## Einrichten (einmalig)

1. Ordner z. B. nach `C:\Users\<Name>\Documents\Claude` kopieren.
2. `Einrichten.cmd` doppelklicken: API-Schlüssel einfügen (https://console.anthropic.com/settings/keys),
   Ablageordner bestätigen (Vorgabe aus Handy-Scan, sonst `Y:\Vorgänge`). Legt das Desktop-Symbol an
   und öffnet Claude.

Keine Administratorrechte, kein Autostart: Das Symbol startet den kleinen Server bei Bedarf
(`Claude-Starten.ps1`), danach läuft er im Hintergrund weiter. `Claude beenden.cmd` stoppt ihn.
Protokoll: `%LOCALAPPDATA%\Claude-Starter\protokoll.txt`.

## Technik

- `Claude-Server.ps1` – PowerShell-HttpListener nur auf `http://localhost:8766/`. `POST /api/claude`
  reicht die Anfrage an `api.anthropic.com/v1/messages` weiter und hängt den Schlüssel an (eigener
  Runspace, das Fenster bleibt bedienbar). `POST /api/ablegen` schreibt das PDF in den Ablageordner.
- `claude.json` – API-Schlüssel, DPAPI-verschlüsselt (nur dieser Windows-Benutzer). Nie ins Repo.
- `einstellungen.json` – `Ablageordner`, `Vorgangsordner`, `NurZiffern`, `Kartenlink`, `Wertrechner`, `Port`.
- `web/` – `claude.html`, `claude.js` (Chat, Systemprompts), `aktenvermerk.js` (PDF-Satz mit pdf-lib).
