package com.kharcha.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val prefs = context.getSharedPreferences("kharcha_sms_prefs", Context.MODE_PRIVATE)
        val isTrackingEnabled = prefs.getBoolean("tracking_enabled", true)
        if (!isTrackingEnabled) {
            Log.d("KHARCHA_SMS", "Tracking paused by user. Skipping SMS.")
            return
        }

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return

        for (sms in messages) {
            val sender = sms.displayOriginatingAddress ?: ""
            val body = sms.displayMessageBody ?: ""

            // Quick preliminary filter: Indian bank SMS sender codes usually contain BK, NB, SM, or bank acronym
            val isPotentialBankSender = sender.matches(Regex("(?i)^[A-Z]{2}-[A-Z0-9]{5,9}$")) ||
                    listOf("HDFC", "SBI", "ICICI", "AXIS", "KOTAK", "PNB", "BOB", "INDUS", "IDFC", "PAYTM").any { sender.contains(it, ignoreCase = true) }

            if (!isPotentialBankSender && !body.contains("INR", ignoreCase = true) && !body.contains("Rs", ignoreCase = true)) {
                // Ignore general personal chat / promotional SMS
                continue
            }

            val parsed = BankSmsParser.parse(body, sender)
            if (parsed != null) {
                Log.i("KHARCHA_SMS", "Detected transaction: ₹${parsed.amount} (${parsed.type}) at ${parsed.bank}")

                // Save locally to offline queue
                LocalTransactionStore.savePending(context, parsed)

                // Trigger background synchronization worker
                TransactionSyncWorker.enqueueSync(context)
            }
        }
    }
}
