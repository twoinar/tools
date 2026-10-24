# Claude-Starter – kleiner Webserver nur für diesen PC (http://localhost:8766/).
# Zeigt das Claude-Fenster (Frage an Claude, BrandenburgViewer, Grundstückswert), reicht die
# Anfragen an die Anthropic-API weiter und legt Ergebnisse als PDF im Ablageordner ab:
# <Ablageordner>\<Nummer> <Bezeichnung>.pdf (bzw. im Vorgangsordner, wenn so eingestellt).
# Der API-Schlüssel liegt verschlüsselt in claude.json (DPAPI, nur dieser Windows-Benutzer) und
# geht nur an api.anthropic.com. An Claude geht nur, was im Chat getippt wird.
#
# Start: Desktop-Symbol „Claude“ (Claude-Starten.ps1). Einmalig vorher: „Einrichten.cmd“.

$ErrorActionPreference = 'Stop'
$Version = '1.6'

# ---------------------------------------------------------------- Einstellungen
$cfg = [ordered]@{ Ablageordner = ''; Vorgangsordner = $false; NurZiffern = $true
    Kartenlink = 'https://bb-viewer.geobasis-bb.de/'; Wertrechner = ''; Port = 8766
    Registerportal = 'https://www.handelsregister.de' }
$cfgPfad = Join-Path $PSScriptRoot 'einstellungen.json'
if (Test-Path -LiteralPath $cfgPfad) {
    $j = Get-Content -LiteralPath $cfgPfad -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($k in @($cfg.Keys)) {
        if ($null -ne $j.$k -and "$($j.$k)" -ne '') { $cfg[$k] = $j.$k }
    }
}
$Basis = [string]$cfg.Ablageordner
$MitVorgangsordner = [bool]$cfg.Vorgangsordner
$NurZiffern = [bool]$cfg.NurZiffern
$Kartenlink = [string]$cfg.Kartenlink
$Wertrechner = [string]$cfg.Wertrechner
$Port = [int]$cfg.Port
$Registerportal = ([string]$cfg.Registerportal).TrimEnd('/')
$ClaudeDatei = Join-Path $PSScriptRoot 'claude.json'
$Web = Join-Path $PSScriptRoot 'web'
$MaxBytes = 30MB

$LogOrdner = Join-Path $env:LOCALAPPDATA 'Claude-Starter'
New-Item -ItemType Directory -Force -Path $LogOrdner | Out-Null
$Log = Join-Path $LogOrdner 'protokoll.txt'
function Protokoll([string]$text) {
    Add-Content -LiteralPath $Log -Encoding UTF8 -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $text)
}

# ---------------------------------------------------------------- Hilfen
function Get-Query([System.Net.HttpListenerRequest]$req) {
    # Selbst zerlegen: HttpListener dekodiert Umlaute sonst mit der Systemcodepage.
    $q = @{}
    $roh = $req.Url.Query
    if ($roh.StartsWith('?')) { $roh = $roh.Substring(1) }
    foreach ($teil in $roh.Split('&')) {
        if ($teil -eq '') { continue }
        $kv = $teil.Split('=', 2)
        $k = [Uri]::UnescapeDataString($kv[0].Replace('+', ' '))
        $v = if ($kv.Count -gt 1) { [Uri]::UnescapeDataString($kv[1].Replace('+', ' ')) } else { '' }
        $q[$k] = $v
    }
    return $q
}

function Get-Sauber([string]$s, [int]$max = 80) {
    # Für Datei- und Ordnernamen: verbotene Zeichen raus, Leerraum glätten.
    if ($null -eq $s) { return '' }
    $s = $s -replace '[\\/:*?"<>|\x00-\x1F]', ' '
    $s = ($s -replace '\s+', ' ').Trim().Trim('.').Trim()
    if ($s.Length -gt $max) { $s = $s.Substring(0, $max).Trim() }
    return $s
}

function Get-Nummer([string]$s) {
    # Vorgangsnummer: mit NurZiffern eine Zahl ohne führende Nullen, sonst ein Aktenzeichen
    # aus Buchstaben, Ziffern, Leerzeichen, . - _ (ein / wird zu -). $null, wenn ungültig.
    if ($null -eq $s) { return $null }
    $s = $s.Trim()
    if ($NurZiffern) {
        if ($s -notmatch '^\d{1,9}$') { return $null }
        $s = $s.TrimStart('0')
    } else {
        $s = ($s -replace '/', '-' -replace '\s+', ' ').Trim()
        if ($s -notmatch '^[\p{L}\d][\p{L}\d .\-_]{0,39}$') { return $null }
    }
    if ($s -eq '') { return $null }
    return $s
}

function Get-Vorgangsordner([string]$nr) {
    # Vorhandenen Ordner "<nr>" oder "<nr> <Beteiligte>" im Ablageordner suchen, sonst "<nr>" anlegen.
    $treffer = @(Get-ChildItem -LiteralPath $Basis -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -eq $nr -or $_.Name.StartsWith("$nr ") })
    if ($treffer.Count -ge 1) { return $treffer[0].FullName }
    $neu = Join-Path $Basis $nr
    New-Item -ItemType Directory -Path $neu | Out-Null
    return $neu
}

function Send-Antwort($ctx, [int]$status, [string]$typ, [byte[]]$daten) {
    $res = $ctx.Response
    $res.StatusCode = $status
    $res.ContentType = $typ
    $res.Headers['Cache-Control'] = 'no-store'
    $res.ContentLength64 = $daten.Length
    $res.OutputStream.Write($daten, 0, $daten.Length)
    $res.OutputStream.Close()
}

function Send-Json($ctx, [int]$status, $obj) {
    $json = $obj | ConvertTo-Json -Compress -Depth 4
    Send-Antwort $ctx $status 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($json))
}

function Get-ClaudeSchluessel {
    if (-not (Test-Path -LiteralPath $ClaudeDatei)) { return '' }
    $j = Get-Content -LiteralPath $ClaudeDatei -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $j.Schluessel) { return '' }
    $sec = $j.Schluessel | ConvertTo-SecureString
    return (New-Object System.Management.Automation.PSCredential 'x', $sec).GetNetworkCredential().Password
}

$Typen = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'
}

# ---------------------------------------------------------------- Anfragen
function Invoke-Ablegen($ctx, $q) {
    $req = $ctx.Request
    $nr = Get-Nummer $q['nr']
    if (-not $nr) { Send-Json $ctx 400 @{ ok = $false; fehler = 'Vorgangsnummer fehlt oder ist ungültig.' }; return }
    if ($req.ContentLength64 -le 0 -or $req.ContentLength64 -gt $MaxBytes) {
        Send-Json $ctx 413 @{ ok = $false; fehler = 'Datei leer oder zu groß.' }; return
    }
    $ms = New-Object System.IO.MemoryStream
    $req.InputStream.CopyTo($ms)
    $daten = $ms.ToArray()
    if ($daten.Length -lt 5 -or [Text.Encoding]::ASCII.GetString($daten, 0, 5) -ne '%PDF-') {
        Send-Json $ctx 400 @{ ok = $false; fehler = 'Es kam kein PDF an.' }; return
    }
    if ($Basis -eq '') { Send-Json $ctx 500 @{ ok = $false; fehler = 'Kein Ablageordner eingestellt (Einrichten.cmd ausführen).' }; return }
    if (-not (Test-Path -LiteralPath $Basis)) { Send-Json $ctx 500 @{ ok = $false; fehler = "Ablageordner $Basis ist nicht erreichbar." }; return }

    # Dateiname: <Nummer> <Bezeichnung>.pdf (bzw. <Bezeichnung>.pdf im Vorgangsordner), bei Gleichstand " (2)" ...
    $bez = Get-Sauber $q['datei'] 120
    if ($bez -eq '') { $bez = 'Claude ' + (Get-Date -Format 'yyyy-MM-dd HH-mm') }
    if ($MitVorgangsordner) { $ordner = Get-Vorgangsordner $nr; $datei = $bez }
    else { $ordner = $Basis; $datei = "$nr $bez" }
    $pfad = Join-Path $ordner "$datei.pdf"
    # ersetzen=1: derselbe Chat wird nach jeder Antwort neu gespeichert (gleicher Name, überschreiben)
    if ($q['ersetzen'] -ne '1') {
        $i = 2
        while (Test-Path -LiteralPath $pfad) { $pfad = Join-Path $ordner "$datei ($i).pdf"; $i++ }
    }
    [IO.File]::WriteAllBytes($pfad, $daten)

    $anzeige = if ($MitVorgangsordner) { (Split-Path $ordner -Leaf) + '\' + (Split-Path $pfad -Leaf) } else { Split-Path $pfad -Leaf }
    Protokoll ("abgelegt  V{0}  {1:N0} KB  {2}" -f $nr, ($daten.Length / 1KB), $anzeige)
    Send-Json $ctx 200 @{ ok = $true; datei = $anzeige }
}

function Get-Downloads {
    # Downloads-Ordner des Benutzers (kann umgeleitet sein), sonst %USERPROFILE%\Downloads
    try {
        $v = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders' -ErrorAction Stop).'{374DE290-123F-4565-9164-39C4925E467B}'
        if ($v) { $v = [Environment]::ExpandEnvironmentVariables($v); if (Test-Path -LiteralPath $v) { return $v } }
    } catch { }
    return (Join-Path $env:USERPROFILE 'Downloads')
}

function Invoke-Downloads($ctx) {
    # Die neuesten PDFs aus dem Downloads-Ordner (letzte 24 Stunden), neueste zuerst
    if (-not $ctx.Request.IsLocal) { Send-Json $ctx 403 @{ ok = $false; fehler = 'Nur am PC selbst.' }; return }
    $ordner = Get-Downloads
    $liste = @(Get-ChildItem -LiteralPath $ordner -File -Filter '*.pdf' -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-24) } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 8 |
        ForEach-Object { @{ name = $_.Name; kb = [int][Math]::Ceiling($_.Length / 1KB); zeit = $_.LastWriteTime.ToString('dd.MM. HH:mm') } })
    Send-Json $ctx 200 @{ ok = $true; ordner = $ordner; dateien = $liste }
}

function Invoke-DownloadAblegen($ctx, $q) {
    # Eine PDF aus dem Downloads-Ordner in den Vorgang kopieren (Original bleibt in Downloads)
    if (-not $ctx.Request.IsLocal) { Send-Json $ctx 403 @{ ok = $false; fehler = 'Nur am PC selbst.' }; return }
    $nr = Get-Nummer $q['nr']
    if (-not $nr) { Send-Json $ctx 400 @{ ok = $false; fehler = 'Vorgangsnummer fehlt oder ist ungültig.' }; return }
    $name = [string]$q['name']
    if ($name -eq '' -or $name -ne (Split-Path $name -Leaf) -or $name -notmatch '\.pdf$') { Send-Json $ctx 400 @{ ok = $false; fehler = 'Ungültiger Dateiname.' }; return }
    $quelle = Join-Path (Get-Downloads) $name
    if (-not (Test-Path -LiteralPath $quelle -PathType Leaf)) { Send-Json $ctx 404 @{ ok = $false; fehler = 'Datei nicht mehr in Downloads.' }; return }
    if ($Basis -eq '' -or -not (Test-Path -LiteralPath $Basis)) { Send-Json $ctx 500 @{ ok = $false; fehler = 'Ablageordner nicht erreichbar.' }; return }
    $bez = Get-Sauber ([IO.Path]::GetFileNameWithoutExtension($name)) 120
    if ($bez -eq '') { $bez = 'Download' }
    if ($MitVorgangsordner) { $ordner = Get-Vorgangsordner $nr; $datei = $bez }
    else { $ordner = $Basis; $datei = if ($bez.StartsWith("$nr ")) { $bez } else { "$nr $bez" } }
    $pfad = Join-Path $ordner "$datei.pdf"
    $i = 2
    while (Test-Path -LiteralPath $pfad) { $pfad = Join-Path $ordner "$datei ($i).pdf"; $i++ }
    Copy-Item -LiteralPath $quelle -Destination $pfad
    $anzeige = if ($MitVorgangsordner) { (Split-Path $ordner -Leaf) + '\' + (Split-Path $pfad -Leaf) } else { Split-Path $pfad -Leaf }
    Protokoll ("Download abgelegt  V{0}  {1}" -f $nr, $anzeige)
    Send-Json $ctx 200 @{ ok = $true; datei = $anzeige }
}

# ---------------------------------------------------------------- Registerabruf (handelsregister.de)
# Das Fenster führt die Formulare des Registerportals selbst aus (JSF: ViewState, Sitzung); der Server
# reicht nur die Anfragen an das Registerportal weiter, hält die Sitzungs-Cookies und speichert
# Dateien zwischen. Andere Adressen werden nicht angefragt. Nutzungsordnung: höchstens 60 Suchen oder
# Aufrufe von Rechtsträgern je Stunde – gezählt werden Suchen und Dokumentabrufe, Grenze hier 50.
$HrOrdner = Join-Path $LogOrdner 'register'
$HrZaehler = Join-Path $LogOrdner 'register-abrufe.json'
$HrGrenze = 50
$script:HrCookies = New-Object System.Net.CookieContainer

function Get-HrAbrufe {
    $jetzt = [DateTime]::UtcNow
    $liste = @()
    if (Test-Path -LiteralPath $HrZaehler) {
        try { $liste = @((Get-Content -LiteralPath $HrZaehler -Raw | ConvertFrom-Json) | ForEach-Object { if ($_ -is [DateTime]) { $_.ToUniversalTime() } else { [DateTime]::Parse([string]$_, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime() } }) } catch { $liste = @() }
    }
    return @($liste | Where-Object { ($jetzt - $_).TotalMinutes -lt 60 })
}

function Invoke-HrNeu($ctx) {
    # Neue Sitzung (Cookies leeren), alte Zwischendateien entfernen
    if (-not $ctx.Request.IsLocal) { Send-Json $ctx 403 @{ ok = $false }; return }
    $script:HrCookies = New-Object System.Net.CookieContainer
    New-Item -ItemType Directory -Force -Path $HrOrdner | Out-Null
    Get-ChildItem -LiteralPath $HrOrdner -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } | Remove-Item -Force -ErrorAction SilentlyContinue
    Send-Json $ctx 200 @{ ok = $true; abrufe = @(Get-HrAbrufe).Count; grenze = $HrGrenze }
}

function Invoke-HrHttp($ctx, $q) {
    # Eine Anfrage an das Registerportal. Body (application/x-www-form-urlencoded) wird unverändert
    # weitergegeben; ohne Body GET. zaehlt=1: Suche oder Dokumentabruf (Stundengrenze).
    if (-not $ctx.Request.IsLocal) { Send-Json $ctx 403 @{ ok = $false; fehler = 'Nur am PC selbst.' }; return }
    $url = [string]$q['url']
    if (-not ($url -eq $Registerportal -or $url.StartsWith($Registerportal + '/'))) {
        Send-Json $ctx 400 @{ ok = $false; fehler = 'Nur das Registerportal ist erlaubt.' }; return
    }
    if ($q['zaehlt'] -eq '1') {
        $liste = @(Get-HrAbrufe)
        if ($liste.Count -ge $HrGrenze) {
            $frei = [int][Math]::Ceiling(60 - ([DateTime]::UtcNow - ($liste | Sort-Object | Select-Object -First 1)).TotalMinutes)
            Send-Json $ctx 429 @{ ok = $false; fehler = "Stundengrenze des Registerportals erreicht ($HrGrenze Abrufe). Wieder möglich in etwa $frei Minuten." }; return
        }
        $liste += [DateTime]::UtcNow
        ConvertTo-Json @($liste | ForEach-Object { $_.ToString('o') }) | Set-Content -LiteralPath $HrZaehler -Encoding UTF8
    }
    $body = (New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)).ReadToEnd()
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $r = [Net.HttpWebRequest]::Create($url)
        $r.CookieContainer = $script:HrCookies
        $r.UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0'
        $r.Accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        $r.Headers['Accept-Language'] = 'de-DE,de;q=0.9'
        $r.AutomaticDecompression = [Net.DecompressionMethods]::GZip -bor [Net.DecompressionMethods]::Deflate
        $r.Timeout = 90000
        $r.AllowAutoRedirect = $true
        if ($q['referer']) { $r.Referer = [string]$q['referer'] }
        if ($body -ne '') {
            $r.Method = 'POST'
            $r.ContentType = 'application/x-www-form-urlencoded; charset=UTF-8'
            if ($q['ajax'] -eq '1') { $r.Headers['Faces-Request'] = 'partial/ajax'; $r.Headers['X-Requested-With'] = 'XMLHttpRequest' }
            $b = [Text.Encoding]::UTF8.GetBytes($body)
            $r.ContentLength = $b.Length
            $st = $r.GetRequestStream(); $st.Write($b, 0, $b.Length); $st.Close()
        }
        try { $resp = $r.GetResponse() } catch [Net.WebException] { if ($_.Exception.Response) { $resp = $_.Exception.Response } else { throw } }
        $ms = New-Object IO.MemoryStream
        $resp.GetResponseStream().CopyTo($ms)
        $daten = $ms.ToArray()
        $typ = [string]$resp.ContentType
        $disp = [string]$resp.Headers['Content-Disposition']
        $antwort = @{ ok = $true; status = [int]$resp.StatusCode; url = $resp.ResponseUri.AbsoluteUri; typ = $typ; disposition = $disp }
        $resp.Close()
        $istPdf = $daten.Length -ge 5 -and [Text.Encoding]::ASCII.GetString($daten, 0, 5) -eq '%PDF-'
        if (-not $istPdf -and $disp -notmatch 'attachment' -and $typ -match 'html|xml|text') {
            $antwort.text = [Text.Encoding]::UTF8.GetString($daten)
            # letzte Seite aufheben: hilft bei der Fehlersuche, wenn das Portal seine Seiten ändert
            New-Item -ItemType Directory -Force -Path $HrOrdner | Out-Null
            [IO.File]::WriteAllBytes((Join-Path $HrOrdner 'letzte-seite.html'), $daten)
        } else {
            # Datei zwischenspeichern; das Fenster legt sie danach im Vorgang ab
            $endung = '.bin'
            if ($istPdf) { $endung = '.pdf' }
            elseif ($disp -match 'filename\*?=(?:UTF-8.{2})?"?([^";]+)') { $e = [IO.Path]::GetExtension($Matches[1]).ToLower(); if ($e -match '^\.[a-z0-9]{2,5}$') { $endung = $e } }
            elseif ($typ -match 'zip') { $endung = '.zip' } elseif ($typ -match 'tif') { $endung = '.tif' }
            New-Item -ItemType Directory -Force -Path $HrOrdner | Out-Null
            $id = [guid]::NewGuid().ToString('N') + $endung
            [IO.File]::WriteAllBytes((Join-Path $HrOrdner $id), $daten)
            $antwort.datei = $id
            $antwort.groesse = $daten.Length
        }
        Protokoll ("Register {0} {1}  {2:N0} KB" -f $(if ($body -ne '') { 'POST' } else { 'GET' }), $url, ($daten.Length / 1KB))
        Send-Json $ctx 200 $antwort
    } catch {
        Protokoll "Register Fehler: $($_.Exception.Message)"
        Send-Json $ctx 502 @{ ok = $false; fehler = 'Registerportal nicht erreichbar: ' + $_.Exception.Message }
    }
}

function Invoke-HrAblegen($ctx, $q) {
    # Zwischengespeicherte Datei aus dem Registerabruf in den Vorgang verschieben
    if (-not $ctx.Request.IsLocal) { Send-Json $ctx 403 @{ ok = $false }; return }
    $nr = Get-Nummer $q['nr']
    if (-not $nr) { Send-Json $ctx 400 @{ ok = $false; fehler = 'Vorgangsnummer fehlt oder ist ungültig.' }; return }
    $id = [string]$q['id']
    if ($id -notmatch '^[0-9a-f]{32}\.[a-z0-9]{2,5}$') { Send-Json $ctx 400 @{ ok = $false; fehler = 'Ungültige Datei.' }; return }
    $quelle = Join-Path $HrOrdner $id
    if (-not (Test-Path -LiteralPath $quelle)) { Send-Json $ctx 404 @{ ok = $false; fehler = 'Datei nicht mehr da.' }; return }
    if ($Basis -eq '' -or -not (Test-Path -LiteralPath $Basis)) { Send-Json $ctx 500 @{ ok = $false; fehler = 'Ablageordner nicht erreichbar.' }; return }
    $bez = Get-Sauber $q['name'] 150
    if ($bez -eq '') { $bez = 'Registerabruf' }
    $endung = [IO.Path]::GetExtension($id)
    if ($MitVorgangsordner) { $ordner = Get-Vorgangsordner $nr; $datei = $bez }
    else { $ordner = $Basis; $datei = "$nr $bez" }
    $pfad = Join-Path $ordner "$datei$endung"
    $i = 2
    while (Test-Path -LiteralPath $pfad) { $pfad = Join-Path $ordner "$datei ($i)$endung"; $i++ }
    Move-Item -LiteralPath $quelle -Destination $pfad
    $anzeige = if ($MitVorgangsordner) { (Split-Path $ordner -Leaf) + '\' + (Split-Path $pfad -Leaf) } else { Split-Path $pfad -Leaf }
    Protokoll ("Registerabruf abgelegt  V{0}  {1}" -f $nr, $anzeige)
    Send-Json $ctx 200 @{ ok = $true; datei = $anzeige }
}

function Invoke-Protokoll($ctx, $q) {
    # Eine Zeile an "<Nummer> Claude-Fenster Protokoll.txt" im Vorgang anhängen (was im Fenster geöffnet wurde)
    $nr = Get-Nummer $q['nr']
    if (-not $nr) { Send-Json $ctx 400 @{ ok = $false; fehler = 'Vorgangsnummer fehlt oder ist ungültig.' }; return }
    if ($ctx.Request.ContentLength64 -gt 4KB) { Send-Json $ctx 413 @{ ok = $false; fehler = 'Zu lang.' }; return }
    $text = (New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)).ReadToEnd()
    $text = ($text -replace '[\x00-\x1F]', ' ').Trim()
    if ($text -eq '') { Send-Json $ctx 400 @{ ok = $false; fehler = 'Leer.' }; return }
    if ($Basis -eq '' -or -not (Test-Path -LiteralPath $Basis)) { Send-Json $ctx 500 @{ ok = $false; fehler = 'Ablageordner nicht erreichbar.' }; return }
    if ($MitVorgangsordner) { $pfad = Join-Path (Get-Vorgangsordner $nr) 'Claude-Fenster Protokoll.txt' }
    else { $pfad = Join-Path $Basis "$nr Claude-Fenster Protokoll.txt" }
    Add-Content -LiteralPath $pfad -Encoding UTF8 -Value ("{0:dd.MM.yyyy HH:mm}  {1}" -f (Get-Date), $text)
    Send-Json $ctx 200 @{ ok = $true }
}

function Invoke-Vorgespraech($ctx, $q) {
    # Neuesten Vorgesprächsbogen des Vorgangs ("<Nr> … Vorgespräch….pdf") an die Seite geben. Die Seite liest
    # daraus Anschrift und Lage des Grundstücks (eingebettete Daten). Nur am PC selbst.
    if (-not $ctx.Request.IsLocal) { Send-Json $ctx 403 @{ ok = $false }; return }
    $nr = Get-Nummer $q['nr']
    if (-not $nr -or $Basis -eq '' -or -not (Test-Path -LiteralPath $Basis)) { Send-Json $ctx 404 @{ ok = $false }; return }
    $orte = @($Basis)
    $vo = @(Get-ChildItem -LiteralPath $Basis -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq $nr -or $_.Name.StartsWith("$nr ") })
    $orte += @($vo | ForEach-Object { $_.FullName })
    $muster = '^0*' + [regex]::Escape($nr) + '\b.*Vorgespr.*\.pdf$'
    $datei = @(foreach ($o in $orte) { Get-ChildItem -LiteralPath $o -File -Filter '*.pdf' -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match $muster -or ($o -ne $Basis -and $_.Name -match 'Vorgespr') } }) |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $datei) { Send-Json $ctx 404 @{ ok = $false; fehler = 'Kein Vorgesprächsbogen im Vorgang.' }; return }
    $res = $ctx.Response
    $res.Headers['X-Datei'] = [Uri]::EscapeDataString($datei.Name)
    Send-Antwort $ctx 200 'application/pdf' ([IO.File]::ReadAllBytes($datei.FullName))
}

function Invoke-Info($ctx) {
    Send-Json $ctx 200 @{ ok = $true; version = $Version; rechner = $env:COMPUTERNAME; basis = $Basis
        basisOk = ($Basis -ne '' -and (Test-Path -LiteralPath $Basis)); nurZiffern = $NurZiffern; registerportal = $Registerportal }
}

function Invoke-ClaudeStatus($ctx) {
    Send-Json $ctx 200 @{ ok = $true; schluessel = (Test-Path -LiteralPath $ClaudeDatei); karte = $Kartenlink; rechner = $Wertrechner; lokal = $ctx.Request.IsLocal }
}

# Die Anfrage an Claude dauert oft eine Minute oder länger. Sie läuft deshalb in einem eigenen
# Runspace, damit das Fenster in der Zeit weiter bedient wird.
$ClaudeBlock = {
    param($ctx, [string]$schluessel, [string]$log)
    function Senden([int]$status, [byte[]]$daten) {
        $res = $ctx.Response
        $res.StatusCode = $status
        $res.ContentType = 'application/json; charset=utf-8'
        $res.Headers['Cache-Control'] = 'no-store'
        $res.ContentLength64 = $daten.Length
        $res.OutputStream.Write($daten, 0, $daten.Length)
        $res.OutputStream.Close()
    }
    try {
        $ms = New-Object System.IO.MemoryStream
        $ctx.Request.InputStream.CopyTo($ms)
        $koerper = $ms.ToArray()
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $r = [Net.HttpWebRequest]::Create('https://api.anthropic.com/v1/messages')
        $r.Method = 'POST'
        $r.ContentType = 'application/json'
        $r.Headers['x-api-key'] = $schluessel
        $r.Headers['anthropic-version'] = '2026-10-21'
        $r.Headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'
        $r.Timeout = 600000
        $r.ReadWriteTimeout = 600000
        $r.ContentLength = $koerper.Length
        $s = $r.GetRequestStream(); $s.Write($koerper, 0, $koerper.Length); $s.Close()
        try { $antwort = $r.GetResponse() }
        catch [Net.WebException] {
            if (-not $_.Exception.Response) { throw }
            $antwort = $_.Exception.Response
        }
        $aus = New-Object System.IO.MemoryStream
        $antwort.GetResponseStream().CopyTo($aus)
        $status = [int]$antwort.StatusCode
        $antwort.Close()
        Add-Content -LiteralPath $log -Encoding UTF8 -Value ("{0:yyyy-MM-dd HH:mm:ss}  Claude-Anfrage {1:N0} KB, Antwort {2}" -f (Get-Date), ($koerper.Length / 1KB), $status)
        Senden $status $aus.ToArray()
    } catch {
        Add-Content -LiteralPath $log -Encoding UTF8 -Value ("{0:yyyy-MM-dd HH:mm:ss}  Claude-Fehler: {1}" -f (Get-Date), $_.Exception.Message)
        $json = '{"ok":false,"fehler":' + ('Anthropic nicht erreichbar: ' + $_.Exception.Message | ConvertTo-Json) + '}'
        try { Senden 502 ([Text.Encoding]::UTF8.GetBytes($json)) } catch { }
    }
}
$ClaudePool = [runspacefactory]::CreateRunspacePool(1, 3)
$ClaudePool.Open()
$ClaudeLaeufe = New-Object System.Collections.ArrayList

function Invoke-Claude($ctx) {
    # Reicht die Anfrage der Seite unverändert an die Anthropic-API weiter (nur vom PC selbst)
    if (-not $ctx.Request.IsLocal) { Send-Json $ctx 403 @{ ok = $false; fehler = 'Nur am PC selbst.' }; return }
    $schluessel = Get-ClaudeSchluessel
    if ($schluessel -eq '') { Send-Json $ctx 400 @{ ok = $false; fehler = 'Kein API-Schlüssel. Einmal „Einrichten.cmd“ starten.' }; return }
    foreach ($l in @($ClaudeLaeufe)) { if ($l.Handle.IsCompleted) { $l.PS.Dispose(); [void]$ClaudeLaeufe.Remove($l) } }
    $ps = [powershell]::Create()
    $ps.RunspacePool = $ClaudePool
    [void]$ps.AddScript($ClaudeBlock).AddArgument($ctx).AddArgument($schluessel).AddArgument($Log)
    [void]$ClaudeLaeufe.Add([pscustomobject]@{ PS = $ps; Handle = $ps.BeginInvoke() })
}

function Invoke-Datei($ctx, [string]$pfad) {
    if ($pfad -eq '/' -or $pfad -eq '') { $pfad = '/claude.html' }
    if ($pfad -eq '/intern' -or $pfad -eq '/intern/') { $pfad = '/intern/index.html' }
    $name = $pfad.TrimStart('/')
    # Nur einfache Dateinamen im web-Ordner bzw. in web/intern (Anmeldung und Service Worker für Tools intern;
    # die Seiten unter /intern/app/ liefert der Service Worker im Browser entschlüsselt aus)
    if ($name -notmatch '^(intern/)?[A-Za-z0-9._-]+$' -or $name.Contains('..')) { Send-Json $ctx 404 @{ ok = $false }; return }
    $voll = Join-Path $Web $name
    if (-not (Test-Path -LiteralPath $voll -PathType Leaf)) { Send-Json $ctx 404 @{ ok = $false; fehler = 'Nicht gefunden.' }; return }
    $ext = [IO.Path]::GetExtension($voll).ToLower()
    $typ = if ($Typen.ContainsKey($ext)) { $Typen[$ext] } else { 'application/octet-stream' }
    Send-Antwort $ctx 200 $typ ([IO.File]::ReadAllBytes($voll))
}

# ---------------------------------------------------------------- Hauptschleife
# Nur localhost: braucht keine Administratorrechte und ist von außen nicht erreichbar.
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
    $listener.Start()
} catch {
    Protokoll "Start auf Port $Port nicht möglich: $($_.Exception.Message) (läuft Claude schon?)"
    exit 1
}
Protokoll "Claude-Starter $Version gestartet, Port $Port, Ablageordner $Basis"

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
        $req = $ctx.Request
        $pfad = $req.Url.AbsolutePath
        # Anfragen fremder Webseiten (Origin-Header von anderer Adresse) abweisen: sonst könnte jede Seite,
        # die im Browser offen ist, über diesen Server den API-Schlüssel verbrauchen oder Dateien ablegen.
        $herkunft = [string]$req.Headers['Origin']
        if ($herkunft -ne '' -and @("http://localhost:$Port", "http://127.0.0.1:$Port") -notcontains $herkunft) {
            Send-Json $ctx 403 @{ ok = $false; fehler = 'Nicht erlaubt.' }; continue
        }
        if ($req.HttpMethod -eq 'GET' -and $pfad -eq '/api/info') { Invoke-Info $ctx }
        elseif ($req.HttpMethod -eq 'POST' -and $pfad -eq '/api/ablegen') { Invoke-Ablegen $ctx (Get-Query $req) }
        elseif ($req.HttpMethod -eq 'POST' -and $pfad -eq '/api/protokoll') { Invoke-Protokoll $ctx (Get-Query $req) }
        elseif ($req.HttpMethod -eq 'GET' -and $pfad -eq '/api/downloads') { Invoke-Downloads $ctx }
        elseif ($req.HttpMethod -eq 'POST' -and $pfad -eq '/api/hr/neu') { Invoke-HrNeu $ctx }
        elseif ($req.HttpMethod -eq 'POST' -and $pfad -eq '/api/hr/http') { Invoke-HrHttp $ctx (Get-Query $req) }
        elseif ($req.HttpMethod -eq 'POST' -and $pfad -eq '/api/hr/ablegen') { Invoke-HrAblegen $ctx (Get-Query $req) }
        elseif ($req.HttpMethod -eq 'POST' -and $pfad -eq '/api/download-ablegen') { Invoke-DownloadAblegen $ctx (Get-Query $req) }
        elseif ($req.HttpMethod -eq 'GET' -and $pfad -eq '/api/vorgespraech') { Invoke-Vorgespraech $ctx (Get-Query $req) }
        elseif ($req.HttpMethod -eq 'GET' -and $pfad -eq '/api/claude') { Invoke-ClaudeStatus $ctx }
        elseif ($req.HttpMethod -eq 'POST' -and $pfad -eq '/api/claude') { Invoke-Claude $ctx }
        elseif ($req.HttpMethod -eq 'GET') { Invoke-Datei $ctx $pfad }
        else { Send-Json $ctx 405 @{ ok = $false } }
    } catch {
        Protokoll "Fehler: $($_.Exception.Message)"
        try { Send-Json $ctx 500 @{ ok = $false; fehler = "Fehler am PC: $($_.Exception.Message)" } } catch { }
    }
}
