#!/bin/bash
# Holt die Webseiten des Notariats (twoinar/tools, twoinar/boegen, twoinar/kostenrechner, jeweils Zweig main)
# nach /opt/tools/web/<name>/ und hält den Container „tools-web“ auf dem Stand von server/ in twoinar/tools.
# Läuft auf dem IONOS-Server per cron alle 15 Minuten; Einrichtung siehe README.md in diesem Ordner.
# Die drei Repositories sind öffentlich, ein Token ist nicht nötig. Die Buchhaltung bleibt unberührt.
#
# Aufruf von Hand: bash aktualisieren.sh [--jetzt]   (--jetzt: alles neu holen und Container neu starten)
#                  bash aktualisieren.sh --einrichten (Benutzer, Passwort und API-Schlüssel eingeben)

set -u
umask 022
BASIS=${BASIS:-/opt/tools}
DOCKER=${DOCKER:-$(command -v docker || echo /usr/local/bin/docker)}
REPOS="tools boegen kostenrechner"
WEB="$BASIS/web"
KONFIG="$BASIS/konfig"

mkdir -p "$WEB" "$KONFIG" "$BASIS/stand"
PROTOKOLL="$BASIS/protokoll.txt"
melde() { echo "$(date '+%F %T') $*" >> "$PROTOKOLL"; echo "$*"; }

einrichten() {
    local benutzer passwort schluessel hash
    read -rp "Benutzername für die Tools: " benutzer
    read -rsp "Passwort (Anzeige bleibt leer): " passwort; echo
    read -rsp "Anthropic-API-Schlüssel (Anzeige bleibt leer): " schluessel; echo
    [ -n "$benutzer" ] && [ -n "$passwort" ] && [ -n "$schluessel" ] || { echo "Eingabe fehlt."; return 1; }
    hash=$(printf '%s\n%s\n' "$passwort" "$passwort" | "$DOCKER" run --rm -i caddy:2.10 caddy hash-password 2>/dev/null | tail -n 1)
    case "$hash" in '$2'*) ;; *) echo "Passwort-Hash konnte nicht erzeugt werden."; return 1 ;; esac
    # Einfache Anführungszeichen: der Hash enthält $-Zeichen
    printf "TOOLS_BENUTZER=%s\nTOOLS_PASSWORT_HASH='%s'\nANTHROPIC_API_KEY=%s\n" "$benutzer" "$hash" "$schluessel" > "$KONFIG/.env"
    chmod 600 "$KONFIG/.env"
    echo "Zugangsdaten abgelegt in $KONFIG/.env (nur root lesbar)."
}

if [ "${1:-}" = "--einrichten" ]; then
    einrichten || exit 1
    set -- --jetzt
fi
[ -s "$KONFIG/.env" ] || { melde "Keine Zugangsdaten: zuerst bash aktualisieren.sh --einrichten"; exit 1; }

mkdir "$BASIS/sperre" 2>/dev/null || {
    # Sperre älter als eine Stunde: hängengebliebener Lauf
    [ -n "$(find "$BASIS/sperre" -maxdepth 0 -mmin +60 2>/dev/null)" ] || exit 0
}
trap 'rm -rf "$BASIS/sperre" "$BASIS/neu"' EXIT

for name in $REPOS; do
    sha=$(curl -fsS --max-time 30 -H "Accept: application/vnd.github.sha" \
        "https://api.github.com/repos/twoinar/$name/commits/main") || { melde "$name: GitHub nicht erreichbar"; continue; }
    case "$sha" in [0-9a-f]*) ;; *) melde "$name: unerwartete Antwort von GitHub"; continue ;; esac
    [ "${1:-}" != "--jetzt" ] && [ "$sha" = "$(cat "$BASIS/stand/$name" 2>/dev/null)" ] && continue

    rm -rf "$BASIS/neu" && mkdir -p "$BASIS/neu"
    if ! curl -fsSL --max-time 300 "https://codeload.github.com/twoinar/$name/tar.gz/$sha" \
            | tar xz -C "$BASIS/neu" --strip-components=1 --no-same-owner; then
        melde "$name: Herunterladen fehlgeschlagen"; continue
    fi
    rm -rf "$BASIS/neu/.git" "$BASIS/neu/.github"
    # Austausch: der alte Stand verschwindet erst, wenn der neue vollständig da ist
    rm -rf "$WEB/$name.alt"
    [ -d "$WEB/$name" ] && mv "$WEB/$name" "$WEB/$name.alt"
    mv "$BASIS/neu" "$WEB/$name"
    rm -rf "$WEB/$name.alt"
    echo "$sha" > "$BASIS/stand/$name"
    melde "$name: Stand ${sha:0:7} eingespielt"
done

# Container-Einstellungen aus twoinar/tools/server übernehmen
QUELLE="$WEB/tools/server"
[ -f "$QUELLE/docker-compose.yml" ] || { melde "server/ fehlt im Stand von twoinar/tools"; exit 1; }
neu_compose=0; neu_caddy=0
cmp -s "$QUELLE/docker-compose.yml" "$KONFIG/docker-compose.yml" || neu_compose=1
cmp -s "$QUELLE/Caddyfile" "$KONFIG/Caddyfile" || neu_caddy=1
# Sich selbst ersetzen über eine neue Datei (mv), damit der laufende Aufruf nicht gestört wird
if ! cmp -s "$QUELLE/aktualisieren.sh" "$BASIS/aktualisieren.sh"; then
    cp "$QUELLE/aktualisieren.sh" "$BASIS/aktualisieren.sh.neu" && mv "$BASIS/aktualisieren.sh.neu" "$BASIS/aktualisieren.sh"
fi

if [ $neu_caddy = 1 ]; then
    # Erst prüfen, dann übernehmen: eine fehlerhafte Datei ersetzt nie die laufende
    if "$DOCKER" run --rm --env-file "$KONFIG/.env" -v "$QUELLE/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2.10 \
            caddy validate --config /etc/caddy/Caddyfile >> "$PROTOKOLL" 2>&1; then
        cp "$QUELLE/Caddyfile" "$KONFIG/Caddyfile"
    else
        melde "Caddyfile ungültig, alte Einstellungen bleiben"; neu_caddy=0
    fi
fi
[ $neu_compose = 1 ] && cp "$QUELLE/docker-compose.yml" "$KONFIG/docker-compose.yml"

cd "$KONFIG" || exit 1
if [ $neu_compose = 1 ] || [ "${1:-}" = "--jetzt" ] || [ -z "$("$DOCKER" compose ps -q tools-web 2>/dev/null)" ]; then
    "$DOCKER" compose up -d --force-recreate >> "$PROTOKOLL" 2>&1 && melde "Container tools-web gestartet" \
        || melde "Container tools-web konnte nicht starten (läuft die Buchhaltung mit dem Netz „werkzeuge“?)"
elif [ $neu_caddy = 1 ]; then
    "$DOCKER" compose exec -T tools-web caddy reload --config /etc/caddy/Caddyfile >> "$PROTOKOLL" 2>&1 \
        && melde "Caddyfile neu geladen" || melde "Caddyfile konnte nicht neu geladen werden"
fi
exit 0
