import { Expense, Settings, UserProfile, Category, Wallet, BudgetGoal } from "./Types";
import { DEFAULT_SETTINGS, STORAGE_KEYS, getUserStorageKeys } from "./Constants";

export interface EnterpriseBootstrapResult {
  isInitialized: boolean;
  users: UserProfile[];
  activeUserId: string;
  settings: Settings;
  expenses: Expense[];
  categories: Category[];
  wallets: Wallet[];
  budgetGoals: BudgetGoal[];
}

export interface EnterpriseAuditLog {
  id: string;
  userId?: string;
  userName: string;
  action: string;
  entity: string;
  details?: string;
  createdAt: string;
}

/**
 * Enterprise Storage Service
 * Replaces unstructured browser JSON strings with ACID-compliant,
 * relational database storage backed by Prisma ORM and SQLite/PostgreSQL.
 */
class EnterpriseStorageService {
  private isOnline: boolean = typeof navigator !== "undefined" ? navigator.onLine : true;
  private syncTimeout: any = null;
  private pendingSync: { userId: string; data: any } | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => { this.isOnline = true; });
      window.addEventListener("offline", () => { this.isOnline = false; });
    }
  }

  /**
   * Initializes the application from the enterprise database.
   * If the DB is empty, it detects legacy localStorage JSON data and migrates it automatically!
   */
  async bootstrap(): Promise<EnterpriseBootstrapResult | null> {
    try {
      const res = await fetch("/api/bootstrap");
      if (!res.ok) throw new Error("Failed to reach enterprise storage API");
      const data = await res.json();

      if (data.isInitialized && data.activeData) {
        return {
          isInitialized: true,
          users: data.users,
          activeUserId: data.activeUserId,
          settings: data.activeData.settings || DEFAULT_SETTINGS,
          expenses: data.activeData.expenses || [],
          categories: data.activeData.categories || [],
          wallets: data.activeData.wallets || [],
          budgetGoals: data.activeData.budgetGoals || [],
        };
      }

      // If database has no users, attempt auto-migration of local JSON data
      const migrated = await this.migrateLegacyLocalStorage();
      if (migrated) {
        return await this.bootstrap();
      }

      // If no local data either, initialize first enterprise user
      return await this.initializeDefaultEnterpriseUser();
    } catch (err) {
      console.warn("Enterprise DB bootstrap failed, falling back to local cache:", err);
      return null;
    }
  }

  /**
   * Automatically migrates existing localStorage JSON data to the relational database
   */
  private async migrateLegacyLocalStorage(): Promise<boolean> {
    if (typeof window === "undefined") return false;

    try {
      const savedUsersJson = localStorage.getItem(STORAGE_KEYS.USERS);
      const savedActiveId = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER) || "";

      let users: UserProfile[] = [];
      const userData: Record<string, { settings: any; expenses: any[] }> = {};

      if (savedUsersJson) {
        try {
          users = JSON.parse(savedUsersJson);
        } catch {
          users = [];
        }
      }

      if (users.length === 0) {
        // Check single-user legacy keys
        const legacyExpJson = localStorage.getItem(STORAGE_KEYS.EXPENSES);
        const legacySettJson = localStorage.getItem(STORAGE_KEYS.SETTINGS);
        if (legacyExpJson || legacySettJson) {
          const newId = "usr_" + Math.random().toString(36).substring(2, 9);
          const legacySett = legacySettJson ? JSON.parse(legacySettJson) : DEFAULT_SETTINGS;
          const legacyExp = legacyExpJson ? JSON.parse(legacyExpJson) : [];
          users = [{
            id: newId,
            name: legacySett.userName || "Primary User",
            avatar: legacySett.profileImage,
            createdAt: new Date().toISOString(),
          }];
          userData[newId] = {
            settings: legacySett,
            expenses: legacyExp,
          };
        }
      } else {
        // Collect each user's isolated data
        for (const u of users) {
          const keys = getUserStorageKeys(u.id);
          const expJson = localStorage.getItem(keys.EXPENSES);
          const setJson = localStorage.getItem(keys.SETTINGS);
          userData[u.id] = {
            settings: setJson ? JSON.parse(setJson) : DEFAULT_SETTINGS,
            expenses: expJson ? JSON.parse(expJson) : [],
          };
        }
      }

      if (users.length === 0) return false;

      const res = await fetch("/api/migrate-legacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          users,
          activeUserId: savedActiveId || users[0].id,
          userData,
        }),
      });

      if (res.ok) {
        console.log("Successfully migrated local JSON data into Enterprise Relational Database!");
        return true;
      }
    } catch (err) {
      console.warn("Legacy migration failed:", err);
    }
    return false;
  }

  /**
   * Initializes the first default user in the database
   */
  private async initializeDefaultEnterpriseUser(): Promise<EnterpriseBootstrapResult | null> {
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "User 1",
          settings: DEFAULT_SETTINGS,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.success && data.user) {
        await this.setActiveUser(data.user.id);
        return {
          isInitialized: true,
          users: [data.user],
          activeUserId: data.user.id,
          settings: DEFAULT_SETTINGS,
          expenses: [],
          categories: [],
          wallets: DEFAULT_SETTINGS.wallets || [],
          budgetGoals: [],
        };
      }
    } catch (err) {
      console.error("Failed to initialize default enterprise user:", err);
    }
    return null;
  }

  /**
   * Save or sync settings, custom categories, wallets, and budget goals
   */
  async saveSettings(
    userId: string,
    settings: Settings,
    categories: Category[],
    wallets: Wallet[],
    budgetGoals: BudgetGoal[]
  ): Promise<void> {
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          settings,
          categories,
          wallets,
          budgetGoals,
        }),
      });
    } catch (err) {
      console.error("Enterprise DB saveSettings error:", err);
    }
  }

  /**
   * Sync partial user settings to database
   */
  async syncSettings(userId: string, partialSettings: Partial<Settings>): Promise<void> {
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          settings: partialSettings,
        }),
      });
    } catch (err) {
      console.error("Enterprise DB syncSettings error:", err);
    }
  }

  /**
   * Sync complete user dataset (expenses, settings, categories, wallets, budgetGoals) atomically
   * Debounced by 300ms to coalesce rapid state updates into a single database write.
   */
  async syncUserData(
    userId: string,
    data: {
      expenses: Expense[];
      settings: Settings;
      categories: Category[];
      wallets: Wallet[];
      budgetGoals: BudgetGoal[];
    }
  ): Promise<boolean> {
    this.pendingSync = { userId, data };

    return new Promise((resolve) => {
      if (this.syncTimeout) {
        clearTimeout(this.syncTimeout);
      }

      this.syncTimeout = setTimeout(async () => {
        const payload = this.pendingSync;
        this.pendingSync = null;
        if (!payload) {
          resolve(true);
          return;
        }

        try {
          const res = await fetch("/api/sync-user-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: payload.userId,
              expenses: payload.data.expenses,
              settings: payload.data.settings,
              categories: payload.data.categories,
              wallets: payload.data.wallets,
              budgetGoals: payload.data.budgetGoals,
            }),
          });
          resolve(res.ok);
        } catch (err) {
          console.error("Enterprise DB syncUserData error:", err);
          resolve(false);
        }
      }, 300);
    });
  }

  /**
   * Save a single expense to the database
   */
  async saveExpense(userId: string, expense: Expense): Promise<Expense | null> {
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, expense }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.expense;
      }
    } catch (err) {
      console.error("Enterprise DB saveExpense error:", err);
    }
    return null;
  }

  /**
   * Batch import expenses into database within a single ACID transaction
   */
  async batchImportExpenses(userId: string, expenses: Expense[]): Promise<boolean> {
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, expenses }),
      });
      return res.ok;
    } catch (err) {
      console.error("Enterprise DB batchImportExpenses error:", err);
      return false;
    }
  }

  /**
   * Delete an expense by ID
   */
  async deleteExpense(userId: string, expenseId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/expenses?userId=${encodeURIComponent(userId)}&id=${encodeURIComponent(expenseId)}`, {
        method: "DELETE",
      });
      return res.ok;
    } catch (err) {
      console.error("Enterprise DB deleteExpense error:", err);
      return false;
    }
  }

  /**
   * Clear all expenses for a user
   */
  async clearAllExpenses(userId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/expenses?userId=${encodeURIComponent(userId)}&clearAll=true`, {
        method: "DELETE",
      });
      return res.ok;
    } catch (err) {
      console.error("Enterprise DB clearAllExpenses error:", err);
      return false;
    }
  }

  /**
   * Switch active user in database
   */
  async setActiveUser(userId: string): Promise<void> {
    try {
      await fetch("/api/active-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
    } catch (err) {
      console.error("Enterprise DB setActiveUser error:", err);
    }
  }

  /**
   * Register a new user account with secure credentials
   */
  async registerUser(payload: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    phoneNumber?: string;
    countryCode?: string;
    agreedToTerms?: boolean;
  }): Promise<{ success: boolean; message?: string; user?: any; devVerificationCode?: string; error?: string; details?: string[] }> {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Registration failed", details: data.details };
      }
      return { success: true, message: data.message, user: data.user, devVerificationCode: data.devVerificationCode };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error during registration" };
    }
  }

  /**
   * Get onboarding state for a user
   */
  async getOnboardingState(userId: string): Promise<any> {
    try {
      const res = await fetch(`/api/onboarding?userId=${encodeURIComponent(userId)}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.error("Enterprise DB getOnboardingState error:", err);
    }
    return null;
  }

  /**
   * Save incremental onboarding progress
   */
  async saveOnboardingStep(payload: {
    userId: string;
    step: number;
    stepKey?: string;
    isCompleted?: boolean;
    isSkipped?: boolean;
    isFinalStep?: boolean;
    profileData?: any;
    preferencesData?: any;
    integrationsData?: any[];
  }): Promise<{ success: boolean; message?: string; onboarding?: any; error?: string }> {
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || "Network error saving onboarding" };
    }
  }

  /**
   * Update user profile information
   */
  async updateUserProfile(userId: string, profileData: any): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileData),
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || "Network error updating profile" };
    }
  }

  /**
   * Export all user data as JSON (GDPR / personal backup)
   */
  async exportUserData(userId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}?export=true`);
      if (!res.ok) throw new Error("Failed to export data");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kharcha-user-data-${userId}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      console.error("Export user data error:", err);
      return false;
    }
  }

  /**
   * Verify email with 6-digit code
   */
  async verifyEmail(email: string, code: string): Promise<{ success: boolean; message?: string; user?: any; settings?: any; error?: string }> {
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Verification failed" };
      }
      return { success: true, message: data.message, user: data.user, settings: data.settings };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error during email verification" };
    }
  }

  /**
   * Resend verification code
   */
  async resendVerificationCode(email: string): Promise<{ success: boolean; message?: string; devVerificationCode?: string; error?: string }> {
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, resend: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Resend failed" };
      }
      return { success: true, message: data.message, devVerificationCode: data.devVerificationCode };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error" };
    }
  }

  /**
   * Authenticate user with email and password
   */
  async loginUser(payload: { email: string; password: string }): Promise<{
    success: boolean;
    requiresVerification?: boolean;
    email?: string;
    message?: string;
    user?: any;
    activeData?: any;
    error?: string;
  }> {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Login failed" };
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || "Network error during login" };
    }
  }

  /**
   * Request password reset code
   */
  async forgotPassword(email: string): Promise<{ success: boolean; message?: string; devResetCode?: string; error?: string }> {
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Request failed" };
      }
      return { success: true, message: data.message, devResetCode: data.devResetCode };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error" };
    }
  }

  /**
   * Set new password with reset code
   */
  async resetPassword(payload: {
    email: string;
    code: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<{ success: boolean; message?: string; error?: string; details?: string[] }> {
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Reset failed", details: data.details };
      }
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message || "Network error" };
    }
  }

  /**
   * Create a new user profile
   */
  async createUser(payload: {
    name: string;
    avatar?: string;
    email?: string;
    pinCode?: string;
    settings?: Settings;
    categories?: Category[];
    wallets?: Wallet[];
    budgetGoals?: BudgetGoal[];
  }): Promise<UserProfile | null> {
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        return data.user;
      }
    } catch (err) {
      console.error("Enterprise DB createUser error:", err);
    }
    return null;
  }

  /**
   * Fetch complete data bundle for a specific user
   */
  async getUserData(userId: string) {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.error("Enterprise DB getUserData error:", err);
    }
    return null;
  }

  /**
   * Delete a user profile and all cascade relations
   */
  async deleteUser(userId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      return res.ok;
    } catch (err) {
      console.error("Enterprise DB deleteUser error:", err);
      return false;
    }
  }

  /**
   * Fetch enterprise audit logs
   */
  async getAuditLogs(userId?: string, limit: number = 50): Promise<EnterpriseAuditLog[]> {
    try {
      const url = userId
        ? `/api/audit-logs?userId=${encodeURIComponent(userId)}&limit=${limit}`
        : `/api/audit-logs?limit=${limit}`;
      const res = await fetch(url);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.error("Enterprise DB getAuditLogs error:", err);
    }
    return [];
  }

  /**
   * Log an audit action
   */
  async logAudit(userId: string | undefined, action: string, entity: string, details?: any): Promise<void> {
    try {
      await fetch("/api/audit-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, entity, details }),
      });
    } catch (err) {
      console.error("Enterprise DB logAudit error:", err);
    }
  }

  /**
   * Export full database snapshot
   */
  async exportBackup(): Promise<any> {
    const res = await fetch("/api/backup");
    if (!res.ok) throw new Error("Failed to export backup");
    return await res.json();
  }

  /**
   * Restore database from snapshot
   */
  async restoreBackup(backupPayload: any): Promise<boolean> {
    const res = await fetch("/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(backupPayload),
    });
    return res.ok;
  }
}

export const enterpriseStorage = new EnterpriseStorageService();
export default enterpriseStorage;
