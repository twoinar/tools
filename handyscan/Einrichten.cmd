@echo off
rem Einmalig ausführen: Port-Freigabe und Firewall (fragt nach Administratorrechten),
rem PIN festlegen, Autostart anlegen und Handy-Scan starten.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Einrichten.ps1"
pause
