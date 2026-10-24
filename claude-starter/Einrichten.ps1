# Claude einrichten (einmalig): API-Schlüssel verschlüsselt speichern und prüfen, Ablageordner
# festlegen, Desktop-Symbol „Claude“ anlegen. Der Schlüssel ist nur für diesen Windows-Benutzer
# auf diesem PC lesbar (DPAPI) und geht nur an api.anthropic.com.

$ErrorActionPreference = 'Stop'
$cfgPfad = Join-Path $PSScriptRoot 'einstellungen.json'
$schluesselPfad = Join-Path $PSScriptRoot 'claude.json'

Write-Host "Claude einrichten" -ForegroundColor Cyan
Write-Host ""

# 1. API-Schlüssel
Write-Host "API-Schlüssel anlegen: https://console.anthropic.com/settings/keys → Create Key (beginnt mit sk-ant-)."
$sec = Read-Host '1. API-Schlüssel einfügen (wird nicht angezeigt; Enter = bisherigen behalten)' -AsSecureString
if ($sec.Length -gt 0) {
    $klar = (New-Object System.Management.Automation.PSCredential 'x', $sec).GetNetworkCredential().Password.Trim()
    # Prüfen, ob Anthropic den Schlüssel annimmt (Modellliste, kostet nichts)
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    try {
        Invoke-RestMethod -Uri 'https://api.anthropic.com/v1/models?limit=1' -Headers @{ 'x-api-key' = $klar; 'anthropic-version' = '2026-10-21' } | Out-Null
        Write-Host "   Schlüssel gültig." -ForegroundColor Green
    } catch {
        Write-Host "   Anthropic lehnt den Schlüssel ab oder ist nicht erreichbar: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "   Nichts gespeichert. Bitte erneut starten." -ForegroundColor Red
        exit 1
    }
    $json = [ordered]@{ Schluessel = (ConvertTo-SecureString $klar -AsPlainText -Force | ConvertFrom-SecureString); Verschluesselt = $true }
    [IO.File]::WriteAllText($schluesselPfad, ($json | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
    Write-Host "   gespeichert (verschlüsselt, nur für $env:USERNAME auf diesem PC lesbar)." -ForegroundColor Green
} elseif (-not (Test-Path -LiteralPath $schluesselPfad)) {
    Write-Host "   Kein Schlüssel eingegeben." -ForegroundColor Red
    exit 1
}

# 2. Ablageordner: Vorgabe aus der bisherigen Einstellung, sonst aus Handy-Scan, sonst Y:\Vorgänge
$cfg = [ordered]@{ Ablageordner = ''; Vorgangsordner = $false; NurZiffern = $true; Kartenlink = 'https://bb-viewer.geobasis-bb.de/'; Wertrechner = ''; Port = 8766 }
if (Test-Path -LiteralPath $cfgPfad) {
    $j = Get-Content -LiteralPath $cfgPfad -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($k in @($cfg.Keys)) { if ($null -ne $j.$k -and "$($j.$k)" -ne '') { $cfg[$k] = $j.$k } }
}
if (-not $cfg.Ablageordner) {
    $hs = Get-ChildItem -Path (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Handy-Scan') -Filter einstellungen.json -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hs) {
        $h = Get-Content -LiteralPath $hs.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($h.Basisordner) { $cfg.Ablageordner = $h.Basisordner; $cfg.Vorgangsordner = [bool]$h.Vorgangsordner; $cfg.NurZiffern = [bool]$h.NurZiffern }
    }
}
$vorgabe = if ($cfg.Ablageordner) { $cfg.Ablageordner } else { 'Y:\Vorgänge' }
$a = Read-Host "2. Ablageordner für die PDFs [$vorgabe]"
if ($a.Trim() -eq '') { $a = $vorgabe }
$cfg.Ablageordner = $a.Trim().Trim('"')
if (Test-Path -LiteralPath $cfg.Ablageordner) { Write-Host "   gefunden." -ForegroundColor Green }
else { Write-Host "   ACHTUNG: $($cfg.Ablageordner) ist nicht erreichbar. Trotzdem gespeichert." -ForegroundColor Yellow }
[IO.File]::WriteAllText($cfgPfad, ($cfg | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))

# 3. Desktop-Symbol
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
    Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$sh = New-Object -ComObject WScript.Shell
$l = $sh.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Claude.lnk'))
$l.TargetPath = Join-Path $PSHOME 'powershell.exe'
$l.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $PSScriptRoot 'Claude-Starten.ps1')`""
$l.WorkingDirectory = $PSScriptRoot
$l.WindowStyle = 7
if ($edge) { $l.IconLocation = "$edge,0" }
$l.Description = 'Claude: Frage, BrandenburgViewer, Grundstückswert'
$l.Save()
Write-Host "3. Symbol „Claude“ auf dem Desktop angelegt." -ForegroundColor Green

# Laufenden Server beenden, damit neue Einstellungen gelten, und Claude öffnen
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like '*Claude-Server.ps1*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
& (Join-Path $PSScriptRoot 'Claude-Starten.ps1')
Write-Host "4. Fertig. Künftig einfach das Symbol „Claude“ auf dem Desktop anklicken." -ForegroundColor Green
