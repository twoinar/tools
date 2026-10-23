@echo off
rem Handbuch und Anleitungen sofort auf den Webspace hochladen (sonst nachts automatisch).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Webspace-Abgleich.ps1"
pause
