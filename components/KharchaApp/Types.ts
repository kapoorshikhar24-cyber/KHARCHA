export type ScreenName = "lock" | "cat" | "amt" | "dash" | "hist" | "set" | "manage_cats" | "change_pin" | "registry" | "reports" | "subscriptions" | "manage_wallets";
export type PeriodName = "today" | "week" | "month";
export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface Category {
  id: string;
  label: string;
  icon: string;
  color: string;
  bg: string;
}

export interface Wallet {
  id: string;
  label: string;
  icon: string;
  color: string;
  initialBalance?: number;
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
  userName: string;
  userEmail: string;
  profileImage?: string;
  customCategories?: Category[];
  wallets?: Wallet[];
  defaultWalletId?: string;
}
