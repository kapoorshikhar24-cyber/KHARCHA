export type ScreenName = "lock" | "cat" | "amt" | "dash" | "hist" | "set" | "manage_cats" | "change_pin" | "registry" | "reports" | "subscriptions" | "manage_wallets" | "user_select" | "user_manage" | "budget_goals" | "monthly_breakdown";
export type PeriodName = "today" | "week" | "month";
export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface Category {
  id: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
  defaultAmount?: number;
  type?: "expense" | "income";
}

export interface Wallet {
  id: string;
  label: string;
  icon: string;
  color: string;
  initialBalance?: number;
}

export interface BudgetGoal {
  categoryId: string;
  limit: number; // monthly cap in local currency
}

export interface Expense {
  id: string;
  category: string;
  amount: number;
  note: string;
  createdAt: string;
  type?: "expense" | "income";
  walletId?: string;
  isRecurring?: boolean;
  frequency?: RecurrenceFrequency;
}

export interface Settings {
  theme?: "dark" | "light";
  accentColor?: string;
  biometric: boolean;
  pin: boolean;
  pinCode: string; // 4-digit PIN
  voice: boolean;
  haptic: boolean;
  offline: boolean;
  dailyBudget: number;
  monthlyBudget: number;
  layoutMode?: "mobile" | "desktop";
  userName: string;
  userEmail: string;
  profileImage?: string;
  customCategories?: Category[];
  wallets?: Wallet[];
  defaultWalletId?: string;
  currency?: "₹" | "$" | "€" | "£";
  budgetGoals?: BudgetGoal[];
}

export interface UserProfile {
  id: string;
  name: string;
  avatar?: string; // compressed base64 profile image
  createdAt: string;
}
