"use client";
/**
 * KharchaApp/index.tsx
 * Main entry point. Handles all state, screen routing, and screen rendering.
 *
 * Usage in Next.js:
 *   import KharchaApp from "@/components/KharchaApp";
 *   export default function Page() { return <KharchaApp />; }
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { ScreenName, PeriodName, Category, Expense, Settings, Wallet, UserProfile, BudgetGoal, TransactionType } from "./Types";
import { CATEGORIES, INCOME_CATEGORIES, AMOUNT_PRESETS, DEFAULT_SETTINGS, STORAGE_KEYS, WALLETS, CATEGORY_KEYWORDS, INCOME_KEYWORDS, getUserStorageKeys } from "./Constants";
import {
  fmt, todayKey, greeting, dateLabel,
  loadStorage, saveStorage,
  filterByPeriod, sumExpenses, sumIncome, sumWalletBalance, categoryTotal,
  weeklyTotals, groupByDate, generateId, smartMatchCategory, extractVoiceAmount,
  triggerHaptic, HapticType,
  parseCSVToExpenses, getDayByDayMonthly,
} from "./Utils";
import { S, TOKEN } from "./Styles";
import enterpriseStorage, { EnterpriseAuditLog } from "./EnterpriseStorage";

const ALL_CATEGORIES = [...CATEGORIES, ...INCOME_CATEGORIES];

// ─── WebAuthn Helpers ────────────────────────────────────────────────────────
const bufferToBase64url = (buffer: ArrayBuffer | Uint8Array) => {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  const base64String = btoa(str);
  return base64String.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

const base64urlToBuffer = (base64url: string) => {
  const padding = '='.repeat((4 - base64url.length % 4) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

const AUTH_CONFIG = {
  publicKey: {
    challenge: new Uint8Array(32),
    rp: { name: "Kharcha App" },
    user: {
      id: new Uint8Array(16),
      name: "user@kharcha.app",
      displayName: "Kharcha User"
    },
    pubKeyCredParams: [{ alg: -7, type: "public-key" as const }],
    authenticatorSelection: {
      userVerification: "required" as const,
      authenticatorAttachment: "platform" as const,
      residentKey: "preferred" as const,
      requireResidentKey: false,
    },
    timeout: 60000
  }
};
import {
  StatusBar, HomeBar, Toggle, FingerprintIcon,
  SectionLabel, TogRow,
  BarChart, ExpenseRow, CategoryBar, BudgetCard,
  CatIcon, ArrowLeftIcon, BellIcon, PlusIcon, MicIcon,
  GlobalStyles, BiometricOverlay, ArrowDownIcon,
  BudgetGoalBar, SparkLine,
  WindowsTitleBar, PhoneTopBar,
} from "./SubComponents";
import ReportsScreen from "./ReportsScreen";
import AuthScreen, { AuthMode } from "./AuthScreen";
import OnboardingFlow from "./OnboardingFlow";
import WebShell from "./web/WebShell";
import WindowsDesktopShell from "./desktop/WindowsDesktopShell";
import { PlatformMode } from "./types/Platform";

// ─── App ──────────────────────────────────────────────────────────────────────
export default function KharchaApp() {

  // ── Multi-user state ─────────────────────────────────────────────────────────
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [activeUserId, setActiveUserId] = useState<string>("");
  const [pendingSwitchUserId, setPendingSwitchUserId] = useState<string | null>(null);
  const [switchPinInput, setSwitchPinInput] = useState<string>("");
  const [switchPinError, setSwitchPinError] = useState<boolean>(false);
  const [switchShake, setSwitchShake] = useState<boolean>(false);

  // ── Core state ──────────────────────────────────────────────────────────────
  const [screen, setScreen] = useState<ScreenName>("user_select");
  const [authInitialMode, setAuthInitialMode] = useState<AuthMode>("register");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [platformMode, setPlatformMode] = useState<PlatformMode>("web");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updatePlatform = () => {
      const isElectron = Boolean((window as any).electronAPI);
      const isWindowsOS = typeof navigator !== "undefined" && /Win/i.test(navigator.userAgent || navigator.platform || "");
      const isWideScreen = window.innerWidth >= 1024;

      if (isElectron || (isWindowsOS && isWideScreen) || settings.layoutMode === "desktop" || settings.layoutMode === "windows") {
        setPlatformMode("desktop");
      } else {
        setPlatformMode("web");
      }
    };
    updatePlatform();
    window.addEventListener("resize", updatePlatform);
    return () => window.removeEventListener("resize", updatePlatform);
  }, [settings.layoutMode]);

  const [hasLoaded, setHasLoaded] = useState(false);
  const [dbConnected, setDbConnected] = useState<boolean>(true);
  const [auditLogs, setAuditLogs] = useState<EnterpriseAuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState<boolean>(false);
  const backupInputRef = useRef<HTMLInputElement>(null);

  // ── Amount screen ────────────────────────────────────────────────────────────
  const [selCat, setSelCat] = useState<Category>(CATEGORIES[0]);
  const [amtVal, setAmtVal] = useState<number>(150);
  const [amtInput, setAmtInput] = useState<string>(""); // For manual typing
  const [showKeypad, setShowKeypad] = useState<boolean>(false);
  const [note, setNote] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [txType, setTxType] = useState<TransactionType>("expense");
  const [selWalletId, setSelWalletId] = useState<string>("cash");
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [txDate, setTxDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [cropImg, setCropImg] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  const [rotation, setRotation] = useState<number>(0);

  // ── Categories ──────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<Category[]>(ALL_CATEGORIES);

  // ── Dashboard ────────────────────────────────────────────────────────────────
  const [period, setPeriod] = useState<PeriodName>("today");
  const [wallets, setWallets] = useState<Wallet[]>(WALLETS);

  // ── History & Breakdown ──────────────────────────────────────────────────────
  const [histCat, setHistCat] = useState<string>("all");
  const [histSearch, setHistSearch] = useState<string>("");
  const [histTime, setHistTime] = useState<"all" | "this_month" | "last_30" | "this_year">("all");
  const [histSort, setHistSort] = useState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc">("date_desc");
  const [breakdownDate, setBreakdownDate] = useState<Date>(new Date());
  const [matrixViewMode, setMatrixViewMode] = useState<"matrix" | "ledger">("matrix");
  const [selectedMatrixDay, setSelectedMatrixDay] = useState<number | null>(null);

  // ── Transaction Registry & Audit Ledger state ───────────────────────────────
  const [regSearch, setRegSearch] = useState<string>("");
  const [regTime, setRegTime] = useState<"all" | "today" | "yesterday" | "week" | "this_month" | "last_month" | "this_year" | "custom">("all");
  const [regCustomStart, setRegCustomStart] = useState<string>("");
  const [regCustomEnd, setRegCustomEnd] = useState<string>("");
  const [regType, setRegType] = useState<"all" | "expense" | "income" | "recurring">("all");
  const [regCat, setRegCat] = useState<string>("all");
  const [regWallet, setRegWallet] = useState<string>("all");
  const [regSort, setRegSort] = useState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "cat_asc">("date_desc");
  const [regMinAmt, setRegMinAmt] = useState<string>("");
  const [regMaxAmt, setRegMaxAmt] = useState<string>("");
  const [regSelectedIds, setRegSelectedIds] = useState<string[]>([]);
  const [manageCatType, setManageCatType] = useState<"expense" | "income">("expense");

  // ── Voice ────────────────────────────────────────────────────────────────────
  const [voiceOpen, setVoiceOpen] = useState<boolean>(false);
  const [voiceStep, setVoiceStep] = useState<0 | 1>(0);
  const [transcript, setTranscript] = useState<string>("");
  const [parsedExpense, setParsedExpense] = useState<Partial<Expense> | null>(null);
  const [isListening, setIsListening] = useState(false);

  // ── Auth state ──────────────────────────────────────────────────────────────
  const [pinInput, setPinInput] = useState<string>("");
  const [shake, setShake] = useState(false);
  const [bioStatus, setBioStatus] = useState<null | "scanning" | "success" | "fail">(null);
  const [loginSuccess, setLoginSuccess] = useState(false);

  // ── Edit Expense state ───────────────────────────────────────────────────────
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // ── Budget Goals state ───────────────────────────────────────────────────────
  const [budgetGoals, setBudgetGoals] = useState<BudgetGoal[]>([]);

  // ── Category management state ────────────────────────────────────────────────
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catLabel, setCatLabel] = useState<string>("");
  const [catIcon, setCatIcon] = useState<string>("🍔");
  const [catColor, setCatColor] = useState<string>("#EF9F27");
  const [catDefaultAmount, setCatDefaultAmount] = useState<string>("");
  const [isCatFormOpen, setIsCatFormOpen] = useState<boolean>(false);

  // ── Budget alert dismissed ───────────────────────────────────────────────────
  const [budgetAlertDismissed, setBudgetAlertDismissed] = useState(false);

  // ── Responsive Layout & Windows vs Phone State ────────────────────────────────
  const [isDesktop, setIsDesktop] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Quick Add State for Windows Desktop UI
  const [quickAmt, setQuickAmt] = useState("");
  const [quickNote, setQuickNote] = useState("");
  const [quickCatId, setQuickCatId] = useState("food");
  const [quickWalletId, setQuickWalletId] = useState("cash");
  const [quickType, setQuickType] = useState<"expense" | "income">("expense");
  const [quickSaving, setQuickSaving] = useState(false);
  const [desktopLedgerSearch, setDesktopLedgerSearch] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateLayout = () => {
      if (settings.layoutMode === "desktop" || settings.layoutMode === "windows") {
        setIsDesktop(true);
      } else if (settings.layoutMode === "mobile" || settings.layoutMode === "phone") {
        setIsDesktop(false);
      } else {
        const isWindows = typeof navigator !== "undefined" && /Win/i.test(navigator.userAgent || navigator.platform || "");
        setIsDesktop(isWindows || window.innerWidth >= 1024);
      }
    };
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, [settings.layoutMode]);

  const toggleUiMode = useCallback(() => {
    const nextMode = isDesktop ? "phone" : "windows";
    const nextSettings: Settings = { ...settings, layoutMode: nextMode };
    setSettings(nextSettings);
    if (activeUserId) {
      const userKeys = getUserStorageKeys(activeUserId);
      saveStorage(userKeys.SETTINGS, nextSettings);
    }
    setIsDesktop(!isDesktop);
    if (settings.haptic) triggerHaptic("medium");
  }, [isDesktop, settings, activeUserId]);

  const toggleTheme = useCallback(() => {
    const nextTheme = settings.theme === "light" ? "dark" : "light";
    const nextSettings: Settings = { ...settings, theme: nextTheme };
    setSettings(nextSettings);
    if (activeUserId) {
      const userKeys = getUserStorageKeys(activeUserId);
      saveStorage(userKeys.SETTINGS, nextSettings);
    }
    if (settings.haptic) triggerHaptic("medium");
  }, [settings, activeUserId]);

  // ── CSV import ref ───────────────────────────────────────────────────────────
  const csvInputRef = useRef<HTMLInputElement>(null);

  // ── Load from Enterprise Database (multi-user aware with offline fallback) ──
  useEffect(() => {
    let cancelled = false;

    async function initializeEnterpriseData() {
      try {
        const bootstrapResult = await enterpriseStorage.bootstrap();
        if (!cancelled && bootstrapResult && bootstrapResult.users && bootstrapResult.users.length > 0) {
          setUsers(bootstrapResult.users);
          setActiveUserId(bootstrapResult.activeUserId);
          setExpenses(bootstrapResult.expenses);
          setSettings(bootstrapResult.settings);
          setCategories(
            bootstrapResult.categories && bootstrapResult.categories.length > 0
              ? bootstrapResult.categories
              : (bootstrapResult.settings.customCategories || ALL_CATEGORIES)
          );
          setWallets(
            bootstrapResult.wallets && bootstrapResult.wallets.length > 0
              ? bootstrapResult.wallets
              : (bootstrapResult.settings.wallets || WALLETS)
          );
          setBudgetGoals(
            bootstrapResult.budgetGoals && bootstrapResult.budgetGoals.length > 0
              ? bootstrapResult.budgetGoals
              : (bootstrapResult.settings.budgetGoals || [])
          );
          setDbConnected(true);

          if (bootstrapResult.settings.pin || bootstrapResult.settings.biometric) {
            setScreen("lock");
          } else {
            const activeUser = bootstrapResult.users.find(u => u.id === bootstrapResult.activeUserId);
            if (activeUser && activeUser.onboardingStatus && activeUser.onboardingStatus !== "completed" && !activeUser.isProfileCompleted) {
              setScreen("onboarding");
            } else {
              setScreen("dash");
            }
          }
          setHasLoaded(true);
          return;
        }
      } catch (err) {
        console.warn("Enterprise DB bootstrap issue, using local cache fallback:", err);
      }

      if (cancelled) return;

      // Fallback: local storage
      const savedUsers = loadStorage<UserProfile[]>(STORAGE_KEYS.USERS, []);
      const savedActiveId = loadStorage<string>(STORAGE_KEYS.ACTIVE_USER, "");

      if (savedUsers.length === 0) {
        const legacyExp = loadStorage<Expense[]>(STORAGE_KEYS.EXPENSES, []);
        const legacySett = loadStorage<Settings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
        const newId = generateId();
        const newUser: UserProfile = {
          id: newId,
          name: legacySett.userName || "User 1",
          avatar: legacySett.profileImage,
          createdAt: new Date().toISOString(),
        };
        const userKeys = getUserStorageKeys(newId);
        saveStorage(userKeys.EXPENSES, legacyExp);
        saveStorage(userKeys.SETTINGS, legacySett);
        saveStorage(STORAGE_KEYS.USERS, [newUser]);
        saveStorage(STORAGE_KEYS.ACTIVE_USER, newId);
        setUsers([newUser]);
        setActiveUserId(newId);
        setExpenses(legacyExp);
        setSettings(legacySett);
        setCategories(legacySett.customCategories || ALL_CATEGORIES);
        setWallets(legacySett.wallets || WALLETS);
        setBudgetGoals(legacySett.budgetGoals || []);

        if (legacySett.pin || legacySett.biometric) {
          setScreen("lock");
        } else {
          setScreen("dash");
        }
      } else {
        setUsers(savedUsers);
        const userId = savedActiveId || savedUsers[0].id;
        setActiveUserId(userId);
        const userKeys = getUserStorageKeys(userId);
        const savedExp = loadStorage<Expense[]>(userKeys.EXPENSES, []);
        const savedSet = loadStorage<Settings>(userKeys.SETTINGS, DEFAULT_SETTINGS);
        setExpenses(savedExp);
        setSettings(savedSet);
        setCategories(savedSet.customCategories || ALL_CATEGORIES);
        setWallets(savedSet.wallets || WALLETS);
        setBudgetGoals(savedSet.budgetGoals || []);

        if (savedSet.pin || savedSet.biometric) {
          setScreen("lock");
        } else {
          setScreen("dash");
        }
      }
      setHasLoaded(true);
    }

    initializeEnterpriseData();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Navigation with Browser History ──────────────────────────────────────────
  const go = useCallback((s: ScreenName) => {
    if (settings.haptic) triggerHaptic("light");
    setScreen(s);
    setVoiceOpen(false);
    setPinInput("");
    if (typeof window !== "undefined") {
      try {
        window.history.pushState({ screen: s }, "", `#${s}`);
      } catch {
        // Safe fallback in sandboxed frames
      }
    }
  }, [settings.haptic]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePopState = (e: PopStateEvent) => {
      if (e.state && e.state.screen) {
        setScreen(e.state.screen);
      } else if (window.location.hash) {
        const hashScreen = window.location.hash.replace("#", "") as ScreenName;
        if (hashScreen) setScreen(hashScreen);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const handleProfileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCropImg(reader.result as string);
        setZoom(1);
        setOffsetX(0);
        setOffsetY(0);
        setRotation(0);
        if (settings.haptic) triggerHaptic("success");
      };
      reader.readAsDataURL(file);
    }
  };

  const renderCropModal = () => {
    if (!cropImg) return null;

    const handleSave = () => {
      const img = new Image();
      img.src = cropImg;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 150;
        canvas.height = 150;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, 150, 150);

          // Translate to center for rotation
          ctx.translate(75, 75);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.scale(zoom, zoom);
          ctx.translate(offsetX, offsetY);

          // Calculate aspect ratio and draw centered & cropped
          const size = Math.min(img.width, img.height);
          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;

          ctx.drawImage(img, sx, sy, size, size, -75, -75, 150, 150);
          
          const compressed = canvas.toDataURL("image/jpeg", 0.85);
          updateSetting("profileImage", compressed);
          setCropImg(null);
          setZoom(1);
          setOffsetX(0);
          setOffsetY(0);
          setRotation(0);
          if (settings.haptic) triggerHaptic("success");
        }
      };
    };

    return (
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.85)", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "flex-start", zIndex: 1000, padding: "24px 16px",
        overflowY: "auto", WebkitOverflowScrolling: "touch"
      }}>
        <div style={{
          background: TOKEN.surface, borderRadius: 24, padding: 24, width: "100%", maxWidth: 340,
          maxHeight: "92vh", overflowY: "auto", margin: "auto 0",
          display: "flex", flexDirection: "column", gap: 20, border: `1px solid ${TOKEN.border}`
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: TOKEN.text, textAlign: "center" }}>Adjust Profile Picture</div>
          
          {/* Preview circle container */}
          <div style={{
            width: 150, height: 150, borderRadius: "50%", overflow: "hidden",
            position: "relative", alignSelf: "center", border: `2px solid ${TOKEN.amber}`,
            background: "#000"
          }}>
            <img src={cropImg} style={{
              position: "absolute",
              width: "100%", height: "100%", objectFit: "cover",
              transform: `scale(${zoom}) translate(${offsetX}px, ${offsetY}px) rotate(${rotation}deg)`,
              transition: "transform 0.1s ease"
            }} alt="Preview" />
          </div>

          {/* Controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: TOKEN.muted, marginBottom: 4 }}>
                <span>Zoom</span>
                <span>{zoom.toFixed(1)}x</span>
              </div>
              <input type="range" min="1" max="3" step="0.1" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} style={{ width: "100%", accentColor: TOKEN.amber }} />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: TOKEN.muted, marginBottom: 4 }}>
                <span>Rotation</span>
                <span>{rotation}°</span>
              </div>
              <input type="range" min="0" max="360" step="15" value={rotation} onChange={(e) => setRotation(parseInt(e.target.value))} style={{ width: "100%", accentColor: TOKEN.amber }} />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: TOKEN.muted, marginBottom: 4 }}>
                <span>Horizontal Offset</span>
                <span>{offsetX}px</span>
              </div>
              <input type="range" min="-50" max="50" step="1" value={offsetX} onChange={(e) => setOffsetX(parseInt(e.target.value))} style={{ width: "100%", accentColor: TOKEN.amber }} />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: TOKEN.muted, marginBottom: 4 }}>
                <span>Vertical Offset</span>
                <span>{offsetY}px</span>
              </div>
              <input type="range" min="-50" max="50" step="1" value={offsetY} onChange={(e) => setOffsetY(parseInt(e.target.value))} style={{ width: "100%", accentColor: TOKEN.amber }} />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button onClick={() => setCropImg(null)} style={{ flex: 1, padding: "12px", background: "transparent", border: `1px solid ${TOKEN.border}`, borderRadius: 12, color: TOKEN.textSub, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Cancel</button>
            <button onClick={handleSave} style={{ flex: 1, padding: "12px", background: TOKEN.amber, border: "none", borderRadius: 12, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Save Picture</button>
          </div>
        </div>
      </div>
    );
  };

  const renderSwitchPinModal = () => {
    if (!pendingSwitchUserId) return null;
    const targetUser = users.find(u => u.id === pendingSwitchUserId);
    if (!targetUser) return null;

    const targetKeys = getUserStorageKeys(pendingSwitchUserId);
    const targetSet = loadStorage<Settings>(targetKeys.SETTINGS, DEFAULT_SETTINGS);
    const colors = ["#EF9F27", "#378ADD", "#1D9E75", "#7F77DD", "#D85A30"];
    const accentColor = colors[targetUser.name.charCodeAt(0) % colors.length];

    return (
      <div 
        style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(16px)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "flex-start",
          zIndex: 1100, padding: "24px 16px",
          overflowY: "auto", WebkitOverflowScrolling: "touch",
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setPendingSwitchUserId(null);
            setSwitchPinInput("");
          }
        }}
      >
        <div style={{
          background: TOKEN.surface,
          borderRadius: 28,
          padding: "32px 24px 28px",
          width: "100%", maxWidth: 340,
          maxHeight: "92vh",
          overflowY: "auto",
          margin: "auto 0",
          display: "flex", flexDirection: "column", alignItems: "center",
          border: `1px solid ${TOKEN.border}`,
          boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 40px ${accentColor}18`,
          position: "relative",
          animation: switchShake ? "shake 0.4s ease-in-out" : "fadeIn 0.2s ease-out",
        }}>
          {/* Close Button */}
          <button
            onClick={() => {
              if (settings.haptic) triggerHaptic("light");
              setPendingSwitchUserId(null);
              setSwitchPinInput("");
            }}
            style={{
              position: "absolute", top: 16, right: 16,
              background: "transparent", border: "none",
              color: TOKEN.muted, fontSize: 18, cursor: "pointer",
              padding: 6, lineHeight: 1
            }}
            aria-label="Cancel"
          >
            ✕
          </button>

          {/* User Avatar */}
          <div style={{
            width: 76, height: 76, borderRadius: "50%", overflow: "hidden",
            background: `linear-gradient(135deg, ${accentColor}33, ${accentColor}11)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `2.5px solid ${accentColor}`,
            fontSize: 30, fontWeight: 700, color: accentColor,
            boxShadow: `0 0 24px ${accentColor}33`,
            marginBottom: 14
          }}>
            {targetUser.avatar ? (
              <img src={targetUser.avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt={targetUser.name} />
            ) : (
              targetUser.name.charAt(0).toUpperCase()
            )}
          </div>

          <div style={{ fontSize: 19, fontWeight: 700, color: "#fff", textAlign: "center" }}>
            {targetUser.name}
          </div>
          <div style={{ fontSize: 12, color: TOKEN.muted, marginTop: 4, textAlign: "center" }}>
            Enter 4-digit PIN to switch profile
          </div>

          {/* PIN Dots */}
          <div style={{ display: "flex", gap: 14, margin: "22px 0 14px" }}>
            {[0, 1, 2, 3].map((i) => {
              const filled = i < switchPinInput.length;
              return (
                <div key={i} style={{
                  width: 14, height: 14, borderRadius: "50%",
                  background: filled ? accentColor : "rgba(255,255,255,0.1)",
                  border: `1.5px solid ${filled ? accentColor : "rgba(255,255,255,0.2)"}`,
                  boxShadow: filled ? `0 0 12px ${accentColor}` : "none",
                  transition: "all 0.15s ease",
                }} />
              );
            })}
          </div>

          {/* Error Message */}
          <div style={{
            minHeight: 18, fontSize: 11, color: TOKEN.danger,
            fontWeight: 600, textAlign: "center", marginBottom: 10,
            visibility: switchPinError ? "visible" : "hidden"
          }}>
            Incorrect PIN. Please try again.
          </div>

          {/* Biometric trigger if target has it enabled */}
          {targetSet.biometric && (
            <button
              onClick={handleSwitchBiometric}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 16px", borderRadius: 20,
                background: "rgba(255,255,255,0.05)",
                border: `1px solid ${TOKEN.border}`,
                color: TOKEN.amber, fontSize: 12, cursor: "pointer",
                marginBottom: 14
              }}
            >
              <FingerprintIcon size={16} color={TOKEN.amber} />
              <span>Unlock with Biometrics</span>
            </button>
          )}

          {/* Numeric Keypad */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10, width: "100%", maxWidth: 220,
          }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                onClick={() => handleSwitchPinInput(n.toString())}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "none", borderRadius: 12,
                  color: TOKEN.text, fontSize: 18, fontWeight: 600,
                  height: 44, cursor: "pointer",
                  transition: "background 0.15s"
                }}
                onPointerDown={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
                onPointerUp={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
              >
                {n}
              </button>
            ))}

            <button
              onClick={() => {
                if (settings.haptic) triggerHaptic("light");
                setPendingSwitchUserId(null);
                setSwitchPinInput("");
              }}
              style={{
                background: "transparent", border: "none",
                color: TOKEN.muted, fontSize: 11, fontWeight: 600,
                cursor: "pointer"
              }}
            >
              CANCEL
            </button>

            <button
              onClick={() => handleSwitchPinInput("0")}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "none", borderRadius: 12,
                color: TOKEN.text, fontSize: 18, fontWeight: 600,
                height: 44, cursor: "pointer",
                transition: "background 0.15s"
              }}
              onPointerDown={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
              onPointerUp={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
            >
              0
            </button>

            <button
              onClick={() => {
                if (settings.haptic) triggerHaptic("light");
                setSwitchPinInput(p => p.slice(0, -1));
                setSwitchPinError(false);
              }}
              style={{
                background: "transparent", border: "none",
                color: TOKEN.dim, fontSize: 18, cursor: "pointer"
              }}
            >
              ⌫
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Auth Handlers ───────────────────────────────────────────────────────────
  const handleBiometric = useCallback(async () => {
    if (!settings.biometric || bioStatus) return;

    // Check if WebAuthn and Platform Authenticator are supported
    if (!window.PublicKeyCredential) {
      alert("Biometric authentication not supported on this browser.");
      return;
    }
    
    const isAvailable = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!isAvailable) {
      alert("No biometric hardware (Fingerprint/FaceID) detected on this device.");
      return;
    }

    setBioStatus("scanning");

    try {
      const storageKey = `bio_cred_${settings.userEmail || "default"}`;
      const savedId = localStorage.getItem(storageKey);
      
      // If no valid credential saved, we can't do non-discoverable auth
      if (!savedId || savedId === "enrolled") {
        alert("Please register your fingerprint in Settings first.");
        setBioStatus(null);
        return;
      }

      const options: any = {
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          userVerification: "required",
          allowCredentials: [{
            type: "public-key",
            id: base64urlToBuffer(savedId),
            transports: ["internal"] // Force built-in sensor, skips "USB key" prompt on Android
          }]
        }
      };

      const assertion = await navigator.credentials.get(options);

      if (assertion) {
        if (settings.haptic) triggerHaptic("success");
        setBioStatus("success");
        setTimeout(() => {
          setBioStatus(null);
          go("dash"); // Direct to dashboard on success
        }, 800);
      }
    } catch (err: any) {
      console.error("Biometric failed", err);
      if (settings.haptic) triggerHaptic("error");
      
      // Handle "No passkeys available" specifically
      if (err.name === "NotAllowedError") {
        alert("Authentication cancelled or no registered fingerprint found. Please register in Settings first.");
      } else {
        alert("Biometric error: " + err.message);
      }
      
      setBioStatus("fail");
      setTimeout(() => setBioStatus(null), 2000);
    }
  }, [settings.biometric, bioStatus, go, settings.haptic, settings.userEmail]);

  const handlePinInput = useCallback((num: string) => {
    if (loginSuccess) return;

    const next = pinInput + num;
    if (next.length <= 4) {
      setPinInput(next);
      if (settings.haptic) triggerHaptic("light");
      
      // Auto-categorize based on note when typing PIN? No, that's for the amt screen.

      // Only trigger login logic on the lock screen
      if (screen === "lock" && next.length === 4) {
        if (next === settings.pinCode) {
          if (settings.haptic) triggerHaptic("success");
          setLoginSuccess(true);
          setTimeout(() => {
            setLoginSuccess(false);
            go("dash");
          }, 400);
        } else {
          if (settings.haptic) triggerHaptic("error");
          setShake(true);
          setTimeout(() => {
            setShake(false);
            setPinInput("");
          }, 500);
        }
      }
    }
  }, [pinInput, screen, go, settings.pinCode, settings.haptic, loginSuccess]);

  // ── Auto-trigger biometric on lock screen ───────────────────────────────────
  useEffect(() => {
    if (screen === "lock" && settings.biometric && hasLoaded && !bioStatus) {
      const timer = setTimeout(handleBiometric, 500);
      return () => clearTimeout(timer);
    }
  }, [screen, settings.biometric, hasLoaded, handleBiometric]);

  // ── Persist on change (namespaced per user) ─────────────────────────────────────
  useEffect(() => {
    if (!hasLoaded || !activeUserId) return;
    const userKeys = getUserStorageKeys(activeUserId);
    saveStorage(userKeys.EXPENSES, expenses);
  }, [expenses, hasLoaded, activeUserId]);

  useEffect(() => {
    if (!hasLoaded || !activeUserId) return;
    const userKeys = getUserStorageKeys(activeUserId);
    const nextSettings = { ...settings, customCategories: categories, budgetGoals };
    saveStorage(userKeys.SETTINGS, nextSettings);
  }, [settings, categories, budgetGoals, hasLoaded, activeUserId]);

  // ── Debounced Enterprise DB Sync (ACID Transaction) ─────────────────────────────
  useEffect(() => {
    if (!hasLoaded || !activeUserId) return;
    const timer = setTimeout(() => {
      enterpriseStorage
        .syncUserData(activeUserId, {
          expenses,
          settings,
          categories,
          wallets,
          budgetGoals,
        })
        .then((ok) => {
          if (ok) setDbConnected(true);
        })
        .catch(() => setDbConnected(false));
    }, 400);

    return () => clearTimeout(timer);
  }, [expenses, settings, categories, wallets, budgetGoals, hasLoaded, activeUserId]);

  const clearPin = () => setPinInput("");

  // ── Multi-user actions & PIN Guard ─────────────────────────────────────────
  const executeSwitchUser = useCallback((userId: string) => {
    // Save current active user data first
    if (activeUserId) {
      const currKeys = getUserStorageKeys(activeUserId);
      saveStorage(currKeys.EXPENSES, expenses);
      saveStorage(currKeys.SETTINGS, { ...settings, customCategories: categories, budgetGoals });
      enterpriseStorage.syncUserData(activeUserId, {
        expenses,
        settings,
        categories,
        wallets,
        budgetGoals,
      }).catch(console.error);
    }

    // Load new user data from isolated partition
    const userKeys = getUserStorageKeys(userId);
    const newExp = loadStorage<Expense[]>(userKeys.EXPENSES, []);
    const newSet = loadStorage<Settings>(userKeys.SETTINGS, DEFAULT_SETTINGS);

    setActiveUserId(userId);
    saveStorage(STORAGE_KEYS.ACTIVE_USER, userId);
    enterpriseStorage.setActiveUser(userId).catch(console.error);

    setExpenses(newExp);
    setSettings(newSet);
    setCategories(newSet.customCategories || ALL_CATEGORIES);
    setWallets(newSet.wallets || WALLETS);
    setBudgetGoals(newSet.budgetGoals || []);
    setBudgetAlertDismissed(false);
    setPinInput("");
    setLoginSuccess(false);
    setBioStatus(null);
    setPendingSwitchUserId(null);
    setSwitchPinInput("");
    setSwitchPinError(false);
    setSwitchShake(false);

    setScreen("dash");
    if (newSet.haptic) triggerHaptic("success");
  }, [activeUserId, expenses, settings, categories, budgetGoals]);

  const requestSwitchUser = useCallback((targetUserId: string) => {
    const targetKeys = getUserStorageKeys(targetUserId);
    const targetSet = loadStorage<Settings>(targetKeys.SETTINGS, DEFAULT_SETTINGS);

    // If target profile has PIN protection enabled with a valid PIN, challenge for PIN
    if (targetSet.pin && targetSet.pinCode) {
      setPendingSwitchUserId(targetUserId);
      setSwitchPinInput("");
      setSwitchPinError(false);
      setSwitchShake(false);
      if (settings.haptic) triggerHaptic("medium");
      return;
    }

    // Otherwise, direct switch without challenge
    executeSwitchUser(targetUserId);
  }, [settings.haptic, executeSwitchUser]);

  const switchUser = requestSwitchUser;

  const handleSwitchPinInput = useCallback((num: string) => {
    if (!pendingSwitchUserId) return;
    const targetKeys = getUserStorageKeys(pendingSwitchUserId);
    const targetSet = loadStorage<Settings>(targetKeys.SETTINGS, DEFAULT_SETTINGS);

    setSwitchPinInput((prev) => {
      const next = prev + num;
      if (next.length > 4) return prev;

      setSwitchPinError(false);
      if (settings.haptic) triggerHaptic("light");

      if (next.length === 4) {
        if (next === targetSet.pinCode) {
          if (settings.haptic) triggerHaptic("success");
          setTimeout(() => {
            executeSwitchUser(pendingSwitchUserId);
          }, 250);
        } else {
          if (settings.haptic) triggerHaptic("error");
          setSwitchShake(true);
          setSwitchPinError(true);
          setTimeout(() => {
            setSwitchShake(false);
            setSwitchPinInput("");
          }, 500);
        }
      }
      return next;
    });
  }, [pendingSwitchUserId, settings.haptic, executeSwitchUser]);

  const handleSwitchBiometric = useCallback(async () => {
    if (!pendingSwitchUserId) return;
    const targetKeys = getUserStorageKeys(pendingSwitchUserId);
    const targetSet = loadStorage<Settings>(targetKeys.SETTINGS, DEFAULT_SETTINGS);
    if (!targetSet.biometric) return;

    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      alert("Biometric authentication is not supported on this browser.");
      return;
    }

    try {
      const storageKey = `bio_cred_${targetSet.userEmail || pendingSwitchUserId || "default"}`;
      const savedId = localStorage.getItem(storageKey);

      if (!savedId || savedId === "enrolled") {
        alert("No biometric credentials registered for this user.");
        return;
      }

      const options: any = {
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          userVerification: "required",
          allowCredentials: [{
            type: "public-key",
            id: base64urlToBuffer(savedId),
            transports: ["internal"]
          }]
        }
      };

      const assertion = await navigator.credentials.get(options);
      if (assertion) {
        if (settings.haptic) triggerHaptic("success");
        executeSwitchUser(pendingSwitchUserId);
      }
    } catch (err: any) {
      console.warn("Switch biometric verification failed or cancelled", err);
      if (settings.haptic) triggerHaptic("error");
      setSwitchPinError(true);
      setSwitchShake(true);
      setTimeout(() => {
        setSwitchShake(false);
      }, 500);
    }
  }, [pendingSwitchUserId, settings.haptic, executeSwitchUser]);

  const createUser = (name: string) => {
    const newId = generateId();
    const newUser: UserProfile = { id: newId, name, createdAt: new Date().toISOString() };
    const newUserSettings: Settings = { ...DEFAULT_SETTINGS, userName: name, layoutMode: settings.layoutMode };
    const userKeys = getUserStorageKeys(newId);
    saveStorage(userKeys.EXPENSES, []);
    saveStorage(userKeys.SETTINGS, newUserSettings);
    const updated = [...users, newUser];
    setUsers(updated);
    saveStorage(STORAGE_KEYS.USERS, updated);

    // Enterprise DB sync
    enterpriseStorage.createUser({
      name,
      settings: newUserSettings,
      wallets: WALLETS,
      categories: ALL_CATEGORIES,
    }).catch(console.error);

    if (settings.haptic) triggerHaptic("success");
    return newId;
  };

  const deleteUser = (userId: string) => {
    if (users.length <= 1) { alert("You must keep at least one user."); return; }
    const updated = users.filter(u => u.id !== userId);
    setUsers(updated);
    saveStorage(STORAGE_KEYS.USERS, updated);

    // Enterprise DB cascade delete
    enterpriseStorage.deleteUser(userId).catch(console.error);

    // If deleting active user, switch to first remaining user
    if (userId === activeUserId) executeSwitchUser(updated[0].id);
    if (settings.haptic) triggerHaptic("medium");
  };

  const renameUser = (userId: string, newName: string) => {
    const updated = users.map(u => u.id === userId ? { ...u, name: newName } : u);
    setUsers(updated);
    saveStorage(STORAGE_KEYS.USERS, updated);
    // Also update settings.userName if it's the active user
    if (userId === activeUserId) {
      setSettings(s => ({ ...s, userName: newName }));
      enterpriseStorage.saveSettings(userId, { ...settings, userName: newName }, categories, wallets, budgetGoals).catch(console.error);
    }
  };

  // ── Expense actions ──────────────────────────────────────────────────────────
  const updateAmt = useCallback((delta: number) => {
    if (settings.haptic) triggerHaptic(Math.abs(delta) > 10 ? "medium" : "light");
    setAmtVal((prev) => Math.max(1, prev + delta));
  }, [settings.haptic]);

  const addExpense = useCallback(() => {
    if (isSaving) return;

    setIsSaving(true);
    if (settings.haptic) triggerHaptic("success");

    if (editingExpense) {
      // Edit mode: update in-place
      const updated: Expense = {
        ...editingExpense,
        category: selCat.id,
        amount: amtVal,
        note: note.trim(),
        createdAt: new Date(txDate + "T12:00:00").toISOString(),
        type: txType,
        walletId: selWalletId,
        isRecurring: isRecurring,
        frequency: isRecurring ? "monthly" : undefined,
      };
      setExpenses((prev) => prev.map((e) => e.id === updated.id ? updated : e));
    } else {
      // Create mode: prepend new entry
      const e: Expense = {
        id: generateId(),
        category: selCat.id,
        amount: amtVal,
        note: note.trim(),
        createdAt: new Date(txDate + "T12:00:00").toISOString(),
        type: txType,
        walletId: selWalletId,
        isRecurring: isRecurring,
        frequency: isRecurring ? "monthly" : undefined,
      };
      setExpenses((prev) => [e, ...prev]);
    }

    setTimeout(() => {
      setIsSaving(false);
      setEditingExpense(null);
      setNote("");
      setAmtVal(150);
      setTxType("expense");
      setIsRecurring(false);
      setTxDate(new Date().toISOString().slice(0, 10));
      go("dash");
    }, 900);
  }, [selCat, amtVal, note, go, isSaving, txType, selWalletId, isRecurring, txDate, editingExpense]);

  const deleteExpense = useCallback((id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const editExpense = useCallback((updated: Expense) => {
    setExpenses((prev) => prev.map((e) => e.id === updated.id ? updated : e));
    if (settings.haptic) triggerHaptic("success");
  }, [settings.haptic]);

  const handleEditOpen = useCallback((expense: Expense) => {
    setEditingExpense(expense);
    setSelCat(CATEGORIES.find(c => c.id === expense.category) || CATEGORIES[0]);
    setAmtVal(expense.amount);
    setAmtInput(expense.amount.toString());
    setNote(expense.note || "");
    setTxType(expense.type || "expense");
    setSelWalletId(expense.walletId || "cash");
    setIsRecurring(expense.isRecurring || false);
    setTxDate(expense.createdAt.slice(0, 10));
    go("amt");
  }, [go]);

  const handleDuplicateExpense = useCallback((item: Expense) => {
    const duplicated: Expense = {
      ...item,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    setExpenses(prev => [duplicated, ...prev]);
    if (settings.haptic) triggerHaptic("success");
  }, [settings.haptic]);

  const handleAddExpense = useCallback((expenseData: Omit<Expense, "id">) => {
    const newExp: Expense = {
      ...expenseData,
      id: generateId(),
    };
    setExpenses(prev => [newExp, ...prev]);
    if (settings.haptic) triggerHaptic("success");
  }, [settings.haptic]);

  const handleBulkDeleteExpenses = useCallback((expenseIds: string[]) => {
    setExpenses(prev => prev.filter(e => !expenseIds.includes(e.id)));
    if (settings.haptic) triggerHaptic("medium");
  }, [settings.haptic]);

  const handleUpdateSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      if (activeUserId) {
        const userKeys = getUserStorageKeys(activeUserId);
        saveStorage(userKeys.SETTINGS, updated);
      }
      return updated;
    });
  }, [activeUserId]);

  const handleUpdateUser = useCallback((updatedFields: Partial<UserProfile>) => {
    setUsers(prev => prev.map(u => u.id === activeUserId ? { ...u, ...updatedFields } : u));
  }, [activeUserId]);


  const handleQuickAdd = useCallback(() => {
    const val = parseFloat(quickAmt);
    if (!val || isNaN(val) || val <= 0) {
      if (settings.haptic) triggerHaptic("error");
      return;
    }
    const newExp: Expense = {
      id: generateId(),
      category: quickCatId,
      amount: val,
      note: quickNote.trim(),
      createdAt: new Date().toISOString(),
      type: quickType,
      walletId: quickWalletId,
    };
    setExpenses(prev => [newExp, ...prev]);
    setQuickAmt("");
    setQuickNote("");
    setQuickSaving(true);
    if (settings.haptic) triggerHaptic("success");
    setTimeout(() => setQuickSaving(false), 1000);
  }, [quickAmt, quickCatId, quickNote, quickType, quickWalletId, settings.haptic]);

  const handleCSVImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const imported = parseCSVToExpenses(text, expenses);
      if (imported.length === 0) {
        alert("No new expenses found. Make sure the CSV has date and amount columns.");
        return;
      }
      setExpenses(prev => [...imported, ...prev]);
      if (settings.haptic) triggerHaptic("success");
      alert(`✅ Imported ${imported.length} expense${imported.length !== 1 ? "s" : ""} successfully!`);
    };
    reader.readAsText(file);
    // Reset input so same file can be re-imported
    e.target.value = "";
  }, [expenses, settings.haptic]);

  // ── Global keyboard support ──────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");

      if (isInputActive) {
        if (e.key === "Enter" && screen === "amt" && activeEl.id !== "p-upload") {
          e.preventDefault();
          if (settings.haptic) triggerHaptic("success");
          setAmtInput("");
          setShowKeypad(false);
          addExpense();
        }
        return;
      }

      if (pendingSwitchUserId) {
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          handleSwitchPinInput(e.key);
        } else if (e.key === "Backspace") {
          e.preventDefault();
          if (settings.haptic) triggerHaptic("light");
          setSwitchPinInput(p => p.slice(0, -1));
          setSwitchPinError(false);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setPendingSwitchUserId(null);
          setSwitchPinInput("");
        }
        return;
      }

      if (screen === "lock" && settings.pin) {
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          handlePinInput(e.key);
        } else if (e.key === "Backspace") {
          e.preventDefault();
          if (settings.haptic) triggerHaptic("light");
          setPinInput(p => p.slice(0, -1));
        }
      }

      if (screen === "amt") {
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          if (settings.haptic) triggerHaptic("light");
          setAmtInput(prev => {
            const next = prev + e.key;
            if (next.length > 7) return prev;
            setAmtVal(parseInt(next) || 0);
            return next;
          });
        } else if (e.key === "Backspace") {
          e.preventDefault();
          if (settings.haptic) triggerHaptic("light");
          setAmtInput(prev => {
            const next = prev.slice(0, -1);
            setAmtVal(parseInt(next) || 0);
            return next;
          });
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (settings.haptic) triggerHaptic("success");
          setAmtInput("");
          setShowKeypad(false);
          addExpense();
        } else if (e.key === "Escape" || e.key === "o" || e.key === "O") {
          e.preventDefault();
          if (settings.haptic) triggerHaptic("medium");
          setShowKeypad(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [screen, settings.pin, settings.haptic, handlePinInput, addExpense, pendingSwitchUserId, handleSwitchPinInput]);

  const registerBiometrics = useCallback(async () => {
    try {
      if (!window.PublicKeyCredential) throw new Error("Not supported");

      setBioStatus("scanning");
      const credential = await navigator.credentials.create({
        publicKey: {
          ...AUTH_CONFIG.publicKey,
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          user: {
            ...AUTH_CONFIG.publicKey.user,
            id: crypto.getRandomValues(new Uint8Array(16)) // Ensure unique user ID per device
          }
        }
      });

      if (!credential) {
        setBioStatus(null);
        return false;
      }

      const rawId = (credential as any).rawId;
      const storageKey = `bio_cred_${settings.userEmail || "default"}`;
      localStorage.setItem(storageKey, bufferToBase64url(rawId));

      if (settings.haptic) triggerHaptic("success");
      setBioStatus("success");
      setTimeout(() => setBioStatus(null), 1000);
      return true;
    } catch (err) {
      console.error(err);
      setBioStatus("fail");
      setTimeout(() => setBioStatus(null), 2000);
      alert("Failed to register biometrics. Ensure your device supports it.");
      return false;
    }
  }, [settings.userEmail, settings.haptic]);

  const updateSetting = useCallback(async <K extends keyof Settings>(key: K, val: Settings[K]) => {
    if (key === "biometric" && val === true) {
      const success = await registerBiometrics();
      if (!success) return;
    }
    if (settings.haptic) triggerHaptic("medium");
    setSettings((s) => ({ ...s, [key]: val }));
  }, [settings.haptic, registerBiometrics]);

  // ── Derived values ───────────────────────────────────────────────────────────
  const todayExpenses = filterByPeriod(expenses, "today");
  const todayTotal = sumExpenses(todayExpenses);
  const periodExpenses = filterByPeriod(expenses, period);
  const periodTotal = sumExpenses(periodExpenses);
  const barData = weeklyTotals(expenses);

  const topCats = categories
    .map((c) => ({ ...c, total: categoryTotal(expenses, c.id) }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);
  const maxCatTotal = Math.max(...topCats.map((c) => c.total), 1);

  const filteredExpenses = expenses.filter((e) => {
    const catMatch = histCat === "all" || e.category === histCat;
    const noteMatch = !histSearch ||
      (e.note || "").toLowerCase().includes(histSearch.toLowerCase()) ||
      e.category.includes(histSearch.toLowerCase());

    let timeMatch = true;
    if (histTime !== "all") {
      const expDate = new Date(e.createdAt);
      const now = new Date();
      if (histTime === "this_month") {
        timeMatch = expDate.getFullYear() === now.getFullYear() && expDate.getMonth() === now.getMonth();
      } else if (histTime === "last_30") {
        const diffDays = (now.getTime() - expDate.getTime()) / (1000 * 3600 * 24);
        timeMatch = diffDays >= 0 && diffDays <= 30;
      } else if (histTime === "this_year") {
        timeMatch = expDate.getFullYear() === now.getFullYear();
      }
    }
    return catMatch && noteMatch && timeMatch;
  });

  const sortedExpenses = [...filteredExpenses].sort((a, b) => {
    if (histSort === "amount_desc") return b.amount - a.amount;
    if (histSort === "amount_asc") return a.amount - b.amount;
    if (histSort === "date_asc") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const isAmountSorted = histSort === "amount_desc" || histSort === "amount_asc";
  const groupedHistory = groupByDate(sortedExpenses);
  const historyDates = Object.keys(groupedHistory).sort((a, b) => {
    if (histSort === "date_asc") return a.localeCompare(b);
    return b.localeCompare(a);
  });

  // ── Voice Logic ─────────────────────────────────────────────────────────────
  function parseVoiceInput(text: string) {
    const lower = text.toLowerCase();
    
    // 1. Spoken Word & Numeric Amount Extractor (handles "1200", "5k", "two thousand five hundred", "fifty rupees", etc.)
    const amount = extractVoiceAmount(lower);

    // 2. Voice Income Detection (e.g. "Received salary 50000", "Got freelance payment 15000")
    const isIncome = INCOME_KEYWORDS.some(kw => lower.includes(kw));
    const targetCategories = isIncome ? INCOME_CATEGORIES : categories;

    // 3. Smart Category Match with Hinglish + English support
    let categoryMatch: string = isIncome ? "salary" : categories[0].id;
    const kwMatch = smartMatchCategory(lower, CATEGORY_KEYWORDS);
    if (kwMatch) {
      categoryMatch = kwMatch;
    } else {
      // Fallback search
      for (const cat of targetCategories) {
        if (lower.includes(cat.label.toLowerCase()) || lower.includes(cat.id)) {
          categoryMatch = cat.id;
          break;
        }
      }
    }

    // 4. Note formatting
    let note = text.trim();
    if (note.length > 0) {
      note = note.charAt(0).toUpperCase() + note.slice(1);
    }

    setParsedExpense({
      amount: amount || 150,
      category: categoryMatch,
      note: note,
      type: isIncome ? "income" : "expense",
      walletId: settings.defaultWalletId || "cash",
    });

    setVoiceStep(1);
    if (settings.haptic) triggerHaptic("success");
  }

  function startVoice() {
    const SpeechRecognitionAPI = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
    
    if (!SpeechRecognitionAPI) {
      alert("Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }

    setVoiceStep(0);
    setVoiceOpen(true);
    setTranscript("Listening...");
    setParsedExpense(null);

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = 'en-IN'; // Optimized for Indian English & Hinglish
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        if (settings.haptic) triggerHaptic("light");
      };

      recognition.onresult = (event: any) => {
        const current = event.resultIndex;
        const result = event.results[current][0].transcript;
        setTranscript(result);
        
        if (event.results[0].isFinal) {
          setIsListening(false);
          parseVoiceInput(result);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech error:", event.error);
        setTranscript(`Error: ${event.error}`);
        setIsListening(false);
        setTimeout(() => setVoiceOpen(false), 2000);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.error(err);
      alert("Could not start microphone. Please check browser microphone permissions.");
      setVoiceOpen(false);
    }
  }

  function confirmVoice() {
    if (!parsedExpense) return;
    const isInc = parsedExpense.type === "income";
    const e: Expense = {
      id: generateId(),
      category: parsedExpense.category || (isInc ? "salary" : "food"),
      amount: parsedExpense.amount || 0,
      note: parsedExpense.note || "",
      type: isInc ? "income" : "expense",
      walletId: parsedExpense.walletId || settings.defaultWalletId || "cash",
      createdAt: new Date().toISOString(),
    };
    setExpenses((prev) => [e, ...prev]);
    setVoiceOpen(false);
    if (settings.haptic) triggerHaptic("success");
    go("dash");
  }

  function renderVoiceModal() {
    if (!voiceOpen) return null;
    const isInc = parsedExpense?.type === "income";
    const allKnownCats = [...categories, ...INCOME_CATEGORIES];
    const catObj = allKnownCats.find(c => c.id === parsedExpense?.category);

    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0, 0, 0, 0.78)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "24px 16px",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}>
        <div style={{
          ...S.voiceBox,
          maxWidth: 380,
          maxHeight: "90vh",
          overflowY: "auto",
          margin: "auto 0",
          background: TOKEN.surface,
          boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
          border: `1px solid ${isListening ? TOKEN.amber : TOKEN.border}`,
        }} className="screen-enter">
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
            <div style={S.label}>{voiceStep === 0 ? "Voice AI Assistant" : "Parsed Transaction"}</div>
            {parsedExpense?.type && (
              <span style={{
                fontSize: 10, padding: "2px 8px", borderRadius: 10,
                background: isInc ? "rgba(29,158,117,0.15)" : "rgba(239,159,39,0.15)",
                color: isInc ? TOKEN.success : TOKEN.amber,
                fontWeight: 600, textTransform: "uppercase",
              }}>
                {isInc ? "💰 Income" : "💸 Expense"}
              </span>
            )}
          </div>

          {voiceStep === 0 && (
            <div style={{ fontSize: 16, color: TOKEN.text, textAlign: "center", fontStyle: "italic", minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
              "{transcript}"
            </div>
          )}

          <div
            onClick={() => {
              if (!isListening) startVoice();
            }}
            style={{
              ...S.voiceRing,
              background: isListening ? "rgba(239, 159, 39, 0.15)" : TOKEN.surfaceElevated,
              borderColor: isListening ? TOKEN.amber : TOKEN.borderSub,
              animation: isListening ? "pulseSuccess 1.5s infinite" : "none",
            }}
          >
            <MicIcon size={32} color={TOKEN.amber} />
          </div>

          <div style={{ fontSize: 12, color: isListening ? TOKEN.amber : TOKEN.muted, textAlign: "center", lineHeight: 1.4 }}>
            {isListening
              ? "Speak now (e.g. 'Paid 350 for Swiggy' or 'Received 15000 freelance')"
              : voiceStep === 0
                ? "Processing speech..."
                : "Review details & confirm"}
          </div>

          {voiceStep === 1 && parsedExpense && (
            <>
              <div style={S.voiceResult}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={S.label}>Detected Amount</span>
                  <span style={{ color: isInc ? TOKEN.success : TOKEN.amber, fontSize: 18, fontWeight: 700, fontFamily: TOKEN.mono }}>
                    {isInc ? "+" : "-"}{fmt(parsedExpense.amount || 0, settings.currency || "₹")}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: TOKEN.muted }}>Category</span>
                  <span style={{ color: TOKEN.text, fontSize: 13, fontWeight: 600 }}>
                    {catObj?.icon} {catObj?.label || parsedExpense.category}
                  </span>
                </div>
                {parsedExpense.note && (
                  <div style={{ color: TOKEN.dim, fontSize: 11, marginTop: 4, fontStyle: "italic", textAlign: "left" }}>
                    "{parsedExpense.note}"
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, width: "100%" }}>
                <button
                  onClick={confirmVoice}
                  style={{ ...S.confirmBtn, background: isInc ? TOKEN.success : TOKEN.amber, color: "#fff", fontWeight: 700 }}
                >
                  Confirm &amp; Save
                </button>
              </div>
            </>
          )}

          <button
            onClick={() => { setVoiceOpen(false); setIsListening(false); }}
            style={{ background: "none", border: "none", color: TOKEN.muted, cursor: "pointer", fontSize: 12, marginTop: 4 }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  SCREENS
  // ════════════════════════════════════════════════════════════════════════════

  function renderAuth() {
    return (
      <AuthScreen
        initialMode={authInitialMode}
        isDesktop={isDesktop}
        theme={settings.theme || "dark"}
        onSwitchToProfiles={() => setScreen("user_select")}
        onSuccess={(result) => {
          const authUser = result.user;
          // Update users state if this user wasn't in list yet
          setUsers((prev) => {
            const exists = prev.some((u) => u.id === authUser.id);
            if (!exists) {
              const updated = [...prev, authUser];
              saveStorage(STORAGE_KEYS.USERS, updated);
              return updated;
            }
            return prev.map(u => u.id === authUser.id ? { ...u, ...authUser } : u);
          });

          // Activate this user
          setActiveUserId(authUser.id);
          saveStorage(STORAGE_KEYS.ACTIVE_USER, authUser.id);
          enterpriseStorage.setActiveUser(authUser.id).catch(console.error);

          const activeData = result.activeData;
          const userKeys = getUserStorageKeys(authUser.id);

          const loadedSettings: Settings = activeData?.settings || {
            ...DEFAULT_SETTINGS,
            userName: authUser.name,
            userEmail: authUser.email || "",
          };
          const loadedExpenses: Expense[] = activeData?.expenses || [];
          const loadedCategories: Category[] = activeData?.categories && activeData.categories.length > 0
            ? activeData.categories
            : ALL_CATEGORIES;
          const loadedWallets: Wallet[] = activeData?.wallets && activeData.wallets.length > 0
            ? activeData.wallets
            : WALLETS;
          const loadedBudgetGoals: BudgetGoal[] = activeData?.budgetGoals || [];

          saveStorage(userKeys.SETTINGS, loadedSettings);
          saveStorage(userKeys.EXPENSES, loadedExpenses);

          setSettings(loadedSettings);
          setExpenses(loadedExpenses);
          setCategories(loadedCategories);
          setWallets(loadedWallets);
          setBudgetGoals(loadedBudgetGoals);

          setPinInput("");
          setLoginSuccess(false);
          setBioStatus(null);

          // Check onboarding status
          if (authUser.onboardingStatus && authUser.onboardingStatus !== "completed" && !authUser.isProfileCompleted) {
            setScreen("onboarding");
          } else {
            setScreen("dash");
          }
          if (loadedSettings.haptic) triggerHaptic("success");
        }}
      />
    );
  }

  function renderUserSelect() {
    const isLight = settings.theme === "light";
    return (
      <div style={{
        minHeight: "100%", width: "100%",
        background: isLight 
          ? "linear-gradient(180deg, #FFFFFF 0%, #F8F9FD 100%)" 
          : TOKEN.bg,
        color: isLight ? "#111827" : TOKEN.text,
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "flex-start",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        padding: "40px 24px", boxSizing: "border-box", gap: 0
      }} className="screen-enter form-screen">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", margin: "auto 0" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            fontSize: 11, color: TOKEN.amber, letterSpacing: "0.25em",
            textTransform: "uppercase", fontWeight: 800, marginBottom: 8
          }}>KHARCHA</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: isLight ? "#111827" : TOKEN.text, lineHeight: 1.2 }}>
            Who's logging in?
          </div>
          <div style={{ fontSize: 13, color: isLight ? "#4B5563" : TOKEN.muted, marginTop: 8 }}>
            Select an existing profile or create your own account
          </div>
        </div>

        {/* User grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(users.length + 1, 3)}, minmax(110px, 140px))`,
          gap: 16, justifyContent: "center", width: "100%", maxWidth: 480
        }}>
          {users.map((user) => {
            const colors = ["#EF9F27", "#378ADD", "#1D9E75", "#7F77DD", "#D85A30"];
            const colorIdx = user.name.charCodeAt(0) % colors.length;
            const accentColor = colors[colorIdx];
            const uKeys = getUserStorageKeys(user.id);
            const uSet = loadStorage<Settings>(uKeys.SETTINGS, DEFAULT_SETTINGS);
            const isProtected = Boolean(uSet.pin && uSet.pinCode);
            const isActive = user.id === activeUserId && screen !== "user_select";
            return (
              <button
                key={user.id}
                onClick={() => requestSwitchUser(user.id)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
                  padding: "22px 14px", borderRadius: 22,
                  border: `1px solid ${isActive ? accentColor : (isLight ? "rgba(0,0,0,0.08)" : TOKEN.border)}`,
                  background: isActive ? `${accentColor}14` : (isLight ? "#FFFFFF" : TOKEN.surfaceHighlight),
                  boxShadow: isLight ? "0 4px 16px rgba(0,0,0,0.05)" : "none",
                  cursor: "pointer", transition: "all 0.2s",
                  backdropFilter: "blur(12px)",
                  position: "relative"
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = isLight ? "#F9FAFB" : TOKEN.surfaceElevated;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = accentColor;
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-4px)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = isActive ? `${accentColor}14` : (isLight ? "#FFFFFF" : TOKEN.surfaceHighlight);
                  (e.currentTarget as HTMLButtonElement).style.borderColor = isActive ? accentColor : (isLight ? "rgba(0,0,0,0.08)" : TOKEN.border);
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                }}
              >
                {/* Lock Badge */}
                {isProtected && (
                  <div style={{
                    position: "absolute", top: 12, right: 12,
                    fontSize: 12, opacity: 0.65
                  }} title="PIN Protected Profile">
                    🔒
                  </div>
                )}
                {/* Avatar */}
                <div style={{
                  width: 70, height: 70, borderRadius: "50%", overflow: "hidden",
                  background: `linear-gradient(135deg, ${accentColor}33, ${accentColor}11)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: `2.5px solid ${accentColor}55`,
                  fontSize: 28, fontWeight: 700, color: accentColor,
                  boxShadow: isLight ? `0 6px 18px ${accentColor}25` : `0 0 24px ${accentColor}22`
                }}>
                  {user.avatar
                    ? <img src={user.avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt={user.name} />
                    : user.name.charAt(0).toUpperCase()
                  }
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: isLight ? "#111827" : TOKEN.text, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", width: "100%", whiteSpace: "nowrap" }}>
                  {user.name}
                </div>
                <div style={{
                  fontSize: 10, color: accentColor, fontWeight: 700, letterSpacing: "0.08em",
                  textTransform: "uppercase", background: `${accentColor}18`,
                  padding: "3px 10px", borderRadius: 20
                }}>
                  {isProtected ? "Locked →" : "Login →"}
                </div>
              </button>
            );
          })}

          {/* Add User / Sign Up card */}
          <button
            onClick={() => {
              if (settings.haptic) triggerHaptic("medium");
              setAuthInitialMode("register");
              setScreen("auth");
            }}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
              padding: "22px 14px", borderRadius: 22,
              border: `1.5px dashed ${isLight ? "rgba(217,119,6,0.35)" : "rgba(239,159,39,0.3)"}`,
              background: isLight ? "#FFFBEB" : "rgba(239,159,39,0.03)",
              boxShadow: isLight ? "0 4px 16px rgba(217,119,6,0.06)" : "none",
              cursor: "pointer", transition: "all 0.2s"
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = TOKEN.amber;
              (e.currentTarget as HTMLButtonElement).style.background = isLight ? "#FEF3C7" : "rgba(239,159,39,0.08)";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-4px)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = isLight ? "rgba(217,119,6,0.35)" : "rgba(239,159,39,0.3)";
              (e.currentTarget as HTMLButtonElement).style.background = isLight ? "#FFFBEB" : "rgba(239,159,39,0.03)";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
            }}
          >
            <div style={{
              width: 70, height: 70, borderRadius: "50%",
              background: isLight ? "#FEF3C7" : "rgba(239,159,39,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28, color: TOKEN.amber,
              border: `1.5px dashed ${isLight ? "rgba(217,119,6,0.4)" : "rgba(239,159,39,0.4)"}`
            }}>+</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: TOKEN.amber }}>Sign Up</div>
            <div style={{ fontSize: 10, color: isLight ? "#6B7280" : TOKEN.muted }}>New Account</div>
          </button>
        </div>

        {/* Independent Registration & Login Action Buttons */}
        <div style={{
          marginTop: 34,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          width: "100%",
          maxWidth: 380,
        }}>
          <button
            onClick={() => {
              if (settings.haptic) triggerHaptic("medium");
              setAuthInitialMode("register");
              setScreen("auth");
            }}
            style={{
              width: "100%",
              padding: "13px 20px",
              borderRadius: 14,
              border: isLight ? "none" : "1px solid rgba(239,159,39,0.4)",
              background: isLight 
                ? "linear-gradient(135deg, #D97706 0%, #EA580C 100%)" 
                : "linear-gradient(135deg, rgba(239,159,39,0.22), rgba(216,90,48,0.15))",
              color: isLight ? "#FFFFFF" : TOKEN.amber,
              fontWeight: 700,
              fontSize: 13.5,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: isLight ? "0 6px 20px rgba(217,119,6,0.25)" : "0 4px 16px rgba(239,159,39,0.12)",
              transition: "all 0.2s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.01)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
            }}
          >
            <span>✨</span>
            <span>Create New Account (Sign Up)</span>
          </button>

          <button
            onClick={() => {
              if (settings.haptic) triggerHaptic("light");
              setAuthInitialMode("login");
              setScreen("auth");
            }}
            style={{
              width: "100%",
              padding: "12px 20px",
              borderRadius: 14,
              border: isLight ? "1px solid rgba(0,0,0,0.1)" : "1px solid rgba(255,255,255,0.08)",
              background: isLight ? "#FFFFFF" : "rgba(255,255,255,0.04)",
              color: isLight ? "#1F2937" : "rgba(255,255,255,0.7)",
              boxShadow: isLight ? "0 2px 8px rgba(0,0,0,0.04)" : "none",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 0.2s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = isLight ? "#F9FAFB" : "rgba(255,255,255,0.08)";
              (e.currentTarget as HTMLButtonElement).style.color = isLight ? "#111827" : "#ffffff";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = isLight ? "#FFFFFF" : "rgba(255,255,255,0.04)";
              (e.currentTarget as HTMLButtonElement).style.color = isLight ? "#1F2937" : "rgba(255,255,255,0.7)";
            }}
          >
            <span>✉️</span>
            <span>Sign In with Email & Password</span>
          </button>
        </div>

        {/* Footer info */}
        <div style={{ marginTop: 26, fontSize: 11.5, color: isLight ? "#6B7280" : "rgba(255,255,255,0.25)", textAlign: "center" }}>
          New users can register independently • Existing users can unlock via PIN or credentials
        </div>
        </div>
      </div>
    );
  }

  function renderUserManage() {
    return (
      <div style={S.screenPad} className="screen-enter form-screen">
        <div style={S.row}>
          <button onClick={() => go("set")} style={S.iconBtn} aria-label="Back"><ArrowLeftIcon color={TOKEN.dim} /></button>
          <div style={S.heading}>Manage Users</div>
          <div style={{ width: 34 }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 24 }}>
          {users.map((user) => (
            <div key={user.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
                background: TOKEN.surfaceElevated, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, border: `2px solid ${user.id === activeUserId ? TOKEN.amber : "transparent"}`
              }}>
                {user.avatar
                  ? <img src={user.avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt={user.name} />
                  : user.name.charAt(0).toUpperCase()
                }
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: TOKEN.text, fontSize: 15 }}>{user.name}</div>
                {user.id === activeUserId && <div style={{ fontSize: 11, color: TOKEN.amber }}>Currently active</div>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    const newName = window.prompt("Rename user:", user.name);
                    if (newName?.trim()) renameUser(user.id, newName.trim());
                  }}
                  style={{ background: "none", border: `1px solid ${TOKEN.border}`, borderRadius: 8, padding: "5px 10px", color: TOKEN.textSub, cursor: "pointer", fontSize: 11 }}
                >Rename</button>
                {user.id !== activeUserId && (
                  <button
                    onClick={() => { if (window.confirm(`Delete ${user.name}? All their data will be lost.`)) deleteUser(user.id); }}
                    style={{ background: "none", border: "none", color: TOKEN.danger, cursor: "pointer", fontSize: 11 }}
                  >Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => { const name = window.prompt("New user name:"); if (name?.trim()) createUser(name.trim()); }}
          style={{ ...S.primaryBtn, marginTop: 20, width: "100%" }}
        >+ Add New User</button>

        <button
          onClick={() => go("user_select")}
          style={{ ...S.primaryBtn, marginTop: 12, width: "100%", background: TOKEN.surfaceHighlight, color: TOKEN.textSub }}
        >Switch User</button>
      </div>
    );
  }

  function renderLock() {
    const handleForgot = () => {
      setAuthInitialMode("forgot");
      setScreen("auth");
    };

    const lastCount = expenses.length;
    const lastTotal = sumExpenses(expenses);
    const activeUser = users.find(u => u.id === activeUserId);
    const isLight = settings.theme === "light";

    return (
      <div style={{
        ...S.screen,
        background: isLight 
          ? "linear-gradient(180deg, #FFFFFF 0%, #F8F9FD 100%)" 
          : "linear-gradient(180deg, #09090F 0%, #060608 100%)",
        padding: "36px 24px",
        justifyContent: "flex-start",
        gap: 0,
        boxSizing: "border-box",
        width: "100%",
        minHeight: "100%",
        ...(shake ? { animation: "shake 0.4s ease-in-out" } : {}),
        ...(loginSuccess ? S.pulseSuccess : {}),
      } as any} className="screen-enter form-screen">
        {bioStatus && <BiometricOverlay status={bioStatus} onCancel={() => setBioStatus(null)} />}

        {/* Brand Header */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{
            fontSize: 10.5,
            letterSpacing: "0.28em",
            color: TOKEN.amber,
            textTransform: "uppercase",
            fontWeight: 800,
            marginBottom: 6,
          }}>
            Expense Tracker
          </div>
          <div style={{
            fontSize: 32,
            fontWeight: 800,
            color: isLight ? "#111827" : "#FFFFFF",
            letterSpacing: "0.06em",
          }}>
            KHARCHA
          </div>
        </div>

        {/* Active User profile details */}
        {activeUser && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "10px 0 14px" }}>
            <div style={{
              width: 82, height: 82, borderRadius: "50%", overflow: "hidden",
              background: isLight ? "#FFF7ED" : "rgba(239, 159, 39, 0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `2.5px solid ${TOKEN.amber}`, fontSize: 34, fontWeight: 800, color: TOKEN.amber,
              boxShadow: isLight
                ? "0 10px 25px -4px rgba(217, 119, 6, 0.22), 0 4px 10px rgba(0,0,0,0.04)"
                : "0 0 24px rgba(239, 159, 39, 0.2)"
            }}>
              {activeUser.avatar
                ? <img src={activeUser.avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt={activeUser.name} />
                : activeUser.name.charAt(0).toUpperCase()
              }
            </div>
            <div style={{
              fontSize: 18.5,
              fontWeight: 700,
              color: isLight ? "#111827" : "#FFFFFF",
              marginTop: 10,
            }}>
              {activeUser.name}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center" }}>
              <button
                onClick={() => {
                  if (settings.haptic) triggerHaptic("medium");
                  setScreen("user_select");
                }}
                style={{
                  background: isLight ? "#F3F4F6" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 20,
                  padding: "4px 12px",
                  color: TOKEN.amber,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = TOKEN.amber)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)")}
              >
                Switch User
              </button>
              <span style={{ color: isLight ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.2)", fontSize: 11 }}>•</span>
              <button
                onClick={() => {
                  if (settings.haptic) triggerHaptic("medium");
                  setAuthInitialMode("login");
                  setScreen("auth");
                }}
                style={{
                  background: isLight ? "#F3F4F6" : "rgba(255,255,255,0.06)",
                  border: `1px solid ${isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: 20,
                  padding: "4px 12px",
                  color: TOKEN.amber,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = TOKEN.amber)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)")}
              >
                Sign In with Email
              </button>
            </div>
          </div>
        )}

        {/* Biometric trigger if active */}
        {settings.biometric && (
          <div style={{ display: "flex", justifyContent: "center", margin: "6px 0 10px" }}>
            <button 
              onClick={() => { if (settings.haptic) triggerHaptic("medium"); handleBiometric(); }} 
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: isLight ? "#FFF7ED" : "rgba(239, 159, 39, 0.08)",
                border: `1.5px solid ${TOKEN.amber}`,
                boxShadow: isLight ? "0 4px 14px rgba(217, 119, 6, 0.15)" : "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              aria-label="Unlock with biometrics"
            >
              <FingerprintIcon size={24} color={TOKEN.amber} />
            </button>
          </div>
        )}

        {/* Instruction Text */}
        <div style={{ textAlign: "center", marginTop: 6 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: isLight ? "#4B5563" : TOKEN.textSub,
          }}>
            Enter PIN to unlock
          </div>
        </div>

        {/* PIN Squares */}
        <div style={{ display: "flex", gap: 14, justifyContent: "center", margin: "14px 0 18px" }}>
          {[0, 1, 2, 3].map((i) => {
            const filled = i < pinInput.length;
            return (
              <div
                key={i}
                style={{
                  width: 50,
                  height: 54,
                  borderRadius: 14,
                  background: isLight
                    ? (filled ? "#FFFBEB" : "#F3F4F8")
                    : (filled ? "rgba(239, 159, 39, 0.12)" : TOKEN.surfaceHighlight),
                  border: `1.5px solid ${filled ? TOKEN.amber : (isLight ? "rgba(0,0,0,0.08)" : TOKEN.border)}`,
                  boxShadow: isLight
                    ? (filled ? "0 4px 12px rgba(217,119,6,0.18)" : "inset 0 1px 3px rgba(0,0,0,0.04)")
                    : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                  transform: filled ? "scale(1.05)" : "scale(1)",
                }}
              >
                <div
                  style={{
                    width: filled ? 12 : 8,
                    height: filled ? 12 : 8,
                    borderRadius: "50%",
                    background: filled ? TOKEN.amber : (isLight ? "#CBD5E1" : TOKEN.dim),
                    boxShadow: filled ? `0 0 10px ${TOKEN.amber}` : "none",
                    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Number Keypad (Minimal & tactile) */}
        {settings.pin && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            width: "100%",
            maxWidth: 270,
            margin: "0 auto",
          }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, "forgot", 0, "back"].map((n) => {
              if (n === "forgot") return (
                <button
                  key="f"
                  onClick={handleForgot}
                  style={{
                    background: "none",
                    border: "none",
                    color: isLight ? "#6B7280" : TOKEN.dim,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    cursor: "pointer",
                    height: 50,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 14,
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = TOKEN.amber)}
                  onMouseLeave={e => (e.currentTarget.style.color = isLight ? "#6B7280" : TOKEN.dim)}
                >
                  FORGOT
                </button>
              );
              if (n === "back") return (
                <button
                  key="b"
                  onClick={() => {
                    if (settings.haptic) triggerHaptic("light");
                    setPinInput((p) => p.slice(0, -1));
                  }}
                  style={{
                    background: isLight ? "#F9FAFB" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)"}`,
                    color: isLight ? "#374151" : TOKEN.textSub,
                    fontSize: 22,
                    cursor: "pointer",
                    height: 50,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 14,
                    boxShadow: isLight ? "0 2px 6px rgba(0,0,0,0.04)" : "none",
                    transition: "all 0.15s",
                  }}
                  onPointerDown={e => {
                    e.currentTarget.style.background = isLight ? "#E5E7EB" : "rgba(255,255,255,0.1)";
                    e.currentTarget.style.transform = "scale(0.95)";
                  }}
                  onPointerUp={e => {
                    e.currentTarget.style.background = isLight ? "#F9FAFB" : "rgba(255,255,255,0.03)";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  ⌫
                </button>
              );
              return (
                <button
                  key={n}
                  onClick={() => handlePinInput(n.toString())}
                  className="key-btn"
                  style={{
                    background: isLight ? "#FFFFFF" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${isLight ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.05)"}`,
                    borderRadius: 14,
                    color: isLight ? "#111827" : TOKEN.text,
                    fontSize: 22,
                    fontWeight: 600,
                    height: 50,
                    cursor: "pointer",
                    boxShadow: isLight ? "0 2px 8px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)" : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.15s",
                  }}
                  onPointerDown={e => {
                    e.currentTarget.style.background = isLight ? "#F3F4F8" : "rgba(255,255,255,0.12)";
                    e.currentTarget.style.transform = "scale(0.94)";
                  }}
                  onPointerUp={e => {
                    e.currentTarget.style.background = isLight ? "#FFFFFF" : "rgba(255,255,255,0.03)";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: "auto",
          paddingTop: 20,
          paddingBottom: 6,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          width: "100%",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11.5,
            color: isLight ? "#6B7280" : TOKEN.muted,
            background: isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)",
            padding: "4px 12px",
            borderRadius: 20,
            border: `1px solid ${isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"}`,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: TOKEN.amber }} />
            <span>Last session • {lastCount} expenses • {fmt(lastTotal)}</span>
          </div>
        </div>
      </div>
    );
  }


  // ────────────────────────────────────────────────────────────────────────────
  function renderCat() {
    return (
      <div style={S.screenPad} className="screen-enter form-screen">
        {/* Header */}
        <div style={{ ...S.row, marginBottom: 4 }}>
          <div>
            <div style={S.label}>Good {greeting()} 👋</div>
            <div style={S.heading}>New Expense</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { if (settings.haptic) triggerHaptic("medium"); startVoice(); }} style={S.iconBtn} aria-label="Voice logging">
              <span style={{ fontSize: 16 }}>🎙️</span>
            </button>
            <button onClick={() => { if (settings.haptic) triggerHaptic("light"); go("dash"); }} style={S.iconBtn} aria-label="Close">
              <span style={{ color: TOKEN.dim, fontSize: 16 }}>✕</span>
            </button>
          </div>
        </div>

        <BudgetCard total={todayTotal} count={todayExpenses.length} date={dateLabel(todayKey())} />

        {/* Expense/Income Toggle in Category Screen */}
        <div style={{ ...S.tabRow, marginBottom: 12, marginTop: 8 }}>
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTxType(t); if (settings.haptic) triggerHaptic("light"); }}
              style={{
                flex: 1, padding: 8, borderRadius: 8, border: "none", cursor: "pointer",
                background: txType === t ? (t === "income" ? TOKEN.success : TOKEN.amber) : "transparent",
                color: txType === t ? "#fff" : TOKEN.muted,
                fontWeight: 600,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.05em"
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ color: TOKEN.muted, fontSize: 12, marginTop: 4, marginBottom: 8 }}>Select category</div>

        <div style={{ ...S.catGrid, gridTemplateColumns: isDesktop ? "repeat(auto-fill, minmax(100px, 1fr))" : "repeat(3, 1fr)" }}>
          {categories
            .filter((cat) => (cat.type || "expense") === txType)
            .map((cat) => {
              const total = categoryTotal(expenses, cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    if (settings.haptic) triggerHaptic("light");
                    setSelCat(cat);
                    if (cat.defaultAmount) {
                      setAmtVal(cat.defaultAmount);
                      setAmtInput(cat.defaultAmount.toString());
                    } else {
                      setAmtVal(150);
                      setAmtInput("");
                    }
                    go("amt");
                  }}
                  className="cat-btn"
                  style={{
                    ...S.catBtn,
                    borderColor: selCat.id === cat.id ? cat.color : TOKEN.borderSub,
                    boxShadow: selCat.id === cat.id ? `0 0 16px ${cat.color}25` : "none",
                  }}
                >
                  <div style={{ ...S.picon, background: cat.bg }}>
                    <CatIcon id={cat.icon} size={18} color={cat.color} />
                  </div>
                  <div style={{ color: TOKEN.text, fontSize: 14, fontWeight: 600 }}>{cat.label}</div>
                  {total > 0 && <div style={{ color: TOKEN.muted, fontSize: 10 }}>{fmt(total)} this month</div>}
                </button>
              );
            })}
        </div>
      </div>
    );
  }

  // ─── Amount Entry Screen ───────────────────────────────────────────────────
  function renderAmt() {
    const handleNumInput = (num: string) => {
      if (settings.haptic) triggerHaptic("light");
      setAmtInput(prev => {
        const next = prev + num;
        if (next.length > 7) return prev; // Limit to 7 digits
        setAmtVal(parseInt(next) || 0);
        return next;
      });
    };

    const handleBackspace = () => {
      if (settings.haptic) triggerHaptic("light");
      setAmtInput(prev => {
        const next = prev.slice(0, -1);
        setAmtVal(parseInt(next) || 0);
        return next;
      });
    };

    return (
      <div style={S.screenPad} className="screen-enter form-screen">
        {/* Header */}
        <div style={S.row}>
          <button onClick={() => { go(editingExpense ? "hist" : "cat"); setAmtInput(""); setShowKeypad(false); setEditingExpense(null); }} style={S.iconBtn} aria-label="Back">
            <ArrowLeftIcon color={TOKEN.dim} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ ...S.picon, background: selCat.bg, width: 28, height: 28 }}>
              <CatIcon id={selCat.icon} size={14} color={selCat.color} />
            </div>
            <span style={{ color: TOKEN.text, fontSize: 15, fontWeight: 500 }}>
              {editingExpense ? `Edit — ${selCat.label}` : selCat.label}
            </span>
          </div>
          <div style={{ width: 34 }} />
        </div>
        {/* Expense/Income Toggle */}
        <div style={{ ...S.tabRow, marginBottom: 8 }}>
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                const nextType = t;
                setTxType(nextType);
                if (settings.haptic) triggerHaptic("light");
                // Update selected category if it doesn't match the new transaction type
                const matchingCats = categories.filter(c => (c.type || "expense") === nextType);
                if (matchingCats.length > 0 && (selCat.type || "expense") !== nextType) {
                  setSelCat(matchingCats[0]);
                  if (matchingCats[0].defaultAmount) {
                    setAmtVal(matchingCats[0].defaultAmount);
                    setAmtInput(matchingCats[0].defaultAmount.toString());
                  }
                }
              }}
              style={{
                flex: 1, padding: 8, borderRadius: 8, border: "none", cursor: "pointer",
                background: txType === t ? (t === "income" ? TOKEN.success : TOKEN.amber) : "transparent",
                color: txType === t ? "#fff" : TOKEN.muted,
                fontWeight: 600,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.05em"
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Category Selection Row */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "8px 0 16px", marginBottom: 8 }}>
          {categories
            .filter((c) => (c.type || "expense") === txType)
            .map((c) => {
              const active = selCat.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelCat(c);
                    if (settings.haptic) triggerHaptic("light");
                    if (c.defaultAmount) {
                      setAmtVal(c.defaultAmount);
                      setAmtInput(c.defaultAmount.toString());
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    whiteSpace: "nowrap",
                    padding: "6px 12px",
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    border: `1px solid ${active ? c.color : TOKEN.borderSub}`,
                    background: active ? `${c.color}22` : TOKEN.surface,
                    color: active ? c.color : TOKEN.textSub,
                    transition: "all 0.2s"
                  }}
                >
                  <CatIcon id={c.icon} size={14} color={active ? c.color : TOKEN.muted} />
                  <span>{c.label}</span>
                </button>
              );
            })}
        </div>

        {/* Note Input */}
        <div style={S.card} className="card">
          <div style={{ color: TOKEN.muted, fontSize: 11, marginBottom: 6 }}>Note</div>
          <input
            autoFocus={!showKeypad}
            value={note}
            onChange={(e) => {
              const val = e.target.value;
              setNote(val);
              // Smart Categorization
              const matchedCat = smartMatchCategory(val, CATEGORY_KEYWORDS);
              if (matchedCat) {
                const catObj = categories.find(c => c.id === matchedCat);
                if (catObj) setSelCat(catObj);
              }
            }}
            placeholder="Lunch, Petrol, Uber…"
            style={S.noteInput}
            onFocus={() => setShowKeypad(false)}
          />
        </div>

        {/* Date Input */}
        <div style={S.card} className="card">
          <div style={{ color: TOKEN.muted, fontSize: 11, marginBottom: 6 }}>Date</div>
          <input
            type="date"
            value={txDate}
            onChange={(e) => setTxDate(e.target.value)}
            style={S.noteInput}
            onFocus={() => setShowKeypad(false)}
          />
        </div>

        {/* Wallet Selector */}
        <div style={{ padding: "8px 0" }}>
          <div style={{ color: TOKEN.muted, fontSize: 10, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>Select Account</div>
          <div style={{ ...S.walletGrid, gridTemplateColumns: isDesktop ? "repeat(auto-fill, minmax(140px, 1fr))" : "repeat(2, minmax(0, 1fr))" }}>
            {WALLETS.map(w => (
              <button
                key={w.id}
                onClick={() => { setSelWalletId(w.id); if (settings.haptic) triggerHaptic("light"); }}
                style={{
                  ...S.walletCard,
                  borderColor: selWalletId === w.id ? TOKEN.amber : TOKEN.border,
                  background: selWalletId === w.id ? "rgba(239, 159, 39, 0.05)" : TOKEN.surface,
                  transition: "all 0.2s"
                } as any}
              >
                <div style={{ fontSize: 20 }}>{w.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: selWalletId === w.id ? TOKEN.amber : TOKEN.text }}>{w.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Recurring Toggle */}
        <div style={S.recurringToggle}>
          <div>
            <div style={{ color: TOKEN.textSub, fontSize: 13, fontWeight: 500 }}>Make Recurring</div>
            <div style={{ color: TOKEN.muted, fontSize: 10 }}>Every month automatically</div>
          </div>
          <Toggle on={isRecurring} onToggle={() => { setIsRecurring(!isRecurring); if (settings.haptic) triggerHaptic("medium"); }} />
        </div>

        {/* Amount Display */}
        <div
          style={{
            ...S.card,
            flex: 1,
            position: "relative",
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px 16px",
            background: showKeypad
              ? "linear-gradient(160deg, rgba(239, 159, 39, 0.08) 0%, rgba(14, 14, 22, 0.95) 100%)"
              : "linear-gradient(160deg, rgba(26, 26, 38, 0.7) 0%, rgba(12, 12, 18, 0.9) 100%)",
            border: showKeypad ? `1px solid ${txType === "income" ? TOKEN.success : TOKEN.amber}` : "1px solid rgba(255, 255, 255, 0.08)",
            boxShadow: showKeypad
              ? `0 16px 40px -8px ${txType === "income" ? "rgba(29, 158, 117, 0.25)" : "rgba(239, 159, 39, 0.25)"}`
              : "0 12px 28px -4px rgba(0, 0, 0, 0.4)",
            cursor: "pointer",
            transition: "all 0.25s ease",
          }}
          onClick={() => setShowKeypad(true)}
        >
          {/* Ambient Glow Orb */}
          <div style={{
            position: "absolute",
            top: -30,
            right: -30,
            width: 100,
            height: 100,
            borderRadius: "50%",
            background: showKeypad
              ? (txType === "income" ? "radial-gradient(circle, rgba(29, 158, 117, 0.25) 0%, transparent 70%)" : "radial-gradient(circle, rgba(239, 159, 39, 0.25) 0%, transparent 70%)")
              : "radial-gradient(circle, rgba(255, 255, 255, 0.05) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />

          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 12px",
            borderRadius: 12,
            background: showKeypad ? "rgba(239, 159, 39, 0.12)" : "rgba(255, 255, 255, 0.05)",
            color: showKeypad ? (txType === "income" ? TOKEN.success : TOKEN.amber) : TOKEN.muted,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}>
            <span>{showKeypad ? "⌨️ Enter Custom Amount" : "✏️ Tap To Edit Amount"}</span>
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 52,
              fontWeight: 700,
              color: showKeypad ? (txType === "income" ? TOKEN.success : TOKEN.amber) : TOKEN.text,
              fontFamily: TOKEN.mono,
              letterSpacing: "-2px",
              display: "flex",
              alignItems: "baseline",
              justifyContent: "center",
              gap: 4,
            }}>
              <span style={{ fontSize: 30, opacity: 0.8, fontWeight: 500 }}>{settings.currency || "₹"}</span>
              <span>{amtVal.toLocaleString("en-IN")}</span>
              {showKeypad && <span style={{ animation: "pulse 1s infinite", borderLeft: `3px solid ${txType === "income" ? TOKEN.success : TOKEN.amber}`, marginLeft: 2, height: "1em", display: "inline-block" }} />}
            </div>
          </div>
        </div>

        {/* Dynamic Controls: Keypad vs Adjusters */}
        {showKeypad ? (
          <div style={{ ...S.keypadGrid, gap: 10, maxWidth: "100%" } as any}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
              <button key={n} onClick={() => handleNumInput(n.toString())} className="key-btn" style={{ ...S.keyBtn, height: 50, borderRadius: 12 } as any}>{n}</button>
            ))}
            <button onClick={() => { if (settings.haptic) triggerHaptic("medium"); setShowKeypad(false); }} className="key-btn" style={{ ...S.keyBtn, height: 50, borderRadius: 12, color: TOKEN.amber } as any}>OK</button>
            <button onClick={() => handleNumInput("0")} className="key-btn" style={{ ...S.keyBtn, height: 50, borderRadius: 12 } as any}>0</button>
            <button onClick={handleBackspace} className="key-btn" style={{ ...S.keyBtn, height: 50, borderRadius: 12, color: TOKEN.danger } as any}>⌫</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "center", gap: 20, alignItems: "center" }}>
              <button onClick={() => { if (settings.haptic) triggerHaptic("light"); updateAmt(-50); }} style={S.adjBtn as any}>▼</button>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { if (settings.haptic) triggerHaptic("light"); updateAmt(-10); }} style={S.fineBtn}>−10</button>
                <button onClick={() => { if (settings.haptic) triggerHaptic("light"); updateAmt(10); }} style={S.fineBtn}>+10</button>
              </div>
              <button onClick={() => { if (settings.haptic) triggerHaptic("light"); updateAmt(50); }} style={S.adjBtn as any}>▲</button>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {[100, 200, 500, 1000].map(v => (
                <button
                  key={v}
                  onClick={() => { if (settings.haptic) triggerHaptic("medium"); setAmtVal(v); setAmtInput(v.toString()); }}
                  style={{
                    ...S.fineBtn,
                    padding: "6px 14px",
                    borderRadius: 20,
                    fontWeight: 600,
                    background: amtVal === v ? (txType === "income" ? `${TOKEN.success}22` : `${TOKEN.amber}22`) : TOKEN.surfaceElevated,
                    color: amtVal === v ? (txType === "income" ? TOKEN.success : TOKEN.amber) : TOKEN.textSub,
                    border: `1px solid ${amtVal === v ? (txType === "income" ? TOKEN.success : TOKEN.amber) : TOKEN.borderSub}`,
                    transition: "all 0.18s ease",
                  }}
                >
                  {settings.currency || "₹"}{v}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => { 
            if (settings.haptic) triggerHaptic("success");
            setAmtInput(""); 
            setShowKeypad(false); 
            addExpense(); 
          }}
          style={{
            ...S.primaryBtn,
            background: isSaving ? TOKEN.success : (txType === "income" ? TOKEN.success : TOKEN.amber),
            color: isSaving ? TOKEN.success : (txType === "income" ? "#fff" : TOKEN.amberText),
            marginTop: 10
          }}
        >
          {isSaving ? "✓ Saved!" : editingExpense ? "Update Expense" : "Save Expense"}
        </button>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  function renderDash() {
    const periodLabel = period === "today" ? "today" : period === "week" ? "this week" : "this month";
    const subText = `${periodExpenses.length} expense${periodExpenses.length !== 1 ? "s" : ""} ${periodLabel}`;
    const income = filterByPeriod(expenses, period).filter(e => e.type === "income");
    const incomeTotal = income.reduce((s, e) => s + e.amount, 0);

    const cur = settings.currency || "₹";
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisMonthExpenses = expenses.filter(e => e.createdAt.startsWith(currentMonthKey) && e.type !== "income");
    const thisMonthIncomes = expenses.filter(e => e.createdAt.startsWith(currentMonthKey) && e.type === "income");
    const monthExpensesTotal = thisMonthExpenses.reduce((s, e) => s + e.amount, 0);
    const monthIncomeTotal = thisMonthIncomes.reduce((s, e) => s + e.amount, 0);
    const netSavings = monthIncomeTotal - monthExpensesTotal;
    const savingsRate = monthIncomeTotal > 0 ? Math.max(0, Math.round((netSavings / monthIncomeTotal) * 100)) : 0;

    const balanceCard = (
      <div style={S.heroCard as any}>
        {/* Ambient glow orbs */}
        <div style={{
          position: "absolute", top: -35, right: -25,
          width: 140, height: 140, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(239,159,39,0.28) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: -20, left: -20,
          width: 100, height: 100, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(216,90,48,0.18) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{
            fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700,
            padding: "3px 10px", borderRadius: 12,
            background: "rgba(239, 159, 39, 0.12)", color: TOKEN.amber,
            border: "1px solid rgba(239, 159, 39, 0.25)",
          }}>
            TOTAL {periodLabel.toUpperCase()}
          </div>
          <div style={{ fontSize: 11, color: TOKEN.muted }}>{subText}</div>
        </div>

        <div style={{
          fontSize: 46, fontWeight: 800, color: "#ffffff",
          fontFamily: TOKEN.mono, letterSpacing: "-1.8px", lineHeight: 1.1,
          textShadow: "0 2px 14px rgba(239,159,39,0.22)",
          margin: "4px 0",
        }}>
          {fmt(periodTotal, settings.currency || "₹")}
        </div>

        {incomeTotal > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              padding: "4px 12px", borderRadius: 20,
              background: "rgba(16,185,129,0.14)",
              border: "1px solid rgba(16,185,129,0.3)",
              color: TOKEN.success, fontSize: 11, fontWeight: 700,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <span>↗</span>
              <span>+{fmt(incomeTotal, settings.currency || "₹")} income</span>
            </div>
          </div>
        )}
        {/* Week sparkline */}
        <div style={{ marginTop: 10, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <BarChart data={barData} currency={settings.currency || "₹"} />
        </div>
      </div>
    );

    const budgetAlert = !budgetAlertDismissed && todayTotal > settings.dailyBudget && (
      <div style={{
        padding: "14px 18px",
        background: `linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(226,75,74,0.05) 100%)`,
        borderRadius: 18,
        border: `1px solid rgba(239,68,68,0.3)`,
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: "0 8px 24px -4px rgba(239,68,68,0.2)",
      }}>
        <span style={{ fontSize: 22 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: TOKEN.danger, fontSize: 13, fontWeight: 700 }}>Daily budget exceeded!</div>
          <div style={{ color: TOKEN.textFaint, fontSize: 11, marginTop: 2 }}>
            Spent {fmt(todayTotal, settings.currency || "₹")} of {fmt(settings.dailyBudget, settings.currency || "₹")} today
          </div>
        </div>
        <button onClick={() => setBudgetAlertDismissed(true)} style={{ background: "none", border: "none", color: TOKEN.muted, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>
    );

    const budgetGoalsLink = budgetGoals.length > 0 && (
      <button
        onClick={() => go("budget_goals")}
        style={{
          ...S.card, flexDirection: "row", alignItems: "center", gap: 14, cursor: "pointer",
          border: `1px solid rgba(239,159,39,0.22)`,
          background: "linear-gradient(135deg, rgba(239,159,39,0.08) 0%, rgba(24,24,36,0.6) 100%)",
        } as any}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 12,
          background: "rgba(239,159,39,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          border: "1px solid rgba(239,159,39,0.3)",
        }}>🎯</div>
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ color: TOKEN.text, fontSize: 13, fontWeight: 600 }}>Budget Goals</div>
          <div style={{ color: TOKEN.muted, fontSize: 11 }}>
            {budgetGoals.filter(g => categoryTotal(expenses, g.categoryId) >= g.limit).length} categor{budgetGoals.filter(g => categoryTotal(expenses, g.categoryId) >= g.limit).length !== 1 ? "ies" : "y"} at limit
          </div>
        </div>
        <span style={{ color: TOKEN.amber, fontSize: 18, fontWeight: 700 }}>›</span>
      </button>
    );

    const walletsOverview = (
      <div>
        <div style={{ ...S.row, marginBottom: 12 }}>
          <div style={{ color: TOKEN.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Accounts</div>
          <button onClick={() => go("manage_wallets")} style={{ background: "none", border: "none", color: TOKEN.amber, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Manage →</button>
        </div>
        <div style={{ ...S.walletGrid, display: "grid", gridTemplateColumns: isDesktop ? "repeat(auto-fill, minmax(150px, 1fr))" : "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {wallets.map(w => {
            const balance = sumWalletBalance(expenses, w.id, w.initialBalance);
            const walletAccentColors: Record<string, string> = {
              cash: "#10B981",
              bank: "#378ADD",
              upi: "#8B5CF6",
            };
            const wColor = walletAccentColors[w.id] || TOKEN.amber;
            return (
              <div key={w.id} style={{
                ...S.walletCard,
                background: `linear-gradient(145deg, rgba(26, 26, 38, 0.78) 0%, rgba(16, 16, 25, 0.9) 100%)`,
                borderRadius: 18,
                padding: "16px 14px",
                border: "1px solid rgba(255, 255, 255, 0.07)",
                boxShadow: `0 8px 24px -4px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.05)`,
                backdropFilter: "blur(16px)",
                position: "relative",
                overflow: "hidden",
              }} className="wallet-card">
                <div style={{
                  position: "absolute", top: -16, right: -16, width: 60, height: 60,
                  borderRadius: "50%", background: `radial-gradient(circle, ${wColor}25 0%, transparent 70%)`,
                  pointerEvents: "none",
                }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 24 }}>{w.icon}</span>
                  <div style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                    background: `${wColor}18`, color: wColor,
                    border: `1px solid ${wColor}35`, letterSpacing: "0.02em"
                  }}>
                    {w.label}
                  </div>
                </div>
                <div style={{
                  fontSize: 19, fontWeight: 700, color: balance < 0 ? TOKEN.danger : TOKEN.text,
                  fontFamily: TOKEN.mono, letterSpacing: "-0.5px", marginTop: 8,
                }}>
                  {balance < 0 ? "-" : ""}{fmt(Math.abs(balance))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );

    const securitySetup = settings.biometric && !localStorage.getItem(`bio_cred_${settings.userEmail || "default"}`) && (
      <div style={{
        padding: 16,
        background: "rgba(239,159,39,0.06)",
        borderRadius: 16,
        border: `1px solid rgba(239,159,39,0.2)`,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <div style={{ fontSize: 24 }}>☝️</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: TOKEN.text, fontSize: 13, fontWeight: 600 }}>Enable Fingerprint</div>
          <div style={{ color: TOKEN.muted, fontSize: 11 }}>Secure your app with one tap</div>
        </div>
        <button onClick={registerBiometrics} style={{
          padding: "6px 14px",
          background: TOKEN.amber,
          color: TOKEN.amberText,
          border: "none",
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer"
        }}>SET UP</button>
      </div>
    );

    const categoryBreakdown = topCats.length > 0 && (
      <div style={{ ...S.card, gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: TOKEN.textSub, fontSize: 13, fontWeight: 600 }}>By Category</div>
          <div style={{ fontSize: 11, color: TOKEN.muted }}>Top {topCats.length}</div>
        </div>
        {topCats.map((c) => (
          <CategoryBar key={c.id} category={c} total={c.total} max={maxCatTotal} currency={settings.currency || "₹"} />
        ))}
      </div>
    );

    const recentTransactions = (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ color: TOKEN.textSub, fontSize: 13, fontWeight: 600 }}>Recent</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              onClick={() => {
                if (settings.haptic) triggerHaptic("light");
                go("registry");
              }}
              style={{
                background: "rgba(99,102,241,0.12)", border: "none",
                color: "#818cf8", fontSize: 11, fontWeight: 600,
                padding: "4px 10px", borderRadius: 20, cursor: "pointer",
              }}
              title="Search & Audit Registry"
            >
              Registry 📋
            </button>
            <button
              onClick={() => go("hist")}
              style={{
                background: "rgba(239,159,39,0.1)", border: "none",
                color: TOKEN.amber, fontSize: 11, fontWeight: 600,
                padding: "4px 10px", borderRadius: 20, cursor: "pointer",
              }}
            >
              See all →
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {expenses.slice(0, 3).map((e) => (
            <ExpenseRow key={e.id} expense={e} categories={categories} onDelete={deleteExpense} onEdit={handleEditOpen} currency={settings.currency || "₹"} />
          ))}
          {expenses.length === 0 && (
            <div style={{
              textAlign: "center", padding: "32px 0",
              color: TOKEN.muted, fontSize: 13,
              border: `1px dashed ${TOKEN.border}`,
              borderRadius: 16,
            }}>
              No expenses yet — tap Add to start tracking 🎯
            </div>
          )}
        </div>
      </div>
    );

    const fab = (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, padding: "8px 0 4px" }}>
        <button onClick={() => go("cat")} style={{ ...S.fab, flex: 1, maxWidth: 220 }} className="fab-btn">
          <PlusIcon color={TOKEN.amberText} />
          <span style={{ color: TOKEN.amberText, fontSize: 14, fontWeight: 700, letterSpacing: "0.02em" }}>Add Expense</span>
        </button>
        {settings.voice && (
          <button
            onClick={() => {
              if (settings.haptic) triggerHaptic("medium");
              startVoice();
            }}
            style={{
              width: 50, height: 50, borderRadius: "50%",
              background: `linear-gradient(135deg, ${TOKEN.amber}, #D85A30)`,
              border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 6px 18px rgba(239, 159, 39, 0.4)`,
              flexShrink: 0,
              transition: "transform 0.15s ease",
            }}
            className="fab-btn"
            title="Direct Voice AI"
            aria-label="Direct Voice AI"
          >
            <MicIcon size={22} color="#ffffff" />
          </button>
        )}
      </div>
    );

    const auditAndLedgerLinks = (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, paddingBottom: 8 }}>
        <button
          onClick={() => {
            if (settings.haptic) triggerHaptic("light");
            go("monthly_breakdown");
          }}
          style={{
            ...S.card, flexDirection: "column", alignItems: "flex-start",
            gap: 8, padding: 12, cursor: "pointer",
            background: "rgba(99,102,241,0.06)",
            border: `1px solid rgba(99,102,241,0.2)`,
          } as any}
          className="card"
        >
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "rgba(99,102,241,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            }}>📅</div>
            <span style={{ color: "#818cf8", fontSize: 14 }}>›</span>
          </div>
          <div>
            <div style={{ color: TOKEN.textSub, fontSize: 12, fontWeight: 700 }}>Day-by-Day Matrix</div>
            <div style={{ color: TOKEN.muted, fontSize: 10 }}>Granular daily ledger</div>
          </div>
        </button>

        <button
          onClick={() => {
            if (settings.haptic) triggerHaptic("light");
            go("registry");
          }}
          style={{
            ...S.card, flexDirection: "column", alignItems: "flex-start",
            gap: 8, padding: 12, cursor: "pointer",
            background: "rgba(239,159,39,0.06)",
            border: `1px solid rgba(239,159,39,0.2)`,
          } as any}
          className="card"
        >
          <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "rgba(239,159,39,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            }}>📋</div>
            <span style={{ color: TOKEN.amber, fontSize: 14 }}>›</span>
          </div>
          <div>
            <div style={{ color: TOKEN.textSub, fontSize: 12, fontWeight: 700 }}>Transaction Registry</div>
            <div style={{ color: TOKEN.muted, fontSize: 10 }}>Search & audit ledger</div>
          </div>
        </button>
      </div>
    );

    return (
      <div style={S.screenPad} className="screen-enter">
        {/* Header */}
        <div style={{ ...S.row, marginBottom: 4 }}>
          <div>
            <div style={{ color: TOKEN.muted, fontSize: 12, letterSpacing: "0.04em" }}>{greeting()} 👋</div>
            <div style={{ color: TOKEN.text, fontSize: 22, fontWeight: 700, letterSpacing: "-0.3px" }}>{settings.userName || "Buddy"}</div>
          </div>
          <div style={{ ...S.avatar, width: 44, height: 44, boxShadow: `0 0 0 2px ${TOKEN.amber}40` }} onClick={() => go("set")}>
            {settings.profileImage ? (
              <img src={settings.profileImage} style={S.avatarImg} alt="Profile" />
            ) : (
              <span style={{ fontSize: 20 }}>👤</span>
            )}
          </div>
        </div>

        {/* Period Tabs */}
        <div style={{
          ...S.tabRow,
          padding: 4,
          borderRadius: 16,
          background: "rgba(22, 22, 34, 0.75)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          backdropFilter: "blur(16px)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)"
        }}>
          {(["today", "week", "month"] as PeriodName[]).map((p) => {
            const active = period === p;
            return (
              <button
                key={p}
                onClick={() => {
                  if (settings.haptic) triggerHaptic("light");
                  setPeriod(p);
                }}
                className="period-btn"
                style={{
                  flex: 1, padding: "8px 6px", borderRadius: 12, border: "none", cursor: "pointer",
                  background: active ? `linear-gradient(135deg, ${TOKEN.amber} 0%, #D85A30 100%)` : "transparent",
                  color: active ? "#ffffff" : TOKEN.muted,
                  fontWeight: active ? 700 : 500,
                  fontSize: 12,
                  boxShadow: active ? `0 4px 14px rgba(239, 159, 39, 0.35)` : "none",
                  transition: "all 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
                  letterSpacing: "0.02em",
                }}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            );
          })}
        </div>

        {isDesktop ? (
          /* ── Windows Desktop Pro Dashboard ────────────────────────────────── */
          <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 4 }}>
            {/* Top 4 KPI Metrics Ribbon */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
              {/* KPI 1: Today's Spend */}
              <div style={S.windowsKpiCard} className="windows-kpi">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: TOKEN.amber, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    Today's Burn
                  </span>
                  <span style={{ fontSize: 14 }}>🪙</span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: TOKEN.text, fontFamily: TOKEN.mono, margin: "2px 0" }}>
                  {fmt(todayTotal, cur)}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: TOKEN.muted }}>
                  <span>Daily Cap: {fmt(settings.dailyBudget || 2000, cur)}</span>
                  <span style={{ fontWeight: 600, color: todayTotal > settings.dailyBudget ? TOKEN.danger : TOKEN.success }}>
                    {Math.round((todayTotal / Math.max(1, settings.dailyBudget || 2000)) * 100)}%
                  </span>
                </div>
                <div style={{ height: 4, background: TOKEN.surfaceHighlight, borderRadius: 2, overflow: "hidden", marginTop: 4 }}>
                  <div style={{
                    width: `${Math.min(100, (todayTotal / Math.max(1, settings.dailyBudget || 2000)) * 100)}%`,
                    height: "100%",
                    background: todayTotal > settings.dailyBudget ? TOKEN.danger : TOKEN.amber,
                    borderRadius: 2,
                  }} />
                </div>
              </div>

              {/* KPI 2: Month Expenses */}
              <div style={S.windowsKpiCard} className="windows-kpi">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: TOKEN.textSub, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    Month Expense
                  </span>
                  <span style={{ fontSize: 14 }}>📉</span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: TOKEN.text, fontFamily: TOKEN.mono, margin: "2px 0" }}>
                  {fmt(monthExpensesTotal, cur)}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: TOKEN.muted }}>
                  <span>Budget: {fmt(settings.monthlyBudget || 50000, cur)}</span>
                  <span style={{ fontWeight: 600, color: monthExpensesTotal > settings.monthlyBudget ? TOKEN.danger : TOKEN.textSub }}>
                    {Math.round((monthExpensesTotal / Math.max(1, settings.monthlyBudget || 50000)) * 100)}%
                  </span>
                </div>
                <div style={{ height: 4, background: TOKEN.surfaceHighlight, borderRadius: 2, overflow: "hidden", marginTop: 4 }}>
                  <div style={{
                    width: `${Math.min(100, (monthExpensesTotal / Math.max(1, settings.monthlyBudget || 50000)) * 100)}%`,
                    height: "100%",
                    background: monthExpensesTotal > settings.monthlyBudget ? TOKEN.danger : "#378ADD",
                    borderRadius: 2,
                  }} />
                </div>
              </div>

              {/* KPI 3: Month Inflow (Income) */}
              <div style={S.windowsKpiCard} className="windows-kpi">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: TOKEN.success, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    Month Inflow
                  </span>
                  <span style={{ fontSize: 14 }}>💵</span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: TOKEN.success, fontFamily: TOKEN.mono, margin: "2px 0" }}>
                  +{fmt(monthIncomeTotal, cur)}
                </div>
                <div style={{ fontSize: 11, color: TOKEN.muted, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ color: TOKEN.success, fontWeight: 600 }}>↑ Active Deposits</span>
                  <span>• {thisMonthIncomes.length} credits</span>
                </div>
                <div style={{ height: 4, background: TOKEN.surfaceHighlight, borderRadius: 2, overflow: "hidden", marginTop: 4 }}>
                  <div style={{ width: "100%", height: "100%", background: TOKEN.success, borderRadius: 2 }} />
                </div>
              </div>

              {/* KPI 4: Net Cashflow / Savings */}
              <div style={S.windowsKpiCard} className="windows-kpi">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: netSavings >= 0 ? TOKEN.success : TOKEN.danger, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    Net Cashflow
                  </span>
                  <span style={{ fontSize: 14 }}>🏦</span>
                </div>
                <div style={{
                  fontSize: 24, fontWeight: 800,
                  color: netSavings >= 0 ? TOKEN.success : TOKEN.danger,
                  fontFamily: TOKEN.mono, margin: "2px 0"
                }}>
                  {netSavings >= 0 ? "+" : ""}{fmt(netSavings, cur)}
                </div>
                <div style={{ fontSize: 11, color: TOKEN.muted }}>
                  Savings Rate: <strong style={{ color: netSavings >= 0 ? TOKEN.success : TOKEN.danger }}>{savingsRate}%</strong>
                </div>
                <div style={{ height: 4, background: TOKEN.surfaceHighlight, borderRadius: 2, overflow: "hidden", marginTop: 4 }}>
                  <div style={{
                    width: `${Math.min(100, Math.max(0, savingsRate))}%`,
                    height: "100%",
                    background: netSavings >= 0 ? TOKEN.success : TOKEN.danger,
                    borderRadius: 2,
                  }} />
                </div>
              </div>
            </div>

            {/* Main Split Content: Left 64% (Trend & Ledger Table) | Right 36% (Quick Add & Wallets) */}
            <div style={{ display: "grid", gridTemplateColumns: "1.75fr 1fr", gap: 18, alignItems: "start" }}>
              {/* Left Column: Visual Breakdown & Full Transaction Table */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {balanceCard}
                {budgetAlert}
                {categoryBreakdown}

                {/* Windows Transaction Ledger with Inline Search & Actions */}
                <div style={{ ...S.card, padding: 18 }} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ color: TOKEN.text, fontSize: 15, fontWeight: 700 }}>Transaction Ledger</div>
                      <div style={{ color: TOKEN.muted, fontSize: 11 }}>Review, search and audit all recent transactions</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="text"
                        value={desktopLedgerSearch}
                        onChange={(e) => setDesktopLedgerSearch(e.target.value)}
                        placeholder="Filter transactions..."
                        style={{
                          background: TOKEN.surfaceElevated,
                          border: `1px solid ${TOKEN.borderSub}`,
                          borderRadius: 8,
                          padding: "5px 10px",
                          fontSize: 12,
                          color: TOKEN.text,
                          width: 170,
                          outline: "none",
                        }}
                      />
                      <button
                        onClick={() => go("hist")}
                        style={{
                          background: "rgba(239, 159, 39, 0.12)",
                          border: `1px solid rgba(239, 159, 39, 0.25)`,
                          color: TOKEN.amber,
                          borderRadius: 8,
                          padding: "5px 10px",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        All History ›
                      </button>
                    </div>
                  </div>

                  {/* Ledger Table */}
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${TOKEN.borderSub}`, color: TOKEN.muted, textAlign: "left" }}>
                          <th style={{ padding: "8px 10px", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>Category</th>
                          <th style={{ padding: "8px 10px", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>Description</th>
                          <th style={{ padding: "8px 10px", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>Account</th>
                          <th style={{ padding: "8px 10px", fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>Date</th>
                          <th style={{ padding: "8px 10px", fontWeight: 600, fontSize: 10, textTransform: "uppercase", textAlign: "right" }}>Amount</th>
                          <th style={{ padding: "8px 10px", fontWeight: 600, fontSize: 10, textTransform: "uppercase", textAlign: "center" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses
                          .filter(e => {
                            if (!desktopLedgerSearch) return true;
                            const query = desktopLedgerSearch.toLowerCase();
                            const cat = categories.find(c => c.id === e.category);
                            return (e.note || "").toLowerCase().includes(query) || (cat?.label || "").toLowerCase().includes(query);
                          })
                          .slice(0, 8)
                          .map(e => {
                            const cat = categories.find(c => c.id === e.category) || categories[0];
                            const isInc = e.type === "income";
                            const wallet = WALLETS.find(w => w.id === e.walletId) || WALLETS[0];
                            return (
                              <tr key={e.id} className="windows-table-row" style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                                <td style={{ padding: "10px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <div style={{ ...S.picon, width: 24, height: 24, background: cat?.bg || "rgba(255,255,255,0.05)" }}>
                                      <CatIcon id={cat?.icon || "food"} size={12} color={isInc ? TOKEN.success : cat?.color} />
                                    </div>
                                    <span style={{ fontWeight: 600, color: TOKEN.textSub }}>{cat?.label || e.category}</span>
                                  </div>
                                </td>
                                <td style={{ padding: "10px", color: TOKEN.text, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {e.note || "—"}
                                </td>
                                <td style={{ padding: "10px" }}>
                                  <span style={{
                                    fontSize: 10, padding: "2px 8px", borderRadius: 10,
                                    background: "rgba(255,255,255,0.05)", border: `1px solid ${TOKEN.borderSub}`, color: TOKEN.muted
                                  }}>
                                    {wallet.icon} {wallet.label}
                                  </span>
                                </td>
                                <td style={{ padding: "10px", color: TOKEN.dim, fontSize: 11, whiteSpace: "nowrap" }}>
                                  {e.createdAt.slice(0, 10)}
                                </td>
                                <td style={{
                                  padding: "10px", textAlign: "right",
                                  fontWeight: 700, fontFamily: TOKEN.mono,
                                  color: isInc ? TOKEN.success : TOKEN.text
                                }}>
                                  {isInc ? "+" : "-"}{fmt(e.amount, cur)}
                                </td>
                                <td style={{ padding: "10px", textAlign: "center" }}>
                                  <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                                    <button
                                      onClick={() => handleEditOpen(e)}
                                      style={{ background: "none", border: "none", cursor: "pointer", color: TOKEN.muted, fontSize: 12 }}
                                      title="Edit"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      onClick={() => deleteExpense(e.id)}
                                      style={{ background: "none", border: "none", cursor: "pointer", color: TOKEN.danger, fontSize: 12 }}
                                      title="Delete"
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Right Column: Desktop Quick Add Widget & Accounts */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* ⚡ Desktop Quick Add Widget */}
                <div style={{
                  ...S.card, padding: 18,
                  background: "linear-gradient(160deg, rgba(239, 159, 39, 0.08) 0%, rgba(18, 18, 28, 0.95) 100%)",
                  border: `1px solid rgba(239, 159, 39, 0.25)`,
                }} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14 }}>⚡</span>
                      <span style={{ color: TOKEN.text, fontSize: 14, fontWeight: 700 }}>Quick Add Transaction</span>
                    </div>
                    {/* Expense / Income Toggle */}
                    <div style={{ display: "flex", background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: 2 }}>
                      <button
                        onClick={() => setQuickType("expense")}
                        style={{
                          padding: "2px 8px", borderRadius: 6, border: "none",
                          background: quickType === "expense" ? TOKEN.amber : "transparent",
                          color: quickType === "expense" ? "#fff" : TOKEN.muted,
                          fontSize: 10, fontWeight: 700, cursor: "pointer",
                        }}
                      >
                        EXPENSE
                      </button>
                      <button
                        onClick={() => setQuickType("income")}
                        style={{
                          padding: "2px 8px", borderRadius: 6, border: "none",
                          background: quickType === "income" ? TOKEN.success : "transparent",
                          color: quickType === "income" ? "#fff" : TOKEN.muted,
                          fontSize: 10, fontWeight: 700, cursor: "pointer",
                        }}
                      >
                        INCOME
                      </button>
                    </div>
                  </div>

                  {/* Amount Input */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: TOKEN.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Amount ({cur})</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 18, color: quickType === "income" ? TOKEN.success : TOKEN.amber, fontWeight: 700, fontFamily: TOKEN.mono }}>{cur}</span>
                      <input
                        type="number"
                        value={quickAmt}
                        onChange={(e) => setQuickAmt(e.target.value)}
                        placeholder="0.00"
                        onKeyDown={(e) => { if (e.key === "Enter") handleQuickAdd(); }}
                        style={{
                          flex: 1, background: TOKEN.surfaceElevated, border: `1px solid ${TOKEN.borderSub}`,
                          borderRadius: 8, padding: "8px 12px", fontSize: 16, fontWeight: 700,
                          color: TOKEN.text, outline: "none", fontFamily: TOKEN.mono
                        }}
                      />
                    </div>
                  </div>

                  {/* Category Selection */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ color: TOKEN.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Category</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {categories
                        .filter(c => (c.type || "expense") === quickType)
                        .slice(0, 6)
                        .map(c => {
                          const isSel = quickCatId === c.id;
                          return (
                            <button
                              key={c.id}
                              onClick={() => setQuickCatId(c.id)}
                              style={{
                                display: "flex", alignItems: "center", gap: 4,
                                padding: "4px 8px", borderRadius: 8, cursor: "pointer",
                                border: isSel ? `1px solid ${c.color}` : `1px solid ${TOKEN.borderSub}`,
                                background: isSel ? `${c.color}25` : TOKEN.surfaceElevated,
                                color: isSel ? c.color : TOKEN.textSub,
                                fontSize: 11, fontWeight: isSel ? 700 : 500
                              }}
                            >
                              <CatIcon id={c.icon} size={12} color={c.color} />
                              <span>{c.label}</span>
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  {/* Note Input */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ color: TOKEN.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Note / Description</div>
                    <input
                      type="text"
                      value={quickNote}
                      onChange={(e) => setQuickNote(e.target.value)}
                      placeholder="e.g. Swiggy lunch, Taxi..."
                      onKeyDown={(e) => { if (e.key === "Enter") handleQuickAdd(); }}
                      style={{
                        width: "100%", background: TOKEN.surfaceElevated, border: `1px solid ${TOKEN.borderSub}`,
                        borderRadius: 8, padding: "7px 10px", fontSize: 12,
                        color: TOKEN.text, outline: "none"
                      }}
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    onClick={handleQuickAdd}
                    style={{
                      width: "100%", padding: "10px", borderRadius: 10, border: "none", cursor: "pointer",
                      background: quickSaving ? TOKEN.success : (quickType === "income" ? TOKEN.success : TOKEN.amber),
                      color: quickType === "income" ? "#fff" : TOKEN.amberText,
                      fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      boxShadow: "0 4px 12px rgba(239, 159, 39, 0.25)"
                    }}
                  >
                    {quickSaving ? "✓ Recorded!" : `Record ${quickType === "income" ? "Income" : "Expense"}`}
                  </button>
                </div>

                {walletsOverview}
                {budgetGoalsLink}
                {auditAndLedgerLinks}
              </div>
            </div>
          </div>
        ) : (
          /* Mobile Stack */
          <>
            {balanceCard}
            {budgetAlert}
            {budgetGoalsLink}
            {walletsOverview}
            {securitySetup}
            {categoryBreakdown}
            {recentTransactions}
            {fab}
            {auditAndLedgerLinks}
          </>
        )}
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  function renderHist() {
    return (
      <div style={S.screenPad} className="screen-enter">
        {/* Header */}
        <div style={S.row}>
          <button onClick={() => go("dash")} style={S.iconBtn} aria-label="Back">←</button>
          <div style={S.heading}>History</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              onClick={() => {
                if (settings.haptic) triggerHaptic("light");
                go("monthly_breakdown");
              }}
              style={{ ...S.iconBtn, fontSize: 13 }}
              title="Day-by-Day Matrix"
            >
              📅
            </button>
            <button
              onClick={() => {
                if (settings.haptic) triggerHaptic("light");
                go("registry");
              }}
              style={{ ...S.iconBtn, fontSize: 13 }}
              title="Transaction Registry (Audit Ledger)"
            >
              📋
            </button>
            <button onClick={() => {
              // Quick Excel export from filtered & sorted history
              import("xlsx").then(XLSX => {
                const data = sortedExpenses.map(e => ({
                  Date: e.createdAt.slice(0, 10),
                  Type: e.type || "expense",
                  Category: categories.find(c => c.id === e.category)?.label || e.category,
                  Amount: e.amount,
                  Note: e.note,
                }));
                const ws = XLSX.utils.json_to_sheet(data);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Expenses");
                XLSX.writeFile(wb, `Kharcha_${new Date().toISOString().slice(0,10)}.xlsx`);
              });
            }} style={S.iconBtn} title="Export Excel">📊</button>
          </div>
        </div>

        {/* Search */}
        <div style={{ ...S.card, flexDirection: "row", gap: 8, alignItems: "center" }} className="card">
          <span style={{ color: TOKEN.muted, fontSize: 14 }}>🔍</span>
          <input
            type="text"
            value={histSearch}
            onChange={(e) => setHistSearch(e.target.value)}
            placeholder="Search expenses by note or category…"
            style={S.noteInput}
          />
          {histSearch && (
            <button
              onClick={() => setHistSearch("")}
              style={{ background: "none", border: "none", color: TOKEN.muted, fontSize: 12, cursor: "pointer" }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Sort control bar */}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
          {/* Sort selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, color: TOKEN.muted }}>Sort:</span>
            <select
              value={histSort}
              onChange={(e) => {
                if (settings.haptic) triggerHaptic("light");
                setHistSort(e.target.value as any);
              }}
              style={{
                background: TOKEN.surfaceElevated,
                color: TOKEN.text,
                border: `0.5px solid ${TOKEN.borderSub}`,
                borderRadius: 12,
                fontSize: 11,
                padding: "3px 8px",
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="date_desc">📅 Newest</option>
              <option value="date_asc">📅 Oldest</option>
              <option value="amount_desc">💰 Amount (High → Low)</option>
              <option value="amount_asc">💰 Amount (Low → High)</option>
            </select>
          </div>
        </div>

        {/* Category filter chips */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {["all", ...categories.map((c) => c.id)].map((f) => {
            const cat = categories.find((c) => c.id === f);
            const active = histCat === f;
            return (
              <button
                key={f}
                onClick={() => {
                  if (settings.haptic) triggerHaptic("light");
                  setHistCat(f);
                }}
                style={{
                  whiteSpace: "nowrap", padding: "5px 12px", borderRadius: 20,
                  fontSize: 11, cursor: "pointer",
                  border: `0.5px solid ${active ? TOKEN.amber : TOKEN.borderSub}`,
                  background: active ? TOKEN.surfaceElevated : "transparent",
                  color: active ? TOKEN.amber : TOKEN.muted,
                }}
              >
                {cat ? `${cat.icon} ${cat.label}` : "All"}
              </button>
            );
          })}
        </div>

        {/* Summary indicator */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: TOKEN.muted, padding: "0 2px" }}>
          <span>{sortedExpenses.length} transaction{sortedExpenses.length === 1 ? "" : "s"}</span>
          <span>Total: <strong style={{ color: TOKEN.amber, fontFamily: TOKEN.mono }}>{fmt(sumExpenses(sortedExpenses), settings.currency || "₹")}</strong></span>
        </div>

        {/* List */}
        {sortedExpenses.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: TOKEN.muted, fontSize: 13 }}>
            No expenses found matching the selected filters.
          </div>
        ) : isAmountSorted ? (
          <div style={isDesktop ? { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" } : { display: "flex", flexDirection: "column", gap: 7 }}>
            {sortedExpenses.map((e, idx) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: TOKEN.muted, width: 22, textAlign: "right", fontFamily: TOKEN.mono, flexShrink: 0 }}>
                  #{idx + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <ExpenseRow expense={e} categories={categories} onDelete={deleteExpense} onEdit={handleEditOpen} currency={settings.currency || "₹"} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          historyDates.map((date) => (
            <div key={date}>
              <div style={{ ...S.label, marginBottom: 6 }}>
                {dateLabel(date)} • {fmt(sumExpenses(groupedHistory[date]), settings.currency || "₹")}
              </div>
              <div style={isDesktop ? { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" } : { display: "flex", flexDirection: "column", gap: 7 }}>
                {groupedHistory[date].map((e) => (
                  <ExpenseRow key={e.id} expense={e} categories={categories} onDelete={deleteExpense} onEdit={handleEditOpen} currency={settings.currency || "₹"} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  const handleExportEnterpriseBackup = async () => {
    try {
      if (settings.haptic) triggerHaptic("medium");
      const backup = await enterpriseStorage.exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kharcha-enterprise-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("Failed to export backup: " + e.message);
    }
  };

  const handleRestoreEnterpriseBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm("Restoring a database backup will overwrite existing records with the snapshot data. Proceed?")) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const ok = await enterpriseStorage.restoreBackup(payload);
      if (ok) {
        alert("Database snapshot successfully restored! Refreshing application...");
        window.location.reload();
      } else {
        alert("Failed to restore database backup.");
      }
    } catch (err: any) {
      alert("Invalid backup file: " + err.message);
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  function renderSet() {
    const allTimeTotal = sumExpenses(expenses);

    return (
      <div style={S.screenBase} className="screen-enter form-screen">
        {/* Header */}
        <div style={{ ...S.row, padding: "20px 20px 12px", borderBottom: `0.5px solid ${TOKEN.border}` }}>
          <button onClick={() => go("dash")} style={S.iconBtn} aria-label="Back">←</button>
          <div style={S.heading}>Settings</div>
          <div style={{ width: 34 }} />
        </div>

        {/* Profile */}
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: `0.5px solid ${TOKEN.borderSub}` }}>
          <div style={{ position: "relative" }}>
            <input type="file" accept="image/*" onChange={handleProfileUpload} id="p-upload" style={{ display: "none" }} />
            <label htmlFor="p-upload" style={S.avatar}>
              {settings.profileImage ? (
                <img src={settings.profileImage} style={S.avatarImg} alt="Profile" />
              ) : (
                <span style={{ fontSize: 18 }}>📸</span>
              )}
            </label>
          </div>
          <div style={{ flex: 1 }}>
            <input value={settings.userName} onChange={(e) => updateSetting("userName", e.target.value)}
              style={{ ...S.noteInput, fontSize: 14, color: TOKEN.text, fontWeight: 500 }} placeholder="Your name" />
            <input value={settings.userEmail} onChange={(e) => updateSetting("userEmail", e.target.value)}
              style={{ ...S.noteInput, fontSize: 12, color: TOKEN.muted, marginTop: 2 }} placeholder="Email" type="email" />
          </div>
          <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 10, background: `${TOKEN.success}20`, color: TOKEN.success, border: `0.5px solid ${TOKEN.success}60` }}>
            {expenses.length} saved
          </span>
        </div>

        <SectionLabel>Security</SectionLabel>
        <TogRow label="Biometric unlock" sub="FaceID / Fingerprint" val={settings.biometric} onChange={(v) => updateSetting("biometric", v)} />
        
        <div style={{ padding: "0 20px 10px" }}>
          <button 
            onClick={registerBiometrics} 
            style={{ 
              width: "100%",
              padding: "14px",
              background: TOKEN.surface,
              border: `1px solid ${settings.biometric ? TOKEN.amber : TOKEN.border}`,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              gap: 12,
              cursor: "pointer",
              opacity: settings.biometric ? 1 : 0.5
            }}
          >
            <div style={{ 
              width: 32, height: 32, borderRadius: 8, background: TOKEN.surfaceElevated,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <FingerprintIcon size={20} color={settings.biometric ? TOKEN.amber : TOKEN.muted} />
            </div>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={{ color: TOKEN.text, fontSize: 13, fontWeight: 500 }}>Add / Update Fingerprint</div>
              <div style={{ color: TOKEN.muted, fontSize: 11 }}>Link your phone's biometrics</div>
            </div>
            <span style={{ color: TOKEN.amber, fontWeight: 600 }}>+</span>
          </button>
        </div>

        <TogRow label="PIN Login" sub="4-digit security code" val={settings.pin} onChange={(v) => {
          if (!v && !settings.biometric) {
            alert("You must have at least one security method enabled.");
            return;
          }
          updateSetting("pin", v);
        }} />
        <button onClick={() => go("change_pin")} style={S.menuItem} className="settings-item">
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ color: TOKEN.textSub, fontSize: 13 }}>Change PIN</div>
            <div style={{ color: TOKEN.muted, fontSize: 11 }}>Update your 4-digit security code</div>
          </div>
          <span style={{ color: TOKEN.muted }}>›</span>
        </button>

        <SectionLabel>Appearance & Theme</SectionLabel>
        <div style={{ padding: "0 20px 14px", borderBottom: `0.5px solid ${TOKEN.borderSub}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* Dark Mode Card */}
            <div
              onClick={() => {
                updateSetting("theme", "dark");
                if (settings.haptic) triggerHaptic("medium");
              }}
              style={{
                padding: "14px",
                borderRadius: 14,
                cursor: "pointer",
                background: settings.theme !== "light" ? "rgba(239, 159, 39, 0.12)" : TOKEN.surfaceElevated,
                border: settings.theme !== "light" ? `2px solid ${TOKEN.amber}` : `1px solid ${TOKEN.borderSub}`,
                transition: "all 0.2s",
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 6 }}>🌙</div>
              <div style={{ color: TOKEN.text, fontSize: 13, fontWeight: 700 }}>Dark Theme</div>
              <div style={{ color: TOKEN.muted, fontSize: 11, marginTop: 2 }}>Obsidian & deep black</div>
              {settings.theme !== "light" && (
                <div style={{ marginTop: 6, fontSize: 10, color: TOKEN.amber, fontWeight: 700 }}>✓ ACTIVE</div>
              )}
            </div>

            {/* Light Mode Card */}
            <div
              onClick={() => {
                updateSetting("theme", "light");
                if (settings.haptic) triggerHaptic("medium");
              }}
              style={{
                padding: "14px",
                borderRadius: 14,
                cursor: "pointer",
                background: settings.theme === "light" ? "rgba(239, 159, 39, 0.12)" : TOKEN.surfaceElevated,
                border: settings.theme === "light" ? `2px solid ${TOKEN.amber}` : `1px solid ${TOKEN.borderSub}`,
                transition: "all 0.2s",
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 6 }}>☀️</div>
              <div style={{ color: TOKEN.text, fontSize: 13, fontWeight: 700 }}>Light Theme</div>
              <div style={{ color: TOKEN.muted, fontSize: 11, marginTop: 2 }}>Clean alabaster white</div>
              {settings.theme === "light" && (
                <div style={{ marginTop: 6, fontSize: 10, color: TOKEN.amber, fontWeight: 700 }}>✓ ACTIVE</div>
              )}
            </div>
          </div>
        </div>
        <SectionLabel>App Experience / UI Layout</SectionLabel>
        <div style={{ padding: "0 20px 14px", borderBottom: `0.5px solid ${TOKEN.borderSub}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* Windows Desktop UI Card */}
            <div
              onClick={() => {
                updateSetting("layoutMode", "windows");
                setIsDesktop(true);
                if (settings.haptic) triggerHaptic("medium");
              }}
              style={{
                padding: "16px 14px",
                borderRadius: 16,
                cursor: "pointer",
                background: isDesktop ? "rgba(55, 138, 221, 0.12)" : TOKEN.surfaceElevated,
                border: isDesktop ? `2px solid #378ADD` : `1px solid ${TOKEN.borderSub}`,
                boxShadow: isDesktop ? "0 4px 16px rgba(55, 138, 221, 0.25)" : "none",
                transition: "all 0.2s",
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>🪟</div>
              <div style={{ color: TOKEN.text, fontSize: 13, fontWeight: 700 }}>Windows UI</div>
              <div style={{ color: TOKEN.muted, fontSize: 11, marginTop: 4, lineHeight: 1.3 }}>
                Title bar, sidebar, 4-card KPI ribbon, ledger table & quick add panel.
              </div>
              {isDesktop && (
                <div style={{ marginTop: 8, fontSize: 10, color: "#378ADD", fontWeight: 700 }}>✓ ACTIVE</div>
              )}
            </div>

            {/* Phone Mobile UI Card */}
            <div
              onClick={() => {
                updateSetting("layoutMode", "phone");
                setIsDesktop(false);
                if (settings.haptic) triggerHaptic("medium");
              }}
              style={{
                padding: "16px 14px",
                borderRadius: 16,
                cursor: "pointer",
                background: !isDesktop ? "rgba(239, 159, 39, 0.12)" : TOKEN.surfaceElevated,
                border: !isDesktop ? `2px solid ${TOKEN.amber}` : `1px solid ${TOKEN.borderSub}`,
                boxShadow: !isDesktop ? "0 4px 16px rgba(239, 159, 39, 0.25)" : "none",
                transition: "all 0.2s",
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>📱</div>
              <div style={{ color: TOKEN.text, fontSize: 13, fontWeight: 700 }}>Phone UI</div>
              <div style={{ color: TOKEN.muted, fontSize: 11, marginTop: 4, lineHeight: 1.3 }}>
                Phone frame, touch cards, status bar, bottom navigation & quick FAB.
              </div>
              {!isDesktop && (
                <div style={{ marginTop: 8, fontSize: 10, color: TOKEN.amber, fontWeight: 700 }}>✓ ACTIVE</div>
              )}
            </div>
          </div>

          <button
            onClick={() => {
              updateSetting("layoutMode", "desktop");
              const autoIsDesktop = typeof window !== "undefined" && window.innerWidth > 768;
              setIsDesktop(autoIsDesktop);
              if (settings.haptic) triggerHaptic("light");
            }}
            style={{
              width: "100%", marginTop: 10, padding: "8px", borderRadius: 10,
              background: "transparent", border: `1px dashed ${TOKEN.borderSub}`,
              color: TOKEN.muted, fontSize: 11, cursor: "pointer",
            }}
          >
            ⚡ Auto-detect based on screen width
          </button>
        </div>

        {/* Accent Color Picker */}
        <div style={{ padding: "12px 20px", borderBottom: `0.5px solid ${TOKEN.borderSub}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ color: TOKEN.textSub, fontSize: 13, fontWeight: 500 }}>Accent Color</div>
              <div style={{ color: TOKEN.muted, fontSize: 11 }}>Button & highlight color</div>
            </div>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              background: settings.accentColor || "#EF9F27",
              border: `2px solid ${TOKEN.border}`,
              boxShadow: `0 0 8px ${settings.accentColor || "#EF9F27"}80`
            }} />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              { color: "#EF9F27", label: "Amber" },
              { color: "#378ADD", label: "Blue" },
              { color: "#1D9E75", label: "Emerald" },
              { color: "#7F77DD", label: "Purple" },
              { color: "#E24B4A", label: "Red" },
              { color: "#D85A30", label: "Coral" },
              { color: "#639922", label: "Lime" },
              { color: "#F06292", label: "Pink" },
            ].map(({ color, label }) => {
              const isActive = (settings.accentColor || "#EF9F27") === color;
              return (
                <button
                  key={color}
                  title={label}
                  onClick={() => updateSetting("accentColor", color)}
                  style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: color,
                    border: isActive ? `3px solid ${TOKEN.text}` : "3px solid transparent",
                    cursor: "pointer",
                    boxShadow: isActive ? `0 0 10px ${color}` : "none",
                    transition: "all 0.2s",
                    outline: "none",
                  }}
                />
              );
            })}
          </div>
          {/* Custom hex input */}
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ color: TOKEN.muted, fontSize: 11 }}>Custom:</div>
            <input
              type="color"
              value={settings.accentColor || "#EF9F27"}
              onChange={(e) => updateSetting("accentColor", e.target.value)}
              style={{
                width: 36, height: 28, padding: 0, border: `1px solid ${TOKEN.border}`,
                borderRadius: 6, background: "transparent", cursor: "pointer",
              }}
            />
            <div style={{ color: TOKEN.textFaint, fontSize: 11, fontFamily: TOKEN.mono }}>
              {settings.accentColor || "#EF9F27"}
            </div>
          </div>
        </div>

        <SectionLabel>Preferences</SectionLabel>
        <button onClick={() => go("budget_goals")} style={S.menuItem} className="settings-item">
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ color: TOKEN.textSub, fontSize: 13 }}>Budget Goals</div>
            <div style={{ color: TOKEN.muted, fontSize: 11 }}>Set monthly spend caps per category</div>
          </div>
          <span style={{ color: TOKEN.muted }}>›</span>
        </button>
        <button onClick={() => go("manage_cats")} style={S.menuItem} className="settings-item">
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ color: TOKEN.textSub, fontSize: 13 }}>Manage Categories</div>
            <div style={{ color: TOKEN.muted, fontSize: 11 }}>Add, edit or remove expense types</div>
          </div>
          <span style={{ color: TOKEN.muted }}>›</span>
        </button>
        <button onClick={() => go("manage_wallets")} style={S.menuItem} className="settings-item">
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ color: TOKEN.textSub, fontSize: 13 }}>Manage Accounts</div>
            <div style={{ color: TOKEN.muted, fontSize: 11 }}>Adjust starting balances and labels</div>
          </div>
          <span style={{ color: TOKEN.muted }}>›</span>
        </button>
        <button onClick={() => go("user_manage")} style={S.menuItem} className="settings-item">
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ color: TOKEN.textSub, fontSize: 13 }}>Manage Users</div>
            <div style={{ color: TOKEN.muted, fontSize: 11 }}>Add, rename or delete user profiles</div>
          </div>
          <span style={{ color: TOKEN.muted }}>›</span>
        </button>
        <button onClick={() => go("user_select")} style={S.menuItem} className="settings-item">
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ color: TOKEN.amber, fontSize: 13, fontWeight: 600 }}>Switch User</div>
            <div style={{ color: TOKEN.muted, fontSize: 11 }}>Currently: {settings.userName || "User"}</div>
          </div>
          <span style={{ color: TOKEN.muted }}>›</span>
        </button>
        <TogRow label="Voice logging" sub="AI expense detection" val={settings.voice} onChange={(v) => updateSetting("voice", v)} />
        <TogRow label="Haptic feedback" sub="Vibrate on amount change" val={settings.haptic} onChange={(v) => updateSetting("haptic", v)} />
        <TogRow label="Offline mode" sub="Cache entries locally" val={settings.offline} onChange={(v) => updateSetting("offline", v)} />

        {/* Currency Selector */}
        <div style={{ padding: "12px 20px", borderBottom: `0.5px solid ${TOKEN.borderSub}` }}>
          <div style={{ color: TOKEN.textSub, fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Currency</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["₹", "$", "€", "£"] as const).map(c => {
              const isActive = (settings.currency || "₹") === c;
              return (
                <button
                  key={c}
                  onClick={() => updateSetting("currency", c)}
                  style={{
                    flex: 1, padding: "10px 0", borderRadius: 12, border: "none", cursor: "pointer",
                    background: isActive ? TOKEN.amber : TOKEN.surfaceHighlight,
                    color: isActive ? "#fff" : TOKEN.textSub,
                    fontWeight: isActive ? 700 : 400,
                    fontSize: 18,
                    transition: "all 0.2s"
                  }}
                >{c}</button>
              );
            })}
          </div>
        </div>

        <SectionLabel>Budget</SectionLabel>
        <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div style={{ color: TOKEN.textSub, fontSize: 13 }}>Daily budget</div>
            <div style={{ color: TOKEN.amber, fontSize: 13, fontFamily: TOKEN.mono, fontWeight: 500 }}>
              {fmt(settings.dailyBudget)}
            </div>
          </div>
          <input type="range" min="500" max="20000" step="500" value={settings.dailyBudget}
            onChange={(e) => updateSetting("dailyBudget", parseInt(e.target.value))}
            style={{ width: "100%", accentColor: TOKEN.amber }} />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={S.label}>₹500</span>
            <span style={S.label}>₹20,000</span>
          </div>
        </div>

        <SectionLabel>Data</SectionLabel>
        <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={() => {
              if (settings.haptic) triggerHaptic("light");
              go("registry");
            }}
            className="settings-item card"
            style={{ ...S.card, flexDirection: "row", justifyContent: "space-between", alignItems: "center", cursor: "pointer", border: `1px solid rgba(99,102,241,0.3)` }}
          >
            <div>
              <div style={{ color: TOKEN.text, fontSize: 13, fontWeight: 500 }}>Transaction Registry</div>
              <div style={{ color: TOKEN.muted, fontSize: 11 }}>Search, multi-filter & audit ledger</div>
            </div>
            <span style={{ color: "#818cf8", fontSize: 16 }}>📋 ➜</span>
          </button>

          <button
            onClick={() => {
              if (settings.haptic) triggerHaptic("light");
              go("monthly_breakdown");
            }}
            className="settings-item card"
            style={{ ...S.card, flexDirection: "row", justifyContent: "space-between", alignItems: "center", cursor: "pointer", border: `1px solid rgba(239,159,39,0.3)` }}
          >
            <div>
              <div style={{ color: TOKEN.text, fontSize: 13, fontWeight: 500 }}>Day-by-Day Matrix</div>
              <div style={{ color: TOKEN.muted, fontSize: 11 }}>Granular monthly calendar heatmap</div>
            </div>
            <span style={{ color: TOKEN.amber, fontSize: 16 }}>📅 ➜</span>
          </button>

          <button
            onClick={() => go("subscriptions")}
            className="settings-item card"
            style={{ ...S.card, flexDirection: "row", justifyContent: "space-between", alignItems: "center", cursor: "pointer", border: `1px solid ${TOKEN.amber}` }}
          >
            <div style={{ color: TOKEN.text, fontSize: 13, fontWeight: 500 }}>Manage Subscriptions</div>
            <span style={{ color: TOKEN.amber }}>➜</span>
          </button>

          {/* Enterprise Database Section */}
          <div style={{
            ...S.card,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            background: "linear-gradient(135deg, rgba(29, 158, 117, 0.12), rgba(55, 138, 221, 0.08))",
            border: "1px solid rgba(29, 158, 117, 0.3)",
            borderRadius: 16,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: dbConnected ? "#1D9E75" : "#EF9F27",
                  boxShadow: dbConnected ? "0 0 10px #1D9E75" : "0 0 10px #EF9F27",
                }} />
                <div>
                  <div style={{ color: TOKEN.text, fontSize: 13, fontWeight: 700 }}>Enterprise Database Engine</div>
                  <div style={{ color: TOKEN.muted, fontSize: 11 }}>Prisma ORM • Relational SQLite (ACID Compliant)</div>
                </div>
              </div>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#1D9E75",
                background: "rgba(29, 158, 117, 0.2)",
                padding: "3px 8px",
                borderRadius: 8,
                border: "1px solid rgba(29, 158, 117, 0.3)",
              }}>
                ACTIVE
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button
                onClick={() => {
                  if (settings.haptic) triggerHaptic("light");
                  setAuditLoading(true);
                  enterpriseStorage.getAuditLogs().then(logs => {
                    setAuditLogs(logs);
                    setAuditLoading(false);
                  });
                  go("audit_logs");
                }}
                className="settings-item"
                style={{
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  color: TOKEN.text,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <span>🛡️</span>
                <span>Audit Trail</span>
              </button>

              <button
                onClick={handleExportEnterpriseBackup}
                className="settings-item"
                style={{
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  color: TOKEN.text,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <span>💾</span>
                <span>Export Backup</span>
              </button>
            </div>

            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={handleRestoreEnterpriseBackup}
            />
            <button
              onClick={() => backupInputRef.current?.click()}
              className="settings-item"
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px dashed rgba(255,255,255,0.18)",
                background: "transparent",
                color: TOKEN.textSub,
                fontSize: 11,
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              📥 Restore Database from Snapshot (.json)
            </button>
          </div>

          {/* CSV Import */}
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={handleCSVImport}
          />
          <button
            onClick={() => csvInputRef.current?.click()}
            className="settings-item card"
            style={{ ...S.card, flexDirection: "row", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
          >
            <div>
              <div style={{ color: TOKEN.text, fontSize: 13, fontWeight: 500 }}>Import CSV</div>
              <div style={{ color: TOKEN.muted, fontSize: 11 }}>Columns: date, amount, category, note, type</div>
            </div>
            <span style={{ color: TOKEN.amber, fontSize: 18 }}>⬆️</span>
          </button>
          <div style={{ ...S.card, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: TOKEN.textSub, fontSize: 13 }}>Total expenses</div>
              <div style={{ color: TOKEN.muted, fontSize: 11 }}>{fmt(allTimeTotal)} all time</div>
            </div>
            <span style={{ color: TOKEN.amber, fontSize: 22, fontWeight: 600, fontFamily: TOKEN.mono }}>{expenses.length}</span>
          </div>
          <button
            onClick={() => {
              if (window.confirm("Clear all expense data? This cannot be undone.")) {
                setExpenses([]);
                if (activeUserId) {
                  enterpriseStorage.clearAllExpenses(activeUserId).catch(console.error);
                }
              }
            }}
            style={S.dangerBtn}
          >
            Clear all data
          </button>
        </div>
      </div>
    );
  }

  function renderChangePin() {
    return (
      <div style={S.screenBase} className="screen-enter form-screen">
        <div style={{ ...S.row, padding: "20px 20px 12px", borderBottom: `0.5px solid ${TOKEN.border}` }}>
          <button onClick={() => go("set")} style={S.iconBtn} aria-label="Back">←</button>
          <div style={S.heading}>Change PIN</div>
          <div style={{ width: 34 }} />
        </div>
        <div style={{ padding: 40, textAlign: "center", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 14, color: TOKEN.muted }}>Enter a new 4-digit PIN</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
            {pinInput.padEnd(4, "-").split("").map((c, i) => (
              <div key={i} style={S.pinDot}>
                <span style={{ color: c === "-" ? TOKEN.muted : TOKEN.amber, fontSize: 24, fontWeight: 600 }}>{c === "-" ? "•" : c}</span>
              </div>
            ))}
          </div>
          <div style={S.keypadGrid as any}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
              <button key={n} onClick={() => handlePinInput(n.toString())} className="key-btn" style={S.keyBtn as any}>{n}</button>
            ))}
            <button onClick={clearPin} className="key-btn" style={{ ...S.keyBtn, color: TOKEN.danger } as any}>✕</button>
            <button onClick={() => handlePinInput("0")} className="key-btn" style={S.keyBtn as any}>0</button>
            <button onClick={() => {
              if (pinInput.length === 4) {
                updateSetting("pinCode", pinInput);
                setPinInput("");
                go("set");
              }
            }} style={{ ...S.keyBtn, color: TOKEN.success, fontSize: 16 } as any}>SAVE</button>
          </div>
        </div>
      </div>
    );
  }

  function renderRegistry() {
    const cur = settings.currency || "₹";

    // ── Filtering Logic ──
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const weekStartStr = startOfWeek.toISOString().slice(0, 10);
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthPrefix = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
    const yearPrefix = `${now.getFullYear()}-`;

    const filtered = expenses.filter((e) => {
      // 1. Universal Search across note, category label, amount, wallet, date
      if (regSearch.trim()) {
        const query = regSearch.toLowerCase().trim();
        const catObj = categories.find(c => c.id === e.category);
        const catLabel = (catObj?.label || e.category).toLowerCase();
        const noteMatch = (e.note || "").toLowerCase().includes(query);
        const catMatch = catLabel.includes(query);
        const amtMatch = e.amount.toString().includes(query);
        const walletObj = wallets.find(w => w.id === e.walletId);
        const walletMatch = (walletObj?.label || e.walletId || "").toLowerCase().includes(query);
        const dateMatch = e.createdAt.includes(query);
        if (!noteMatch && !catMatch && !amtMatch && !walletMatch && !dateMatch) {
          return false;
        }
      }

      // 2. Time Range
      if (regTime === "today" && !e.createdAt.startsWith(todayStr)) return false;
      if (regTime === "yesterday" && !e.createdAt.startsWith(yesterday)) return false;
      if (regTime === "week" && e.createdAt.slice(0, 10) < weekStartStr) return false;
      if (regTime === "this_month" && !e.createdAt.startsWith(monthPrefix)) return false;
      if (regTime === "last_month" && !e.createdAt.startsWith(lastMonthPrefix)) return false;
      if (regTime === "this_year" && !e.createdAt.startsWith(yearPrefix)) return false;
      if (regTime === "custom") {
        if (regCustomStart && e.createdAt.slice(0, 10) < regCustomStart) return false;
        if (regCustomEnd && e.createdAt.slice(0, 10) > regCustomEnd) return false;
      }

      // 3. Type
      if (regType === "expense" && e.type === "income") return false;
      if (regType === "income" && e.type !== "income") return false;
      if (regType === "recurring" && !e.isRecurring) return false;

      // 4. Category
      if (regCat !== "all" && e.category !== regCat) return false;

      // 5. Wallet
      if (regWallet !== "all" && (e.walletId || "cash") !== regWallet) return false;

      // 6. Amount Bounds
      if (regMinAmt && e.amount < parseFloat(regMinAmt)) return false;
      if (regMaxAmt && e.amount > parseFloat(regMaxAmt)) return false;

      return true;
    });

    // ── Sorting ──
    const sorted = [...filtered].sort((a, b) => {
      if (regSort === "date_desc") return b.createdAt.localeCompare(a.createdAt);
      if (regSort === "date_asc") return a.createdAt.localeCompare(b.createdAt);
      if (regSort === "amount_desc") return b.amount - a.amount;
      if (regSort === "amount_asc") return a.amount - b.amount;
      if (regSort === "cat_asc") return (a.category || "").localeCompare(b.category || "");
      return 0;
    });

    // ── Audit KPI Calculations ──
    const totalExpense = sorted.filter(e => e.type !== "income").reduce((s, e) => s + e.amount, 0);
    const totalIncome = sorted.filter(e => e.type === "income").reduce((s, e) => s + e.amount, 0);
    const netAudit = totalIncome - totalExpense;
    const avgExpense = sorted.filter(e => e.type !== "income").length > 0
      ? totalExpense / sorted.filter(e => e.type !== "income").length
      : 0;

    const hasActiveFilters = Boolean(
      regSearch || regTime !== "all" || regType !== "all" || regCat !== "all" ||
      regWallet !== "all" || regSort !== "date_desc" || regMinAmt || regMaxAmt
    );

    const resetFilters = () => {
      setRegSearch("");
      setRegTime("all");
      setRegCustomStart("");
      setRegCustomEnd("");
      setRegType("all");
      setRegCat("all");
      setRegWallet("all");
      setRegSort("date_desc");
      setRegMinAmt("");
      setRegMaxAmt("");
      setRegSelectedIds([]);
      if (settings.haptic) triggerHaptic("light");
    };

    // ── Batch Operations ──
    const allSelected = sorted.length > 0 && sorted.every(e => regSelectedIds.includes(e.id));
    const toggleSelectAll = () => {
      if (allSelected) {
        setRegSelectedIds([]);
      } else {
        setRegSelectedIds(sorted.map(e => e.id));
      }
      if (settings.haptic) triggerHaptic("light");
    };

    const toggleSelectOne = (id: string) => {
      setRegSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
      if (settings.haptic) triggerHaptic("light");
    };

    const handleBatchDelete = () => {
      if (regSelectedIds.length === 0) return;
      if (window.confirm(`Delete ${regSelectedIds.length} selected transaction(s)? This action cannot be undone.`)) {
        setExpenses(prev => prev.filter(e => !regSelectedIds.includes(e.id)));
        setRegSelectedIds([]);
        if (settings.haptic) triggerHaptic("success");
      }
    };

    const handleExportRegistryExcel = () => {
      const recordsToExport = regSelectedIds.length > 0
        ? sorted.filter(e => regSelectedIds.includes(e.id))
        : sorted;

      import("xlsx").then(XLSX => {
        const rows = recordsToExport.map((e) => {
          const cat = categories.find(c => c.id === e.category);
          const wallet = wallets.find(w => w.id === e.walletId);
          return {
            "Transaction ID": e.id,
            "Date": e.createdAt.slice(0, 10),
            "Time": new Date(e.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
            "Type": e.type === "income" ? "INCOME" : "EXPENSE",
            "Category": cat ? cat.label : e.category,
            "Account": wallet ? wallet.label : (e.walletId || "Cash"),
            "Amount": e.amount,
            "Currency": cur,
            "Note / Remarks": e.note || "",
            "Recurring": e.isRecurring ? "YES" : "NO",
          };
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "RegistryLedger");
        XLSX.writeFile(wb, `Transaction_Registry_${todayStr}.xlsx`);
      });
    };

    return (
      <div style={S.screenBase} className="screen-enter">
        {/* Header */}
        <div style={{ ...S.row, padding: "18px 20px 14px", borderBottom: `0.5px solid ${TOKEN.border}` }}>
          <button onClick={() => go("dash")} style={S.iconBtn} aria-label="Back"><ArrowLeftIcon color={TOKEN.dim} /></button>
          <div style={{ textAlign: "center" }}>
            <div style={{ ...S.heading, fontSize: 16 }}>Transaction Registry</div>
            <div style={{ color: TOKEN.muted, fontSize: 11 }}>Search &amp; Audit Ledger</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              onClick={handleExportRegistryExcel}
              style={{ ...S.iconBtn, fontSize: 13, width: 32, height: 32 }}
              title="Export Filtered Registry to Excel"
            >
              📊
            </button>
            <button
              onClick={() => go("cat")}
              style={{ ...S.iconBtn, fontSize: 13, width: 32, height: 32, background: `${TOKEN.amber}15`, color: TOKEN.amber }}
              title="Add New Record"
            >
              ➕
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Universal Search Bar */}
          <div style={{ ...S.card, flexDirection: "row", gap: 8, alignItems: "center", padding: "10px 14px" }} className="card">
            <span style={{ color: TOKEN.muted, fontSize: 14 }}>🔍</span>
            <input
              type="text"
              value={regSearch}
              onChange={(e) => setRegSearch(e.target.value)}
              placeholder="Search by note, category, amount, wallet, date…"
              style={{ ...S.noteInput, fontSize: 13 }}
            />
            {regSearch && (
              <button
                onClick={() => setRegSearch("")}
                style={{ background: "none", border: "none", color: TOKEN.muted, fontSize: 12, cursor: "pointer" }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Date Range Pills */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            {[
              { id: "all", label: "All Time" },
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "week", label: "This Week" },
              { id: "this_month", label: "This Month" },
              { id: "last_month", label: "Last Month" },
              { id: "this_year", label: "This Year" },
              { id: "custom", label: "Custom Range" },
            ].map(t => {
              const active = regTime === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    if (settings.haptic) triggerHaptic("light");
                    setRegTime(t.id as any);
                  }}
                  style={{
                    whiteSpace: "nowrap",
                    padding: "5px 12px",
                    borderRadius: 16,
                    fontSize: 11,
                    cursor: "pointer",
                    border: `0.5px solid ${active ? TOKEN.amber : TOKEN.borderSub}`,
                    background: active ? `${TOKEN.amber}18` : "transparent",
                    color: active ? TOKEN.amber : TOKEN.muted,
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Custom Date Pickers */}
          {regTime === "custom" && (
            <div style={{ ...S.card, padding: 12, display: "flex", gap: 10, alignItems: "center" }} className="card">
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 10, color: TOKEN.muted }}>From:</span>
                <input
                  type="date"
                  value={regCustomStart}
                  onChange={(e) => setRegCustomStart(e.target.value)}
                  style={{ width: "100%", background: TOKEN.surfaceHighlight, color: TOKEN.text, border: "none", borderRadius: 8, padding: "6px 8px", fontSize: 12, marginTop: 4 }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 10, color: TOKEN.muted }}>To:</span>
                <input
                  type="date"
                  value={regCustomEnd}
                  onChange={(e) => setRegCustomEnd(e.target.value)}
                  style={{ width: "100%", background: TOKEN.surfaceHighlight, color: TOKEN.text, border: "none", borderRadius: 8, padding: "6px 8px", fontSize: 12, marginTop: 4 }}
                />
              </div>
            </div>
          )}

          {/* Multi-Axis Filters Row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {/* Type Filter */}
            <div>
              <span style={{ fontSize: 10, color: TOKEN.muted, display: "block", marginBottom: 3 }}>Record Type</span>
              <select
                value={regType}
                onChange={(e) => {
                  if (settings.haptic) triggerHaptic("light");
                  setRegType(e.target.value as any);
                }}
                style={{
                  width: "100%",
                  background: TOKEN.surfaceHighlight,
                  color: TOKEN.text,
                  border: `0.5px solid ${TOKEN.borderSub}`,
                  borderRadius: 10,
                  fontSize: 11,
                  padding: "7px 8px",
                  cursor: "pointer",
                }}
              >
                <option value="all">All Types</option>
                <option value="expense">Expenses Only (Outflow)</option>
                <option value="income">Income Only (Inflow)</option>
                <option value="recurring">Recurring Subscriptions</option>
              </select>
            </div>

            {/* Sort Controller */}
            <div>
              <span style={{ fontSize: 10, color: TOKEN.muted, display: "block", marginBottom: 3 }}>Sort Order</span>
              <select
                value={regSort}
                onChange={(e) => {
                  if (settings.haptic) triggerHaptic("light");
                  setRegSort(e.target.value as any);
                }}
                style={{
                  width: "100%",
                  background: TOKEN.surfaceHighlight,
                  color: TOKEN.text,
                  border: `0.5px solid ${TOKEN.borderSub}`,
                  borderRadius: 10,
                  fontSize: 11,
                  padding: "7px 8px",
                  cursor: "pointer",
                }}
              >
                <option value="date_desc">📅 Date (Newest first)</option>
                <option value="date_asc">📅 Date (Oldest first)</option>
                <option value="amount_desc">💰 Amount (High → Low)</option>
                <option value="amount_asc">💰 Amount (Low → High)</option>
                <option value="cat_asc">🏷️ Category (A → Z)</option>
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <span style={{ fontSize: 10, color: TOKEN.muted, display: "block", marginBottom: 3 }}>Category</span>
              <select
                value={regCat}
                onChange={(e) => {
                  if (settings.haptic) triggerHaptic("light");
                  setRegCat(e.target.value);
                }}
                style={{
                  width: "100%",
                  background: TOKEN.surfaceHighlight,
                  color: TOKEN.text,
                  border: `0.5px solid ${TOKEN.borderSub}`,
                  borderRadius: 10,
                  fontSize: 11,
                  padding: "7px 8px",
                  cursor: "pointer",
                }}
              >
                <option value="all">All Categories</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                ))}
              </select>
            </div>

            {/* Account / Wallet Filter */}
            <div>
              <span style={{ fontSize: 10, color: TOKEN.muted, display: "block", marginBottom: 3 }}>Account / Wallet</span>
              <select
                value={regWallet}
                onChange={(e) => {
                  if (settings.haptic) triggerHaptic("light");
                  setRegWallet(e.target.value);
                }}
                style={{
                  width: "100%",
                  background: TOKEN.surfaceHighlight,
                  color: TOKEN.text,
                  border: `0.5px solid ${TOKEN.borderSub}`,
                  borderRadius: 10,
                  fontSize: 11,
                  padding: "7px 8px",
                  cursor: "pointer",
                }}
              >
                <option value="all">All Accounts</option>
                {wallets.map(w => (
                  <option key={w.id} value={w.id}>{w.icon} {w.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Amount Range Bounds */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 10, color: TOKEN.muted }}>Min Amount ({cur}):</span>
              <input
                type="number"
                placeholder="0"
                value={regMinAmt}
                onChange={(e) => setRegMinAmt(e.target.value)}
                style={{ width: "100%", background: TOKEN.surfaceHighlight, color: TOKEN.text, border: "none", borderRadius: 8, padding: "6px 8px", fontSize: 12, marginTop: 2 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 10, color: TOKEN.muted }}>Max Amount ({cur}):</span>
              <input
                type="number"
                placeholder="Any"
                value={regMaxAmt}
                onChange={(e) => setRegMaxAmt(e.target.value)}
                style={{ width: "100%", background: TOKEN.surfaceHighlight, color: TOKEN.text, border: "none", borderRadius: 8, padding: "6px 8px", fontSize: 12, marginTop: 2 }}
              />
            </div>
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                style={{ ...S.secondaryBtn, height: 32, alignSelf: "flex-end", padding: "4px 10px", fontSize: 11, width: "auto" }}
                title="Reset All Filters"
              >
                Reset ✕
              </button>
            )}
          </div>

          {/* Audit Metrics Ribbon */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            <div style={{ ...S.card, padding: 8, textAlign: "center" }} className="card">
              <div style={{ color: TOKEN.muted, fontSize: 9 }}>MATCHED</div>
              <div style={{ color: TOKEN.text, fontSize: 13, fontWeight: 700, fontFamily: TOKEN.mono }}>{sorted.length}</div>
            </div>
            <div style={{ ...S.card, padding: 8, textAlign: "center" }} className="card">
              <div style={{ color: TOKEN.muted, fontSize: 9 }}>OUTFLOW</div>
              <div style={{ color: TOKEN.amber, fontSize: 13, fontWeight: 700, fontFamily: TOKEN.mono }}>{fmt(totalExpense, cur)}</div>
            </div>
            <div style={{ ...S.card, padding: 8, textAlign: "center" }} className="card">
              <div style={{ color: TOKEN.muted, fontSize: 9 }}>INFLOW</div>
              <div style={{ color: TOKEN.success, fontSize: 13, fontWeight: 700, fontFamily: TOKEN.mono }}>{fmt(totalIncome, cur)}</div>
            </div>
            <div style={{ ...S.card, padding: 8, textAlign: "center" }} className="card">
              <div style={{ color: TOKEN.muted, fontSize: 9 }}>NET AUDIT</div>
              <div style={{ color: netAudit >= 0 ? TOKEN.success : TOKEN.danger, fontSize: 13, fontWeight: 700, fontFamily: TOKEN.mono }}>
                {netAudit >= 0 ? `+${fmt(netAudit, cur)}` : `-${fmt(-netAudit, cur)}`}
              </div>
            </div>
          </div>

          {/* Batch Actions Bar (when items are selected) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 2px" }}>
            <button
              onClick={toggleSelectAll}
              style={{ background: "none", border: "none", color: TOKEN.muted, fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            >
              <input type="checkbox" checked={allSelected} onChange={() => {}} style={{ cursor: "pointer", accentColor: TOKEN.amber }} />
              <span>{allSelected ? "Deselect All" : "Select All"}</span>
            </button>

            {regSelectedIds.length > 0 && (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: TOKEN.amber, fontWeight: 600 }}>{regSelectedIds.length} selected</span>
                <button
                  onClick={handleBatchDelete}
                  style={{ ...S.secondaryBtn, padding: "3px 8px", fontSize: 11, width: "auto", color: TOKEN.danger, borderColor: `${TOKEN.danger}40` }}
                >
                  Delete Selected 🗑️
                </button>
              </div>
            )}
          </div>

          {/* Audit Ledger List */}
          {sorted.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 16px", color: TOKEN.muted, fontSize: 13, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 32 }}>📋</div>
              <div style={{ fontWeight: 600, color: TOKEN.textSub }}>No transactions match your audit filters</div>
              <div style={{ fontSize: 12 }}>Try relaxing your search query or date bounds.</div>
              {hasActiveFilters && (
                <button onClick={resetFilters} style={{ ...S.secondaryBtn, width: "auto", padding: "6px 14px", marginTop: 4 }}>
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sorted.map((e, index) => {
                const cat = categories.find(c => c.id === e.category) ?? categories[0];
                const wallet = wallets.find(w => w.id === e.walletId);
                const isIncome = e.type === "income";
                const isSelected = regSelectedIds.includes(e.id);

                return (
                  <div
                    key={e.id}
                    className="card"
                    style={{
                      ...S.card,
                      padding: "12px 14px",
                      borderLeft: `4px solid ${isIncome ? TOKEN.success : cat.color || TOKEN.amber}`,
                      background: isSelected ? `${TOKEN.amber}0c` : TOKEN.surface,
                      borderColor: isSelected ? `${TOKEN.amber}55` : TOKEN.border,
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {/* Selection checkbox */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(e.id)}
                        style={{ cursor: "pointer", accentColor: TOKEN.amber, width: 16, height: 16 }}
                      />

                      {/* Category Icon */}
                      <div style={{
                        ...S.picon,
                        width: 38, height: 38,
                        background: cat.bg || "rgba(255,255,255,0.06)",
                        boxShadow: `0 2px 8px ${(cat.color || TOKEN.amber)}22`,
                      }}>
                        <CatIcon id={cat.icon} size={18} color={isIncome ? TOKEN.success : cat.color} />
                      </div>

                      {/* Middle Details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: TOKEN.text, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {e.note || cat.label}
                          </span>
                          {isIncome && (
                            <span style={{ background: "rgba(16,185,129,0.15)", color: TOKEN.success, padding: "1px 6px", borderRadius: 6, fontSize: 9, fontWeight: 700 }}>
                              INCOME
                            </span>
                          )}
                          {e.isRecurring && <span title="Recurring Subscription">🔁</span>}
                        </div>

                        <div style={{ color: TOKEN.muted, fontSize: 11, marginTop: 3, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span>{cat.label}</span>
                          <span>•</span>
                          <span>{e.createdAt.slice(0, 10)}</span>
                          <span>•</span>
                          <span>{new Date(e.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                          {wallet && (
                            <>
                              <span>•</span>
                              <span style={{ color: wallet.color || TOKEN.amber }}>{wallet.icon} {wallet.label}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Amount and Actions */}
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{
                          color: isIncome ? TOKEN.success : TOKEN.text,
                          fontSize: 14,
                          fontWeight: 700,
                          fontFamily: TOKEN.mono,
                          letterSpacing: "-0.2px",
                        }}>
                          {isIncome ? "+" : "-"}{fmt(e.amount, cur)}
                        </div>

                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 4 }}>
                          <button
                            onClick={() => handleEditOpen(e)}
                            style={{
                              background: "rgba(255,255,255,0.06)", border: "none", color: TOKEN.muted,
                              padding: "2px 6px", borderRadius: 4, fontSize: 11, cursor: "pointer",
                            }}
                            title="Edit Record"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDuplicateExpense(e)}
                            style={{
                              background: "rgba(255,255,255,0.06)", border: "none", color: TOKEN.muted,
                              padding: "2px 6px", borderRadius: 4, fontSize: 11, cursor: "pointer",
                            }}
                            title="Clone Record"
                          >
                            📋
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm("Delete this transaction?")) {
                                deleteExpense(e.id);
                              }
                            }}
                            style={{
                              background: "rgba(239,68,68,0.1)", border: "none", color: TOKEN.danger,
                              padding: "2px 6px", borderRadius: 4, fontSize: 11, cursor: "pointer",
                            }}
                            title="Delete Record"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }



  function renderSubscriptions() {
    const subs = expenses.filter(e => e.isRecurring);
    return (
      <div style={S.screenPad} className="screen-enter form-screen">
        <div style={S.row}>
          <button onClick={() => go("set")} style={S.iconBtn} aria-label="Back"><ArrowLeftIcon color={TOKEN.dim} /></button>
          <div style={S.heading}>Subscriptions</div>
          <div style={{ width: 34 }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
          {subs.length === 0 ? (
            <div style={{ color: TOKEN.muted, textAlign: "center", padding: 40, fontSize: 14 }}>
              No recurring expenses found.
              <div style={{ fontSize: 12, marginTop: 8 }}>Enable "Make Recurring" when adding an expense.</div>
            </div>
          ) : subs.map(s => (
            <div key={s.id} style={S.subItem}>
              <div style={{ ...S.picon, background: categories.find(c => c.id === s.category)?.bg || TOKEN.surfaceHighlight }}>
                <CatIcon id={s.category} size={18} color={categories.find(c => c.id === s.category)?.color || TOKEN.amber} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: TOKEN.text, fontWeight: 600, fontSize: 14 }}>{s.note || s.category}</div>
                <div style={{ color: TOKEN.muted, fontSize: 10 }}>{s.frequency || "Monthly"} • {WALLETS.find(w => w.id === s.walletId)?.label || "Cash"}</div>
              </div>
              <div style={{ color: TOKEN.text, fontWeight: 600, fontFamily: TOKEN.mono }}>{fmt(s.amount)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderBudgetGoals() {
    const cur = settings.currency || "₹";
    return (
      <div style={S.screenBase} className="screen-enter form-screen">
        <div style={{ ...S.row, padding: "20px 20px 12px", borderBottom: `0.5px solid ${TOKEN.border}` }}>
          <button onClick={() => go("set")} style={S.iconBtn} aria-label="Back"><ArrowLeftIcon color={TOKEN.dim} /></button>
          <div style={S.heading}>Budget Goals</div>
          <div style={{ width: 34 }} />
        </div>

        <div style={{ padding: "16px 20px 0", color: TOKEN.muted, fontSize: 12 }}>
          Set monthly spending caps per category. Tap a category to set or update its limit.
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {categories.map(cat => {
            const goal = budgetGoals.find(g => g.categoryId === cat.id);
            const spent = categoryTotal(expenses, cat.id);

            return (
              <div key={cat.id} style={{ ...S.card, gap: 16 }} className="card">
                {goal ? (
                  <BudgetGoalBar category={cat} spent={spent} limit={goal.limit} currency={cur} />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ ...S.picon, background: cat.bg }}>
                      <CatIcon id={cat.icon} size={16} color={cat.color} />
                    </div>
                    <span style={{ color: TOKEN.textSub, fontSize: 13, flex: 1 }}>{cat.label}</span>
                    <span style={{ color: TOKEN.muted, fontSize: 11 }}>No limit set</span>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => {
                      const val = window.prompt(`Monthly limit for ${cat.label} (${cur}):`, goal?.limit?.toString() || "");
                      if (val === null) return;
                      const num = parseFloat(val.replace(/[^0-9.]/g, ""));
                      if (isNaN(num) || num <= 0) {
                        setBudgetGoals(prev => prev.filter(g => g.categoryId !== cat.id));
                      } else {
                        setBudgetGoals(prev => {
                          const existing = prev.findIndex(g => g.categoryId === cat.id);
                          if (existing >= 0) {
                            const next = [...prev];
                            next[existing] = { categoryId: cat.id, limit: num };
                            return next;
                          }
                          return [...prev, { categoryId: cat.id, limit: num }];
                        });
                      }
                      if (settings.haptic) triggerHaptic("medium");
                    }}
                    style={{
                      flex: 1, padding: "8px", background: goal ? TOKEN.surfaceHighlight : TOKEN.amber,
                      border: "none", borderRadius: 10, cursor: "pointer",
                      color: goal ? TOKEN.textSub : "#fff",
                      fontSize: 12, fontWeight: 600
                    }}
                  >
                    {goal ? `Edit Limit (${cur}${goal.limit.toLocaleString("en-IN")})` : `+ Set Limit`}
                  </button>
                  {goal && (
                    <button
                      onClick={() => { setBudgetGoals(prev => prev.filter(g => g.categoryId !== cat.id)); if (settings.haptic) triggerHaptic("medium"); }}
                      style={{ padding: "8px 12px", background: "none", border: `1px solid ${TOKEN.danger}40`, borderRadius: 10, cursor: "pointer", color: TOKEN.danger, fontSize: 12 }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderMonthlyBreakdown() {
    const cur = settings.currency || "₹";
    const now = new Date();
    const year = breakdownDate.getFullYear();
    const month = breakdownDate.getMonth();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    const isFutureMonth = breakdownDate.getTime() > now.getTime() && !isCurrentMonth;
    const monthName = breakdownDate.toLocaleString("default", { month: "long", year: "numeric" });
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayWeekday = new Date(year, month, 1).getDay(); // 0 = Sun
    const currentDay = isCurrentMonth ? now.getDate() : isFutureMonth ? 0 : daysInMonth;

    // Build granular day-by-day record
    const monthDays = Array.from({ length: daysInMonth }, (_, i) => {
      const dayNum = i + 1;
      const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      const dayTxs = expenses.filter(e => e.createdAt.startsWith(dateKey));
      const dayExpense = dayTxs.filter(e => e.type !== "income").reduce((s, e) => s + e.amount, 0);
      const dayIncome = dayTxs.filter(e => e.type === "income").reduce((s, e) => s + e.amount, 0);
      const net = dayIncome - dayExpense;
      const weekday = new Date(year, month, dayNum).getDay();
      return {
        day: dayNum,
        dateKey,
        weekday,
        txs: dayTxs,
        dayExpense,
        dayIncome,
        net,
        txCount: dayTxs.length,
      };
    });

    const totalExpense = monthDays.reduce((s, d) => s + d.dayExpense, 0);
    const totalIncome = monthDays.reduce((s, d) => s + d.dayIncome, 0);
    const netMonth = totalIncome - totalExpense;
    const peakDay = monthDays.reduce((best, d) => d.dayExpense > best.dayExpense ? d : best, { day: 0, dayExpense: 0 });
    const activeElapsedDays = currentDay > 0 ? currentDay : daysInMonth;
    const avgPerDay = activeElapsedDays > 0 ? totalExpense / activeElapsedDays : 0;
    const frugalDays = monthDays.filter(d => d.dayExpense === 0 && (!isCurrentMonth || d.day <= currentDay)).length;
    const remainingBudget = settings.monthlyBudget - totalExpense;
    const daysLeft = daysInMonth - currentDay;
    const dailyRemaining = remainingBudget > 0 && daysLeft > 0 ? remainingBudget / daysLeft : 0;
    const sparkData = monthDays.map(d => d.dayExpense);

    const activeSelectedDayNum = (selectedMatrixDay && selectedMatrixDay <= daysInMonth)
      ? selectedMatrixDay
      : (isCurrentMonth ? currentDay : (peakDay.day || 1));
    const activeSelectedDay = monthDays.find(d => d.day === activeSelectedDayNum) || monthDays[0];

    const weekLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const handleExportMonthExcel = () => {
      import("xlsx").then(XLSX => {
        // Sheet 1: Daily Matrix Summary
        const summaryRows = monthDays.map(d => ({
          "Month": monthName,
          "Day": d.day,
          "Date": d.dateKey,
          "Weekday": weekLabels[d.weekday],
          "Outflow": d.dayExpense,
          "Inflow": d.dayIncome,
          "Net Cashflow": d.net,
          "Transaction Count": d.txCount,
          "Currency": cur,
        }));

        // Sheet 2: Granular Transactions of the month
        const monthTxs = expenses.filter(e => {
          const d = new Date(e.createdAt);
          return d.getFullYear() === year && d.getMonth() === month;
        }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        const txRows = monthTxs.map(e => {
          const cat = categories.find(c => c.id === e.category);
          const wallet = wallets.find(w => w.id === e.walletId);
          return {
            "Transaction ID": e.id,
            "Date": e.createdAt.slice(0, 10),
            "Time": new Date(e.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
            "Type": e.type === "income" ? "INCOME" : "EXPENSE",
            "Category": cat ? cat.label : e.category,
            "Account": wallet ? wallet.label : (e.walletId || "Cash"),
            "Amount": e.amount,
            "Currency": cur,
            "Note / Remarks": e.note || "",
            "Recurring": e.isRecurring ? "YES" : "NO",
          };
        });

        const wb = XLSX.utils.book_new();
        const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
        const wsTxs = XLSX.utils.json_to_sheet(txRows);
        XLSX.utils.book_append_sheet(wb, wsSummary, "Daily_Matrix");
        XLSX.utils.book_append_sheet(wb, wsTxs, "Granular_Ledger");
        XLSX.writeFile(wb, `Kharcha_Breakdown_${year}_${month + 1}.xlsx`);
      });
    };

    return (
      <div style={S.screenBase} className="screen-enter">
        {/* Navigation & Header */}
        <div style={{ ...S.row, padding: "16px 20px 12px", borderBottom: `0.5px solid ${TOKEN.border}` }}>
          <button onClick={() => go("dash")} style={S.iconBtn} aria-label="Back"><ArrowLeftIcon color={TOKEN.dim} /></button>

          {/* Month Navigation */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => {
                if (settings.haptic) triggerHaptic("light");
                setBreakdownDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
              }}
              style={{ ...S.iconBtn, fontSize: 13, width: 30, height: 30 }}
              title="Previous Month"
            >
              ◀
            </button>
            <div style={{ ...S.heading, fontSize: 15, fontWeight: 700 }}>{monthName}</div>
            <button
              onClick={() => {
                if (settings.haptic) triggerHaptic("light");
                setBreakdownDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
              }}
              style={{ ...S.iconBtn, fontSize: 13, width: 30, height: 30 }}
              title="Next Month"
            >
              ▶
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {!isCurrentMonth && (
              <button
                onClick={() => {
                  if (settings.haptic) triggerHaptic("light");
                  setBreakdownDate(new Date());
                }}
                style={{ ...S.secondaryBtn, padding: "4px 8px", fontSize: 11, width: "auto" }}
                title="Jump to Current Month"
              >
                Today
              </button>
            )}
            <button
              onClick={() => {
                if (settings.haptic) triggerHaptic("light");
                go("registry");
              }}
              style={{ ...S.iconBtn, fontSize: 13, width: 32, height: 32 }}
              title="Open Full Registry"
            >
              📋
            </button>
            <button
              onClick={handleExportMonthExcel}
              style={{ ...S.iconBtn, fontSize: 13, width: 32, height: 32 }}
              title="Export Month Matrix & Ledger to Excel"
            >
              📊
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Executive Summary Stats Ribbon */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            <div style={{ ...S.card, padding: 10, textAlign: "center" }} className="card">
              <div style={{ color: TOKEN.muted, fontSize: 9, fontWeight: 600 }}>OUTFLOW</div>
              <div style={{ color: TOKEN.amber, fontSize: 13, fontWeight: 700, fontFamily: TOKEN.mono, marginTop: 2 }}>{fmt(totalExpense, cur)}</div>
            </div>
            <div style={{ ...S.card, padding: 10, textAlign: "center" }} className="card">
              <div style={{ color: TOKEN.muted, fontSize: 9, fontWeight: 600 }}>INFLOW</div>
              <div style={{ color: TOKEN.success, fontSize: 13, fontWeight: 700, fontFamily: TOKEN.mono, marginTop: 2 }}>{fmt(totalIncome, cur)}</div>
            </div>
            <div style={{ ...S.card, padding: 10, textAlign: "center" }} className="card">
              <div style={{ color: TOKEN.muted, fontSize: 9, fontWeight: 600 }}>NET SAVED</div>
              <div style={{ color: netMonth >= 0 ? TOKEN.success : TOKEN.danger, fontSize: 13, fontWeight: 700, fontFamily: TOKEN.mono, marginTop: 2 }}>
                {netMonth >= 0 ? `+${fmt(netMonth, cur)}` : `-${fmt(-netMonth, cur)}`}
              </div>
            </div>
            <div style={{ ...S.card, padding: 10, textAlign: "center" }} className="card">
              <div style={{ color: TOKEN.muted, fontSize: 9, fontWeight: 600 }}>FRUGAL DAYS</div>
              <div style={{ color: "#38bdf8", fontSize: 13, fontWeight: 700, fontFamily: TOKEN.mono, marginTop: 2 }}>{frugalDays} days</div>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div style={{
            display: "flex", background: TOKEN.surfaceHighlight, borderRadius: 10, padding: 3,
            border: `0.5px solid ${TOKEN.borderSub}`
          }}>
            <button
              onClick={() => {
                if (settings.haptic) triggerHaptic("light");
                setMatrixViewMode("matrix");
              }}
              style={{
                flex: 1, padding: "6px 0", borderRadius: 8, border: "none", cursor: "pointer",
                background: matrixViewMode === "matrix" ? TOKEN.amber : "transparent",
                color: matrixViewMode === "matrix" ? "#ffffff" : TOKEN.muted,
                fontSize: 11, fontWeight: 600, transition: "all 0.15s ease",
              }}
            >
              🗓️ 7-Day Matrix Heatmap
            </button>
            <button
              onClick={() => {
                if (settings.haptic) triggerHaptic("light");
                setMatrixViewMode("ledger");
              }}
              style={{
                flex: 1, padding: "6px 0", borderRadius: 8, border: "none", cursor: "pointer",
                background: matrixViewMode === "ledger" ? TOKEN.amber : "transparent",
                color: matrixViewMode === "ledger" ? "#ffffff" : TOKEN.muted,
                fontSize: 11, fontWeight: 600, transition: "all 0.15s ease",
              }}
            >
              📋 Chronological Daily Ledger
            </button>
          </div>

          {/* VIEW MODE: MATRIX (Calendar Grid) */}
          {matrixViewMode === "matrix" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Calendar Grid Card */}
              <div style={{ ...S.card, padding: 12, gap: 10 }} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TOKEN.textSub }}>
                    Day-by-Day Calendar Matrix
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 10, color: TOKEN.muted }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "rgba(16,185,129,0.3)" }} /> Light
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "rgba(239,159,39,0.35)" }} /> Moderate
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "rgba(239,68,68,0.4)" }} /> Peak
                  </div>
                </div>

                {/* Weekday Labels */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center" }}>
                  {weekLabels.map((lbl, idx) => (
                    <div key={lbl} style={{
                      fontSize: 10, fontWeight: 700,
                      color: idx === 0 || idx === 6 ? TOKEN.amber : TOKEN.muted,
                      padding: "4px 0"
                    }}>
                      {lbl}
                    </div>
                  ))}
                </div>

                {/* 7-Column Day Tiles */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 }}>
                  {/* Empty cells for weekday offset */}
                  {Array.from({ length: firstDayWeekday }).map((_, idx) => (
                    <div key={`offset-${idx}`} style={{ height: 48, borderRadius: 8, opacity: 0.15, background: "rgba(255,255,255,0.02)" }} />
                  ))}

                  {/* Month Day Tiles */}
                  {monthDays.map(d => {
                    const isSelected = activeSelectedDayNum === d.day;
                    const isToday = isCurrentMonth && d.day === now.getDate();
                    const isFuture = isCurrentMonth && d.day > currentDay;

                    let tileBg = "rgba(255,255,255,0.02)";
                    let tileBorder = "1px solid rgba(255,255,255,0.06)";
                    let badgeColor = TOKEN.muted;

                    if (isFuture) {
                      tileBg = "rgba(255,255,255,0.01)";
                      tileBorder = "1px dashed rgba(255,255,255,0.05)";
                    } else if (d.dayExpense === 0) {
                      tileBg = "rgba(16,185,129,0.06)";
                      tileBorder = "1px solid rgba(16,185,129,0.18)";
                      badgeColor = TOKEN.success;
                    } else if (d.dayExpense > 0 && d.dayExpense < avgPerDay * 0.6) {
                      tileBg = "rgba(16,185,129,0.12)";
                      tileBorder = "1px solid rgba(16,185,129,0.28)";
                      badgeColor = "#34d399";
                    } else if (d.dayExpense <= avgPerDay * 1.3) {
                      tileBg = "rgba(239,159,39,0.12)";
                      tileBorder = "1px solid rgba(239,159,39,0.28)";
                      badgeColor = TOKEN.amber;
                    } else {
                      tileBg = "rgba(239,68,68,0.15)";
                      tileBorder = "1px solid rgba(239,68,68,0.35)";
                      badgeColor = TOKEN.danger;
                    }

                    return (
                      <div
                        key={d.day}
                        onClick={() => {
                          if (settings.haptic) triggerHaptic("light");
                          setSelectedMatrixDay(d.day);
                        }}
                        style={{
                          height: 52,
                          borderRadius: 8,
                          padding: "4px 3px",
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "space-between",
                          cursor: "pointer",
                          background: isSelected ? `${TOKEN.amber}1f` : tileBg,
                          border: isSelected ? `2px solid ${TOKEN.amber}` : tileBorder,
                          boxShadow: isSelected ? `0 0 10px ${TOKEN.amber}40` : "none",
                          position: "relative",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{
                            fontSize: 10,
                            fontWeight: isToday || isSelected ? 800 : 600,
                            color: isToday ? TOKEN.amber : isSelected ? "#ffffff" : TOKEN.textSub,
                          }}>
                            {d.day}
                          </span>
                          {isToday && (
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: TOKEN.amber }} title="Today" />
                          )}
                          {d.dayIncome > 0 && (
                            <span style={{ fontSize: 8, color: TOKEN.success, fontWeight: 700 }}>+</span>
                          )}
                        </div>

                        <div style={{ textAlign: "center" }}>
                          {d.dayExpense > 0 ? (
                            <div style={{ fontSize: 9, fontWeight: 700, color: badgeColor, fontFamily: TOKEN.mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {fmt(d.dayExpense, cur)}
                            </div>
                          ) : d.dayIncome > 0 ? (
                            <div style={{ fontSize: 9, fontWeight: 700, color: TOKEN.success, fontFamily: TOKEN.mono }}>
                              +{fmt(d.dayIncome, cur)}
                            </div>
                          ) : isFuture ? (
                            <span style={{ fontSize: 8, color: TOKEN.dim }}>—</span>
                          ) : (
                            <span style={{ fontSize: 8, color: TOKEN.success, fontWeight: 700 }}>₹0</span>
                          )}
                        </div>

                        <div style={{ display: "flex", justifyContent: "center" }}>
                          {d.txCount > 0 ? (
                            <span style={{
                              fontSize: 7, fontWeight: 600,
                              background: "rgba(255,255,255,0.08)",
                              color: TOKEN.muted,
                              padding: "1px 4px", borderRadius: 4,
                            }}>
                              {d.txCount} tx
                            </span>
                          ) : (
                            <span style={{ height: 10 }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Granular Day Inspector Panel */}
              <div style={{ ...S.card, padding: 14, gap: 12, borderLeft: `4px solid ${TOKEN.amber}` }} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ color: TOKEN.amber, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                      DAY {activeSelectedDay.day} GRANULAR LEDGER
                    </div>
                    <div style={{ color: TOKEN.text, fontSize: 14, fontWeight: 700, marginTop: 1 }}>
                      {new Date(year, month, activeSelectedDay.day).toLocaleDateString("en-IN", {
                        weekday: "long", day: "numeric", month: "long", year: "numeric"
                      })}
                    </div>
                  </div>

                  {/* Day Cycling Buttons */}
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={() => {
                        if (settings.haptic) triggerHaptic("light");
                        setSelectedMatrixDay(Math.max(1, activeSelectedDay.day - 1));
                      }}
                      style={{ ...S.iconBtn, width: 28, height: 28, fontSize: 11 }}
                      title="Previous Day"
                    >
                      ‹
                    </button>
                    <button
                      onClick={() => {
                        if (settings.haptic) triggerHaptic("light");
                        setSelectedMatrixDay(Math.min(daysInMonth, activeSelectedDay.day + 1));
                      }}
                      style={{ ...S.iconBtn, width: 28, height: 28, fontSize: 11 }}
                      title="Next Day"
                    >
                      ›
                    </button>
                  </div>
                </div>

                {/* Day KPI Bar */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, background: TOKEN.surfaceHighlight, padding: "8px 10px", borderRadius: 10 }}>
                  <div>
                    <div style={{ color: TOKEN.muted, fontSize: 9 }}>OUTFLOW</div>
                    <div style={{ color: TOKEN.amber, fontSize: 12, fontWeight: 700, fontFamily: TOKEN.mono }}>{fmt(activeSelectedDay.dayExpense, cur)}</div>
                  </div>
                  <div>
                    <div style={{ color: TOKEN.muted, fontSize: 9 }}>INFLOW</div>
                    <div style={{ color: TOKEN.success, fontSize: 12, fontWeight: 700, fontFamily: TOKEN.mono }}>{fmt(activeSelectedDay.dayIncome, cur)}</div>
                  </div>
                  <div>
                    <div style={{ color: TOKEN.muted, fontSize: 9 }}>RECORDS</div>
                    <div style={{ color: TOKEN.textSub, fontSize: 12, fontWeight: 700, fontFamily: TOKEN.mono }}>{activeSelectedDay.txCount} items</div>
                  </div>
                </div>

                {/* Granular Transactions List */}
                {activeSelectedDay.txs.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "20px 0", color: TOKEN.muted, fontSize: 12 }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>🌱</div>
                    <div style={{ fontWeight: 600, color: TOKEN.textSub }}>Zero Outflow Day</div>
                    <div>No expenses or incomes recorded on this date.</div>
                    <button
                      onClick={() => go("amt")}
                      style={{ ...S.secondaryBtn, width: "auto", margin: "10px auto 0", padding: "5px 12px", fontSize: 11 }}
                    >
                      + Add Record for this Day
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {activeSelectedDay.txs.map(e => {
                      const cat = categories.find(c => c.id === e.category) ?? categories[0];
                      const wallet = wallets.find(w => w.id === e.walletId);
                      const isIncome = e.type === "income";

                      return (
                        <div
                          key={e.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "8px 10px",
                            background: "rgba(255,255,255,0.03)",
                            borderRadius: 10,
                            border: `0.5px solid ${TOKEN.borderSub}`,
                          }}
                        >
                          <div style={{
                            ...S.picon,
                            width: 34, height: 34,
                            background: cat.bg || "rgba(255,255,255,0.06)",
                          }}>
                            <CatIcon id={cat.icon} size={16} color={isIncome ? TOKEN.success : cat.color} />
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: TOKEN.text, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {e.note || cat.label}
                              </span>
                              {isIncome && (
                                <span style={{ background: "rgba(16,185,129,0.15)", color: TOKEN.success, padding: "1px 5px", borderRadius: 4, fontSize: 8, fontWeight: 700 }}>
                                  INCOME
                                </span>
                              )}
                            </div>
                            <div style={{ color: TOKEN.muted, fontSize: 10, marginTop: 2, display: "flex", gap: 6 }}>
                              <span>{cat.label}</span>
                              <span>•</span>
                              <span>{new Date(e.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                              {wallet && <span>• {wallet.icon} {wallet.label}</span>}
                            </div>
                          </div>

                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{
                              color: isIncome ? TOKEN.success : TOKEN.text,
                              fontSize: 13,
                              fontWeight: 700,
                              fontFamily: TOKEN.mono,
                            }}>
                              {isIncome ? "+" : "-"}{fmt(e.amount, cur)}
                            </div>
                            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", marginTop: 2 }}>
                              <button
                                onClick={() => handleEditOpen(e)}
                                style={{ background: "none", border: "none", color: TOKEN.muted, fontSize: 10, cursor: "pointer", padding: "1px 3px" }}
                                title="Edit"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDuplicateExpense(e)}
                                style={{ background: "none", border: "none", color: TOKEN.muted, fontSize: 10, cursor: "pointer", padding: "1px 3px" }}
                                title="Duplicate"
                              >
                                📋
                              </button>
                              <button
                                onClick={() => {
                                  if (window.confirm("Delete this transaction?")) deleteExpense(e.id);
                                }}
                                style={{ background: "none", border: "none", color: TOKEN.danger, fontSize: 10, cursor: "pointer", padding: "1px 3px" }}
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Sparkline & Budget Progress */}
              <div style={{ ...S.card, gap: 10 }} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TOKEN.textSub }}>Monthly Spending Trajectory</div>
                  {peakDay.dayExpense > 0 && (
                    <div style={{ fontSize: 10, color: TOKEN.muted }}>Peak: Day {peakDay.day} ({fmt(peakDay.dayExpense, cur)})</div>
                  )}
                </div>
                <SparkLine data={sparkData} height={56} color={TOKEN.amber} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: TOKEN.muted }}>
                  <span>Day 1</span>
                  <span>Day {Math.floor(daysInMonth / 2)}</span>
                  <span>Day {daysInMonth}</span>
                </div>
              </div>

              <div style={{ ...S.card, gap: 8 }} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: TOKEN.muted }}>
                  <span>{fmt(totalExpense, cur)} spent of {fmt(settings.monthlyBudget, cur)}</span>
                  <span style={{ color: remainingBudget >= 0 ? TOKEN.success : TOKEN.danger, fontWeight: 600 }}>
                    {remainingBudget >= 0 ? `${fmt(remainingBudget, cur)} left` : `${fmt(-remainingBudget, cur)} over`}
                  </span>
                </div>
                <div style={{ height: 6, background: TOKEN.surfaceHighlight, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(100, (totalExpense / (settings.monthlyBudget || 1)) * 100)}%`,
                    background: totalExpense > settings.monthlyBudget ? TOKEN.danger : TOKEN.amber,
                    borderRadius: 3,
                  }} />
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE: CHRONOLOGICAL DAILY LEDGER */}
          {matrixViewMode === "ledger" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {monthDays.filter(d => d.txCount > 0).length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: TOKEN.muted, fontSize: 13 }}>
                  No transactions recorded in {monthName}.
                </div>
              ) : (
                monthDays.filter(d => d.txCount > 0).reverse().map(d => (
                  <div key={d.day} style={{ ...S.card, padding: 12, gap: 10 }} className="card">
                    {/* Day Group Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `0.5px solid ${TOKEN.borderSub}`, paddingBottom: 8 }}>
                      <div>
                        <span style={{ color: TOKEN.text, fontWeight: 700, fontSize: 13 }}>
                          Day {d.day} • {new Date(year, month, d.day).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                        </span>
                        <span style={{ fontSize: 10, color: TOKEN.muted, marginLeft: 8 }}>
                          {d.txCount} record{d.txCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 8, fontSize: 12, fontFamily: TOKEN.mono, fontWeight: 700 }}>
                        {d.dayExpense > 0 && <span style={{ color: TOKEN.amber }}>-{fmt(d.dayExpense, cur)}</span>}
                        {d.dayIncome > 0 && <span style={{ color: TOKEN.success }}>+{fmt(d.dayIncome, cur)}</span>}
                      </div>
                    </div>

                    {/* Day Transactions */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {d.txs.map(e => {
                        const cat = categories.find(c => c.id === e.category) ?? categories[0];
                        const wallet = wallets.find(w => w.id === e.walletId);
                        const isIncome = e.type === "income";

                        return (
                          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                            <div style={{ ...S.picon, width: 28, height: 28, background: cat.bg }}>
                              <CatIcon id={cat.icon} size={14} color={isIncome ? TOKEN.success : cat.color} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: TOKEN.text, fontSize: 12, fontWeight: 600 }}>{e.note || cat.label}</div>
                              <div style={{ color: TOKEN.muted, fontSize: 10 }}>
                                {new Date(e.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                                {wallet && ` • ${wallet.label}`}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ color: isIncome ? TOKEN.success : TOKEN.text, fontSize: 12, fontWeight: 700, fontFamily: TOKEN.mono }}>
                                {isIncome ? "+" : "-"}{fmt(e.amount, cur)}
                              </div>
                              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                                <button onClick={() => handleEditOpen(e)} style={{ background: "none", border: "none", color: TOKEN.muted, fontSize: 9, cursor: "pointer" }}>✏️</button>
                                <button onClick={() => handleDuplicateExpense(e)} style={{ background: "none", border: "none", color: TOKEN.muted, fontSize: 9, cursor: "pointer" }}>📋</button>
                                <button onClick={() => { if (window.confirm("Delete record?")) deleteExpense(e.id); }} style={{ background: "none", border: "none", color: TOKEN.danger, fontSize: 9, cursor: "pointer" }}>🗑️</button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderReports() {
    return (
      <ReportsScreen 
        expenses={expenses} 
        categories={categories} 
        settings={settings}
        isDesktop={isDesktop}
        onBack={() => go("dash")} 
      />
    );
  }

  function renderManageWallets() {
    return (
      <div style={S.screenPad} className="screen-enter form-screen">
        <div style={S.row}>
          <button onClick={() => go("set")} style={S.iconBtn} aria-label="Back"><ArrowLeftIcon color={TOKEN.dim} /></button>
          <div style={S.heading}>Accounts</div>
          <div style={{ width: 34 }} />
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }}>
          {wallets.map((w, idx) => (
            <div key={w.id} style={S.reportCard} className="card">
              <div style={{ ...S.row, marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>{w.icon}</span>
                <div style={{ flex: 1, fontWeight: 600, color: TOKEN.text }}>{w.label}</div>
              </div>
              <div style={{ color: TOKEN.muted, fontSize: 11, marginBottom: 6 }}>Starting Balance</div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: 12, color: TOKEN.muted, fontSize: 14 }}>₹</span>
                <input 
                  type="number"
                  value={w.initialBalance || ""}
                  onChange={(e) => {
                    const next = [...wallets];
                    next[idx] = { ...w, initialBalance: parseFloat(e.target.value) || 0 };
                    setWallets(next);
                    updateSetting("wallets", next);
                  }}
                  placeholder="0.00"
                  style={{ ...S.noteInput, paddingLeft: 28 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderManageCats() {
    const activeCats = categories.filter((c) => (c.type || "expense") === manageCatType);

    const handleSaveCategory = () => {
      if (!catLabel.trim()) {
        alert("Please enter a category label.");
        return;
      }
      if (!catIcon.trim()) {
        alert("Please enter a category icon (e.g. an emoji).");
        return;
      }

      const newCat: Category = {
        id: editingCat ? editingCat.id : generateId(),
        label: catLabel.trim(),
        icon: catIcon.trim(),
        color: catColor,
        bg: "var(--token-surfaceElevated)",
        type: manageCatType,
        defaultAmount: parseFloat(catDefaultAmount) || undefined
      };

      let nextCats: Category[];
      if (editingCat) {
        nextCats = categories.map((c) => (c.id === editingCat.id ? newCat : c));
      } else {
        nextCats = [...categories, newCat];
      }

      setCategories(nextCats);
      updateSetting("customCategories", nextCats);

      // Reset
      setEditingCat(null);
      setCatLabel("");
      setCatIcon("🍔");
      setCatColor("#EF9F27");
      setCatDefaultAmount("");
      setIsCatFormOpen(false);
      if (settings.haptic) triggerHaptic("success");
    };

    const handleDeleteCategory = (catId: string) => {
      if (categories.filter(c => (c.type || "expense") === manageCatType).length <= 1) {
        alert("You must keep at least one category for this type.");
        return;
      }

      if (window.confirm("Delete this category? Associated history won't be deleted, but it will fallback to the default category icon.")) {
        const nextCats = categories.filter(c => c.id !== catId);
        setCategories(nextCats);
        updateSetting("customCategories", nextCats);
        if (settings.haptic) triggerHaptic("medium");
      }
    };

    const handleEditOpen = (cat: Category) => {
      setEditingCat(cat);
      setCatLabel(cat.label);
      setCatIcon(cat.icon);
      setCatColor(cat.color);
      setCatDefaultAmount(cat.defaultAmount ? cat.defaultAmount.toString() : "");
      setIsCatFormOpen(true);
      if (settings.haptic) triggerHaptic("light");
    };

    const emojis = ["🍔", "🚗", "🔌", "🛍️", "🏠", "🧾", "💵", "💻", "📈", "📦", "💡", "🍿", "🏥", "🏋️", "🎓", "🎁", "🐕", "☕", "☕", "✈️", "🚕", "🛒"];
    const colors = ["#EF9F27", "#378ADD", "#1D9E75", "#7F77DD", "#D85A30", "#639922", "#E24B4A", "#F06292"];

    return (
      <div style={S.screenPad} className="screen-enter form-screen">
        <div style={S.row}>
          <button onClick={() => go("set")} style={S.iconBtn} aria-label="Back"><ArrowLeftIcon color={TOKEN.dim} /></button>
          <div style={S.heading}>Categories</div>
          <button onClick={() => {
            setEditingCat(null);
            setCatLabel("");
            setCatIcon("🍔");
            setCatColor("#EF9F27");
            setCatDefaultAmount("");
            setIsCatFormOpen(true);
            if (settings.haptic) triggerHaptic("light");
          }} style={S.iconBtn} aria-label="Add Category">+</button>
        </div>

        {/* Expense/Income Toggle */}
        <div style={{ ...S.tabRow, marginTop: 16, marginBottom: 12 }}>
          {(["expense", "income"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setManageCatType(t); if (settings.haptic) triggerHaptic("light"); }}
              style={{
                flex: 1, padding: 8, borderRadius: 8, border: "none", cursor: "pointer",
                background: manageCatType === t ? (t === "income" ? TOKEN.success : TOKEN.amber) : "transparent",
                color: manageCatType === t ? "#fff" : TOKEN.muted,
                fontWeight: 600,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.05em"
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Category List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {activeCats.map((cat) => (
            <div key={cat.id} style={{ ...S.cardRow, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ ...S.picon, background: cat.bg }}>
                  <CatIcon id={cat.icon} size={18} color={cat.color} />
                </div>
                <div>
                  <div style={{ color: TOKEN.text, fontSize: 14, fontWeight: 500 }}>{cat.label}</div>
                  {cat.defaultAmount && (
                    <div style={{ color: TOKEN.muted, fontSize: 11, marginTop: 2 }}>
                      Default: {fmt(cat.defaultAmount, settings.currency || "₹")}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => handleEditOpen(cat)}
                  style={{ background: "none", border: `1px solid ${TOKEN.border}`, borderRadius: 8, padding: "6px 12px", color: TOKEN.textSub, cursor: "pointer", fontSize: 11 }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteCategory(cat.id)}
                  style={{ background: "none", border: "none", color: TOKEN.danger, cursor: "pointer", fontSize: 11, padding: "6px" }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add/Edit Modal */}
        {isCatFormOpen && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.85)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "flex-start", zIndex: 1000, padding: "24px 16px",
            overflowY: "auto", WebkitOverflowScrolling: "touch"
          }}>
            <div style={{
              background: TOKEN.surface, borderRadius: 24, padding: 24, width: "100%", maxWidth: 340,
              maxHeight: "90vh", overflowY: "auto", margin: "auto 0",
              display: "flex", flexDirection: "column", gap: 16, border: `1px solid ${TOKEN.border}`
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: TOKEN.text, textAlign: "center" }}>
                {editingCat ? "Edit Category" : "Add Category"}
              </div>

              {/* Preview Circle */}
              <div style={{
                width: 60, height: 60, borderRadius: "50%",
                background: "var(--token-surfaceElevated)",
                display: "flex", alignItems: "center", justifyContent: "center",
                alignSelf: "center", border: `2px solid ${catColor}`,
                fontSize: 24, boxShadow: `0 0 16px ${catColor}33`
              }}>
                <CatIcon id={catIcon} size={24} color={catColor} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Label Input */}
                <div>
                  <div style={{ color: TOKEN.muted, fontSize: 11, marginBottom: 4 }}>Label</div>
                  <div style={S.card} className="card">
                    <input
                      type="text"
                      value={catLabel}
                      onChange={(e) => setCatLabel(e.target.value)}
                      placeholder="e.g. Groceries, Rent"
                      style={S.noteInput}
                    />
                  </div>
                </div>

                {/* Default Amount Input */}
                <div>
                  <div style={{ color: TOKEN.muted, fontSize: 11, marginBottom: 4 }}>Default Amount (Optional)</div>
                  <div style={S.card} className="card">
                    <input
                      type="number"
                      value={catDefaultAmount}
                      onChange={(e) => setCatDefaultAmount(e.target.value)}
                      placeholder="e.g. 500"
                      style={S.noteInput}
                    />
                  </div>
                </div>

                {/* Icon Selection */}
                <div>
                  <div style={{ color: TOKEN.muted, fontSize: 11, marginBottom: 4 }}>Icon (Emoji or Text)</div>
                  <div style={{ ...S.card, flexDirection: "row", alignItems: "center", gap: 8 }} className="card">
                    <input
                      type="text"
                      value={catIcon}
                      onChange={(e) => setCatIcon(e.target.value)}
                      placeholder="Emoji"
                      style={{ ...S.noteInput, width: 60, textAlign: "center" }}
                    />
                    <div style={{ display: "flex", gap: 4, overflowX: "auto", flex: 1, padding: "2px 0" }}>
                      {emojis.map(e => (
                        <button
                          key={e}
                          onClick={() => setCatIcon(e)}
                          style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", padding: 2 }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Color Selection */}
                <div>
                  <div style={{ color: TOKEN.muted, fontSize: 11, marginBottom: 4 }}>Color</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
                    {colors.map(color => {
                      const active = catColor === color;
                      return (
                        <button
                          key={color}
                          onClick={() => setCatColor(color)}
                          style={{
                            width: 28, height: 28, borderRadius: "50%",
                            background: color,
                            border: active ? `3px solid ${TOKEN.text}` : "3px solid transparent",
                            cursor: "pointer",
                            boxShadow: active ? `0 0 8px ${color}` : "none",
                            transition: "all 0.2s",
                            outline: "none"
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <button
                  onClick={() => setIsCatFormOpen(false)}
                  style={{ flex: 1, padding: "12px", background: "transparent", border: `1px solid ${TOKEN.border}`, borderRadius: 12, color: TOKEN.textSub, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCategory}
                  style={{ flex: 1, padding: "12px", background: manageCatType === "income" ? TOKEN.success : TOKEN.amber, border: "none", borderRadius: 12, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderAuditLogs() {
    return (
      <div style={S.screenBase} className="screen-enter form-screen">
        <div style={{ ...S.row, padding: "20px 20px 12px", borderBottom: `0.5px solid ${TOKEN.border}` }}>
          <button onClick={() => go("set")} style={S.iconBtn} aria-label="Back">←</button>
          <div style={S.heading}>Enterprise Audit Trail</div>
          <button
            onClick={() => {
              setAuditLoading(true);
              enterpriseStorage.getAuditLogs().then((logs) => {
                setAuditLogs(logs);
                setAuditLoading(false);
              });
            }}
            style={{ ...S.iconBtn, fontSize: 16 }}
            title="Refresh logs"
          >
            🔄
          </button>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: 1 }}>
          {/* Status banner */}
          <div style={{
            ...S.card,
            background: "linear-gradient(135deg, rgba(29, 158, 117, 0.15), rgba(55, 138, 221, 0.1))",
            border: "1px solid rgba(29, 158, 117, 0.35)",
            padding: 16,
            borderRadius: 16,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#1D9E75", boxShadow: "0 0 10px #1D9E75" }} />
                <span style={{ color: TOKEN.text, fontWeight: 700, fontSize: 14 }}>Prisma Relational Database</span>
              </div>
              <span style={{ fontSize: 11, background: "rgba(29, 158, 117, 0.25)", color: "#1D9E75", padding: "3px 8px", borderRadius: 8, fontWeight: 600 }}>
                ACID Compliant
              </span>
            </div>
            <div style={{ color: TOKEN.textSub, fontSize: 12, marginTop: 8 }}>
              Every transaction, modification, user switch, and import is cryptographically recorded with timestamps in the relational database.
            </div>
          </div>

          {/* Log records list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {auditLoading ? (
              <div style={{ textAlign: "center", color: TOKEN.muted, padding: 30 }}>Loading audit logs...</div>
            ) : auditLogs.length === 0 ? (
              <div style={{ textAlign: "center", color: TOKEN.muted, padding: 30 }}>
                No audit logs recorded yet. Transactions and user switches will appear here in real time.
              </div>
            ) : (
              auditLogs.map((log) => {
                const isCreate = log.action.includes("CREATE") || log.action.includes("BATCH");
                const isDelete = log.action.includes("DELETE") || log.action.includes("CLEAR");
                const badgeColor = isCreate ? "#1D9E75" : isDelete ? "#E24B4A" : "#378ADD";

                return (
                  <div key={log.id} style={{ ...S.card, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: badgeColor,
                        background: `${badgeColor}22`,
                        padding: "2px 8px",
                        borderRadius: 6,
                        border: `1px solid ${badgeColor}44`,
                      }}>
                        {log.action}
                      </span>
                      <span style={{ fontSize: 11, color: TOKEN.dim }}>
                        {new Date(log.createdAt).toLocaleString("en-IN", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                        })}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ color: TOKEN.text, fontWeight: 600 }}>{log.entity}</span>
                      <span style={{ color: TOKEN.muted }}>By: {log.userName}</span>
                    </div>
                    {log.details && (
                      <div style={{
                        fontSize: 11,
                        color: TOKEN.textSub,
                        background: "rgba(0,0,0,0.25)",
                        padding: "6px 8px",
                        borderRadius: 6,
                        fontFamily: TOKEN.mono,
                        wordBreak: "break-all",
                      }}>
                        {log.details}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  function Sidebar() {
    const tabs: { screen: ScreenName; icon: string; label: string }[] = [
      { screen: "dash", icon: "📊", label: "Dashboard" },
      { screen: "hist", icon: "🕒", label: "Ledger & History" },
      { screen: "registry", icon: "📋", label: "Transaction Registry" },
      { screen: "monthly_breakdown", icon: "📅", label: "Day-by-Day Matrix" },
      { screen: "reports", icon: "📈", label: "Analytics" },
      { screen: "budget_goals", icon: "🎯", label: "Budget Goals" },
      { screen: "subscriptions", icon: "🔄", label: "Subscriptions" },
      { screen: "manage_wallets", icon: "💼", label: "Accounts & Wallets" },
      { screen: "set", icon: "⚙️", label: "Settings" },
      { screen: "audit_logs", icon: "🛡️", label: "Audit Ledger & DB" },
    ];

    return (
      <div style={S.sidebar}>
        {/* Brand Logo Section */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          paddingBottom: 20,
          borderBottom: `1px solid rgba(255,255,255,0.06)`,
          marginBottom: 8,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14,
            background: `linear-gradient(135deg, rgba(239,159,39,0.3), rgba(239,159,39,0.1))`,
            border: `1px solid rgba(239,159,39,0.25)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, boxShadow: "0 4px 12px rgba(239,159,39,0.15)",
          }}>
            {settings.profileImage
              ? <img src={settings.profileImage} style={{ width: "100%", height: "100%", borderRadius: 12, objectFit: "cover" }} alt="Profile" />
              : "🪙"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, color: TOKEN.text, fontSize: 16, letterSpacing: "-0.3px" }}>Kharcha</div>
            <div style={{ fontSize: 11, color: TOKEN.muted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {settings.userName || "User"}
            </div>
          </div>
          <button
            onClick={() => setScreen("user_select")}
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8, padding: "4px 8px", fontSize: 11, color: TOKEN.muted, cursor: "pointer",
            }}
            title="Switch User"
          >
            Switch
          </button>
        </div>

        {/* Nav Items */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, overflowY: "auto" }}>
          {tabs.map((t) => {
            const isActive = screen === t.screen;
            return (
              <button
                key={t.screen}
                onClick={() => {
                  if (settings.haptic) triggerHaptic("light");
                  go(t.screen);
                }}
                className="sidebar-item"
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "9px 12px",
                  borderRadius: 12, border: "none", cursor: "pointer",
                  background: isActive ? "rgba(239,159,39,0.12)" : "transparent",
                  color: isActive ? TOKEN.amber : TOKEN.textSub,
                  fontWeight: isActive ? 700 : 500,
                  fontSize: 13,
                  transition: "all 0.18s",
                  position: "relative",
                  borderLeft: isActive ? `3px solid ${TOKEN.amber}` : "3px solid transparent",
                }}
              >
                <span style={{ fontSize: 16 }}>{t.icon}</span>
                <span style={{ flex: 1, textAlign: "left" }}>{t.label}</span>
                {isActive && (
                  <div style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: TOKEN.amber,
                    boxShadow: `0 0 8px ${TOKEN.amber}`,
                  }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Quick Add Buttons */}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            onClick={() => { if (settings.haptic) triggerHaptic("medium"); go("cat"); }}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "10px", borderRadius: 12, cursor: "pointer",
              background: `linear-gradient(135deg, rgba(239,159,39,0.22), rgba(239,159,39,0.08))`,
              border: `1px solid rgba(239,159,39,0.25)`,
              color: TOKEN.amber, fontWeight: 700, fontSize: 12,
              transition: "all 0.2s",
            }}
            className="sidebar-item"
          >
            <PlusIcon size={14} color={TOKEN.amber} />
            Add Expense
          </button>
          {settings.voice && (
            <button
              onClick={() => { if (settings.haptic) triggerHaptic("medium"); startVoice(); }}
              style={{
                width: 38, height: 38, borderRadius: 12, cursor: "pointer",
                background: `linear-gradient(135deg, rgba(239,159,39,0.25), rgba(216,90,48,0.2))`,
                border: `1px solid rgba(239,159,39,0.3)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: TOKEN.amber, flexShrink: 0,
              }}
              className="sidebar-item"
              title="Voice AI"
              aria-label="Voice AI"
            >
              <MicIcon size={16} color={TOKEN.amber} />
            </button>
          )}
        </div>

        {/* UI Mode Switcher pill */}
        <button
          onClick={toggleUiMode}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "8px 10px", borderRadius: 10, cursor: "pointer",
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            color: TOKEN.textSub, fontSize: 11, fontWeight: 500,
            marginTop: 8,
          }}
          className="sidebar-item"
          title="Switch to Mobile Phone View"
        >
          <span>📱</span>
          <span>Switch to Phone UI</span>
        </button>

        {/* Footer */}
        <div style={{ paddingTop: 10, borderTop: `1px solid rgba(255,255,255,0.05)`, marginTop: 6 }}>
          <div style={{ color: TOKEN.dim, fontSize: 10, textAlign: "center", letterSpacing: "0.06em" }}>KHARCHA WINDOWS v2.0</div>
        </div>
      </div>
    );
  }

  function BottomNav() {
    const tabs: { screen: ScreenName; icon: string; label: string }[] = [
      { screen: "dash", icon: "📊", label: "Dash" },
      { screen: "reports", icon: "📈", label: "Reports" },
      { screen: "hist", icon: "🕒", label: "History" },
      { screen: "set", icon: "⚙️", label: "Settings" },
    ];

    return (
      <div style={S.tabNav}>
        {tabs.map((t) => {
          const isActive = screen === t.screen;
          return (
            <div
              key={t.screen}
              onClick={() => {
                if (settings.haptic) triggerHaptic("light");
                go(t.screen);
              }}
              className="nav-item"
              style={{
                ...S.tabItem,
                background: isActive ? "rgba(239,159,39,0.12)" : "transparent",
                color: isActive ? TOKEN.amber : TOKEN.dim,
                transition: "all 0.2s",
                borderRadius: 14,
                position: "relative",
              }}
            >
              <span style={{ fontSize: 20 }}>{t.icon}</span>
              <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 400 }}>{t.label}</span>
              {isActive && (
                <div style={{
                  position: "absolute", bottom: 3,
                  width: 4, height: 4, borderRadius: "50%",
                  background: TOKEN.amber,
                  boxShadow: `0 0 6px ${TOKEN.amber}`,
                }} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ─── Root render ─────────────────────────────────────────────────────────────
  if (screen === "onboarding") {
    const activeUser: UserProfile = users.find(u => u.id === activeUserId) || {
      id: activeUserId || "default",
      name: settings.userName || "Kharcha User",
      email: settings.userName ? `${settings.userName.toLowerCase()}@kharcha.local` : "user@kharcha.local",
      createdAt: new Date().toISOString()
    };

    return (
      <div
        style={{
          ...S.root,
          padding: 0,
        }}
        className={`app-root theme-${settings.theme || "dark"}`}
      >
        <GlobalStyles />
        <OnboardingFlow
          user={activeUser}
          initialSettings={settings}
          theme={settings.theme || "dark"}
          onComplete={(updatedUser, updatedSettings) => {
            setUsers(prev => prev.map(u => u.id === updatedUser.id ? { ...u, ...updatedUser } : u));
            if (updatedSettings) {
              setSettings(prev => ({ ...prev, ...updatedSettings }));
              const userKeys = getUserStorageKeys(updatedUser.id);
              saveStorage(userKeys.SETTINGS, { ...settings, ...updatedSettings });
            }
            setScreen("dash");
            if (settings.haptic) triggerHaptic("success");
          }}
          onSkipAll={() => {
            setScreen("dash");
          }}
        />
      </div>
    );
  }

  const isAuthScreen = ["user_select", "auth", "register", "forgot_password", "lock"].includes(screen);

  if (!isAuthScreen) {
    const activeUser: UserProfile = users.find(u => u.id === activeUserId) || {
      id: activeUserId || "default",
      name: settings.userName || "Kharcha User",
      email: settings.userName ? `${settings.userName.toLowerCase()}@kharcha.local` : "user@kharcha.local",
      createdAt: new Date().toISOString()
    };

    if (platformMode === "desktop") {
      return (
        <div
          style={{
            ...S.root,
            padding: 0,
            ...(settings.accentColor ? {
              ["--token-amber" as any]: settings.accentColor,
              ["--token-amberText" as any]: settings.theme === "light" ? "#ffffff" : "#1a0a00",
            } : {})
          }}
          className={`app-root theme-${settings.theme || "dark"}`}
        >
          <GlobalStyles />
          <WindowsDesktopShell
            user={activeUser}
            users={users}
            expenses={expenses}
            settings={settings}
            categories={categories}
            wallets={wallets}
            budgetGoals={budgetGoals}
            onAddExpense={handleAddExpense}
            onEditExpense={editExpense}
            onDeleteExpense={deleteExpense}
            onBulkDeleteExpenses={handleBulkDeleteExpenses}
            onUpdateSettings={handleUpdateSettings}
            onSwitchUser={() => setScreen("user_select")}
            onSignOut={() => setScreen("user_select")}
            onSwitchToWebMode={() => {
              setPlatformMode("web");
              handleUpdateSettings({ layoutMode: "responsive" });
            }}
          />
        </div>
      );
    }

    return (
      <div
        style={{
          ...S.root,
          padding: 0,
          ...(settings.accentColor ? {
            ["--token-amber" as any]: settings.accentColor,
            ["--token-amberText" as any]: settings.theme === "light" ? "#ffffff" : "#1a0a00",
          } : {})
        }}
        className={`app-root theme-${settings.theme || "dark"}`}
      >
        <GlobalStyles />
        <WebShell
          user={activeUser}
          users={users}
          expenses={expenses}
          settings={settings}
          categories={categories}
          wallets={wallets}
          budgetGoals={budgetGoals}
          onAddExpense={handleAddExpense}
          onEditExpense={editExpense}
          onDeleteExpense={deleteExpense}
          onBulkDeleteExpenses={handleBulkDeleteExpenses}
          onUpdateSettings={handleUpdateSettings}
          onUpdateUser={handleUpdateUser}
          onSwitchUser={() => setScreen("user_select")}
          onSignOut={() => setScreen("user_select")}
          onSwitchToDesktopMode={() => {
            setPlatformMode("desktop");
            handleUpdateSettings({ layoutMode: "desktop" });
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        ...S.root,
        padding: isDesktop ? 0 : 16,
        ...(settings.accentColor ? {
          ["--token-amber" as any]: settings.accentColor,
          ["--token-amberText" as any]: settings.theme === "light" ? "#ffffff" : "#1a0a00",
        } : {})
      }}
      className={`app-root theme-${settings.theme || "dark"}`}
    >
      <GlobalStyles />
      <div style={isDesktop ? (isMaximized ? { ...S.desktopContainer, maxWidth: "100%", height: "100vh", borderRadius: 0 } : S.desktopContainer) : S.phone} className={isDesktop ? "app-desktop" : "app-phone"}>
        {isDesktop && (
          <WindowsTitleBar
            userName={settings.userName}
            onSwitchUser={() => setScreen("user_select")}
            onToggleUiMode={toggleUiMode}
            theme={settings.theme || "dark"}
            onToggleTheme={toggleTheme}
            isMaximized={isMaximized}
            onToggleMaximize={() => setIsMaximized(!isMaximized)}
          />
        )}
        {!isDesktop && <StatusBar />}
        {!isDesktop && (
          <PhoneTopBar
            userName={settings.userName}
            onSwitchUser={() => setScreen("user_select")}
            onToggleUiMode={toggleUiMode}
            theme={settings.theme || "dark"}
            onToggleTheme={toggleTheme}
            onOpenVoice={settings.voice ? startVoice : undefined}
          />
        )}
        <div style={isDesktop ? S.windowsWorkspace : { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {isDesktop && ["dash", "hist", "reports", "set", "registry", "budget_goals", "monthly_breakdown", "subscriptions", "manage_wallets", "manage_cats", "audit_logs"].includes(screen) && <Sidebar />}
          <div style={isDesktop ? S.desktopContent : S.body}>
            {screen === "user_select" && renderUserSelect()}
            {(screen === "auth" || screen === "register" || screen === "forgot_password") && renderAuth()}
            {screen === "lock" && renderLock()}
            {screen === "cat" && renderCat()}
            {screen === "amt" && renderAmt()}
            {screen === "dash" && renderDash()}
            {screen === "hist" && renderHist()}
            {screen === "set" && renderSet()}
            {screen === "change_pin" && renderChangePin()}
            {screen === "registry" && renderRegistry()}
            {screen === "manage_cats" && renderManageCats()}
            {screen === "reports" && renderReports()}
            {screen === "subscriptions" && renderSubscriptions()}
            {screen === "manage_wallets" && renderManageWallets()}
            {screen === "user_manage" && renderUserManage()}
            {screen === "budget_goals" && renderBudgetGoals()}
            {screen === "monthly_breakdown" && renderMonthlyBreakdown()}
            {screen === "audit_logs" && renderAuditLogs()}
          </div>
        </div>
        {!isDesktop && ["dash", "hist", "reports", "set"].includes(screen) && <BottomNav />}
        {!isDesktop && <HomeBar />}
      </div>
      {renderCropModal()}
      {renderSwitchPinModal()}
      {renderVoiceModal()}
    </div>
  );
}
