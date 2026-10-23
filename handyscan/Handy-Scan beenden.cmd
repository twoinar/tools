@echo off
rem Beendet den Handy-Scan-Server (z. B. vor einem Update).
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*Handy-Scan-Server.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; 'Handy-Scan beendet.' }"
pause
