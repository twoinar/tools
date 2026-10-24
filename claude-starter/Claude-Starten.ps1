# Desktop-Symbol „Claude“: startet den kleinen Server, falls er noch nicht läuft, und öffnet
# das Claude-Fenster (Edge im App-Modus, ohne Adressleiste).

$cfgPfad = Join-Path $PSScriptRoot 'einstellungen.json'
$port = 8766
if (Test-Path -LiteralPath $cfgPfad) {
    $j = Get-Content -LiteralPath $cfgPfad -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($j.Port) { $port = [int]$j.Port }
}
$url = "http://localhost:$port/"

function Test-Laeuft {
    try { Invoke-RestMethod -Uri "${url}api/info" -TimeoutSec 2 | Out-Null; return $true } catch { return $false }
}
if (-not (Test-Laeuft)) {
    Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
        '-File', "`"$(Join-Path $PSScriptRoot 'Claude-Server.ps1')`"")
    for ($i = 0; $i -lt 20 -and -not (Test-Laeuft); $i++) { Start-Sleep -Milliseconds 300 }
}

$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") |
    Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($edge) { Start-Process $edge "--app=$url --window-size=900,900" } else { Start-Process $url }
