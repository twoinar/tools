#!/bin/bash
# Spiegel aller GitHub-Repositories auf der Synology.
#
#   Öffentliche Repositories -> $WEB/<repository>/    (über die Web Station als Webseite abrufbar)
#   Private Repositories     -> $PRIVAT/<repository>/ (nur als Sicherung, NICHT im Web-Ordner)
#
# Läuft über den Aufgabenplaner (z. B. stündlich), siehe README.md im selben Ordner.
# Voraussetzung: Paket „Git Server“ aus dem Paket-Zentrum (bringt das Programm git mit).
# Für die privaten Repositories: github-token.txt neben diesem Skript
# (Fine-grained Token, nur Lesezugriff „Contents“ auf alle Repositories).
# Fällt GitHub aus, bleiben die bisherigen Kopien unverändert.

KONTO="twoinar"
WEB="${WEB:-/volume1/web/spiegel}"
PRIVAT="${PRIVAT:-/volume1/github-sicherung}"
ORDNER="$(cd "$(dirname "$0")" && pwd)"
PROTOKOLL="$ORDNER/spiegel-protokoll.txt"
TOKEN=""
[ -f "$ORDNER/github-token.txt" ] && TOKEN="$(tr -d ' \r\n' < "$ORDNER/github-token.txt")"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$PROTOKOLL"; }
[ -f "$PROTOKOLL" ] && tail -n 2000 "$PROTOKOLL" > "$PROTOKOLL.neu" && mv "$PROTOKOLL.neu" "$PROTOKOLL"

command -v git >/dev/null 2>&1 || { log "FEHLER: git fehlt – Paket „Git Server“ installieren."; exit 1; }

namen() { grep -o '"full_name": *"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/' | grep "^$KONTO/" | sed "s#^$KONTO/##"; }

OEFFENTLICH="$(curl -fsS "https://api.github.com/users/$KONTO/repos?per_page=100" | namen)"
if [ -z "$OEFFENTLICH" ]; then log "GitHub nicht erreichbar – Kopien bleiben unverändert."; exit 0; fi
ALLE="$OEFFENTLICH"
if [ -n "$TOKEN" ]; then
  ALLE="$(curl -fsS -H "Authorization: Bearer $TOKEN" "https://api.github.com/user/repos?per_page=100&affiliation=owner" | namen)"
  [ -z "$ALLE" ] && { log "FEHLER: Token ungültig oder abgelaufen – nur öffentliche Repositories."; ALLE="$OEFFENTLICH"; }
fi

spiegeln() {   # $1 = Repository, $2 = Zielordner
  local r="$1" ziel="$2/$1" url="https://github.com/$KONTO/$1.git"
  [ -n "$TOKEN" ] && url="https://x-access-token:$TOKEN@github.com/$KONTO/$1.git"
  mkdir -p "$2"
  if [ -d "$ziel/.git" ]; then
    git -C "$ziel" remote set-url origin "$url"
    if git -C "$ziel" fetch --quiet --prune origin && git -C "$ziel" reset --quiet --hard origin/HEAD; then
      log "ok      $r"
    else
      log "FEHLER  $r (Aktualisieren) – alte Kopie bleibt"
    fi
  elif git clone --quiet "$url" "$ziel"; then
    log "neu     $r"
  else
    log "FEHLER  $r (erstes Holen)"
  fi
  chmod 700 "$ziel/.git" 2>/dev/null   # .git (enthält ggf. den Token) nicht über das Web lesbar
}

for r in $ALLE; do
  if printf '%s\n' "$OEFFENTLICH" | grep -qx "$r"; then spiegeln "$r" "$WEB"; else spiegeln "$r" "$PRIVAT"; fi
done
exit 0
