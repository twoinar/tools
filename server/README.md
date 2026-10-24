# Tools auf dem IONOS-Server

Die Webseiten aus `twoinar/tools`, `twoinar/boegen` und `twoinar/kostenrechner` laufen zusätzlich zu GitHub Pages
unter **https://tools.notariat-woinar.de/** (gleiche Pfade: `/tools/`, `/boegen/`, `/kostenrechner/`), hinter einem
Login. Der Server holt sich alle 15 Minuten den Stand von `main`, an jedem PC ist also immer dieselbe Version da.

Seiten, die Claude brauchen, rufen `/api/claude/v1/messages` auf. Der API-Schlüssel liegt nur auf dem Server
(`/opt/tools/konfig/.env`) und wird beim Weiterleiten an Anthropic eingesetzt; kein PC braucht einen eigenen.

## Aufbau

- `/opt/tools/web/<repo>/` – die Webseiten, von `aktualisieren.sh` ausgepackt
- `/opt/tools/konfig/` – `docker-compose.yml` und `Caddyfile` aus diesem Ordner, dazu `.env` (nur root)
- Container `tools-web` (Caddy) ohne eigenen Port, nur im Docker-Netz `werkzeuge`
- Der Caddy der Buchhaltung (`twoinar/buchhaltung`, `deploy/synology/weitere/tools.caddy`) holt das Zertifikat
  und leitet `tools.notariat-woinar.de` an `tools-web` weiter. Er ist der einzige Container der Buchhaltung in
  diesem Netz; Datenbank, Belege und deren `.env` sind von hier aus nicht erreichbar.

## Einrichten (einmalig)

Voraussetzungen: DNS-Eintrag `tools` (Typ A) auf die IPv4 des Servers; der Stand von `twoinar/buchhaltung` mit
`weitere/tools.caddy` läuft (legt das Netz `werkzeuge` an).

Für Claude einen eigenen API-Schlüssel anlegen (console.anthropic.com → API Keys, Name z. B. „Tools-Server“) und
dort ein Monatslimit setzen.

Als root auf dem Server:

```sh
mkdir -p /opt/tools && cd /opt/tools
curl -fsSLO https://raw.githubusercontent.com/twoinar/tools/main/server/aktualisieren.sh
bash aktualisieren.sh --einrichten
echo '*/15 * * * * root bash /opt/tools/aktualisieren.sh >/dev/null 2>&1' > /etc/cron.d/tools
```

`--einrichten` fragt Benutzername, Passwort und API-Schlüssel ab (Eingaben bleiben unsichtbar), legt sie in
`/opt/tools/konfig/.env` ab, holt die drei Repositories und startet den Container. Danach
https://tools.notariat-woinar.de/ öffnen und mit Benutzername und Passwort anmelden.

Passwort oder Schlüssel ändern: `bash /opt/tools/aktualisieren.sh --einrichten` noch einmal.
Protokoll: `/opt/tools/protokoll.txt`.

## Änderungen

`Caddyfile`, `docker-compose.yml` und `aktualisieren.sh` in diesem Ordner gelten nach dem nächsten Lauf auf dem
Server. Ein ungültiges `Caddyfile` wird vorher geprüft und nicht übernommen.

Auf dem Server werden keine Dateien gespeichert: die Seiten verarbeiten Dateien im Browser, Claude-Anfragen werden
nur durchgereicht. Für Claude gelten die Datenschutzregeln des Notariats unverändert.
