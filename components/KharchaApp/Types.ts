export type ScreenName =
  | "lock"
  | "cat"
  | "amt"
  | "dash"
  | "hist"
  | "set"
  | "manage_cats"
  | "change_pin"
  | "registry"
  | "reports"
  | "subscriptions"
  | "manage_wallets"
  | "user_select"
  | "user_manage"
  | "budget_goals"
  | "monthly_breakdown"
  | "audit_logs"
  | "auth"
  | "register"
  | "forgot_password"
  | "onboarding";

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
  bankName?: string;
  paymentMethod?: string;
  refNumber?: string;
  accountLast4?: string;
  merchant?: string;
  syncSource?: "manual" | "bank_sms" | "csv" | "voice";
  verifiedStatus?: "auto_detected" | "verified" | "disputed";
  rawSmsHash?: string;
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
  monthlyResetDay?: number;
  layoutMode?: "mobile" | "desktop" | "windows" | "phone" | "responsive" | "web";
  userName: string;
  userEmail: string;
  profileImage?: string;
  customCategories?: Category[];
  wallets?: Wallet[];
  defaultWalletId?: string;
  currency?: "₹" | "$" | "€" | "£";
  budgetGoals?: BudgetGoal[];
  notificationPreferences?: string;
  dashboardPreferences?: string;
}

export interface OnboardingState {
  status: "not_started" | "in_progress" | "completed" | "skipped_optional";
  currentStep: number;
  completedSteps: string[];
  skippedOptionalSteps?: string[];
  startedAt?: string;
  completedAt?: string;
}

export interface UserIntegrationItem {
  type: string;
  status: "connected" | "disconnected" | "pending";
  consent: "granted" | "denied" | "skipped";
  connectedAt?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
  country?: string;
  timezone?: string;
  preferredLanguage?: string;
  avatar?: string; // compressed base64 profile image
  createdAt: string;
  isEmailVerified?: boolean;
  isProfileCompleted?: boolean;
  onboardingStatus?: string;
  onboardingStep?: number;
}
