package com.kharcha.sms

import java.util.regex.Pattern

data class ParsedTransaction(
    val amount: Double,
    val type: String, // "expense" or "income"
    val bank: String,
    val paymentMethod: String,
    val merchantOrSender: String?,
    val refNumber: String?,
    val accountLast4: String?,
    val date: String,
    val rawText: String,
    val category: String,
    val fingerprint: String
)

object BankSmsParser {

    private val EXCLUSIONS = listOf(
        Pattern.compile("\\b(otp|one time password|verification code)\\b", Pattern.CASE_INSENSITIVE),
        Pattern.compile("\\b(failed|declined|unsuccessful|rejected|cancelled)\\b", Pattern.CASE_INSENSITIVE),
        Pattern.compile("\\b(pending|in progress|initiated)\\b", Pattern.CASE_INSENSITIVE),
        Pattern.compile("\\b(apply for|pre-approved|instant loan|credit card offer)\\b", Pattern.CASE_INSENSITIVE)
    )

    private val BANK_MAP = mapOf(
        "HDFC" to "HDFC Bank",
        "SBI" to "State Bank of India",
        "ICICI" to "ICICI Bank",
        "AXIS" to "Axis Bank",
        "KOTAK" to "Kotak Mahindra Bank",
        "PNB" to "Punjab National Bank",
        "BOB" to "Bank of Baroda",
        "INDUS" to "IndusInd Bank",
        "IDFC" to "IDFC FIRST Bank",
        "YES" to "Yes Bank",
        "PAYTM" to "Paytm Payments Bank"
    )

    fun parse(smsBody: String, sender: String): ParsedTransaction? {
        val clean = smsBody.replace("\n", " ").trim()

        // 1. Exclude non-transactions
        for (p in EXCLUSIONS) {
            if (p.matcher(clean).find()) return null
        }

        // 2. Determine Bank
        var bankName = "Bank Account"
        for ((key, name) in BANK_MAP) {
            if (sender.contains(key, ignoreCase = true) || clean.contains(key, ignoreCase = true)) {
                bankName = name
                break
            }
        }

        // 3. Determine Debit vs Credit
        val isDebit = Pattern.compile("\\b(debited|spent|paid|sent|withdrawn|purchase|payment of|made to|transfer of)\\b", Pattern.CASE_INSENSITIVE).matcher(clean).find()
        val isCredit = Pattern.compile("\\b(credited|received|deposited|refunded|reversal|added to)\\b", Pattern.CASE_INSENSITIVE).matcher(clean).find()

        val type = when {
            isDebit && !isCredit -> "expense"
            isCredit && !isDebit -> "income"
            isDebit && isCredit -> if (clean.contains("debited", ignoreCase = true)) "expense" else "income"
            else -> return null
        }

        // 4. Extract Amount
        val amtPattern = Pattern.compile("(?:INR|Rs\\.?|₹)\\s*([0-9,]+(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE)
        val amtMatcher = amtPattern.matcher(clean)
        var amount: Double? = null
        while (amtMatcher.find()) {
            val start = amtMatcher.start()
            val prefix = if (start >= 15) clean.substring(start - 15, start).lowercase() else ""
            if (!prefix.contains("bal") && !prefix.contains("avl") && !prefix.contains("limit")) {
                val str = amtMatcher.group(1)?.replace(",", "")
                amount = str?.toDoubleOrNull()
                if (amount != null && amount > 0) break
            }
        }

        if (amount == null || amount <= 0) return null

        // 5. Payment Method
        val paymentMethod = when {
            Pattern.compile("\\bUPI\\b|VPA|@ok|@upi", Pattern.CASE_INSENSITIVE).matcher(clean).find() -> "UPI"
            Pattern.compile("\\bATM\\b|cash withdrawal", Pattern.CASE_INSENSITIVE).matcher(clean).find() -> "ATM"
            Pattern.compile("\\bCard\\b|ending with|credit card|debit card", Pattern.CASE_INSENSITIVE).matcher(clean).find() -> "CARD"
            Pattern.compile("\\bIMPS\\b", Pattern.CASE_INSENSITIVE).matcher(clean).find() -> "IMPS"
            Pattern.compile("\\bNEFT\\b", Pattern.CASE_INSENSITIVE).matcher(clean).find() -> "NEFT"
            else -> "OTHER"
        }

        // 6. Account last 4
        val accMatcher = Pattern.compile("(?:a/c|account|card|acct)\\s*(?:no\\.?)?\\s*(?:ending\\s*)?(?:with\\s*)?(?:x{1,}|[*]{1,})*(\\d{3,4})\\b", Pattern.CASE_INSENSITIVE).matcher(clean)
        val accountLast4 = if (accMatcher.find()) accMatcher.group(1) else null

        // 7. Merchant / Counterparty
        val merchantMatcher = Pattern.compile("(?:to|at|info/|from)\\s*([A-Za-z0-9\\s&._-]{3,30}?)(?:\\s+on|\\s+ref|\\s+upi|\\s+avl|\\s+bal|\\.|$)", Pattern.CASE_INSENSITIVE).matcher(clean)
        var merchant: String? = null
        if (merchantMatcher.find()) {
            val candidate = merchantMatcher.group(1)?.trim()
            if (candidate != null && !candidate.matches(Regex("(?i)^(account|your|bank|my|the|inr|rs|upi|ref)$"))) {
                merchant = candidate
            }
        }

        // 8. Reference number
        val refMatcher = Pattern.compile("(?:ref\\s*(?:no\\.?)?|utr\\s*(?:no\\.?)?|rrn\\s*|txn\\s*id|ref\\s*:)\\s*([A-Za-z0-9]{6,22})", Pattern.CASE_INSENSITIVE).matcher(clean)
        val refNumber = if (refMatcher.find()) refMatcher.group(1) else null

        // 9. Category derivation
        val category = deduceCategory(merchant, type, clean)

        // 10. Fingerprint
        val fingerprint = if (refNumber != null) {
            "fp_${bankName.replace(" ", "_")}_$refNumber".lowercase()
        } else {
            "fp_${bankName.replace(" ", "_")}_${amount}_${type}_${accountLast4 ?: "na"}".lowercase()
        }

        val dateIso = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
            timeZone = java.util.TimeZone.getTimeZone("UTC")
        }.format(java.util.Date())

        return ParsedTransaction(
            amount = amount,
            type = type,
            bank = bankName,
            paymentMethod = paymentMethod,
            merchantOrSender = merchant,
            refNumber = refNumber,
            accountLast4 = accountLast4,
            date = dateIso,
            rawText = clean,
            category = category,
            fingerprint = fingerprint
        )
    }

    private fun deduceCategory(merchant: String?, type: String, text: String): String {
        if (type == "income") return if (text.contains("salary", ignoreCase = true)) "salary" else "other_inc"

        val combined = "${merchant ?: ""} $text".lowercase()
        return when {
            combined.contains("swiggy") || combined.contains("zomato") || combined.contains("food") || combined.contains("restaurant") || combined.contains("cafe") -> "food"
            combined.contains("uber") || combined.contains("ola") || combined.contains("rapido") || combined.contains("metro") || combined.contains("irctc") -> "travel"
            combined.contains("petrol") || combined.contains("fuel") || combined.contains("hpcl") || combined.contains("bpcl") || combined.contains("iocl") -> "fuel"
            combined.contains("amazon") || combined.contains("flipkart") || combined.contains("myntra") || combined.contains("zepto") || combined.contains("blinkit") -> "shopping"
            combined.contains("airtel") || combined.contains("jio") || combined.contains("bescom") || combined.contains("electricity") || combined.contains("netflix") -> "bills"
            else -> "food"
        }
    }
}
