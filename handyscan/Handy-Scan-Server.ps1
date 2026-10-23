# Handy-Scan – kleiner Webserver für das Büro-WLAN.
# Das Handy öffnet die Scan-Seite, fotografiert die Seiten, baut daraus ein PDF
# und schickt es hierher. Der Server legt es im Vorgangsordner unter
# <Basisordner>\<Nummer> <Bezeichnung>\ ab. Nichts verlässt das Büronetz.
#
# Start: "Handy-Scan starten.cmd" (läuft unsichtbar im Hintergrund).
# Einmalig vorher als Administrator: "Einrichten.cmd" (Port-Freigabe, Firewall, Autostart).

param(
    [string]$Einstellungen = (Join-Path $PSScriptRoot 'einstellungen.json')
)

$ErrorActionPreference = 'Stop'
$Version = '1.0'

# ---------------------------------------------------------------- Einstellungen
$cfg = [ordered]@{ Basisordner = 'Y:\Vorgänge'; Port = 8765; Pin = '' }
if (Test-Path -LiteralPath $Einstellungen) {
    $j = Get-Content -LiteralPath $Einstellungen -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($k in @('Basisordner', 'Port', 'Pin')) {
        if ($null -ne $j.$k -and "$($j.$k)" -ne '') { $cfg[$k] = $j.$k }
    }
}
$Basis = [string]$cfg.Basisordner
$Port = [int]$cfg.Port
$Pin = [string]$cfg.Pin
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
    # Vorgangsnummer ohne führende Nullen; $null, wenn keine reine Zahl.
    if ($null -eq $s) { return $null }
    $s = $s.Trim()
    if ($s -notmatch '^\d{1,9}$') { return $null }
    $s = $s.TrimStart('0')
    if ($s -eq '') { return $null }
    return $s
}

function Find-Vorgangsordner([string]$nr) {
    # Ordner, deren Name mit genau dieser Nummer beginnt (auch mit führenden Nullen),
    # gefolgt von Ende oder einem Nicht-Ziffer-Zeichen. Neuester zuerst.
    if (-not (Test-Path -LiteralPath $Basis)) { return @() }
    $muster = '^0*' + [regex]::Escape($nr) + '(\D|$)'
    return @(Get-ChildItem -LiteralPath $Basis -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match $muster } | Sort-Object LastWriteTime -Descending)
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
function Invoke-Ordner($ctx, $q) {
    if (-not (Test-Pin $ctx)) { return }
    $nr = Get-Nummer $q['nr']
    if (-not $nr) { Send-Json $ctx 400 @{ ok = $false; fehler = 'Bitte eine Vorgangsnummer (nur Ziffern) eingeben.' }; return }
    if (-not (Test-Path -LiteralPath $Basis)) {
        Send-Json $ctx 500 @{ ok = $false; fehler = "Basisordner $Basis ist am PC nicht erreichbar." }; return
    }
    $treffer = Find-Vorgangsordner $nr
    Send-Json $ctx 200 @{ ok = $true; nr = $nr; gefunden = ($treffer.Count -gt 0)
        ordner = @($treffer | ForEach-Object { $_.Name }) }
}

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

    # Zielordner: vorhandenen nehmen (gewählter Name oder neuester), sonst neu anlegen
    $treffer = Find-Vorgangsordner $nr
    $wunsch = [string]$q['ordner']
    $ziel = $null
    if ($wunsch -ne '') { $ziel = $treffer | Where-Object { $_.Name -eq $wunsch } | Select-Object -First 1 }
    if (-not $ziel -and $treffer.Count -gt 0) { $ziel = $treffer[0] }
    if ($ziel) {
        $zielPfad = $ziel.FullName
    } else {
        if (-not (Test-Path -LiteralPath $Basis)) {
            Send-Json $ctx 500 @{ ok = $false; fehler = "Basisordner $Basis ist am PC nicht erreichbar." }; return
        }
        $bez = Get-Sauber $q['bez'] 80
        $name = if ($bez -ne '') { "$nr $bez" } else { $nr }
        $zielPfad = Join-Path $Basis $name
        New-Item -ItemType Directory -Path $zielPfad -Force | Out-Null
    }

    # Dateiname: <Name>.pdf, bei Gleichstand " (2)", " (3)" ...
    $datei = Get-Sauber $q['datei'] 100
    if ($datei -eq '') { $datei = 'Scan ' + (Get-Date -Format 'yyyy-MM-dd HH-mm') }
    $pfad = Join-Path $zielPfad "$datei.pdf"
    $i = 2
    while (Test-Path -LiteralPath $pfad) { $pfad = Join-Path $zielPfad "$datei ($i).pdf"; $i++ }
    [IO.File]::WriteAllBytes($pfad, $daten)

    Protokoll ("abgelegt  V{0}  {1:N0} KB  {2}" -f $nr, ($daten.Length / 1KB), (Split-Path $pfad -Leaf))
    Send-Json $ctx 200 @{ ok = $true; ordner = (Split-Path $zielPfad -Leaf); datei = (Split-Path $pfad -Leaf) }
}

function Invoke-Info($ctx) {
    $adr = @(Get-LanAdressen | ForEach-Object { "http://${_}:$Port/" })
    Send-Json $ctx 200 @{ ok = $true; version = $Version; adressen = $adr; rechner = $env:COMPUTERNAME
        basis = $Basis; basisOk = (Test-Path -LiteralPath $Basis); pin = ($Pin -ne '') }
}

function Invoke-Datei($ctx, [string]$pfad) {
    if ($pfad -eq '/' -or $pfad -eq '') { $pfad = '/index.html' }
    if ($pfad -eq '/start') { $pfad = '/start.html' }
    $name = $pfad.TrimStart('/')
    # Nur einfache Dateinamen direkt im web-Ordner
    if ($name -notmatch '^[A-Za-z0-9._-]+$' -or $name.Contains('..')) { Send-Json $ctx 404 @{ ok = $false }; return }
    $voll = Join-Path $Web $name
    if (-not (Test-Path -LiteralPath $voll -PathType Leaf)) { Send-Json $ctx 404 @{ ok = $false; fehler = 'Nicht gefunden.' }; return }
    $ext = [IO.Path]::GetExtension($voll).ToLower()
    $typ = if ($Typen.ContainsKey($ext)) { $Typen[$ext] } else { 'application/octet-stream' }
    Send-Antwort $ctx 200 $typ ([IO.File]::ReadAllBytes($voll))
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
        elseif ($req.HttpMethod -eq 'GET' -and $pfad -eq '/api/ordner') { Invoke-Ordner $ctx $q }
        elseif ($req.HttpMethod -eq 'POST' -and $pfad -eq '/api/ablegen') { Invoke-Ablegen $ctx $q }
        elseif ($req.HttpMethod -eq 'GET') { Invoke-Datei $ctx $pfad }
        else { Send-Json $ctx 405 @{ ok = $false } }
    } catch {
        Protokoll "Fehler: $($_.Exception.Message)"
        try { Send-Json $ctx 500 @{ ok = $false; fehler = "Fehler am PC: $($_.Exception.Message)" } } catch { }
    }
}
