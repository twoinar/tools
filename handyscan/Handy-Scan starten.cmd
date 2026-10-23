@echo off
rem Startet den Handy-Scan-Server unsichtbar im Hintergrund.
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Handy-Scan-Server.ps1"
