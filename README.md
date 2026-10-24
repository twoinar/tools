# Tools

Werkzeuge fürs Notariat, als Webseite unter https://tools.notariat-woinar.de/tools/ (IONOS-Server mit Login, siehe `server/`).
Jedes Tool liegt in einem eigenen Unterordner und läuft vollständig im Browser.

## Öffentlich (zum Teilen mit Kollegen)

- `xnp/` – XNP – Sonstige Anträge: erstellt aus der elektronisch beglaubigten Abschrift einen
  Importordner für XNP „Sonstige Anträge“ (siehe `xnp/README.md`). `erbausschlagung/` leitet dorthin um.
- `geldwaesche/` – Geldwäscheprüfung Kaufvertrag: liest einen Kaufvertrag und erstellt eine
  Prüfliste nach GwG und GwGMeldV-Immobilien samt Vermerk (siehe `geldwaesche/README.md`).
- `handyscan/` – Handy-Scan: Dokumente beim Vorgespräch mit dem Handy fotografieren und als PDF
  in der Vorgangsablage am Büro-PC speichern. Läuft auf dem Büro-PC im Büro-WLAN, nicht auf GitHub
  Pages (siehe `handyscan/README.md`). Download als `apps/handyscan/Handy-Scan.zip` – nach
  Änderungen in `handyscan/` neu packen.
- `boegen/` – Bögen für Notariate in Brandenburg: allgemeine Kopie von Vorgesprächsbogen (mit Erbspiegel,
  Grundstückswert, Geschäftswert, Kostenberechnung) und Vollzugsbogen aus `twoinar/boegen`. Name, Anschrift,
  Kontakt und Mitarbeiter trägt jedes Notariat unter „Notardaten“ ein (`boegen/notar.js`, nur im Browser,
  Export/Import als `Notardaten.json`). Die eigenen Bögen in `twoinar/boegen` bleiben unverändert;
  Verbesserungen dort bei Bedarf hierher übernehmen, ohne feste Notardaten.
- `apps/` – Handy-Apps mit QR-Code und Anleitung: Handy-Scan, Sprachnachricht (APK aus
  `twoinar/sprachnachricht`, Release „neueste“).

Jede Seite zeigt unten klein „Version … · Stand …“ (`python3 werkzeuge/stand.py <datei> <version>`).
Bei jeder inhaltlichen Änderung die Version erhöhen.

## Intern (`intern/`, verschlüsselt)

Der Bereich „Tools intern“ ist nur mit Passwort lesbar. Im Repository liegen ausschließlich
verschlüsselte Dateien (`intern/daten/*.bin`, AES-256-GCM, Schlüssel per PBKDF2-SHA256 mit
600 000 Iterationen aus dem Passwort). `intern/index.html` nimmt das Passwort entgegen,
`intern/sw.js` entschlüsselt die Seiten unter `intern/app/` im Browser. Das funktioniert nur
über https (tools.notariat-woinar.de) oder `localhost`.

Neu bauen bzw. Passwort ändern:

    INTERN_PASSWORT='…' python3 werkzeuge/intern-bauen.py <ordner-mit-den-internen-seiten>

Der Ordner mit den internen Seiten im Klartext gehört **nicht** in dieses Repository.
Zum Passwortwechsel zusätzlich `intern/schluessel.json` vorher löschen (neues Salz).

Passwort wechseln ohne Klartext-Ordner: auf GitHub unter Settings › Secrets and variables › Actions
die Secrets `INTERN_PASSWORT_ALT` und `INTERN_PASSWORT` anlegen, dann unter Actions
„Tools intern: Passwort ändern“ › „Run workflow“ starten. Die Aktion entschlüsselt mit dem alten
und verschlüsselt mit dem neuen Passwort (`werkzeuge/intern-umschluesseln.py`) und lädt das
Ergebnis hoch. Danach `INTERN_PASSWORT_ALT` wieder löschen.

## Spiegel auf der Synology

`synology/` enthält ein Skript, das alle Repositories regelmäßig von GitHub holt und über die
Web Station bereitstellt (siehe `synology/README.md`).
