@echo off
rem Einmalig: FTP-Zugang zum Webspace eintragen, n„chtlichen Abgleich anlegen, ersten Abgleich starten.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Webspace-Einrichten.ps1"
pause
