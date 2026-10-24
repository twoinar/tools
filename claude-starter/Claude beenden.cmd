@echo off
rem Beendet den Claude-Server (z. B. vor einem Update).
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*Claude-Server.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; 'Claude beendet.' }"
pause
