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

# 2. Ablageordner und Ablageart
foreach ($feld in @('Basisordner', 'Vorgangsordner', 'NurZiffern')) {
    if (-not ($cfg.PSObject.Properties.Name -contains $feld)) { $cfg | Add-Member -NotePropertyName $feld -NotePropertyValue $null }
}
Write-Host ""
$bisher = [string]$cfg.Basisordner
if ($bisher -ne '') { Write-Host "2. Bisheriger Ablageordner: $bisher" }
$antwort = Read-Host "2. Ablageordner neu auswählen? (j = Ordner wählen, Enter = $(if ($bisher) { 'behalten' } else { 'Ordner wählen' }))"
if ($bisher -eq '' -or $antwort.Trim().ToLower().StartsWith('j')) {
    $gewaehlt = ''
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
        $dlg.Description = 'Ordner, in dem die Scans abgelegt werden (z. B. das Laufwerk mit den Vorgängen)'
        $dlg.ShowNewFolderButton = $false
        if ($bisher -ne '' -and (Test-Path -LiteralPath $bisher)) { $dlg.SelectedPath = $bisher }
        if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $gewaehlt = $dlg.SelectedPath }
    } catch { }
    if ($gewaehlt -eq '') { $gewaehlt = (Read-Host "   Ablageordner eintippen, z. B. Y:\Vorgänge").Trim().Trim('"') }
    if ($gewaehlt -ne '') { $cfg.Basisordner = $gewaehlt }
}
if ([string]$cfg.Basisordner -eq '') { Write-Host "   ACHTUNG: kein Ablageordner eingestellt." -ForegroundColor Yellow }
elseif (Test-Path -LiteralPath $cfg.Basisordner) { Write-Host "   Ablageordner $($cfg.Basisordner) gefunden." -ForegroundColor Green }
else { Write-Host "   ACHTUNG: Ablageordner $($cfg.Basisordner) nicht gefunden (Netzlaufwerk verbunden?)." -ForegroundColor Yellow }

Write-Host ""
Write-Host "   Wie liegen die Vorgänge im Ablageordner?"
Write-Host "   1 = alle PDFs direkt im Ordner:      <Ablageordner>\12345 Geburtsurkunde.pdf"
Write-Host "   2 = je Vorgang ein eigener Ordner:   <Ablageordner>\12345 Müller\Geburtsurkunde.pdf"
$bisherArt = if ($cfg.Vorgangsordner -eq $true) { '2' } else { '1' }
$art = (Read-Host "   Auswahl (Enter = $bisherArt)").Trim()
if ($art -eq '') { $art = $bisherArt }
$cfg.Vorgangsordner = ($art -eq '2')

$bisherZ = if ($cfg.NurZiffern -eq $false) { 'n' } else { 'j' }
$z = (Read-Host "   Bestehen Vorgangsnummern nur aus Ziffern (z. B. 12345)? j/n (Enter = $bisherZ)").Trim().ToLower()
if ($z -eq '') { $z = $bisherZ }
$cfg.NurZiffern = -not $z.StartsWith('n')

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
