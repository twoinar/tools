# Claude-Starter

Eigenes Fenster für Claude und die Werkzeuge des Notariats auf dem Büro-PC, unabhängig von Handy-Scan.
Desktop-Symbol „Claude“ → Kacheln, geordnet nach Claude, Vorgespräch und Bewertung, Vollzug und
Register, Büro, Karten und Register. Jede Kachel zeigt, wohin die Eingaben gehen:
🟠 KI (an Claude, USA) · 🟢 bleibt am PC (nur im Browser bzw. auf diesem PC) · 🔵 Webseite (an den
Betreiber der Seite, nicht an eine KI).

- **Frage an Claude** – schlichter Chat (mit Websuche), Antworten kurz und mit Vorschriften.
- **Grundstückswert KI** – erst Einverständnis der Beteiligten bestätigen, dann Formular (Pflicht nur
  die Adresse). Claude recherchiert, fragt fehlende Angaben nach und gibt Verkehrswert nach Sach- und
  Ertragswertverfahren (ImmoWertV) und den Bedarfswert für die Schenkungsteuer (§§ 176 ff. BewG) aus.
- **Grundstückswert lokal**, Bögen, Kostenrechner, XNP, Geldwäsche, Büro-Portal, Handy-Scan,
  Tools intern, BrandenburgViewer, BORIS, Gesetze im Internet – Links.
- **Bilanzen und Firmendaten** – Firmenname eintippen, Unternehmensregister oder Bundesanzeiger öffnen;
  der Name liegt in der Zwischenablage (Strg+V ins Suchfeld).

**Vorgang:** Beim ersten Klick (und nach 30 Minuten Pause) fragt das Fenster nach der Vorgangsnummer;
oben steht der aktuelle Vorgang mit „wechseln“. Alles wird im Vorgang hinterlegt: jeder Chat als PDF
`<Nr> Claude Frage <Datum Zeit>.pdf` bzw. `<Nr> Wertanalyse KI <Datum Zeit>.pdf` (nach jeder Antwort
fortgeschrieben), jeder geöffnete Link und jede Firmensuche als Zeile in `<Nr> Claude-Fenster Protokoll.txt`.
Was in den geöffneten Webseiten und Tools passiert, sieht das Fenster nicht; deren Ergebnisse dort
speichern. An Claude geht nur der getippte Text, die Vorgangsnummer bleibt am PC.

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
  Runspace, das Fenster bleibt bedienbar). `POST /api/ablegen` schreibt das PDF in den Ablageordner (`ersetzen=1` überschreibt), `POST /api/protokoll`
  hängt eine Zeile an das Vorgangsprotokoll.
- `claude.json` – API-Schlüssel, DPAPI-verschlüsselt (nur dieser Windows-Benutzer). Nie ins Repo.
- `einstellungen.json` – `Ablageordner`, `Vorgangsordner`, `NurZiffern`, `Kartenlink`, `Wertrechner`, `Port`, optional
  `Links` (`boegen`, `tools`, `kosten`, `portal`) für andere Adressen.
- `web/` – `claude.html`, `claude.js` (Chat, Systemprompts), `aktenvermerk.js` (PDF-Satz mit pdf-lib).
