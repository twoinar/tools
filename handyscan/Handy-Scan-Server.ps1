# Handy-Scan – kleiner Webserver für das Büro-WLAN.
# Das Handy öffnet die Scan-Seite, fotografiert die Seiten, baut daraus ein PDF
# und schickt es hierher. Der Server legt es als <Basisordner>\<Nummer> <Bezeichnung>.pdf
# ab oder – mit "Vorgangsordner": true – als <Basisordner>\<Vorgangsordner>\<Bezeichnung>.pdf.
# Einstellungen in einstellungen.json (siehe README.md). Nichts verlässt das Büronetz.
# Unter /vermerk lassen sich Frage und Antwort aus Claude als Aktenvermerk-PDF ablegen.
# Die Startseite / ist das Büro-Portal: Handbuch und Anleitungen (nur lesend aus dem
# "Anleitungsordner", falls eingestellt), Handy-Scan (/scan), Claude-Vermerk und QR-Code fürs Handy.
# /claude ist das Claude-Fenster (Startknöpfe, Chat, Grundstückswert). Anfragen an Claude laufen
# über /api/claude zur Anthropic-API; der Schlüssel liegt verschlüsselt in claude.json und
# verlässt den PC nur Richtung api.anthropic.com. Nur vom PC selbst (localhost) erlaubt.
#
# Start: "Handy-Scan starten.cmd" (läuft unsichtbar im Hintergrund).
# Einmalig vorher als Administrator: "Einrichten.cmd" (Port-Freigabe, Firewall, Autostart).

param(
    [string]$Einstellungen = (Join-Path $PSScriptRoot 'einstellungen.json')
)

$ErrorActionPreference = 'Stop'
$Version = '2.2'

# ---------------------------------------------------------------- Einstellungen
$StandardArten = @('Geburtsurkunde', 'Heiratsurkunde', 'Sterbeurkunde', 'Personalausweis', 'Reisepass',
    'Erbschein', 'Testament', 'Vollmacht', 'Vertrag', 'Sonstiges')
$cfg = [ordered]@{ Basisordner = ''; Vorgangsordner = $false; NurZiffern = $true; Dokumentarten = $StandardArten
    Anleitungsordner = ''; Kartenlink = 'https://bb-viewer.geobasis-bb.de/'; Port = 8765; Pin = '' }
if (Test-Path -LiteralPath $Einstellungen) {
    $j = Get-Content -LiteralPath $Einstellungen -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($k in @($cfg.Keys)) {
        if ($null -ne $j.$k -and "$($j.$k)" -ne '') { $cfg[$k] = $j.$k }
    }
}
$Basis = [string]$cfg.Basisordner
$MitVorgangsordner = [bool]$cfg.Vorgangsordner
$NurZiffern = [bool]$cfg.NurZiffern
$Arten = @($cfg.Dokumentarten | ForEach-Object { "$_".Trim() } | Where-Object { $_ -ne '' })
$Port = [int]$cfg.Port
$Pin = [string]$cfg.Pin
$Anleitungen = [string]$cfg.Anleitungsordner
$Kartenlink = [string]$cfg.Kartenlink
$ClaudeDatei = Join-Path $PSScriptRoot 'claude.json'
# Diese Dateiarten zeigt das Portal aus dem Anleitungsordner (nur lesen)
$AnleitungsTypen = @{
    '.pdf' = 'application/pdf'; '.mp4' = 'video/mp4'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'
    '.docx' = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    '.xlsx' = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}
$Web = Join-Path $PSScriptRoot 'web'
$MaxBytes = 60MB

$LogOrdner = Join-Path $env:LOCALAPPDATA 'Handy-Scan'
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
    # Vorhandenen Ordner "<nr>" oder "<nr> <Beteiligte>" im Basisordner suchen, sonst "<nr>" anlegen.
    $treffer = @(Get-ChildItem -LiteralPath $Basis -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -eq $nr -or $_.Name.StartsWith("$nr ") })
    if ($treffer.Count -ge 1) { return $treffer[0].FullName }
    $neu = Join-Path $Basis $nr
    New-Item -ItemType Directory -Path $neu | Out-Null
    return $neu
}

function Send-Antwort($ctx, [int]$status, [string]$typ, [byte[]]$daten, [string]$cache = 'no-store') {
    $res = $ctx.Response
    $res.StatusCode = $status
    $res.ContentType = $typ
    $res.Headers['Cache-Control'] = $cache
    $res.ContentLength64 = $daten.Length
    $res.OutputStream.Write($daten, 0, $daten.Length)
    $res.OutputStream.Close()
}

function Send-Json($ctx, [int]$status, $obj) {
    $json = $obj | ConvertTo-Json -Compress -Depth 4
    Send-Antwort $ctx $status 'application/json; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($json))
}

function Test-Pin($ctx) {
    if ($Pin -eq '') { return $true }
    if ($ctx.Request.Headers['X-Pin'] -eq $Pin) { return $true }
    Send-Json $ctx 403 @{ ok = $false; fehler = 'PIN falsch oder fehlt.'; pin = $true }
    return $false
}

function Get-LanAdressen {
    $ips = @()
    try {
        $ips = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
            Where-Object { $_.OperationalStatus -eq 'Up' -and $_.NetworkInterfaceType -ne 'Loopback' } |
            ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
            Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' -and -not $_.Address.ToString().StartsWith('169.254.') } |
            ForEach-Object { $_.Address.ToString() }
    } catch { }
    return @($ips | Select-Object -Unique)
}

$Typen = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
    '.png' = 'image/png'; '.svg' = 'image/svg+xml'
}

# ---------------------------------------------------------------- Anfragen
function Invoke-Ablegen($ctx, $q) {
    if (-not (Test-Pin $ctx)) { return }
    $req = $ctx.Request
    $nr = Get-Nummer $q['nr']
    if (-not $nr) { Send-Json $ctx 400 @{ ok = $false; fehler = 'Vorgangsnummer fehlt.' }; return }
    if ($req.ContentLength64 -le 0 -or $req.ContentLength64 -gt $MaxBytes) {
        Send-Json $ctx 413 @{ ok = $false; fehler = 'Datei leer oder zu groß.' }; return
    }

    # Datei einlesen und prüfen, dass es ein PDF ist
    $ms = New-Object System.IO.MemoryStream
    $req.InputStream.CopyTo($ms)
    $daten = $ms.ToArray()
    if ($daten.Length -lt 5 -or [Text.Encoding]::ASCII.GetString($daten, 0, 5) -ne '%PDF-') {
        Send-Json $ctx 400 @{ ok = $false; fehler = 'Es kam kein PDF an.' }; return
    }

    if ($Basis -eq '') {
        Send-Json $ctx 500 @{ ok = $false; fehler = 'Am PC ist noch kein Ablageordner eingestellt (Einrichten.cmd ausführen).' }; return
    }
    if (-not (Test-Path -LiteralPath $Basis)) {
        Send-Json $ctx 500 @{ ok = $false; fehler = "Ablageordner $Basis ist am PC nicht erreichbar." }; return
    }

    # Dateiname: <Nummer> <Bezeichnung>.pdf (bzw. <Bezeichnung>.pdf im Vorgangsordner),
    # bei Gleichstand " (2)", " (3)" ...
    $bez = Get-Sauber $q['datei'] 120
    if ($bez -match ('^0*' + [regex]::Escape($nr) + '\b')) { $bez = ($bez -replace ('^0*' + [regex]::Escape($nr)), '').Trim() }
    if ($bez -eq '') { $bez = 'Scan ' + (Get-Date -Format 'yyyy-MM-dd HH-mm') }
    if ($MitVorgangsordner) { $ordner = Get-Vorgangsordner $nr; $datei = $bez }
    else { $ordner = $Basis; $datei = "$nr $bez" }
    $pfad = Join-Path $ordner "$datei.pdf"
    $i = 2
    while (Test-Path -LiteralPath $pfad) { $pfad = Join-Path $ordner "$datei ($i).pdf"; $i++ }
    [IO.File]::WriteAllBytes($pfad, $daten)

    $anzeige = if ($MitVorgangsordner) { (Split-Path $ordner -Leaf) + '\' + (Split-Path $pfad -Leaf) } else { Split-Path $pfad -Leaf }
    Protokoll ("abgelegt  V{0}  {1:N0} KB  {2}" -f $nr, ($daten.Length / 1KB), $anzeige)
    Send-Json $ctx 200 @{ ok = $true; datei = $anzeige }
}

function Invoke-Info($ctx) {
    $adr = @(Get-LanAdressen | ForEach-Object { "http://${_}:$Port/" })
    Send-Json $ctx 200 @{ ok = $true; version = $Version; adressen = $adr; rechner = $env:COMPUTERNAME
        basis = $Basis; basisOk = ($Basis -ne '' -and (Test-Path -LiteralPath $Basis)); pin = ($Pin -ne '')
        vorgangsordner = $MitVorgangsordner; nurZiffern = $NurZiffern; arten = $Arten; port = $Port
        anleitungen = $Anleitungen; anleitungenOk = ($Anleitungen -ne '' -and (Test-Path -LiteralPath $Anleitungen)) }
}

function Get-AnleitungsListe {
    # Alle zeigbaren Dateien im Anleitungsordner, Pfade relativ mit / getrennt
    $wurzel = [IO.Path]::GetFullPath($Anleitungen).TrimEnd('\')
    Get-ChildItem -LiteralPath $wurzel -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $AnleitungsTypen.ContainsKey($_.Extension.ToLower()) -and -not $_.Name.StartsWith('~$') } |
        Select-Object -First 2000 |
        ForEach-Object {
            [ordered]@{ pfad = $_.FullName.Substring($wurzel.Length + 1).Replace('\', '/')
                groesse = $_.Length; geaendert = $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm') }
        }
}

function Invoke-AnleitungsListe($ctx) {
    if ($Anleitungen -eq '') { Send-Json $ctx 200 @{ ok = $true; aus = $true; dateien = @() }; return }
    if (-not (Test-Path -LiteralPath $Anleitungen)) {
        Send-Json $ctx 200 @{ ok = $false; fehler = "Anleitungsordner $Anleitungen ist nicht erreichbar."; dateien = @() }; return
    }
    Send-Json $ctx 200 @{ ok = $true; ordner = $Anleitungen; dateien = @(Get-AnleitungsListe) }
}

function Invoke-Anleitung($ctx, [string]$rel) {
    # /anleitung/<relativer Pfad>: nur Dateien innerhalb des Anleitungsordners, nur bekannte Typen
    if ($Anleitungen -eq '') { Send-Json $ctx 404 @{ ok = $false }; return }
    $rel = [Uri]::UnescapeDataString($rel).Replace('/', '\')
    $wurzel = [IO.Path]::GetFullPath($Anleitungen).TrimEnd('\')
    $voll = [IO.Path]::GetFullPath((Join-Path $wurzel $rel))
    $ext = [IO.Path]::GetExtension($voll).ToLower()
    if (-not $voll.StartsWith($wurzel + '\', [StringComparison]::OrdinalIgnoreCase) -or -not $AnleitungsTypen.ContainsKey($ext) -or
        -not (Test-Path -LiteralPath $voll -PathType Leaf)) {
        Send-Json $ctx 404 @{ ok = $false; fehler = 'Nicht gefunden.' }; return
    }
    $res = $ctx.Response
    $res.StatusCode = 200
    $res.ContentType = $AnleitungsTypen[$ext]
    $res.Headers['Cache-Control'] = 'no-cache'
    $name = [IO.Path]::GetFileName($voll)
    $res.Headers['Content-Disposition'] = "inline; filename*=UTF-8''" + [Uri]::EscapeDataString($name)
    $fs = [IO.File]::OpenRead($voll)
    try {
        $res.ContentLength64 = $fs.Length
        $fs.CopyTo($res.OutputStream)
    } finally { $fs.Close(); $res.OutputStream.Close() }
}

function Get-ClaudeSchluessel {
    # API-Schlüssel aus claude.json (DPAPI, nur dieser Windows-Benutzer kann ihn lesen)
    if (-not (Test-Path -LiteralPath $ClaudeDatei)) { return '' }
    $j = Get-Content -LiteralPath $ClaudeDatei -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $j.Schluessel) { return '' }
    $sec = $j.Schluessel | ConvertTo-SecureString
    return (New-Object System.Management.Automation.PSCredential 'x', $sec).GetNetworkCredential().Password
}

function Invoke-ClaudeStatus($ctx) {
    Send-Json $ctx 200 @{ ok = $true; schluessel = (Test-Path -LiteralPath $ClaudeDatei); karte = $Kartenlink; lokal = $ctx.Request.IsLocal }
}

# Die Anfrage an Claude dauert oft eine Minute oder länger. Sie läuft deshalb in einem eigenen
# Runspace, damit Handy-Scan und Portal in der Zeit weiter antworten.
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
    if (-not $ctx.Request.IsLocal) { Send-Json $ctx 403 @{ ok = $false; fehler = 'Claude nur am PC selbst.' }; return }
    $schluessel = Get-ClaudeSchluessel
    if ($schluessel -eq '') { Send-Json $ctx 400 @{ ok = $false; fehler = 'Kein API-Schlüssel. Einmal „Claude einrichten.cmd“ starten.' }; return }
    # Fertige Läufe aufräumen
    foreach ($l in @($ClaudeLaeufe)) { if ($l.Handle.IsCompleted) { $l.PS.Dispose(); [void]$ClaudeLaeufe.Remove($l) } }
    $ps = [powershell]::Create()
    $ps.RunspacePool = $ClaudePool
    [void]$ps.AddScript($ClaudeBlock).AddArgument($ctx).AddArgument($schluessel).AddArgument($Log)
    [void]$ClaudeLaeufe.Add([pscustomobject]@{ PS = $ps; Handle = $ps.BeginInvoke() })
}

function Invoke-Datei($ctx, [string]$pfad) {
    if ($pfad -eq '/' -or $pfad -eq '') { $pfad = '/portal.html' }
    if ($pfad -eq '/scan') { $pfad = '/index.html' }
    if ($pfad -eq '/start') { $pfad = '/start.html' }
    if ($pfad -eq '/vermerk') { $pfad = '/vermerk.html' }
    if ($pfad -eq '/claude') { $pfad = '/claude.html' }
    $name = $pfad.TrimStart('/')
    # Nur einfache Dateinamen direkt im web-Ordner
    if ($name -notmatch '^[A-Za-z0-9._-]+$' -or $name.Contains('..')) { Send-Json $ctx 404 @{ ok = $false }; return }
    $voll = Join-Path $Web $name
    if (-not (Test-Path -LiteralPath $voll -PathType Leaf)) { Send-Json $ctx 404 @{ ok = $false; fehler = 'Nicht gefunden.' }; return }
    $ext = [IO.Path]::GetExtension($voll).ToLower()
    $typ = if ($Typen.ContainsKey($ext)) { $Typen[$ext] } else { 'application/octet-stream' }
    # Große Bibliotheken darf das Handy eine Woche zwischenspeichern
    $cache = if ($name -in @('opencv.js', 'pdf-lib.min.js', 'qrcode.js')) { 'max-age=604800' } else { 'no-store' }
    Send-Antwort $ctx 200 $typ ([IO.File]::ReadAllBytes($voll)) $cache
}

# ---------------------------------------------------------------- Hauptschleife
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$Port/")
try {
    $listener.Start()
} catch {
    Protokoll "Start auf Port $Port nicht möglich: $($_.Exception.Message) (läuft der Server schon? Einrichten.cmd ausgeführt?)"
    exit 1
}
Protokoll "Server $Version gestartet, Port $Port, Basisordner $Basis, Adressen: $((Get-LanAdressen) -join ', ')"

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
        $req = $ctx.Request
        $pfad = $req.Url.AbsolutePath
        $q = Get-Query $req
        if ($req.HttpMethod -eq 'GET' -and $pfad -eq '/api/info') { Invoke-Info $ctx }
        elseif ($req.HttpMethod -eq 'POST' -and $pfad -eq '/api/ablegen') { Invoke-Ablegen $ctx $q }
        elseif ($req.HttpMethod -eq 'GET' -and $pfad -eq '/api/anleitungen') { Invoke-AnleitungsListe $ctx }
        elseif ($req.HttpMethod -eq 'GET' -and $pfad -eq '/api/claude') { Invoke-ClaudeStatus $ctx }
        elseif ($req.HttpMethod -eq 'POST' -and $pfad -eq '/api/claude') { Invoke-Claude $ctx }
        elseif ($req.HttpMethod -eq 'GET' -and $pfad.StartsWith('/anleitung/')) { Invoke-Anleitung $ctx $req.RawUrl.Split([char]0x3F)[0].Substring(11) }
        elseif ($req.HttpMethod -eq 'GET') { Invoke-Datei $ctx $pfad }
        else { Send-Json $ctx 405 @{ ok = $false } }
    } catch {
        Protokoll "Fehler: $($_.Exception.Message)"
        try { Send-Json $ctx 500 @{ ok = $false; fehler = "Fehler am PC: $($_.Exception.Message)" } } catch { }
    }
}
