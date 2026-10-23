#!/usr/bin/env python3
"""
Setzt unten auf einer Seite die kleine Zeile „Version … · Stand …“.

    python3 werkzeuge/stand.py <datei.html> <version> [<TT.MM.JJJJ>]

Ohne Datum wird das heutige genommen. Steht die Zeile schon da, wird sie ersetzt.
Bei jeder inhaltlichen Änderung an einem Tool die Version erhöhen (1.4 -> 1.5) und neu setzen.
"""
import re, sys, time
from pathlib import Path

MARKE = re.compile(r'<p class="stand-version"[^>]*>.*?</p>(<style>@media print\{\.stand-version\{display:none\}\}</style>)?\n?', re.S)


def setzen(datei: Path, version: str, datum: str) -> None:
    t = datei.read_text(encoding="utf-8")
    zeile = (f'<p class="stand-version" style="font:12px/1.4 system-ui,sans-serif;color:#80868b;'
             f'text-align:center;margin:24px 0 12px">Version {version} · Stand {datum}</p>'
             '<style>@media print{.stand-version{display:none}}</style>\n')
    if MARKE.search(t):
        t = MARKE.sub(lambda m: zeile, t, count=1)
    else:
        i = t.rfind("</body>")
        if i < 0:
            raise SystemExit(f"{datei}: kein </body> gefunden")
        t = t[:i] + zeile + t[i:]
    datei.write_text(t, encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    setzen(Path(sys.argv[1]), sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else time.strftime("%d.%m.%Y"))
