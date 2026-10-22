# XNP – Sonstige Anträge

Webseite, die aus der elektronisch beglaubigten Abschrift einer Urkunde (PDF + Signaturdatei)
samt Anlagen eine Importdatei (Ordner) für XNP „Sonstige Anträge“ erstellt.
Antragsarten: Erbausschlagung, Anfechtung, Erbscheinsantrag, Europäisches Nachlasszeugnis,
sonstige Nachlasssache, Adoption, betreuungs- und familiengerichtliche Genehmigung, Sonstiges.

**Alles läuft im Browser des Anwenders.** Die Sicherheitsregel der Seite
(`Content-Security-Policy: connect-src 'none'`) verbietet jede Datenverbindung nach dem Laden.

## Ablage
```
Y:\XNP Sonstige Anträge\Eingang\<UVZ-Nr>-<Jahr>\   Urkunde + Anlagen, je mit .pkcs7
Y:\XNP Sonstige Anträge\XNP-Export\                 hier entstehen die Importordner
```

## Ablauf
1. Antragsart wählen. Einmalig Eingangsordner, Zielordner und Notardaten einstellen.
2. Vorgang (Unterordner) wählen. Das Tool erkennt die Urkunde an der UVZ-Nr., alle übrigen PDFs sind Anlagen.
3. Gelb markierte Felder prüfen, Gericht wählen.
4. „XNP-Importdatei erstellen“. In XNP: Sonstige Anträge → Importieren → Ordner wählen → Empfänger von Hand auswählen.

## Technik
`xjustiz_nachricht.xml` (XJustiz 3.6.2, `nachricht.gds.uebermittlungSchriftgutobjekte.0005005`).
Sachgebiet nach Codeliste GDS.Sachgebiet 2.3; Gegenstand als `Az;Sachgebiet;Parteien;Gegenstand;`.
Anlagen: Dokumenttyp nach Dateiname (z. B. Geburts-/Sterbeurkunde → 081 Personenstandsurkunde).

## Testdaten
`testdaten/` enthält nur erfundene Personen; `.pkcs7` dort sind Platzhalter.

## Bibliotheken (lokal im Ordner `vendor/`)
pdf.js 4.10.38 (Apache-2.0), pdf-lib 1.17.1 (MIT), JSZip 3.10.1 (MIT/GPLv3).
