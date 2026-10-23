package de.notarwoinar.handyscan

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import com.google.android.material.button.MaterialButton
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font
import java.io.ByteArrayOutputStream
import java.io.File
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlin.concurrent.thread

// Handy-Scan als App: Google-Dokumentenscanner (läuft auf dem Handy, ohne Cloud) erkennt und
// schneidet die Seiten zu; das fertige PDF geht an den Handy-Scan-Server auf dem Büro-PC, der es
// als <Basisordner>\<Vorgangsnummer> <Bezeichnung>.pdf ablegt.
// Wer gescannt hat, steht als Zeile unter jeder Seite und als Autor im PDF (wichtig für spätere
// Beglaubigungen: hat der Notar das Original selbst gesehen?).
class MainActivity : AppCompatActivity() {

    private val arten = listOf(
        "Geburtsurkunde", "Heiratsurkunde", "Sterbeurkunde", "Personalausweis", "Reisepass",
        "Erbschein", "Testament", "Vollmacht", "Vertrag", "Sonstiges",
    )

    private lateinit var nr: TextInputEditText
    private lateinit var bez: TextInputEditText
    private lateinit var chips: ChipGroup
    private lateinit var dateiname: TextView
    private lateinit var meldung: TextView
    private lateinit var scannen: MaterialButton
    private lateinit var personWahl: Spinner
    private lateinit var erneut: MaterialButton
    private lateinit var update: MaterialButton
    private var updateUrl = ""
    private var updateVersion = ""
    private var art = ""

    private val keinePerson = "– bitte wählen –"
    private val personenVorgabe = listOf(
        "Notar Thomas Woinar", "Notarassessor", "C. Schulz", "F. Hillebrand", "M. Senechal",
        "A. Daßdorff", "E. Gießler", "A. Lamprecht", "S. Schumann",
    )

    private val prefs by lazy { getSharedPreferences("handyscan", Context.MODE_PRIVATE) }
    private var server: String
        get() = prefs.getString("server", "http://10.100.100.104:8765/") ?: ""
        set(v) = prefs.edit().putString("server", v).apply()
    private var pin: String
        get() = prefs.getString("pin", "") ?: ""
        set(v) = prefs.edit().putString("pin", v).apply()
    private var personen: List<String>
        get() = (prefs.getString("personen", null)?.lines() ?: personenVorgabe).map { it.trim() }.filter { it.isNotEmpty() }
        set(v) = prefs.edit().putString("personen", v.joinToString("\n")).apply()
    private var person: String
        get() = prefs.getString("person", "") ?: ""
        set(v) = prefs.edit().putString("person", v).apply()

    private val scanner = registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { r ->
        if (r.resultCode != Activity.RESULT_OK) { zeige("Scan abgebrochen.", false); return@registerForActivityResult }
        val ergebnis = GmsDocumentScanningResult.fromActivityResultIntent(r.data)
        val pdf = ergebnis?.pdf
        if (pdf == null) { zeige("Kein PDF vom Scanner erhalten.", false); return@registerForActivityResult }
        hochladen(pdf.uri, pdf.pageCount, Date())
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        PDFBoxResourceLoader.init(applicationContext)
        setContentView(oberflaeche())
        aktualisieren()
        updatePruefen()
    }

    override fun onResume() {
        super.onResume()
        offenAnzeigen()
    }

    // ------------------------------------------------------------------ Oberfläche
    private fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    private fun feld(hinweis: String, typ: Int): Pair<TextInputLayout, TextInputEditText> {
        val lay = TextInputLayout(this, null, com.google.android.material.R.attr.textInputOutlinedStyle)
        lay.hint = hinweis
        val et = TextInputEditText(lay.context)
        et.inputType = typ
        et.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
        lay.addView(et)
        lay.layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) }
        return lay to et
    }

    private fun oberflaeche(): View {
        val spalte = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(24), dp(20), dp(24))
        }
        val kopf = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        kopf.addView(TextView(this).apply {
            text = "Handy-Scan"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 26f)
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }, LinearLayout.LayoutParams(0, -2, 1f))
        kopf.addView(MaterialButton(this, null, com.google.android.material.R.attr.borderlessButtonStyle).apply {
            text = "⚙"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            setOnClickListener { einstellungen() }
        })
        spalte.addView(kopf)
        spalte.addView(TextView(this).apply {
            text = "Dokument scannen und am Büro-PC ablegen. Nur im Büro-WLAN.  ·  Version " +
                packageManager.getPackageInfo(packageName, 0).versionName
            alpha = 0.7f
        })
        update = MaterialButton(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
            layoutParams = LinearLayout.LayoutParams(-1, dp(56)).apply { topMargin = dp(8) }
            visibility = View.GONE
            setOnClickListener { updateInstallieren() }
        }
        spalte.addView(update)

        val (l1, e1) = feld("Vorgangsnummer", InputType.TYPE_CLASS_NUMBER)
        nr = e1; spalte.addView(l1)

        chips = ChipGroup(this).apply {
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) }
        }
        for (a in arten) {
            chips.addView(Chip(this).apply {
                text = a
                isCheckable = true
                setOnClickListener { artWaehlen(a, isChecked) }
            })
        }
        spalte.addView(chips)

        val (l2, e2) = feld("Bezeichnung (Dokumentart + Name)", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS)
        bez = e2; spalte.addView(l2)

        spalte.addView(TextView(this).apply {
            text = "Gescannt von"
            alpha = 0.7f
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(16) }
        })
        personWahl = Spinner(this).apply {
            layoutParams = LinearLayout.LayoutParams(-1, dp(52))
            onItemSelectedListener = object : android.widget.AdapterView.OnItemSelectedListener {
                override fun onItemSelected(p: android.widget.AdapterView<*>?, v: View?, pos: Int, id: Long) {
                    val wahl = selectedItem?.toString() ?: ""
                    person = if (wahl == keinePerson) "" else wahl
                    aktualisieren()
                }
                override fun onNothingSelected(p: android.widget.AdapterView<*>?) {}
            }
        }
        spalte.addView(personWahl)
        personenLaden()

        dateiname = TextView(this).apply {
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) }
            alpha = 0.8f
        }
        spalte.addView(dateiname)

        scannen = MaterialButton(this).apply {
            text = "Scannen und ablegen"
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
            layoutParams = LinearLayout.LayoutParams(-1, dp(64)).apply { topMargin = dp(24) }
            setOnClickListener { scanStarten() }
        }
        spalte.addView(scannen)

        meldung = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
            setPadding(dp(14), dp(12), dp(14), dp(12))
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(16) }
            visibility = View.GONE
        }
        spalte.addView(meldung)

        erneut = MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
            layoutParams = LinearLayout.LayoutParams(-1, dp(56)).apply { topMargin = dp(8) }
            visibility = View.GONE
            setOnClickListener { alleSenden() }
            setOnLongClickListener { offeneVerwerfen(); true }
        }
        spalte.addView(erneut)

        spalte.addView(TextView(this).apply {
            text = "Der Scanner erkennt das Blatt selbst, schneidet zu und richtet es gerade. " +
                "Mehrere Seiten nacheinander aufnehmen, dann „Fertig“. Die Bilder werden nur auf dem Handy " +
                "verarbeitet und nach dem Ablegen gelöscht. Wartende Scans löschen: „Erneut senden“ lange drücken."
            alpha = 0.6f
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(24) }
        })

        val beobachter = object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) { aktualisieren() }
        }
        nr.addTextChangedListener(beobachter)
        bez.addTextChangedListener(beobachter)
        return ScrollView(this).apply { addView(spalte) }
    }

    private fun personenLaden() {
        val liste = listOf(keinePerson) + personen
        val a = ArrayAdapter(this, android.R.layout.simple_spinner_item, liste)
        a.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        personWahl.adapter = a
        personWahl.setSelection(liste.indexOf(person).coerceAtLeast(0))
    }

    // Dokumentart setzt den Anfang der Bezeichnung; dahinter Getipptes bleibt stehen
    private fun artWaehlen(a: String, an: Boolean) {
        var rest = bez.text?.toString() ?: ""
        if (art.isNotEmpty() && rest.startsWith(art)) rest = rest.substring(art.length)
        rest = rest.trim()
        art = if (an) a else ""
        for (i in 0 until chips.childCount) (chips.getChildAt(i) as Chip).isChecked = (chips.getChildAt(i) as Chip).text == art
        bez.setText(if (art.isNotEmpty()) "$art $rest" else rest)
        bez.requestFocus()
        bez.setSelection(bez.text?.length ?: 0)
    }

    private fun nummer() = (nr.text?.toString() ?: "").filter { it.isDigit() }.trimStart('0')
    private fun bezeichnung() = (bez.text?.toString() ?: "").replace(Regex("[\\\\/:*?\"<>|]"), " ").replace(Regex("\\s+"), " ").trim()

    private fun aktualisieren() {
        dateiname.text = if (nummer().isEmpty()) "Dateiname: –"
        else "Dateiname: ${nummer()} ${bezeichnung().ifEmpty { "Scan" }}.pdf"
        scannen.isEnabled = nummer().isNotEmpty() && person.isNotEmpty()
    }

    private fun zeige(text: String, gut: Boolean?) {
        meldung.visibility = View.VISIBLE
        meldung.text = text
        meldung.setBackgroundColor(when (gut) { true -> Color.parseColor("#DAFBE1"); false -> Color.parseColor("#FFEBE9"); null -> Color.parseColor("#F0F0F0") })
        meldung.setTextColor(Color.parseColor("#1F2328"))
    }

    // ------------------------------------------------------------------ Scannen
    private fun scanStarten() {
        if (nummer().isEmpty()) { zeige("Bitte zuerst die Vorgangsnummer eingeben.", false); return }
        if (person.isEmpty()) { zeige("Bitte auswählen, wer scannt.", false); return }
        val optionen = GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(false)
            .setPageLimit(30)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_PDF)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build()
        GmsDocumentScanning.getClient(optionen).getStartScanIntent(this)
            .addOnSuccessListener { scanner.launch(IntentSenderRequest.Builder(it).build()) }
            .addOnFailureListener { zeige("Scanner nicht verfügbar: ${it.message}", false) }
    }

    // ------------------------------------------------------------------ Ablegen am Büro-PC
    // Jeder Scan wird erst mit Vermerk im App-eigenen Speicher gesichert (offen/<zeit>.pdf + .txt mit
    // Nummer, Bezeichnung, Person) und dann gesendet. Erst wenn der PC die Ablage bestätigt, wird er
    // gelöscht. Klappt das Senden nicht (z. B. nicht im Büro-WLAN), bleibt er für „Erneut senden“.
    private val offenOrdner by lazy { File(filesDir, "offen").apply { mkdirs() } }
    private fun offene() = offenOrdner.listFiles { f -> f.name.endsWith(".pdf") }?.sortedBy { it.name } ?: emptyList()

    private fun hochladen(uri: Uri, seiten: Int, scanZeit: Date) {
        val n = nummer(); val b = bezeichnung(); val wer = person
        zeige("$seiten Seite(n) – wird am Büro-PC abgelegt …", null)
        scannen.isEnabled = false
        thread {
            val gesichert = try {
                val roh = contentResolver.openInputStream(uri)!!.use { it.readBytes() }
                val name = SimpleDateFormat("yyyyMMdd-HHmmss-SSS", Locale.GERMANY).format(scanZeit)
                File(offenOrdner, "$name.txt").writeText("$n\n$b\n$wer\n$seiten", Charsets.UTF_8)
                File(offenOrdner, "$name.pdf").apply { writeBytes(vermerken(roh, wer, scanZeit)) }
            } catch (e: Exception) {
                runOnUiThread { scannen.isEnabled = true; zeige("Scan konnte nicht verarbeitet werden: ${e.message}", false) }
                null
            } finally {
                // Dateien des Scanners nicht liegen lassen
                try { uri.path?.let { File(it).takeIf { f -> f.exists() }?.delete() } } catch (_: Exception) {}
                try { cacheDir.listFiles()?.forEach { if (it.name.endsWith(".pdf") || it.name.endsWith(".jpg")) it.delete() } } catch (_: Exception) {}
            }
            if (gesichert != null) {
                val ok = senden(gesichert)
                runOnUiThread {
                    scannen.isEnabled = true
                    if (ok) {
                        bez.setText(""); art = ""
                        for (i in 0 until chips.childCount) (chips.getChildAt(i) as Chip).isChecked = false
                    }
                    offenAnzeigen()
                }
            }
        }
    }

    // Sendet einen gesicherten Scan; true, wenn der PC ihn abgelegt hat. Läuft im Hintergrund.
    private fun senden(pdf: File): Boolean {
        val meta = File(pdf.path.removeSuffix(".pdf") + ".txt")
        val (n, b, wer) = (meta.readText(Charsets.UTF_8).split("\n") + listOf("", "", "")).take(3)
        val (code, text, fehler) = try {
            val daten = pdf.readBytes()
            val url = URL(server.trimEnd('/') + "/api/ablegen?nr=" + URLEncoder.encode(n, "UTF-8") +
                "&datei=" + URLEncoder.encode(b, "UTF-8").replace("+", "%20"))
            val c = url.openConnection() as HttpURLConnection
            c.requestMethod = "POST"
            c.connectTimeout = 8000; c.readTimeout = 30000
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/pdf")
            c.setRequestProperty("X-Pin", pin)
            c.setFixedLengthStreamingMode(daten.size)
            c.outputStream.use { it.write(daten) }
            val code = c.responseCode
            val text = (if (code < 400) c.inputStream else c.errorStream)?.bufferedReader()?.readText() ?: ""
            Triple(code, text, null as String?)
        } catch (e: Exception) {
            Triple(0, "", e.message ?: e.javaClass.simpleName)
        }
        val ok = fehler == null && code in 200..299
        if (ok) { pdf.delete(); meta.delete() }
        runOnUiThread {
            when {
                ok -> {
                    val datei = Regex("\"datei\"\\s*:\\s*\"([^\"]*)\"").find(text)?.groupValues?.get(1) ?: "PDF"
                    zeige("✓ Abgelegt: $datei\nGescannt von $wer", true)
                }
                fehler != null -> zeige("Noch nicht abgelegt: Der Büro-PC ist nicht erreichbar (nicht im Büro-WLAN?). " +
                    "Der Scan ist auf dem Handy gesichert. Im Büro „Erneut senden“ tippen.", false)
                code == 403 -> { zeige("PIN falsch oder fehlt. Bitte unter ⚙ eintragen, dann „Erneut senden“.", false); einstellungen() }
                else -> {
                    val msg = Regex("\"fehler\"\\s*:\\s*\"([^\"]*)\"").find(text)?.groupValues?.get(1) ?: "Fehler $code"
                    zeige("Noch nicht abgelegt: $msg\nDer Scan ist auf dem Handy gesichert.", false)
                }
            }
        }
        return ok
    }

    private fun alleSenden() {
        val liste = offene()
        if (liste.isEmpty()) { offenAnzeigen(); return }
        erneut.isEnabled = false; scannen.isEnabled = false
        zeige("${liste.size} Scan(s) werden am Büro-PC abgelegt …", null)
        thread {
            var gut = 0
            for (f in liste) { if (senden(f)) gut++ else break }
            runOnUiThread {
                scannen.isEnabled = true
                if (gut == liste.size && gut > 1) zeige("✓ Alle $gut Scans abgelegt.", true)
                offenAnzeigen()
            }
        }
    }

    private fun offenAnzeigen() {
        val zahl = offene().size
        erneut.visibility = if (zahl > 0) View.VISIBLE else View.GONE
        erneut.isEnabled = true
        erneut.text = if (zahl == 1) "Erneut senden (1 Scan wartet)" else "Erneut senden ($zahl Scans warten)"
        aktualisieren()
    }

    private fun offeneVerwerfen() {
        AlertDialog.Builder(this)
            .setTitle("Wartende Scans löschen?")
            .setMessage("Die ${offene().size} noch nicht abgelegten Scans werden vom Handy gelöscht.")
            .setPositiveButton("Löschen") { _, _ ->
                offenOrdner.listFiles()?.forEach { it.delete() }
                zeige("Wartende Scans gelöscht.", null)
                offenAnzeigen()
            }
            .setNegativeButton("Abbrechen", null)
            .show()
    }

    // ------------------------------------------------------------------ Vermerk im PDF
    // Unter jede Seite kommt ein schmaler Streifen mit „Gescannt von … am …“ – die Seite wird dafür
    // nach unten verlängert, der Scan selbst bleibt unverdeckt. Zeitpunkt = Ende des Scannens. Dazu Autor und Betreff im PDF.
    private fun vermerken(pdf: ByteArray, wer: String, jetzt: Date): ByteArray {
        val zeit = SimpleDateFormat("dd.MM.yyyy 'um' HH:mm 'Uhr'", Locale.GERMANY).format(jetzt)
        val zeile = latin1("Gescannt von $wer am $zeit mit Handy-Scan")
        PDDocument.load(pdf).use { doc ->
            for (seite in doc.pages) {
                val box = seite.mediaBox
                val streifen = 22f
                val neu = PDRectangle(box.lowerLeftX, box.lowerLeftY - streifen, box.width, box.height + streifen)
                seite.mediaBox = neu
                seite.cropBox = neu
                PDPageContentStream(doc, seite, PDPageContentStream.AppendMode.APPEND, true, true).use { cs ->
                    cs.setNonStrokingColor(1f, 1f, 1f)
                    cs.addRect(neu.lowerLeftX, neu.lowerLeftY, neu.width, streifen)
                    cs.fill()
                    cs.setNonStrokingColor(0.25f, 0.25f, 0.25f)
                    cs.beginText()
                    cs.setFont(PDType1Font.HELVETICA, 8f)
                    cs.newLineAtOffset(neu.lowerLeftX + 10f, neu.lowerLeftY + 8f)
                    cs.showText(zeile)
                    cs.endText()
                }
            }
            val info = doc.documentInformation
            info.author = latin1(wer)
            info.subject = zeile
            info.creator = "Handy-Scan"
            info.creationDate = Calendar.getInstance().apply { time = jetzt }
            val aus = ByteArrayOutputStream()
            doc.save(aus)
            return aus.toByteArray()
        }
    }

    // Die Standardschrift kennt nur westeuropäische Zeichen (Umlaute und ß gehen)
    private fun latin1(s: String) = s.map { if (it.code in 32..255) it else '?' }.joinToString("")

    // ------------------------------------------------------------------ App-Update
    // Beim Start fragt die App bei GitHub nach, ob es eine neuere Handy-Scan-<Version>.apk gibt, und
    // zeigt dann oben einen Knopf. Ein Tipp lädt sie und übergibt sie an Android zum Installieren.
    private val releaseApi = "https://api.github.com/repos/twoinar/tools/releases/tags/handyscan-app"
    private fun eigeneVersion() = packageManager.getPackageInfo(packageName, 0).versionName ?: "0"

    private fun neuer(a: String, b: String): Boolean {
        val x = a.split('.').map { it.toIntOrNull() ?: 0 }; val y = b.split('.').map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(x.size, y.size)) {
            val d = x.getOrElse(i) { 0 } - y.getOrElse(i) { 0 }
            if (d != 0) return d > 0
        }
        return false
    }

    private fun updatePruefen() {
        thread {
            try {
                val c = URL(releaseApi).openConnection() as HttpURLConnection
                c.connectTimeout = 6000; c.readTimeout = 10000
                c.setRequestProperty("Accept", "application/vnd.github+json")
                c.setRequestProperty("User-Agent", "Handy-Scan")
                if (c.responseCode != 200) return@thread
                val assets = JSONObject(c.inputStream.bufferedReader().readText()).getJSONArray("assets")
                var bestV = ""; var bestUrl = ""
                for (i in 0 until assets.length()) {
                    val a = assets.getJSONObject(i)
                    val v = Regex("^Handy-Scan-([0-9.]+)\\.apk$").find(a.getString("name"))?.groupValues?.get(1) ?: continue
                    if (bestV.isEmpty() || neuer(v, bestV)) { bestV = v; bestUrl = a.getString("browser_download_url") }
                }
                if (bestV.isNotEmpty() && neuer(bestV, eigeneVersion())) {
                    updateVersion = bestV; updateUrl = bestUrl
                    runOnUiThread {
                        update.text = "Neue Version $bestV installieren"
                        update.visibility = View.VISIBLE
                    }
                }
            } catch (_: Exception) { /* kein Internet: kein Hinweis */ }
        }
    }

    private fun updateInstallieren() {
        if (!packageManager.canRequestPackageInstalls()) {
            zeige("Einmalig nötig: Im nächsten Fenster „Aus dieser Quelle zulassen“ einschalten, zurückgehen und erneut auf „Neue Version installieren“ tippen.", null)
            startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
            return
        }
        update.isEnabled = false
        update.text = "Version $updateVersion wird geladen …"
        thread {
            val datei = try {
                val ordner = File(cacheDir, "update").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
                val ziel = File(ordner, "Handy-Scan-$updateVersion.apk")
                val c = URL(updateUrl).openConnection() as HttpURLConnection
                c.instanceFollowRedirects = true
                c.connectTimeout = 10000; c.readTimeout = 60000
                c.setRequestProperty("User-Agent", "Handy-Scan")
                if (c.responseCode != 200) throw Exception("Download-Fehler ${c.responseCode}")
                c.inputStream.use { ein -> ziel.outputStream().use { ein.copyTo(it) } }
                ziel
            } catch (e: Exception) {
                runOnUiThread {
                    update.isEnabled = true; update.text = "Neue Version $updateVersion installieren"
                    zeige("Update konnte nicht geladen werden: ${e.message}", false)
                }
                null
            } ?: return@thread
            runOnUiThread {
                update.isEnabled = true; update.text = "Neue Version $updateVersion installieren"
                val uri = FileProvider.getUriForFile(this, "$packageName.dateien", datei)
                startActivity(Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                })
            }
        }
    }

    // ------------------------------------------------------------------ Einstellungen
    private fun einstellungen() {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(8), dp(20), 0) }
        val s = EditText(this).apply { setText(server); hint = "http://10.100.100.104:8765/"; inputType = InputType.TYPE_TEXT_VARIATION_URI }
        val p = EditText(this).apply { setText(pin); hint = "leer lassen"; inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD }
        val l = EditText(this).apply {
            setText(personen.joinToString("\n"))
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_WORDS
            minLines = 4
        }
        box.addView(TextView(this).apply { text = "Wer scannt (ein Name pro Zeile)" })
        box.addView(l)
        box.addView(TextView(this).apply { text = "Adresse des Büro-PCs"; setPadding(0, dp(12), 0, 0) })
        box.addView(s)
        box.addView(TextView(this).apply { text = "PIN (nur falls am PC eine vergeben ist)"; setPadding(0, dp(12), 0, 0) })
        box.addView(p)
        AlertDialog.Builder(this)
            .setTitle("Einstellungen")
            .setView(ScrollView(this).apply { addView(box) })
            .setPositiveButton("Speichern") { _, _ ->
                server = s.text.toString().trim(); pin = p.text.toString().trim()
                personen = l.text.toString().lines().map { it.trim() }.filter { it.isNotEmpty() }
                personenLaden()
            }
            .setNegativeButton("Abbrechen", null)
            .show()
    }
}
