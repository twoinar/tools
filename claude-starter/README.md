# Claude-Starter

Eigenes Fenster für Claude und die Werkzeuge des Notariats auf dem Büro-PC, unabhängig von Handy-Scan.
Desktop-Symbol „Claude“ → Kacheln, geordnet nach Claude, Vorgespräch und Bewertung, Vollzug und
Register, Büro, Karten und Register. Jede Kachel zeigt, wohin die Eingaben gehen:
🟠 KI (an Claude, USA) · 🟢 bleibt am PC (nur im Browser bzw. auf diesem PC) · 🔵 Webseite (an den
Betreiber der Seite, nicht an eine KI).

- **Frage an Claude** – schlichter Chat (mit Websuche), Antworten kurz und mit Vorschriften.
- **Grundstückswert KI** – erst Einverständnis der Beteiligten bestätigen, dann nur die Adresse
  (vorbelegt aus dem Vorgesprächsbogen des Vorgangs bzw. aus dem BrandenburgViewer). Claude recherchiert, fragt fehlende Angaben nach und gibt Verkehrswert nach Sach- und
  Ertragswertverfahren (ImmoWertV) und den Bedarfswert für die Schenkungsteuer (§§ 176 ff. BewG) aus.
- **Tools intern** – die Seiten aus `tools/intern` (Bögen, Kostenrechner, XNP …) als Kacheln, wie in deren
  Übersicht gruppiert; die Bögen-Übersicht wird ausgepackt (jeder Bogen eine Kachel), Handy-Scan bleibt
  draußen, doppelte Einträge erscheinen nur einmal. Einmal „Tools intern verbinden“ und das Passwort eingeben; danach öffnen sie ohne
  Passwort. Technik: `web/intern/` (Kopie von Anmeldung und Service Worker aus `tools/intern`) lädt die
  verschlüsselten Dateien vom IONOS-Server und entschlüsselt sie im Browser; der Schlüssel liegt nicht
  exportierbar in der IndexedDB von `localhost:8766`. Grundstückswert lokal = `boegen/bewertung.html` (sonst `boegen/vorgespraech.html?nur=bewertung`).
- **Vorgesprächsbogen klassisch / Maske** – der bisherige Bogen aus Tools intern und die neue Klick-Maske
  (https://tools.notariat-woinar.de/boegen/vorgespraech-maske.html, Login fragt Edge einmal ab). Tools intern
  lädt die verschlüsselten Dateien von https://tools.notariat-woinar.de/tools/intern/ (ohne Login lesbar).
- **BrandenburgViewer** – springt zum Grundstück des Vorgangs: Koordinaten aus dem Vorgesprächsbogen (bzw. der Maske, Info-Key `WoinarMaske` → `grundstuecke`)
  (`<Nr> … Vorgespräch….pdf` im Ablageordner, eingebettete Daten der Bögen) als `marker`, sonst
  Adresssuche (`query`). Öffnet gleich mit Luftbild und Topographie, Bodenrichtwerten Bauland, Fluren und
  Flurstücken (`layerIDs=7004,586,73,149`, IDs aus der `config.json` des Viewers; diese Schreibweise von Thomas getestet).
- **Registerabruf** – Firma (und ggf. Registernummer) eingeben, ankreuzen was gebraucht wird: aktueller,
  historischer, chronologischer Abdruck, neuester Gesellschaftsvertrag, neueste Gesellschafterliste. Das
  Fenster füllt die Formulare des Registerportals selbst aus (`web/register.js`, JSF mit ViewState, Ablauf
  nach bundesAPI/handelsregister und lexdoudkin/handelsregister-mcp); `POST /api/hr/http` reicht die Anfragen
  nur an `Registerportal` (Einstellung, Vorgabe https://www.handelsregister.de) weiter und hält die Sitzung,
  `POST /api/hr/ablegen` legt die Dateien im Vorgang ab. Mehrere Treffer: Auswahl im Fenster. Suchen und
  Dokumentabrufe werden gezählt (`%LOCALAPPDATA%\Claude-Starter\register-abrufe.json`), ab 50 je Stunde
  gesperrt (Nutzungsordnung: höchstens 60). Die zuletzt geladene Seite liegt zur Fehlersuche in
  `%LOCALAPPDATA%\Claude-Starter\register\letzte-seite.html`. Keine KI beteiligt.
- **Download in den Vorgang** – zeigt die neuesten PDFs aus Downloads (24 Stunden), Anklicken kopiert sie
  in den Vorgang (z. B. eine abgerufene Bilanz). Eine PDF lässt sich auch einfach ins Fenster ziehen.
- **Bilanzen und Firmendaten** – Firmenname eintippen, Unternehmensregister oder Handelsregister öffnen;
  der Name liegt in der Zwischenablage (Strg+V ins Suchfeld). Das Handelsregister öffnet auf der Startseite
  (Direktaufruf der Suche ergibt ohne Sitzung „Seite nicht gefunden“), dort „Normale Suche“.

**Vorgang:** Beim ersten Klick fragt das Fenster nach der Vorgangsnummer, danach alle 30 Minuten „Noch Vorgang …?“
(beim nächsten Klick und von selbst, solange das Fenster offen ist; nach „Abbrechen“ 5 Minuten Ruhe);
oben steht der aktuelle Vorgang mit „wechseln“. Alles wird im Vorgang hinterlegt: jeder Chat als PDF
`<Nr> Claude Frage <Datum Zeit>.pdf` bzw. `<Nr> Wertanalyse KI <Datum Zeit>.pdf` (nach jeder Antwort
fortgeschrieben), dazu Registerauszüge und abgelegte Downloads. Ein Protokoll der geöffneten Links gibt es
nicht mehr (Wunsch Thomas 26.10.: nur echte Dateien im Vorgang).
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
  Runspace, das Fenster bleibt bedienbar). `POST /api/ablegen` schreibt das PDF in den Ablageordner (`ersetzen=1` überschreibt), `GET /api/downloads` listet neue PDFs aus Downloads,
  `POST /api/download-ablegen` kopiert eine davon in den Vorgang.
- `claude.json` – API-Schlüssel, DPAPI-verschlüsselt (nur dieser Windows-Benutzer). Nie ins Repo.
- `einstellungen.json` – `Ablageordner`, `Vorgangsordner`, `NurZiffern`, `Kartenlink`, `Wertrechner`, `Port`, optional
  `Links` (`boegen`, `tools`, `kosten`, `portal`) für andere Adressen.
- `web/` – `claude.html`, `claude.js` (Chat, Systemprompts), `aktenvermerk.js` (PDF-Satz mit pdf-lib).
