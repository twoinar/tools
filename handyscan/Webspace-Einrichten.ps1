# Einrichtung des Webspace-Abgleichs (einmalig): FTP-Zugang abfragen, Passwort verschlüsselt
# speichern, nächtliche Aufgabe anlegen und den ersten Abgleich starten.

$ErrorActionPreference = 'Stop'
$wsPfad = Join-Path $PSScriptRoot 'webspace.json'

Write-Host "Webspace-Abgleich einrichten" -ForegroundColor Cyan
Write-Host "Die Angaben stehen im UD-Media-Kundenbereich unter FTP-Zugänge."
Write-Host ""
$alt = if (Test-Path -LiteralPath $wsPfad) { Get-Content -LiteralPath $wsPfad -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
function Frage([string]$text, [string]$vorgabe) {
    $zusatz = if ($vorgabe) { " [$vorgabe]" } else { '' }
    $a = Read-Host "$text$zusatz"
    if ($a.Trim() -eq '') { return $vorgabe }
    return $a.Trim()
}
$server = Frage '1. FTP-Server (z. B. ftp.ud-webspace.de, ohne ftp://)' $(if ($alt) { $alt.Server })
$benutzer = Frage '2. FTP-Benutzername' $(if ($alt) { $alt.Benutzer })
$pw = Read-Host '3. FTP-Passwort (wird nicht angezeigt; Enter = bisheriges behalten)' -AsSecureString
$ordner = Frage '4. Ordner auf dem Webspace' $(if ($alt) { $alt.Ordner } else { '/anleitungen' })
$adresse = Frage '5. Web-Adresse dieses Ordners (z. B. https://www.notar-woinar.de/anleitungen/)' $(if ($alt) { $alt.Adresse })

$pwText = if ($pw.Length -gt 0) { $pw | ConvertFrom-SecureString } elseif ($alt) { $alt.Passwort } else { throw 'Kein Passwort eingegeben.' }
$ws = [ordered]@{ Server = $server; Benutzer = $benutzer; Passwort = $pwText; Ordner = $ordner; Adresse = $adresse; Verschluesselt = $true }
[IO.File]::WriteAllText($wsPfad, ($ws | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
Write-Host "   gespeichert (Passwort verschlüsselt, nur für $env:USERNAME auf diesem PC lesbar)." -ForegroundColor Green

# Nächtliche Aufgabe, läuft als angemeldeter Benutzer (Laufwerk Y: ist dann verbunden)
$ps = Join-Path $PSHOME 'powershell.exe'
$aktion = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $PSScriptRoot 'Webspace-Abgleich.ps1')`""
$ausloeser = New-ScheduledTaskTrigger -Daily -At '02:30'
$opt = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'Handy-Scan Webspace-Abgleich' -Action $aktion -Trigger $ausloeser -Settings $opt -Force | Out-Null
Write-Host "6. Nächtlicher Abgleich um 2:30 Uhr angelegt." -ForegroundColor Green

Write-Host ""
Write-Host "7. Erster Abgleich läuft ..."
& (Join-Path $PSScriptRoot 'Webspace-Abgleich.ps1')
if ($LASTEXITCODE -eq 2) {
    Write-Host ""
    Write-Host "Der Ordner auf dem Webspace hat noch keinen Passwortschutz. Im UD-Media-Kundenbereich den" -ForegroundColor Yellow
    Write-Host "Verzeichnisschutz für $ordner einrichten und danach 'Webspace jetzt abgleichen.cmd' starten." -ForegroundColor Yellow
} elseif ($LASTEXITCODE -eq 0) {
    Start-Process $adresse
}
