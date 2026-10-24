@echo off
rem Einmalig: API-Schluessel fuer Claude speichern, Desktop-Symbol "Claude" anlegen, Handy-Scan neu starten.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Claude-Einrichten.ps1"
pause
