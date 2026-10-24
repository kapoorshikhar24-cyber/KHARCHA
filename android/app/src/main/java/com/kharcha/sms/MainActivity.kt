package com.kharcha.sms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {

    private val PERMISSION_REQUEST_CODE = 101

    private lateinit var tvStatus: TextView
    private lateinit var etPairingCode: EditText
    private lateinit var etServerUrl: EditText
    private lateinit var btnPair: Button
    private lateinit var swTracking: Switch
    private lateinit var btnSyncNow: Button
    private lateinit var btnTestSms: Button
    private lateinit var btnClearLocal: Button
    private lateinit var tvQueueCount: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Simple programmatic layout
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 60, 40, 40)
        }

        val tvTitle = TextView(this).apply {
            text = "KHARCHA Bank SMS Tracker"
            textSize = 22f
            setTypeface(null, android.graphics.Typeface.BOLD)
        }
        root.addView(tvTitle)

        val tvSub = TextView(this).apply {
            text = "Automatic UPI & Bank Expense Detection Companion"
            textSize = 13f
            setPadding(0, 8, 0, 24)
        }
        root.addView(tvSub)

        tvStatus = TextView(this).apply {
            text = "Status: Checking permissions..."
            textSize = 14f
            setPadding(0, 0, 0, 16)
        }
        root.addView(tvStatus)

        etServerUrl = EditText(this).apply {
            hint = "Backend URL (e.g. https://your-kharcha.vercel.app)"
            textSize = 13f
        }
        root.addView(etServerUrl)

        etPairingCode = EditText(this).apply {
            hint = "Enter 6-digit Pairing Code from Web"
            textSize = 14f
        }
        root.addView(etPairingCode)

        btnPair = Button(this).apply {
            text = "Link with Web Dashboard"
        }
        root.addView(btnPair)

        swTracking = Switch(this).apply {
            text = "Enable Auto SMS Detection"
            isChecked = true
            setPadding(0, 20, 0, 20)
        }
        root.addView(swTracking)

        tvQueueCount = TextView(this).apply {
            text = "Pending Offline Records: 0"
            setPadding(0, 10, 0, 16)
        }
        root.addView(tvQueueCount)

        btnSyncNow = Button(this).apply {
            text = "Force Sync to Cloud"
        }
        root.addView(btnSyncNow)

        btnTestSms = Button(this).apply {
            text = "Simulate Bank SMS (Test)"
        }
        root.addView(btnTestSms)

        btnClearLocal = Button(this).apply {
            text = "Clear Local Data & Disconnect"
        }
        root.addView(btnClearLocal)

        setContentView(root)

        loadSettings()
        checkPermissions()
        setupListeners()
    }

    private fun loadSettings() {
        val prefs = getSharedPreferences("kharcha_sms_prefs", Context.MODE_PRIVATE)
        val server = prefs.getString("api_url", "http://10.0.2.2:3000") // 10.0.2.2 is localhost in Android emulator
        etServerUrl.setText(server)
        swTracking.isChecked = prefs.getBoolean("tracking_enabled", true)

        val token = prefs.getString("device_token", null)
        if (!token.isNullOrEmpty()) {
            tvStatus.text = "Status: 🟢 Connected & Paired"
            btnPair.text = "Re-pair Device"
        } else {
            tvStatus.text = "Status: ⚪ Not Paired (Enter code from Web)"
        }
        updateQueueDisplay()
    }

    private fun updateQueueDisplay() {
        val pending = LocalTransactionStore.getPending(this)
        tvQueueCount.text = "Pending Offline Records: ${pending.length()}"
    }

    private fun setupListeners() {
        swTracking.setOnCheckedChangeListener { _, isChecked ->
            getSharedPreferences("kharcha_sms_prefs", Context.MODE_PRIVATE)
                .edit().putBoolean("tracking_enabled", isChecked).apply()
            Toast.makeText(this, if (isChecked) "Tracking resumed" else "Tracking paused", Toast.LENGTH_SHORT).show()
        }

        btnPair.setOnClickListener {
            val code = etPairingCode.text.toString().trim()
            val url = etServerUrl.text.toString().trim()
            if (code.length != 6) {
                Toast.makeText(this, "Please enter a valid 6-digit code", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            performPairing(url, code)
        }

        btnSyncNow.setOnClickListener {
            TransactionSyncWorker.enqueueSync(this)
            Toast.makeText(this, "Sync task queued", Toast.LENGTH_SHORT).show()
            updateQueueDisplay()
        }

        btnTestSms.setOnClickListener {
            val testSms = "INR 250.00 debited from A/c **9988 on 24-OCT-26 to STARBUCKS via UPI. Ref: 982019283019."
            val parsed = BankSmsParser.parse(testSms, "VM-HDFCBK")
            if (parsed != null) {
                LocalTransactionStore.savePending(this, parsed)
                TransactionSyncWorker.enqueueSync(this)
                updateQueueDisplay()
                Toast.makeText(this, "Test transaction queued: ₹${parsed.amount} at ${parsed.merchantOrSender}", Toast.LENGTH_LONG).show()
            }
        }

        btnClearLocal.setOnClickListener {
            LocalTransactionStore.clearAll(this)
            getSharedPreferences("kharcha_sms_prefs", Context.MODE_PRIVATE).edit().clear().apply()
            loadSettings()
            Toast.makeText(this, "Local storage cleared and disconnected", Toast.LENGTH_SHORT).show()
        }
    }

    private fun performPairing(baseUrl: String, pairingCode: String) {
        thread {
            try {
                val endpoint = "$baseUrl/api/sms-transactions/pair"
                val url = URL(endpoint)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true

                val payload = JSONObject().apply {
                    put("pairingCode", pairingCode)
                    put("deviceName", android.os.Build.MODEL ?: "Android Phone")
                }

                OutputStreamWriter(conn.outputStream).use { it.write(payload.toString()) }

                val code = conn.responseCode
                if (code in 200..299) {
                    val resp = conn.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(resp)
                    val token = json.getString("deviceToken")

                    getSharedPreferences("kharcha_sms_prefs", Context.MODE_PRIVATE).edit()
                        .putString("api_url", baseUrl)
                        .putString("device_token", token)
                        .apply()

                    runOnUiThread {
                        loadSettings()
                        Toast.makeText(this, "Paired successfully with KHARCHA!", Toast.LENGTH_LONG).show()
                    }
                } else {
                    runOnUiThread {
                        Toast.makeText(this, "Pairing failed (Code $code). Check code and URL.", Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun checkPermissions() {
        val permissions = arrayOf(
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS
        )
        val needed = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (needed.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toTypedArray(), PERMISSION_REQUEST_CODE)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSION_REQUEST_CODE) {
            val allGranted = grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            if (!allGranted) {
                Toast.makeText(this, "SMS permissions are required to detect transactions automatically", Toast.LENGTH_LONG).show()
            }
        }
    }
}
