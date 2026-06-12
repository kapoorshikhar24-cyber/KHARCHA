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
  food: ["lunch", "dinner", "breakfast", "swiggy", "zomato", "pizza", "coffee", "restaurant", "burger"],
  travel: ["uber", "ola", "auto", "taxi", "flight", "train", "metro", "bus"],
  fuel: ["petrol", "diesel", "cng", "fuel", "gas"],
  shopping: ["amazon", "flipkart", "myntra", "clothes", "mall", "shoes"],
  bills: ["rent", "electricity", "water", "internet", "wifi", "netflix", "spotify", "mobile", "recharge"],
};

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
