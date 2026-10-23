# Webspace-Abgleich: lädt den Anleitungsordner (Handbuch und Anleitungen, nur PDF, Videos, Bilder)
# per FTPS auf den Webspace und legt dort eine Übersichtsseite index.html an.
# Läuft nachts als geplante Aufgabe (eingerichtet mit "Webspace einrichten.cmd").
#
# Sicherheit: Vor jedem Hochladen wird geprüft, dass die Web-Adresse ein Passwort verlangt
# (Antwort 401). Ist der Ordner auf dem Webspace nicht geschützt, wird NICHTS hochgeladen.
# Das FTP-Passwort liegt verschlüsselt in webspace.json (nur dieser Windows-Benutzer auf diesem
# PC kann es entschlüsseln).

param(
    [string]$Einstellungen = (Join-Path $PSScriptRoot 'einstellungen.json'),
    [string]$Webspace = (Join-Path $PSScriptRoot 'webspace.json'),
    [switch]$Alles   # alles neu hochladen, nicht nur Geändertes
)

$ErrorActionPreference = 'Stop'
$Typen = @('.pdf', '.mp4', '.png', '.jpg')

$LogOrdner = Join-Path $env:LOCALAPPDATA 'Handy-Scan'
New-Item -ItemType Directory -Force -Path $LogOrdner | Out-Null
$Log = Join-Path $LogOrdner 'webspace.txt'
$StandDatei = Join-Path $LogOrdner 'webspace-stand.json'
function Protokoll([string]$text) {
    Add-Content -LiteralPath $Log -Encoding UTF8 -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $text)
    Write-Host $text
}

# ---------------------------------------------------------------- Einstellungen
$Anleitungen = ''
if (Test-Path -LiteralPath $Einstellungen) {
    $j = Get-Content -LiteralPath $Einstellungen -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($j.Anleitungsordner) { $Anleitungen = [string]$j.Anleitungsordner }
}
if (-not (Test-Path -LiteralPath $Webspace)) { Protokoll "Abbruch: $Webspace fehlt. Erst 'Webspace einrichten.cmd' ausführen."; exit 1 }
$ws = Get-Content -LiteralPath $Webspace -Raw -Encoding UTF8 | ConvertFrom-Json
$passwort = (New-Object System.Management.Automation.PSCredential 'x', ($ws.Passwort | ConvertTo-SecureString)).GetNetworkCredential().Password
$ftpBasis = 'ftp://' + $ws.Server.Trim().TrimEnd('/') + '/' + $ws.Ordner.Trim().Trim('/')
$webUrl = $ws.Adresse.Trim().TrimEnd('/') + '/'
$cred = New-Object System.Net.NetworkCredential($ws.Benutzer, $passwort)
$tls = $ws.Verschluesselt -ne $false
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if ($Anleitungen -eq '') { Protokoll "Abbruch: Kein Anleitungsordner in einstellungen.json. Erst 'Büro-Portal einrichten.cmd' ausführen."; exit 1 }
if (-not (Test-Path -LiteralPath $Anleitungen)) { Protokoll "Abbruch: Anleitungsordner $Anleitungen nicht erreichbar."; exit 1 }

# ---------------------------------------------------------------- Schutz prüfen
function Test-Schutz {
    try {
        $r = [Net.WebRequest]::Create($webUrl + 'index.html')
        $r.Method = 'GET'
        $r.Timeout = 20000
        $antwort = $r.GetResponse()
        $antwort.Close()
        return 200
    } catch [Net.WebException] {
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        throw
    }
}
$status = Test-Schutz
if ($status -ne 401) {
    Protokoll "Abbruch: $webUrl verlangt kein Passwort (Antwort $status). Erst im UD-Media-Kundenbereich den Verzeichnisschutz für diesen Ordner einrichten. Es wurde nichts hochgeladen."
    exit 2
}

# ---------------------------------------------------------------- FTP
function New-Ftp([string]$pfad, [string]$methode) {
    $r = [Net.FtpWebRequest]::Create("$ftpBasis/$pfad".TrimEnd('/'))
    $r.Method = $methode
    $r.Credentials = $cred
    $r.EnableSsl = $tls
    $r.UseBinary = $true
    $r.UsePassive = $true
    $r.KeepAlive = $false
    $r.Timeout = 60000
    return $r
}
function Invoke-Ftp([string]$pfad, [string]$methode) {
    $antwort = (New-Ftp $pfad $methode).GetResponse()
    $antwort.Close()
}
$angelegt = @{}
function New-FtpOrdner([string]$pfad) {
    # Alle Ebenen anlegen; "existiert schon" ist kein Fehler
    $teile = @($pfad.Split('/') | Where-Object { $_ })
    $bisher = ''
    foreach ($t in @('') + $teile) {
        $bisher = if ($t -eq '') { '' } elseif ($bisher) { "$bisher/$t" } else { $t }
        if ($angelegt.ContainsKey($bisher)) { continue }
        try { Invoke-Ftp $bisher ([Net.WebRequestMethods+Ftp]::MakeDirectory) } catch { }
        $angelegt[$bisher] = $true
    }
}
function Send-FtpDatei([string]$pfad, [byte[]]$daten) {
    $r = New-Ftp $pfad ([Net.WebRequestMethods+Ftp]::UploadFile)
    $r.ContentLength = $daten.Length
    $s = $r.GetRequestStream()
    $s.Write($daten, 0, $daten.Length)
    $s.Close()
    $r.GetResponse().Close()
}

# Dateinamen auf dem Webspace nur aus einfachen Zeichen (Umlaute und Leerzeichen machen bei FTP Ärger)
function Get-Webname([string]$s) {
    $s = $s.Replace('ä', 'ae').Replace('ö', 'oe').Replace('ü', 'ue').Replace('Ä', 'Ae').Replace('Ö', 'Oe').Replace('Ü', 'Ue').Replace('ß', 'ss')
    $s = $s.Normalize([Text.NormalizationForm]::FormD) -replace '\p{Mn}', ''
    $s = ($s -replace '[^A-Za-z0-9._-]+', '-').Trim('-')
    if ($s -eq '') { $s = 'datei' }
    return $s
}

# ---------------------------------------------------------------- Abgleich
$wurzel = [IO.Path]::GetFullPath($Anleitungen).TrimEnd('\')
$dateien = @(Get-ChildItem -LiteralPath $wurzel -Recurse -File |
    Where-Object { $Typen -contains $_.Extension.ToLower() -and -not $_.Name.StartsWith('~$') } |
    ForEach-Object {
        $rel = $_.FullName.Substring($wurzel.Length + 1).Replace('\', '/')
        [pscustomobject]@{
            Rel = $rel
            Web = (($rel.Split('/') | ForEach-Object { Get-Webname $_ }) -join '/')
            Datei = $_
            Kennung = "$($_.Length)|$($_.LastWriteTimeUtc.Ticks)"
        }
    })

$stand = @{}
if ((Test-Path -LiteralPath $StandDatei) -and -not $Alles) {
    (Get-Content -LiteralPath $StandDatei -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $stand[$_.Name] = $_.Value }
}
$neuStand = @{}
$hoch = 0; $fehler = 0
foreach ($d in $dateien) {
    $neuStand[$d.Web] = $d.Kennung
    if ($stand[$d.Web] -eq $d.Kennung) { continue }
    try {
        $ordner = if ($d.Web.Contains('/')) { $d.Web.Substring(0, $d.Web.LastIndexOf('/')) } else { '' }
        New-FtpOrdner $ordner
        Send-FtpDatei $d.Web ([IO.File]::ReadAllBytes($d.Datei.FullName))
        $hoch++
    } catch {
        $fehler++
        $neuStand.Remove($d.Web)
        Protokoll "Fehler bei $($d.Rel): $($_.Exception.Message)"
    }
}
# Was es im Ordner nicht mehr gibt, auch auf dem Webspace löschen
$weg = 0
foreach ($alt in @($stand.Keys)) {
    if ($neuStand.ContainsKey($alt)) { continue }
    try { Invoke-Ftp $alt ([Net.WebRequestMethods+Ftp]::DeleteFile); $weg++ } catch { }
}

# ---------------------------------------------------------------- Übersichtsseite
function Get-Html([string]$s) { return [Net.WebUtility]::HtmlEncode($s) }
$gruppen = $dateien | Group-Object { if ($_.Rel.Contains('/')) { $_.Rel.Substring(0, $_.Rel.LastIndexOf('/')).Replace('/', ' › ') } else { 'Allgemein' } } | Sort-Object Name
$sb = New-Object Text.StringBuilder
foreach ($g in $gruppen) {
    [void]$sb.Append("<h2>$(Get-Html $g.Name)</h2><ul>")
    foreach ($d in ($g.Group | Sort-Object { $_.Datei.BaseName })) {
        $mb = if ($d.Datei.Length -gt 1MB) { '{0:N1} MB' -f ($d.Datei.Length / 1MB) } else { '{0:N0} KB' -f [Math]::Max(1, $d.Datei.Length / 1KB) }
        [void]$sb.Append("<li><a href=""$(Get-Html $d.Web)"">$(Get-Html $d.Datei.BaseName)</a><small>$($d.Datei.LastWriteTime.ToString('dd.MM.yyyy')) · $mb</small></li>")
    }
    [void]$sb.Append('</ul>')
}
$handbuch = $dateien | Where-Object { $_.Datei.BaseName -like 'Handbuch*' -and $_.Datei.Extension -eq '.pdf' } | Select-Object -First 1
$hbLink = if ($handbuch) { "<p class=""hb""><a href=""$(Get-Html $handbuch.Web)"">📘 $(Get-Html $handbuch.Datei.BaseName) öffnen</a> (Stand $($handbuch.Datei.LastWriteTime.ToString('dd.MM.yyyy')))</p>" } else { '' }
$html = @"
<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Handbuch und Anleitungen</title>
<style>
:root{--t:#1f2328;--l:#59636e;--r:#d0d7de;--a:#1f5f99;--b:#fff;--f:#f6f8fa}
@media(prefers-color-scheme:dark){:root{--t:#e6edf3;--l:#9198a1;--r:#3d444d;--a:#4493f8;--b:#0d1117;--f:#151b23}}
body{margin:0;font:16px/1.45 system-ui,"Segoe UI",sans-serif;color:var(--t);background:var(--b)}
main{max-width:860px;margin:0 auto;padding:16px}h1{font-size:24px;margin:8px 0 2px}
h2{font-size:15px;color:var(--l);margin:20px 0 4px}ul{list-style:none;margin:0;padding:0}
li{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--r)}
a{color:var(--a);text-decoration:none;overflow-wrap:anywhere}small{color:var(--l);white-space:nowrap}
.hb{background:var(--f);border:1px solid var(--r);border-radius:10px;padding:12px;font-size:17px}
.unter{color:var(--l);margin:0 0 12px}
</style></head><body><main>
<h1>Handbuch und Anleitungen</h1><p class="unter">Stand $(Get-Date -Format 'dd.MM.yyyy HH:mm') Uhr · nur für Mitarbeiter</p>
$hbLink
$($sb.ToString())
</main></body></html>
"@
try {
    Send-FtpDatei 'index.html' ([Text.Encoding]::UTF8.GetBytes($html))
} catch { $fehler++; Protokoll "Fehler bei index.html: $($_.Exception.Message)" }

$json = $neuStand | ConvertTo-Json
if (-not $json) { $json = '{}' }
[IO.File]::WriteAllText($StandDatei, $json, (New-Object Text.UTF8Encoding $false))
Protokoll "Abgleich fertig: $($dateien.Count) Dateien, $hoch hochgeladen, $weg gelöscht, $fehler Fehler. $webUrl"
if ($fehler) { exit 3 }
