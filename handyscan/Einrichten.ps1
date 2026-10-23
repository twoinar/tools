# Einrichtung von Handy-Scan auf dem Büro-PC (einmalig).
param([switch]$NurAdmin, [int]$Port = 0)

$ErrorActionPreference = 'Stop'
$cfgPfad = Join-Path $PSScriptRoot 'einstellungen.json'
$cfg = Get-Content -LiteralPath $cfgPfad -Raw -Encoding UTF8 | ConvertFrom-Json
if ($Port -eq 0) { $Port = [int]$cfg.Port }

if ($NurAdmin) {
    # Läuft mit Administratorrechten: Adresse für alle Benutzer freigeben, Firewall nur fürs lokale Netz
    netsh http delete urlacl url=http://+:$Port/ 2>$null | Out-Null
    netsh http add urlacl url=http://+:$Port/ sddl="D:(A;;GX;;;WD)" | Out-Null
    netsh advfirewall firewall delete rule name="Handy-Scan" 2>$null | Out-Null
    netsh advfirewall firewall add rule name="Handy-Scan" dir=in action=allow protocol=TCP localport=$Port remoteip=localsubnet profile=any | Out-Null
    exit 0
}

Write-Host "Handy-Scan einrichten" -ForegroundColor Cyan
Write-Host ""

# 1. Port und Firewall (Administrator)
Write-Host "1. Port $Port und Firewall freigeben (Windows fragt nach Administratorrechten) ..."
$p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-NurAdmin', '-Port', $Port)
if ($p.ExitCode -ne 0) { Write-Host "   Freigabe hat nicht geklappt (Code $($p.ExitCode))." -ForegroundColor Red }
else { Write-Host "   erledigt." -ForegroundColor Green }

# 2. Ablageordner
if (Test-Path -LiteralPath $cfg.Basisordner) { Write-Host "2. Ablageordner $($cfg.Basisordner) gefunden." -ForegroundColor Green }
else { Write-Host "2. ACHTUNG: Ablageordner $($cfg.Basisordner) nicht gefunden. In einstellungen.json anpassen." -ForegroundColor Yellow }

# 3. PIN
Write-Host ""
$alt = if ($cfg.Pin) { " (Enter = bisherige PIN behalten)" } else { " (Enter = ohne PIN)" }
$neu = Read-Host "3. PIN für das Handy festlegen, z. B. 4 Ziffern$alt"
if ($neu.Trim() -ne '') { $cfg.Pin = $neu.Trim() }
$json = $cfg | ConvertTo-Json
[IO.File]::WriteAllText($cfgPfad, $json, (New-Object Text.UTF8Encoding $false))

# 4. Autostart
$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup 'Handy-Scan.lnk'
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lnk)
$s.TargetPath = Join-Path $PSScriptRoot 'Handy-Scan starten.cmd'
$s.WorkingDirectory = $PSScriptRoot
$s.WindowStyle = 7
$s.Save()
Write-Host "4. Autostart angelegt: $lnk" -ForegroundColor Green

# 5. Starten (laufenden Server vorher beenden, damit neue Einstellungen gelten)
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.CommandLine -like '*Handy-Scan-Server.ps1*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Process (Join-Path $PSScriptRoot 'Handy-Scan starten.cmd') -WindowStyle Hidden
Start-Sleep -Seconds 3
Start-Process "http://localhost:$Port/start"
Write-Host "5. Handy-Scan läuft. Im Browser erscheint der QR-Code für das Handy." -ForegroundColor Green
