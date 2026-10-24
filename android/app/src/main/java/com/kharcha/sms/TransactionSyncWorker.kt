package com.kharcha.sms

import android.content.Context
import android.util.Log
import androidx.work.*
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

class TransactionSyncWorker(appContext: Context, workerParams: WorkerParameters) :
    Worker(appContext, workerParams) {

    override fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences("kharcha_sms_prefs", Context.MODE_PRIVATE)
        val apiBaseUrl = prefs.getString("api_url", "https://kharcha-app.vercel.app") ?: "https://kharcha-app.vercel.app"
        val deviceToken = prefs.getString("device_token", null)

        if (deviceToken.isNullOrEmpty()) {
            Log.w("KHARCHA_SYNC", "Device token not set. Skipping sync.")
            return Result.failure()
        }

        val pending = LocalTransactionStore.getPending(applicationContext)
        if (pending.length() == 0) {
            return Result.success()
        }

        return try {
            val endpoint = "$apiBaseUrl/api/sms-transactions/sync"
            val url = URL(endpoint)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.doOutput = true
            conn.connectTimeout = 15000
            conn.readTimeout = 15000

            val payload = JSONObject().apply {
                put("deviceToken", deviceToken)
                put("transactions", pending)
            }

            OutputStreamWriter(conn.outputStream).use { writer ->
                writer.write(payload.toString())
                writer.flush()
            }

            val code = conn.responseCode
            if (code in 200..299) {
                Log.i("KHARCHA_SYNC", "Successfully synced ${pending.length()} transactions.")
                LocalTransactionStore.clearPending(applicationContext)
                prefs.edit().putLong("last_sync_time", System.currentTimeMillis()).apply()
                Result.success()
            } else {
                Log.e("KHARCHA_SYNC", "Sync failed with HTTP $code. Retrying later.")
                Result.retry()
            }
        } catch (e: Exception) {
            Log.e("KHARCHA_SYNC", "Network error during sync: ${e.message}", e)
            Result.retry()
        }
    }

    companion object {
        fun enqueueSync(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val syncRequest = OneTimeWorkRequestBuilder<TransactionSyncWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                "KharchaTransactionSync",
                ExistingWorkPolicy.REPLACE,
                syncRequest
            )
        }
    }
}
