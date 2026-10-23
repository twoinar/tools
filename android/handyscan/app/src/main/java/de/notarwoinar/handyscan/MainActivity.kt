package de.notarwoinar.handyscan

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlin.concurrent.thread

// Handy-Scan als App: Google-Dokumentenscanner (läuft auf dem Handy, ohne Cloud) erkennt und
// schneidet die Seiten zu; das fertige PDF geht an den Handy-Scan-Server auf dem Büro-PC, der es
// als <Basisordner>\<Vorgangsnummer> <Bezeichnung>.pdf ablegt.
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
    private var art = ""

    private val prefs by lazy { getSharedPreferences("handyscan", Context.MODE_PRIVATE) }
    private var server: String
        get() = prefs.getString("server", "http://10.100.100.104:8765/") ?: ""
        set(v) = prefs.edit().putString("server", v).apply()
    private var pin: String
        get() = prefs.getString("pin", "") ?: ""
        set(v) = prefs.edit().putString("pin", v).apply()

    private val scanner = registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { r ->
        if (r.resultCode != Activity.RESULT_OK) { zeige("Scan abgebrochen.", false); return@registerForActivityResult }
        val ergebnis = GmsDocumentScanningResult.fromActivityResultIntent(r.data)
        val pdf = ergebnis?.pdf
        if (pdf == null) { zeige("Kein PDF vom Scanner erhalten.", false); return@registerForActivityResult }
        hochladen(pdf.uri, pdf.pageCount)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(oberflaeche())
        aktualisieren()
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
            text = "Dokument scannen und am Büro-PC ablegen. Nur im Büro-WLAN."
            alpha = 0.7f
        })

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

        spalte.addView(TextView(this).apply {
            text = "Der Scanner erkennt das Blatt selbst, schneidet zu und richtet es gerade. " +
                "Mehrere Seiten nacheinander aufnehmen, dann „Fertig“. Die Bilder werden nur auf dem Handy " +
                "verarbeitet und nach dem Ablegen gelöscht."
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
        scannen.isEnabled = nummer().isNotEmpty()
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
    private fun hochladen(uri: Uri, seiten: Int) {
        val n = nummer(); val b = bezeichnung()
        zeige("$seiten Seite(n) – wird am Büro-PC abgelegt …", null)
        scannen.isEnabled = false
        thread {
            val ergebnis = try {
                val daten = contentResolver.openInputStream(uri)!!.use { it.readBytes() }
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
            } finally {
                // Scan-Dateien nicht auf dem Handy liegen lassen
                try { uri.path?.let { File(it).takeIf { f -> f.exists() }?.delete() } } catch (_: Exception) {}
                try { cacheDir.listFiles()?.forEach { if (it.name.endsWith(".pdf") || it.name.endsWith(".jpg")) it.delete() } } catch (_: Exception) {}
            }
            runOnUiThread {
                scannen.isEnabled = true
                val (code, text, fehler) = ergebnis
                when {
                    fehler != null -> zeige("Nicht abgelegt: Der Büro-PC antwortet nicht. Ist das Handy im Büro-WLAN und läuft Handy-Scan am PC?\n($fehler)", false)
                    code == 403 -> { zeige("PIN falsch oder fehlt. Bitte unter ⚙ die PIN eintragen und erneut scannen.", false); einstellungen() }
                    code in 200..299 -> {
                        val datei = Regex("\"datei\"\\s*:\\s*\"([^\"]*)\"").find(text)?.groupValues?.get(1) ?: "PDF"
                        zeige("✓ Abgelegt: $datei", true)
                        bez.setText(""); art = ""
                        for (i in 0 until chips.childCount) (chips.getChildAt(i) as Chip).isChecked = false
                    }
                    else -> {
                        val msg = Regex("\"fehler\"\\s*:\\s*\"([^\"]*)\"").find(text)?.groupValues?.get(1) ?: "Fehler $code"
                        zeige("Nicht abgelegt: $msg", false)
                    }
                }
            }
        }
    }

    // ------------------------------------------------------------------ Einstellungen
    private fun einstellungen() {
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(8), dp(20), 0) }
        val s = EditText(this).apply { setText(server); hint = "http://10.100.100.104:8765/"; inputType = InputType.TYPE_TEXT_VARIATION_URI }
        val p = EditText(this).apply { setText(pin); hint = "PIN"; inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD }
        box.addView(TextView(this).apply { text = "Adresse des Büro-PCs" })
        box.addView(s)
        box.addView(TextView(this).apply { text = "PIN"; setPadding(0, dp(12), 0, 0) })
        box.addView(p)
        AlertDialog.Builder(this)
            .setTitle("Einstellungen")
            .setView(box)
            .setPositiveButton("Speichern") { _, _ -> server = s.text.toString().trim(); pin = p.text.toString().trim() }
            .setNegativeButton("Abbrechen", null)
            .show()
    }
}
