# XNP – Handelsregisteranmeldung

Webseite, die eine Handelsregisteranmeldung (PDF aus Word/ARNOtop, mit Signaturdatei) samt Anlagen
ausliest und die Strukturdaten für das XNP-Handelsregistermodul erstellen soll.

**Alles läuft im Browser des Anwenders.** Die Sicherheitsregel der Seite
(`Content-Security-Policy: connect-src 'none'`) verbietet jede Datenverbindung nach dem Laden.
pdf.js wird aus `../xnp/vendor/` mitbenutzt.

## Stand (Version 0.1)
- Anmeldungsart: GmbH – Geschäftsführerwechsel.
- Ausgelesen werden: UVZ-Nr., Datum, Registergericht (auch aus dem Kürzel hinter der HRB-Nr.), HRB-Nr.,
  Firma, Sitz, Geschäftsanschrift, ausgeschiedene Geschäftsführer (mit Grund) und neu bestellte
  (mit Einzelvertretung und Befreiung von § 181 BGB), allgemeine Vertretungsregelung zur Kontrolle.
- Die XNP-Importdatei (XJustiz-Registeranmeldung) folgt, sobald ein Muster-Export aus ARNOtop vorliegt.

## Testdaten
`testdaten/` enthält nur erfundene Personen; `.pkcs7` dort sind Platzhalter.
