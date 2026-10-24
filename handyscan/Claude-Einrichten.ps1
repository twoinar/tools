# Claude einrichten (einmalig): API-Schlüssel verschlüsselt speichern, prüfen, Desktop-Symbol
# „Claude“ anlegen und Handy-Scan neu starten. Der Schlüssel ist nur für diesen Windows-Benutzer
# auf diesem PC lesbar (DPAPI) und geht nur an api.anthropic.com.

$ErrorActionPreference = 'Stop'
$pfad = Join-Path $PSScriptRoot 'claude.json'
$cfgPfad = Join-Path $PSScriptRoot 'einstellungen.json'
if (-not (Test-Path -LiteralPath $cfgPfad)) {
    Write-Host "Falscher Ordner: Bitte die Dateien in den Handy-Scan-Ordner kopieren (dort liegt einstellungen.json) und von dort starten." -ForegroundColor Red
    exit 1
}
$cfg = Get-Content -LiteralPath $cfgPfad -Raw -Encoding UTF8 | ConvertFrom-Json
$port = if ($cfg.Port) { [int]$cfg.Port } else { 8765 }

Write-Host "Claude einrichten" -ForegroundColor Cyan
Write-Host "API-Schlüssel anlegen: https://console.anthropic.com → API Keys → Create Key (beginnt mit sk-ant-)."
Write-Host ""
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
    [IO.File]::WriteAllText($pfad, ($json | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
    Write-Host "   gespeichert (verschlüsselt, nur für $env:USERNAME auf diesem PC lesbar)." -ForegroundColor Green
} elseif (-not (Test-Path -LiteralPath $pfad)) {
    Write-Host "   Kein Schlüssel eingegeben." -ForegroundColor Red
    exit 1
}

# Desktop-Symbol: Edge im App-Modus (eigenes Fenster ohne Adressleiste)
$url = "http://localhost:$port/claude"
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
    Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$desktop = [Environment]::GetFolderPath('Desktop')
if ($edge) {
    $sh = New-Object -ComObject WScript.Shell
    $l = $sh.CreateShortcut((Join-Path $desktop 'Claude.lnk'))
    $l.TargetPath = $edge
    $l.Arguments = "--app=$url --window-size=900,900"
    $l.IconLocation = "$edge,0"
    $l.Description = 'Claude: Frage, BrandenburgViewer, Grundstückswert'
    $l.Save()
} else {
    [IO.File]::WriteAllText((Join-Path $desktop 'Claude.url'), "[InternetShortcut]`r`nURL=$url`r`n", [Text.Encoding]::ASCII)
}
Write-Host "2. Symbol „Claude“ auf dem Desktop angelegt." -ForegroundColor Green

# Server neu starten (neue Version mit Claude-Weiterleitung)
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like '*Handy-Scan-Server.ps1*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Process (Join-Path $PSScriptRoot 'Handy-Scan starten.cmd') -WindowStyle Hidden
Start-Sleep -Seconds 3
if ($edge) { Start-Process $edge "--app=$url --window-size=900,900" } else { Start-Process $url }
Write-Host "3. Fertig. Claude startet über das Symbol auf dem Desktop." -ForegroundColor Green
