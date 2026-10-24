package com.kharcha.sms

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object LocalTransactionStore {
    private const val PREFS_NAME = "kharcha_offline_store"
    private const val KEY_PENDING_TX = "pending_transactions"

    @Synchronized
    fun savePending(context: Context, tx: ParsedTransaction) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_PENDING_TX, "[]")
        val array = JSONArray(raw)

        val obj = JSONObject().apply {
            put("amount", tx.amount)
            put("type", tx.type)
            put("bank", tx.bank)
            put("paymentMethod", tx.paymentMethod)
            put("merchantOrSender", tx.merchantOrSender ?: JSONObject.NULL)
            put("refNumber", tx.refNumber ?: JSONObject.NULL)
            put("accountLast4", tx.accountLast4 ?: JSONObject.NULL)
            put("date", tx.date)
            put("rawText", tx.rawText)
            put("category", tx.category)
            put("fingerprint", tx.fingerprint)
        }

        array.put(obj)
        prefs.edit().putString(KEY_PENDING_TX, array.toString()).apply()
    }

    @Synchronized
    fun getPending(context: Context): JSONArray {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return JSONArray(prefs.getString(KEY_PENDING_TX, "[]"))
    }

    @Synchronized
    fun clearPending(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_PENDING_TX, "[]").apply()
    }

    @Synchronized
    fun clearAll(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().clear().apply()
    }
}
