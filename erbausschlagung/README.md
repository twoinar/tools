# Erbausschlagung → XNP

Webseite, die aus der elektronisch beglaubigten Abschrift einer Erbausschlagung
(PDF + Signaturdatei) einen Importordner für XNP „Sonstige Anträge“ erstellt.

**Alles läuft im Browser des Anwenders.** Die Seite lädt nur ihre eigenen
Programmdateien. Urkunden und Eingaben werden nicht übertragen: Die
Sicherheitsregel der Seite (`Content-Security-Policy: connect-src 'none'`
in `index.html`) verbietet dem Browser jede Datenverbindung nach dem Laden.

## Ablauf
1. Seite öffnen (Chrome oder Edge), einmal unter „Notardaten“ die eigenen
   Angaben eintragen (bleiben nur in diesem Browser gespeichert).
2. Ordner der beglaubigten Abschriften wählen („Ordner …“) und „Neueste PDF
   laden“, oder PDF + Signaturdatei direkt auswählen.
3. Gelb markierte Felder prüfen, Nachlassgericht wählen.
4. Zielordner wählen und „Importordner erstellen“ (ohne Zielordner: ZIP-Download,
   dann entpacken).
5. In XNP: Sonstige Anträge → Importieren → Ordner wählen → **Empfänger von
   Hand auswählen** → prüfen, signieren, versenden.

## Aufbau des Importordners
`<Ordner>/attachments/` mit Urkunde (`.pdf` + `.pdf.pkcs7`), Anschreiben und
`xjustiz_nachricht.xml` (XJustiz 3.6.2, `nachricht.gds.uebermittlungSchriftgutobjekte.0005005`).
Parteien und Gegenstand stehen in `verfahrensgegenstand/gegenstand` als
`Aktenzeichen;Nachlasssachen;Nachname, Vorname;Erbausschlagung;`.

## Testdaten
`testdaten/Test-Erbausschlagung.pdf` enthält nur erfundene Personen.

## Bibliotheken (lokal im Ordner `vendor/`)
pdf.js 4.10.38 (Apache-2.0), pdf-lib 1.17.1 (MIT), JSZip 3.10.1 (MIT/GPLv3).
