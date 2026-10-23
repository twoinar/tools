# Büro-Portal einrichten (einmalig): Anleitungsordner eintragen, Handy-Scan neu starten,
# Portal im Browser öffnen. Handbuch und Anleitungen werden dort nur gelesen, nie verändert.

$ErrorActionPreference = 'Stop'
$cfgPfad = Join-Path $PSScriptRoot 'einstellungen.json'
$cfg = Get-Content -LiteralPath $cfgPfad -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not ($cfg.PSObject.Properties.Name -contains 'Anleitungsordner')) { $cfg | Add-Member -NotePropertyName Anleitungsordner -NotePropertyValue '' }

Write-Host "Büro-Portal einrichten" -ForegroundColor Cyan
Write-Host ""
$vorgabe = if ($cfg.Anleitungsordner) { $cfg.Anleitungsordner } else { 'Y:\Anleitungen' }
$a = Read-Host "1. Ordner mit Handbuch und Anleitungen [$vorgabe]"
if ($a.Trim() -eq '') { $a = $vorgabe }
$a = $a.Trim().Trim('"')
if (Test-Path -LiteralPath $a) { Write-Host "   gefunden." -ForegroundColor Green }
else { Write-Host "   ACHTUNG: $a ist nicht erreichbar. Trotzdem gespeichert." -ForegroundColor Yellow }
$cfg.Anleitungsordner = $a
[IO.File]::WriteAllText($cfgPfad, ($cfg | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))

# Desktop-Verknüpfung
$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Büro-Portal.url'
$port = if ($cfg.Port) { [int]$cfg.Port } else { 8765 }
[IO.File]::WriteAllText($lnk, "[InternetShortcut]`r`nURL=http://localhost:$port/`r`n", [Text.Encoding]::ASCII)
Write-Host "2. Verknüpfung „Büro-Portal“ auf dem Desktop angelegt." -ForegroundColor Green

# Server neu starten, damit die Einstellung gilt
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like '*Handy-Scan-Server.ps1*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Process (Join-Path $PSScriptRoot 'Handy-Scan starten.cmd') -WindowStyle Hidden
Start-Sleep -Seconds 3
Start-Process "http://localhost:$port/"
Write-Host "3. Büro-Portal läuft: http://localhost:$port/ (Mitarbeiter: Adresse dieses PCs, Port $port)" -ForegroundColor Green
