@echo off
rem Richtet auf DIESEM PC ein, dass das Sortieren nach der Anmeldung automatisch im Hintergrund läuft
rem (gedacht für den PC in der Poststelle). Rückgängig: Verknüpfung im Autostart-Ordner löschen.
set ZIEL=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Posteingang sortieren.lnk
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:ZIEL); $s.TargetPath='%~dp0Posteingang-sortieren.exe'; $s.Arguments='--dauerhaft'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
start "" /min "%~dp0Posteingang-sortieren.exe" --dauerhaft
echo Eingerichtet. Das Sortieren laeuft jetzt und startet kuenftig nach jeder Anmeldung automatisch (minimiert).
pause
