/**
 * lib/bankSmsParser.ts
 * Configurable, high-precision Bank SMS parsing engine for Indian banking & UPI transactions.
 * Supports: HDFC, SBI, ICICI, Axis, Kotak, PNB, BoB, IndusInd, IDFC, Yes Bank, Canara, UPI, etc.
 */

export interface ParsedBankTransaction {
  amount: number;
  type: "expense" | "income";
  bank: string;
  paymentMethod: "UPI" | "CARD" | "IMPS" | "NEFT" | "ATM" | "NETBANKING" | "OTHER";
  merchantOrSender: string | null;
  refNumber: string | null;
  accountLast4: string | null;
  date: string; // ISO date string
  rawText?: string;
  category: string;
  isCompleted: boolean;
  fingerprint: string;
}

// ── Bank Identifier Patterns ───────────────────────────────────────────────
interface BankPattern {
  name: string;
  senderRegex: RegExp;
  bodyRegex?: RegExp;
}

const BANK_PATTERNS: BankPattern[] = [
  { name: "HDFC Bank", senderRegex: /HDFC/i, bodyRegex: /HDFC\s*Bank/i },
  { name: "State Bank of India", senderRegex: /SBI|SBIINB/i, bodyRegex: /State\s*Bank\s*of\s*India|SBI/i },
  { name: "ICICI Bank", senderRegex: /ICICI/i, bodyRegex: /ICICI\s*Bank/i },
  { name: "Axis Bank", senderRegex: /AXIS/i, bodyRegex: /Axis\s*Bank/i },
  { name: "Kotak Mahindra Bank", senderRegex: /KOTAK/i, bodyRegex: /Kotak\s*Bank|Kotak/i },
  { name: "Punjab National Bank", senderRegex: /PNB/i, bodyRegex: /PNB|Punjab\s*National\s*Bank/i },
  { name: "Bank of Baroda", senderRegex: /BOB|BARODA/i, bodyRegex: /Bank\s*of\s*Baroda|BOB/i },
  { name: "IndusInd Bank", senderRegex: /INDUS/i, bodyRegex: /IndusInd\s*Bank/i },
  { name: "IDFC FIRST Bank", senderRegex: /IDFC/i, bodyRegex: /IDFC\s*FIRST/i },
  { name: "Yes Bank", senderRegex: /YES/i, bodyRegex: /Yes\s*Bank/i },
  { name: "Paytm Payments Bank", senderRegex: /PAYTM/i, bodyRegex: /Paytm\s*Bank|Paytm/i },
  { name: "Canara Bank", senderRegex: /CANARA/i, bodyRegex: /Canara\s*Bank/i },
  { name: "Federal Bank", senderRegex: /FED/i, bodyRegex: /Federal\s*Bank/i },
  { name: "Union Bank of India", senderRegex: /UBI|UNION/i, bodyRegex: /Union\s*Bank/i },
];

// ── Exclusion Patterns (Non-completed / Spam / OTP / Loans) ─────────────────
const EXCLUSION_PATTERNS = [
  /\b(otp|one time password|verification code|secret code)\b/i,
  /\b(failed|declined|unsuccessful|rejected|cancelled|could not be processed)\b/i,
  /\b(pending|in progress|initiated)\b/i,
  /\b(apply for|pre-approved|instant loan|credit card offer|congratulations you are eligible)\b/i,
  /\b(claim reward|win exciting|scratch card|cashback offer)\b/i,
  /\b(statement for the period|e-statement)\b/i,
  /\b(payment reminder|due date is|bill generated)\b/i,
];

// ── Merchant / Category Mapping ─────────────────────────────────────────────
const MERCHANT_CATEGORY_MAP: Record<string, string[]> = {
  food: [
    "swiggy", "zomato", "mcdonald", "kfc", "domino", "pizza", "starbucks", "burger king",
    "subway", "chai point", "chaayos", "haldiram", "barbeque nation", "cafe", "restaurant",
    "eatclub", "behrouz", "faasos", "freshmenu", "sweet", "baker", "dhaba"
  ],
  travel: [
    "uber", "ola", "rapido", "irctc", "makemytrip", "goibibo", "easemytrip", "redbus",
    "yatra", "indigo", "air india", "vistara", "spicejet", "akasa", "metro", "railway",
    "fastag", "toll", "parking", "ixigo", "abhibus"
  ],
  fuel: [
    "petrol", "diesel", "fuel", "hpcl", "bpcl", "iocl", "indian oil", "bharat petroleum",
    "hindustan petroleum", "shell", "cng", "auto lpg"
  ],
  shopping: [
    "amazon", "flipkart", "myntra", "ajio", "nykaa", "meesho", "zara", "h&m", "uniqlo",
    "croma", "reliance digital", "vijay sales", "tata cliq", "decathlon", "lifestyle",
    "shoppers stop", "westside", "marks and spencer", "max fashion"
  ],
  bills: [
    "bescom", "tneb", "mseb", "tatapower", "electricity", "bijli", "airtel", "jio", "vodafone",
    "idea", "vi", "actcorp", "broadband", "wifi", "netflix", "spotify", "hotstar", "prime video",
    "dth", "tata sky", "dishtv", "cylinder", "indane", "hp gas", "bharat gas", "water board", "rent",
    "apollo", "pharmeasy", "1mg", "netmeds", "hospital", "clinic", "pathology", "diagnostic"
  ],
  lodging: [
    "hotel", "oyo", "airbnb", "treebo", "fabhotel", "resort", "taj", "marriott", "hyatt"
  ],
};

/**
 * Generate cryptographic or deterministic fingerprint for deduplication
 */
function generateFingerprint(bank: string, amount: number, type: string, refNumber: string | null, accountLast4: string | null, dateStr: string): string {
  if (refNumber && refNumber.length >= 6) {
    return `fp_${bank.replace(/\s+/g, "_")}_${refNumber}`.toLowerCase();
  }
  // Fallback bucketed by date (day)
  const dayKey = dateStr.slice(0, 10);
  return `fp_${bank.replace(/\s+/g, "_")}_${amount}_${type}_${accountLast4 || "na"}_${dayKey}`.toLowerCase();
}

/**
 * Categorize transaction based on merchant name and transaction context
 */
function deduceCategory(merchant: string | null, type: "expense" | "income", note: string): string {
  if (type === "income") {
    if (/salary|payroll|wages/i.test(note)) return "salary";
    if (/dividend|interest|mutual fund|sip|zerodha|groww/i.test(note)) return "investments";
    if (/freelance|client|consulting|upwork/i.test(note)) return "freelance";
    return "other_inc";
  }

  const combined = `${merchant || ""} ${note}`.toLowerCase();

  for (const [catId, keywords] of Object.entries(MERCHANT_CATEGORY_MAP)) {
    for (const kw of keywords) {
      if (combined.includes(kw)) {
        return catId;
      }
    }
  }

  // Default fallbacks
  if (/grocery|supermarket|kirana|zepto|blinkit|instamart|bigbasket|dmart/i.test(combined)) {
    return "shopping";
  }
  if (/fuel|petrol|pump/i.test(combined)) return "fuel";
  if (/travel|ticket|flight|cab|ride/i.test(combined)) return "travel";
  if (/food|dine|eating|snack|tea|coffee/i.test(combined)) return "food";
  if (/bill|recharge|utility|rent|insurance/i.test(combined)) return "bills";

  return "food"; // Default common KHARCHA category
}

/**
 * Parse a Bank SMS body and optional sender ID into structured transaction data
 */
export function parseBankSms(smsBody: string, senderAddress = ""): ParsedBankTransaction | null {
  if (!smsBody || smsBody.trim().length === 0) return null;

  const cleanBody = smsBody.replace(/\r?\n/g, " ").trim();

  // 1. Check exclusion patterns (Failed, OTP, Marketing, Incomplete)
  for (const pattern of EXCLUSION_PATTERNS) {
    if (pattern.test(cleanBody)) {
      return null;
    }
  }

  // 2. Identify Bank Name
  let detectedBank = "Bank Account";
  for (const b of BANK_PATTERNS) {
    if (senderAddress && b.senderRegex.test(senderAddress)) {
      detectedBank = b.name;
      break;
    }
    if (b.bodyRegex && b.bodyRegex.test(cleanBody)) {
      detectedBank = b.name;
      break;
    }
  }

  // 3. Determine Direction: Expense (Debit) vs Income (Credit)
  const isDebit = /\b(debited|spent|paid|sent|withdrawn|purchase|deducted|dr|transferred to|payment of|payment to|made to|txn of|transfer of)\b/i.test(cleanBody);
  const isCredit = /\b(credited|received|deposited|refunded|reversal|cr|transferred from|added to)\b/i.test(cleanBody);

  // If neither or both, check precise phrases
  let txType: "expense" | "income" = "expense";
  if (isDebit && !isCredit) {
    txType = "expense";
  } else if (isCredit && !isDebit) {
    txType = "income";
  } else if (isDebit && isCredit) {
    // Conflict resolution: e.g. "debited for ... will be credited"
    if (/\bdebited by|account has been debited|paid to|spent on|payment of/i.test(cleanBody)) {
      txType = "expense";
    } else if (/\bcredited with|account has been credited/i.test(cleanBody)) {
      txType = "income";
    } else {
      return null; // Ambiguous message
    }
  } else {
    // Not a financial transaction SMS
    return null;
  }

  // 4. Extract Amount
  // Matches "INR 500.00", "Rs. 250", "Rs 1,500.50", "INR30.00"
  // Avoiding "Bal: Rs 15,000" or "Balance INR 10,000"
  const amountRegexes = [
    /(?:debited|credited|spent|paid|payment of|withdrawn|received|amount|for|with)\s*(?:by|of|with)?\s*(?:INR|Rs\.?|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /(?:INR|Rs\.?|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:debited|credited|spent|paid|withdrawn|received|made)/i,
    /(?:INR|Rs\.?|₹)\.?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
  ];

  let rawAmountStr: string | null = null;
  for (const regex of amountRegexes) {
    const match = cleanBody.match(regex);
    if (match && match[1]) {
      // Ensure we don't accidentally pick up balance
      const matchIndex = match.index || 0;
      const precedingText = cleanBody.slice(Math.max(0, matchIndex - 15), matchIndex).toLowerCase();
      if (!precedingText.includes("bal") && !precedingText.includes("avl") && !precedingText.includes("limit")) {
        rawAmountStr = match[1];
        break;
      }
    }
  }

  if (!rawAmountStr) return null;
  const amount = parseFloat(rawAmountStr.replace(/,/g, ""));
  if (isNaN(amount) || amount <= 0) return null;

  // 5. Payment Method
  let paymentMethod: ParsedBankTransaction["paymentMethod"] = "OTHER";
  if (/\bUPI\b|VPA|@ok|@upi|@paytm|@axis|@icici|@sbi/i.test(cleanBody)) {
    paymentMethod = "UPI";
  } else if (/\bATM\b|cash withdrawal/i.test(cleanBody)) {
    paymentMethod = "ATM";
  } else if (/\bcard\b|ending with\s*\d{4}|credit card|debit card/i.test(cleanBody)) {
    paymentMethod = "CARD";
  } else if (/\bIMPS\b/i.test(cleanBody)) {
    paymentMethod = "IMPS";
  } else if (/\bNEFT\b/i.test(cleanBody)) {
    paymentMethod = "NEFT";
  } else if (/\bNetbanking|Internet Banking\b/i.test(cleanBody)) {
    paymentMethod = "NETBANKING";
  }

  // 6. Account Identifier (Last 4 digits)
  const accMatch = cleanBody.match(/(?:a\/c|account|card|acct|ac)\s*(?:no\.?)?\s*(?:ending\s*)?(?:with\s*)?(?:x{1,}|[*]{1,})*(\d{3,4})\b/i);
  const accountLast4 = accMatch ? accMatch[1] : null;

  // 7. Merchant / Counterparty
  let merchant: string | null = null;
  const merchantPatterns = [
    /(?:to|at|info\/)\s*([A-Za-z0-9\s&._-]{3,30}?)(?:\s+on|\s+ref|\s+upi|\s+avl|\s+bal|\s+via|\.|$)/i,
    /VPA\s+([a-zA-Z0-9._-]+@[a-zA-Z0-9]+)/i,
    /(?:from)\s*([A-Za-z0-9\s&._-]{3,30}?)(?:\s+on|\s+ref|\s+upi|\s+avl|\s+bal|\.|$)/i,
  ];

  for (const mPat of merchantPatterns) {
    const mMatch = cleanBody.match(mPat);
    if (mMatch && mMatch[1]) {
      const candidate = mMatch[1].trim();
      // Exclude generic noise words
      if (!/^(account|your|bank|my|the|inr|rs|upi|ref|imps|neft)$/i.test(candidate)) {
        merchant = candidate;
        break;
      }
    }
  }

  // 8. Reference Number / UTR / Transaction ID
  const refMatch = cleanBody.match(/(?:ref\s*(?:no\.?|num\.?)?|utr\s*(?:no\.?)?|rrn\s*|txn\s*(?:id|no\.?)?|ref\s*:)\s*([A-Za-z0-9]{6,22})/i);
  const refNumber = refMatch ? refMatch[1] : null;

  // 9. Timestamp
  const now = new Date();
  const dateStr = now.toISOString();

  // 10. Categorization
  const category = deduceCategory(merchant, txType, cleanBody);

  // 11. Deterministic Fingerprint
  const fingerprint = generateFingerprint(detectedBank, amount, txType, refNumber, accountLast4, dateStr);

  return {
    amount,
    type: txType,
    bank: detectedBank,
    paymentMethod,
    merchantOrSender: merchant,
    refNumber,
    accountLast4,
    date: dateStr,
    rawText: cleanBody,
    category,
    isCompleted: true,
    fingerprint,
  };
}
