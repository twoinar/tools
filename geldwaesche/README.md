# Geldwäscheprüfung Kaufvertrag

Liest einen Kaufvertrag (PDF mit Text, Word .docx oder Text) im Browser und erstellt eine
Prüfliste nach GwG und GwGMeldV-Immobilien mit Fundstellen aus dem Vertrag. Am Ende steht
ein Vermerk zum Ausdrucken oder als Textdatei. Die Seite sendet keine Daten
(Content-Security-Policy `connect-src 'none'`); gespeichert werden im Browser nur der Name
des Bearbeiters und eine eigene Liste der Hochrisikostaaten.

Was geprüft wird (`js/regeln.js`):

- Pflichten bei jedem Erwerb: Identifizierung, wirtschaftlich Berechtigte, Transparenzregister
  und Dokumentation der Eigentums- und Kontrollstruktur (§§ 10, 11, 12 Abs. 4, 20, 23a GwG),
  PEP, Sanktionslisten, Barzahlungsverbot (§ 16a GwG).
- Meldepflichtige Sachverhalte nach §§ 3 bis 6 GwGMeldV-Immobilien; „entkräftet“ nach § 7 mit Begründung.
- Risikofaktoren nach § 15 GwG und Anlage 2 GwG.

Die Erkennung (`js/erkennen.js`) ist regelbasiert: Beteiligte, Kaufpreis, Zahlungsweise
(bar, Krypto, Gold), Vorauszahlungen, Zahlung durch Dritte, IBANs, Raten, Treuhand,
Vollmachten und Konsulate, Vorerwerb, Staatenbezug (`js/staaten.js`). Was der Vertrag nicht
zeigt (PEP, Strafverfahren, Einkommensverhältnisse …), beantwortet der Notar selbst.

Hochrisikostaaten: EU-Liste, anwendbar ab 29.01.2026. Bei Änderungen `HOCHRISIKO` und
`HOCHRISIKO_STAND` in `js/staaten.js` anpassen (oder in der Seite unter „Einstellungen“).

Testverträge mit erfundenen Personen: `testdaten/` (`erzeuge_testvertraege.py` erzeugt PDF und DOCX).
