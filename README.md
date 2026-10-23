# Tools

Werkzeuge fürs Notariat, als Webseite unter https://twoinar.github.io/tools/.
Jedes Tool liegt in einem eigenen Unterordner und läuft vollständig im Browser.

## Öffentlich (zum Teilen mit Kollegen)

- `xnp/` – XNP – Sonstige Anträge: erstellt aus der elektronisch beglaubigten Abschrift einen
  Importordner für XNP „Sonstige Anträge“ (siehe `xnp/README.md`). `erbausschlagung/` leitet dorthin um.
- `geldwaesche/` – Geldwäscheprüfung Kaufvertrag: liest einen Kaufvertrag und erstellt eine
  Prüfliste nach GwG und GwGMeldV-Immobilien samt Vermerk (siehe `geldwaesche/README.md`).
- `apps/` – Handy-Apps mit QR-Code und Anleitung: Sprachnachricht (APK aus
  `twoinar/sprachnachricht`, Release „neueste“).

## Intern (`intern/`, verschlüsselt)

Der Bereich „Tools intern“ ist nur mit Passwort lesbar. Im Repository liegen ausschließlich
verschlüsselte Dateien (`intern/daten/*.bin`, AES-256-GCM, Schlüssel per PBKDF2-SHA256 mit
600 000 Iterationen aus dem Passwort). `intern/index.html` nimmt das Passwort entgegen,
`intern/sw.js` entschlüsselt die Seiten unter `intern/app/` im Browser. Das funktioniert nur
über https (GitHub Pages) oder `localhost`.

Neu bauen bzw. Passwort ändern:

    INTERN_PASSWORT='…' python3 werkzeuge/intern-bauen.py <ordner-mit-den-internen-seiten>

Der Ordner mit den internen Seiten im Klartext gehört **nicht** in dieses Repository.
Zum Passwortwechsel zusätzlich `intern/schluessel.json` vorher löschen (neues Salz).

## Spiegel auf der Synology

`synology/` enthält ein Skript, das alle Repositories regelmäßig von GitHub holt und über die
Web Station bereitstellt (siehe `synology/README.md`).
