# Spiegel auf der Synology

`spiegel.sh` holt regelmäßig alle Repositories von github.com/twoinar auf die Synology:

- **öffentliche** (tools, boegen, kostenrechner …) nach `/volume1/web/spiegel/<name>/` – über die
  Web Station als Webseite abrufbar, z. B. `http://<NAS>/spiegel/tools/`
- **private** (sprachnachricht, buchhaltung …) nach `/volume1/github-sicherung/<name>/` – nur als
  Sicherung des Quellcodes, nicht im Web

Fällt GitHub aus oder ist das Konto weg, bleibt der letzte Stand auf der Synology erhalten.

## Einrichten (einmalig, im DSM)

1. **Paket-Zentrum:** „Web Station“ und „Git Server“ installieren (Git Server bringt das Programm
   `git` mit; den Dienst selbst braucht man nicht).
2. **Systemsteuerung → Gemeinsamer Ordner:** Ordner `skripte` und `github-sicherung` anlegen
   (`web` legt die Web Station selbst an).
3. **File Station:** in `skripte` einen Ordner `github-spiegel` anlegen und `spiegel.sh` hineinlegen.
4. **Token für die privaten Repositories** (optional, ohne Token nur die öffentlichen):
   github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens →
   Generate new token. Repository access: „All repositories“, Permissions → Repository →
   „Contents: Read-only“. Ablauf z. B. 1 Jahr. Den Token als Textdatei `github-token.txt` neben
   `spiegel.sh` speichern.
5. **Systemsteuerung → Aufgabenplaner → Erstellen → Geplante Aufgabe → Benutzerdefiniertes Skript**
   - Allgemein: Name „GitHub-Spiegel“, Benutzer `root`
   - Zeitplan: täglich, Erste Ausführung 00:05, Häufigkeit „Jede Stunde“
   - Aufgabeneinstellungen → Befehl: `bash /volume1/skripte/github-spiegel/spiegel.sh`
6. Aufgabe markieren → **Ausführen**. Nach ein paar Minuten steht in
   `skripte/github-spiegel/spiegel-protokoll.txt` je Repository „neu“ bzw. „ok“.

## Abrufen

- Öffentliche Tools: `http://<NAS-Adresse>/spiegel/tools/`, Bögen: `…/spiegel/boegen/`,
  Kostenrechner: `…/spiegel/kostenrechner/`.
- **Tools intern** braucht https mit gültigem Zertifikat (sonst lässt der Browser die
  Entschlüsselung nicht zu): Systemsteuerung → Externer Zugriff → DDNS (z. B. `name.synology.me`)
  und Sicherheit → Zertifikat → Let's Encrypt. Dann `https://name.synology.me/spiegel/tools/intern/`
  mit demselben Passwort wie bei GitHub.
- Zeigt die Seite „403“, in der File Station beim Ordner `web` → Eigenschaften → Berechtigung dem
  Benutzer `http` Lesen erlauben.

## Hinweise

- Das Skript überschreibt die Kopien jeweils mit dem Stand von GitHub; eigene Änderungen auf der
  Synology gehen dabei verloren.
- Läuft der Token ab, steht im Protokoll „Token ungültig“; dann einen neuen erzeugen und
  `github-token.txt` ersetzen.
- Die Synology muss für den Abruf ins Internet dürfen (api.github.com, github.com).
