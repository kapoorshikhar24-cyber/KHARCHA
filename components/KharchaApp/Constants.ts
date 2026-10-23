import { Category, Settings, Wallet } from "./Types";

export const CATEGORIES: Category[] = [
  { id: "food",     label: "Food",     icon: "food",     color: "#EF9F27", bg: "var(--token-surfaceElevated)", type: "expense" },
  { id: "travel",   label: "Travel",   icon: "travel",   color: "#378ADD", bg: "var(--token-surfaceElevated)", type: "expense" },
  { id: "fuel",     label: "Fuel",     icon: "fuel",     color: "#D85A30", bg: "var(--token-surfaceElevated)", type: "expense" },
  { id: "shopping", label: "Shopping", icon: "shopping", color: "#7F77DD", bg: "var(--token-surfaceElevated)", type: "expense" },
  { id: "lodging",  label: "Lodging",  icon: "lodging",  color: "#1D9E75", bg: "var(--token-surfaceElevated)", type: "expense" },
  { id: "bills",    label: "Bills",    icon: "bills",    color: "#639922", bg: "var(--token-surfaceElevated)", type: "expense" },
];

export const INCOME_CATEGORIES: Category[] = [
  { id: "salary",      label: "Salary",      icon: "💵", color: "#1D9E75", bg: "var(--token-surfaceElevated)", type: "income" },
  { id: "freelance",   label: "Freelance",   icon: "💻", color: "#378ADD", bg: "var(--token-surfaceElevated)", type: "income" },
  { id: "investments", label: "Investments", icon: "📈", color: "#7F77DD", bg: "var(--token-surfaceElevated)", type: "income" },
  { id: "other_inc",   label: "Other",       icon: "📦", color: "#EF9F27", bg: "var(--token-surfaceElevated)", type: "income" },
];

export const WALLETS: Wallet[] = [
  { id: "cash", label: "Cash", icon: "💵", color: "#1D9E75" },
  { id: "bank", label: "Bank", icon: "🏦", color: "#378ADD" },
  { id: "upi",  label: "UPI",  icon: "📱", color: "#7F77DD" },
];

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
<<<<<<< HEAD
  food: [
    "lunch", "dinner", "breakfast", "swiggy", "zomato", "pizza", "coffee", "restaurant", "burger",
    "doodh", "milk", "chai", "tea", "kirana", "ration", "grocery", "groceries", "sabzi", "roti",
    "nashta", "snack", "snacks", "cafe", "mcdonalds", "kfc", "dominos", "starbucks", "ice cream",
    "paneer", "fruits", "juice", "biryani", "dal", "chawal", "maggi", "sweets", "mithai"
  ],
  travel: [
    "uber", "ola", "auto", "taxi", "flight", "train", "metro", "bus", "rickshaw", "rapido",
    "ticket", "toll", "fastag", "parking", "indigo", "air india"
  ],
  fuel: [
    "petrol", "diesel", "cng", "fuel", "gas", "shell", "hp", "indian oil", "bharat petroleum"
  ],
  shopping: [
    "amazon", "flipkart", "myntra", "clothes", "mall", "shoes", "kapde", "ajio", "zara", "h&m",
    "electronics", "gadget", "watch", "makeup", "beauty", "cosmetics", "shopping", "gift"
  ],
  bills: [
    "rent", "electricity", "bijli", "water", "paani", "internet", "wifi", "broadband", "netflix",
    "spotify", "mobile", "recharge", "dth", "cylinder", "lpg", "maintenance", "newspaper", "maid",
    "cook", "bill", "gym", "membership", "medicine", "dawa", "doctor", "hospital", "chemist", "pharmacy"
  ],
  lodging: [
    "hotel", "oyo", "airbnb", "hostel", "resort", "stay", "room"
  ],
  salary: [
    "salary", "paycheck", "wages", "bonus", "stipend"
  ],
  freelance: [
    "freelance", "client", "gig", "contract", "project", "upwork", "fiverr", "consulting"
  ],
  investments: [
    "dividend", "interest", "stock", "stocks", "mutual fund", "sip", "crypto", "trading", "profit", "returns"
  ],
  other_inc: [
    "cashback", "refund", "gift", "reward", "prize", "won"
  ]
};

export const INCOME_KEYWORDS = [
  "received", "got", "credited", "earned", "salary", "bonus", "freelance",
  "cashback", "refund", "dividend", "interest", "income", "incoming", "payment received"
];

=======
  food: ["lunch", "dinner", "breakfast", "swiggy", "zomato", "pizza", "coffee", "restaurant", "burger"],
  travel: ["uber", "ola", "auto", "taxi", "flight", "train", "metro", "bus"],
  fuel: ["petrol", "diesel", "cng", "fuel", "gas"],
  shopping: ["amazon", "flipkart", "myntra", "clothes", "mall", "shoes"],
  bills: ["rent", "electricity", "water", "internet", "wifi", "netflix", "spotify", "mobile", "recharge"],
};

>>>>>>> dcecaefb7235f17b8f7f68a8b2e5e0cdfd5f8706
export const AMOUNT_PRESETS = [50, 100, 200, 500, 1000];

export const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export const STORAGE_KEYS = {
  EXPENSES: "kharcha_expenses",
  SETTINGS: "kharcha_settings",
  // Multi-user keys (global, not per-user)
  USERS: "kharcha_users",
  ACTIVE_USER: "kharcha_active_user",
};

export const getUserStorageKeys = (userId: string) => ({
  EXPENSES: `kharcha_user_${userId}_expenses`,
  SETTINGS: `kharcha_user_${userId}_settings`,
});

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  biometric: true,
  pin: true,
  pinCode: "1234",
  voice: true,
  haptic: true,
  offline: true,
  dailyBudget: 2000,
  monthlyBudget: 50000,
  userName: "User",
  userEmail: "",
  wallets: WALLETS,
  defaultWalletId: "cash",
  currency: "₹",
};
