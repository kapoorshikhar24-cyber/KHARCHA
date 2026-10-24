package com.kharcha.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            // Re-arm background sync when device boots
            TransactionSyncWorker.enqueueSync(context)
        }
    }
}
