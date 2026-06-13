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
import type { ScreenName, PeriodName, Category, Expense, Settings, Wallet, UserProfile, BudgetGoal } from "./Types";
import { CATEGORIES, INCOME_CATEGORIES, AMOUNT_PRESETS, DEFAULT_SETTINGS, STORAGE_KEYS, WALLETS, CATEGORY_KEYWORDS, getUserStorageKeys } from "./Constants";
import {
  fmt, todayKey, greeting, dateLabel,
  loadStorage, saveStorage,
  filterByPeriod, sumExpenses, sumIncome, sumWalletBalance, categoryTotal,
  weeklyTotals, groupByDate, generateId, smartMatchCategory,
  triggerHaptic, HapticType,
  parseCSVToExpenses, getDayByDayMonthly,
} from "./Utils";
import { S, TOKEN } from "./Styles";

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
  CatIcon, ArrowLeftIcon, BellIcon, PlusIcon,
  GlobalStyles, BiometricOverlay, ArrowDownIcon,
  BudgetGoalBar, SparkLine,
} from "./SubComponents";
import ReportsScreen from "./ReportsScreen";

// ─── App ──────────────────────────────────────────────────────────────────────
export default function KharchaApp() {

  // ── Multi-user state ─────────────────────────────────────────────────────────
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [activeUserId, setActiveUserId] = useState<string>("");

  // ── Core state ──────────────────────────────────────────────────────────────
  const [screen, setScreen] = useState<ScreenName>("user_select");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hasLoaded, setHasLoaded] = useState(false);

  // ── Amount screen ────────────────────────────────────────────────────────────
  const [selCat, setSelCat] = useState<Category>(CATEGORIES[0]);
  const [amtVal, setAmtVal] = useState<number>(150);
  const [amtInput, setAmtInput] = useState<string>(""); // For manual typing
  const [showKeypad, setShowKeypad] = useState<boolean>(false);
  const [note, setNote] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [txType, setTxType] = useState<"expense" | "income">("expense");
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

  // ── History ──────────────────────────────────────────────────────────────────
  const [histCat, setHistCat] = useState<string>("all");
  const [histSearch, setHistSearch] = useState<string>("");
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

  // ── Responsive Layout State ──────────────────────────────────────────────────
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateLayout = () => {
      if (settings.layoutMode === "desktop") {
        setIsDesktop(true);
      } else if (settings.layoutMode === "mobile") {
        setIsDesktop(false);
      } else {
        setIsDesktop(window.innerWidth > 768);
      }
    };
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, [settings.layoutMode]);

  // ── CSV import ref ───────────────────────────────────────────────────────────
  const csvInputRef = useRef<HTMLInputElement>(null);

  // ── Load from storage (multi-user aware) ─────────────────────────────────────
  useEffect(() => {
    // Load user directory
    const savedUsers = loadStorage<UserProfile[]>(STORAGE_KEYS.USERS, []);
    const savedActiveId = loadStorage<string>(STORAGE_KEYS.ACTIVE_USER, "");

    if (savedUsers.length === 0) {
      // First-ever launch OR single-user migration:
      // Migrate existing data into a new "User 1" profile
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

      // Route directly based on security settings
      if (legacySett.pin || legacySett.biometric) {
        setScreen("lock");
      } else {
        setScreen("dash");
      }
    } else {
      // Normal multi-user load
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

      // Route directly based on security settings
      if (savedSet.pin || savedSet.biometric) {
        setScreen("lock");
      } else {
        setScreen("dash");
      }
    }
    setHasLoaded(true);
  }, []);

  // ── Navigation ───────────────────────────────────────────────────────────────
  const go = useCallback((s: ScreenName) => {
    if (settings.haptic) triggerHaptic("light");
    setScreen(s);
    setVoiceOpen(false);
    setPinInput("");
  }, [settings.haptic]);

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
        alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20
      }}>
        <div style={{
          background: TOKEN.surface, borderRadius: 24, padding: 24, width: "100%", maxWidth: 340,
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

  const clearPin = () => setPinInput("");

  // ── Multi-user actions ────────────────────────────────────────────────────────
  const switchUser = (userId: string) => {
    // Save current user data first
    if (activeUserId) {
      const currKeys = getUserStorageKeys(activeUserId);
      saveStorage(currKeys.EXPENSES, expenses);
      saveStorage(currKeys.SETTINGS, { ...settings, customCategories: categories });
    }
    // Load new user data
    const userKeys = getUserStorageKeys(userId);
    const newExp = loadStorage<Expense[]>(userKeys.EXPENSES, []);
    const newSet = loadStorage<Settings>(userKeys.SETTINGS, DEFAULT_SETTINGS);
    setActiveUserId(userId);
    saveStorage(STORAGE_KEYS.ACTIVE_USER, userId);
    setExpenses(newExp);
    setSettings(newSet);
    setCategories(newSet.customCategories || ALL_CATEGORIES);
    setWallets(newSet.wallets || WALLETS);
    setBudgetGoals(newSet.budgetGoals || []);
    setBudgetAlertDismissed(false);
    setPinInput("");
    setLoginSuccess(false);
    setBioStatus(null);
    
    // If target user has security enabled, go to lock, otherwise go straight to dashboard
    if (newSet.pin || newSet.biometric) {
      setScreen("lock");
    } else {
      setScreen("dash");
    }
    if (settings.haptic) triggerHaptic("medium");
  };

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
    if (settings.haptic) triggerHaptic("success");
    return newId;
  };

  const deleteUser = (userId: string) => {
    if (users.length <= 1) { alert("You must keep at least one user."); return; }
    const updated = users.filter(u => u.id !== userId);
    setUsers(updated);
    saveStorage(STORAGE_KEYS.USERS, updated);
    // If deleting active user, switch to first remaining user
    if (userId === activeUserId) switchUser(updated[0].id);
    if (settings.haptic) triggerHaptic("medium");
  };

  const renameUser = (userId: string, newName: string) => {
    const updated = users.map(u => u.id === userId ? { ...u, name: newName } : u);
    setUsers(updated);
    saveStorage(STORAGE_KEYS.USERS, updated);
    // Also update settings.userName if it's the active user
    if (userId === activeUserId) {
      setSettings(s => ({ ...s, userName: newName }));
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
  }, [screen, settings.pin, settings.haptic, handlePinInput, addExpense]);

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
    return catMatch && noteMatch;
  });
  const groupedHistory = groupByDate(filteredExpenses);
  const historyDates = Object.keys(groupedHistory).sort().reverse();

  // ── Voice Logic ─────────────────────────────────────────────────────────────
  function parseVoiceInput(text: string) {
    const lower = text.toLowerCase();
    let amount = 0;
    
    // Improved number extraction (handles "paid 1200", "spent 450", etc)
    const numMatch = lower.match(/\b\d+(\.\d{1,2})?\b/);
    if (numMatch) {
      amount = parseFloat(numMatch[0]);
    }

    // Smart Category Match
    let categoryMatch = smartMatchCategory(lower, CATEGORY_KEYWORDS) || categories[0].id;

    // Explicit Category Search (Fallback)
    for (const cat of categories) {
      if (lower.includes(cat.label.toLowerCase()) || lower.includes(cat.id)) {
        categoryMatch = cat.id;
        break;
      }
    }

    let note = text.trim();
    if (note.length > 0) {
      note = note.charAt(0).toUpperCase() + note.slice(1);
    }

    setParsedExpense({
      amount: amount || 150,
      category: categoryMatch,
      note: note
    });

    setVoiceStep(1);
    if (settings.haptic) triggerHaptic("success");
  }

  function startVoice() {
    const SpeechRecognitionAPI = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
    
    if (!SpeechRecognitionAPI) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    setVoiceStep(0);
    setVoiceOpen(true);
    setTranscript("Listening...");
    setParsedExpense(null);

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = 'en-US';
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
      alert("Could not start microphone. Check permissions.");
      setVoiceOpen(false);
    }
  }

  function confirmVoice() {
    if (!parsedExpense) return;
    const e: Expense = {
      id: generateId(),
      category: parsedExpense.category || "food",
      amount: parsedExpense.amount || 0,
      note: parsedExpense.note || "",
      createdAt: new Date().toISOString(),
    };
    setExpenses((prev) => [e, ...prev]);
    setVoiceOpen(false);
    go("dash");
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  SCREENS
  // ════════════════════════════════════════════════════════════════════════════

  function renderUserSelect() {
    return (
      <div style={{
        minHeight: "100%", width: "100%",
        background: "linear-gradient(160deg, #0b0b10 0%, #10101a 60%, #0d0d16 100%)",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "40px 24px", boxSizing: "border-box", gap: 0
      }} className="screen-enter form-screen">
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            fontSize: 11, color: TOKEN.amber, letterSpacing: "0.25em",
            textTransform: "uppercase", fontWeight: 700, marginBottom: 10
          }}>KHARCHA</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#ffffff", lineHeight: 1.2 }}>
            Who's logging in?
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
            Select your profile to continue
          </div>
        </div>

        {/* User grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(users.length + 1, 3)}, minmax(100px, 140px))`,
          gap: 20, justifyContent: "center", width: "100%", maxWidth: 480
        }}>
          {users.map((user) => {
            const colors = ["#EF9F27", "#378ADD", "#1D9E75", "#7F77DD", "#D85A30"];
            const colorIdx = user.name.charCodeAt(0) % colors.length;
            const accentColor = colors[colorIdx];
            return (
              <button
                key={user.id}
                onClick={() => switchUser(user.id)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
                  padding: "24px 16px", borderRadius: 24,
                  border: `1px solid rgba(255,255,255,0.08)`,
                  background: "rgba(255,255,255,0.04)",
                  cursor: "pointer", transition: "all 0.2s",
                  backdropFilter: "blur(12px)"
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.09)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = accentColor;
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-4px)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.08)";
                  (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 76, height: 76, borderRadius: "50%", overflow: "hidden",
                  background: `linear-gradient(135deg, ${accentColor}33, ${accentColor}11)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: `2.5px solid ${accentColor}55`,
                  fontSize: 30, fontWeight: 700, color: accentColor,
                  boxShadow: `0 0 24px ${accentColor}22`
                }}>
                  {user.avatar
                    ? <img src={user.avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt={user.name} />
                    : user.name.charAt(0).toUpperCase()
                  }
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#ffffff", textAlign: "center" }}>{user.name}</div>
                <div style={{
                  fontSize: 10, color: accentColor, fontWeight: 600, letterSpacing: "0.1em",
                  textTransform: "uppercase", background: `${accentColor}22`,
                  padding: "3px 10px", borderRadius: 20
                }}>Login →</div>
              </button>
            );
          })}

          {/* Add User card */}
          <button
            onClick={() => {
              const name = window.prompt("Enter new user name:");
              if (name?.trim()) { createUser(name.trim()); }
            }}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
              padding: "24px 16px", borderRadius: 24,
              border: "1.5px dashed rgba(255,255,255,0.12)",
              background: "transparent", cursor: "pointer", transition: "all 0.2s"
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,159,39,0.4)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.12)"; }}
          >
            <div style={{
              width: 76, height: 76, borderRadius: "50%",
              background: "rgba(255,255,255,0.04)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 30, color: "rgba(255,255,255,0.25)",
              border: "1.5px dashed rgba(255,255,255,0.12)"
            }}>+</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.3)" }}>New User</div>
            <div style={{ fontSize: 10, color: "transparent" }}>–</div>
          </button>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 48, fontSize: 12, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
          Tap your profile to enter your PIN
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
      if (window.confirm("Forgot PIN? This will reset all your app data for security. Proceed?")) {
        localStorage.clear();
        window.location.reload();
      }
    };

    const lastCount = expenses.length;
    const lastTotal = sumExpenses(expenses);
    const activeUser = users.find(u => u.id === activeUserId);

    return (
      <div style={{
        ...S.screen,
        background: "#060608",
        padding: "40px 24px",
        justifyContent: "flex-start",
        gap: 0,
        ...(shake ? { animation: "shake 0.4s ease-in-out" } : {}),
        ...(loginSuccess ? S.pulseSuccess : {}),
      } as any} className="screen-enter form-screen">
        {bioStatus && <BiometricOverlay status={bioStatus} onCancel={() => setBioStatus(null)} />}

        {/* Header */}
        <div style={S.lockHeader}>
          <div style={S.lockSubtitle}>Expense Tracker</div>
          <div style={S.lockTitle}>KHARCHA</div>
        </div>

        {/* Active User profile details */}
        {activeUser && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "20px 0 15px" }}>
            <div style={{
              width: 80, height: 80, borderRadius: "50%", overflow: "hidden",
              background: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", justifyContent: "center",
              border: `2px solid ${TOKEN.amber}`, fontSize: 32, fontWeight: 700, color: TOKEN.amber,
              boxShadow: `0 0 20px rgba(239, 159, 39, 0.15)`
            }}>
              {activeUser.avatar
                ? <img src={activeUser.avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt={activeUser.name} />
                : activeUser.name.charAt(0).toUpperCase()
              }
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#ffffff", marginTop: 12 }}>
              {activeUser.name}
            </div>
            <button
              onClick={() => {
                if (settings.haptic) triggerHaptic("medium");
                setScreen("user_select");
              }}
              style={{
                background: "transparent",
                border: "none",
                color: TOKEN.amber,
                fontSize: 12,
                cursor: "pointer",
                marginTop: 6,
                textDecoration: "underline"
              }}
            >
              Switch User
            </button>
          </div>
        )}

        {/* Biometric trigger if active */}
        {settings.biometric && (
          <div style={{ display: "flex", justifyContent: "center", margin: "10px 0 15px" }}>
            <button 
              onClick={() => { if (settings.haptic) triggerHaptic("medium"); handleBiometric(); }} 
              style={{ ...S.biometricCircle, width: 44, height: 44 } as any}
              aria-label="Unlock with biometrics"
            >
              <FingerprintIcon size={22} color={TOKEN.amber} />
            </button>
          </div>
        )}

        {/* Instruction Text */}
        <div style={{ ...S.instructionText, marginTop: 10 }}>
          <div style={S.unlockText}>Enter PIN to unlock</div>
        </div>

        {/* PIN Squares */}
        <div style={{ ...S.pinRow, margin: "15px 0" }}>
          {[0, 1, 2, 3].map((i) => {
            const filled = i < pinInput.length;
            return (
              <div key={i} style={S.pinSquare as any}>
                <div style={{
                  ...S.pinCircle,
                  ...(filled ? S.pinCircleFilled : {})
                } as any} />
              </div>
            );
          })}
        </div>

        {/* Number Keypad (Minimal) */}
        {settings.pin && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12, width: "100%", maxWidth: 240, margin: "10px auto 0",
          }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, "forgot", 0, "back"].map((n) => {
              if (n === "forgot") return (
                <button key="f" onClick={handleForgot} style={{
                  background: "none", border: "none", color: TOKEN.dim, fontSize: 10, cursor: "pointer"
                }}>FORGOT</button>
              );
              if (n === "back") return (
                <button key="b" onClick={() => { if (settings.haptic) triggerHaptic("light"); setPinInput(p => p.slice(0, -1)); }} style={{
                  background: "none", border: "none", color: TOKEN.dim, fontSize: 18, cursor: "pointer"
                }}>⌫</button>
              );
              return (
                <button key={n} onClick={() => handlePinInput(n.toString())} className="key-btn" style={{
                  background: "rgba(255,255,255,0.03)", 
                  border: "none",
                  borderRadius: 10, 
                  color: TOKEN.textSub, 
                  fontSize: 20,
                  height: 44,
                  cursor: "pointer",
                  transition: "background 0.2s"
                }} onPointerDown={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"} onPointerUp={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}>
                  {n}
                </button>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div style={S.lockFooter}>
          <button style={S.footerBtn as any} aria-label="More">
            <ArrowDownIcon size={20} color={TOKEN.dim} />
          </button>
          <div style={S.sessionSummary as any}>
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: TOKEN.amber }} />
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

        {/* Voice overlay */}
        {voiceOpen && (
          <div style={S.voiceBox}>
            <div style={S.label}>{voiceStep === 0 ? "Listening to your expense" : "Parsed Expense"}</div>
            
            {voiceStep === 0 && (
              <div style={{ fontSize: 16, color: TOKEN.text, textAlign: "center", fontStyle: "italic", minHeight: 40, marginTop: 10 }}>
                "{transcript}"
              </div>
            )}

            <div
              style={{ 
                ...S.voiceRing, 
                background: isListening ? TOKEN.surfaceElevated : TOKEN.surface,
                animation: isListening ? "pulseSuccess 1.5s infinite" : "none"
              }}
            >
              <span style={{ fontSize: 28 }}>🎙️</span>
            </div>
            
            <div style={{ fontSize: 12, color: TOKEN.amber }}>
              {isListening ? "Speak now..." : voiceStep === 0 ? "Processing..." : "Done — tap Confirm"}
            </div>

            {voiceStep === 1 && parsedExpense && (
              <>
                <div style={S.voiceResult}>
                  <div style={S.label}>Detected</div>
                  <div style={{ color: TOKEN.amber, fontSize: 15, fontWeight: 500 }}>
                    ₹{parsedExpense.amount} — {categories.find(c => c.id === parsedExpense.category)?.label || parsedExpense.category}
                  </div>
                  <div style={{ color: TOKEN.textFaint, fontSize: 12, marginTop: 2 }}>"{parsedExpense.note}"</div>
                </div>
                <button onClick={confirmVoice} style={S.confirmBtn}>Confirm &amp; Save</button>
              </>
            )}
            <button onClick={() => { setVoiceOpen(false); setIsListening(false); }}
              style={{ background: "none", border: "none", color: TOKEN.muted, cursor: "pointer", fontSize: 12 }}>
              Cancel
            </button>
          </div>
        )}

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
                  <div style={{ color: "#E0DEDB", fontSize: 14, fontWeight: 500 }}>{cat.label}</div>
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
        <div style={{
          ...S.card,
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          border: showKeypad ? `1px solid ${TOKEN.amber}` : S.card.border,
          cursor: "pointer"
        }} onClick={() => setShowKeypad(true)}>
          <div style={{ color: TOKEN.muted, fontSize: 12 }}>{showKeypad ? "Typing amount..." : "Tap to edit amount"}</div>
          <div style={{ textAlign: "center" }}>
            <div style={{
              fontSize: 52,
              fontWeight: 600,
              color: showKeypad ? (txType === "income" ? TOKEN.success : TOKEN.amber) : TOKEN.text,
              fontFamily: TOKEN.mono,
              letterSpacing: "-2px"
            }}>
              ₹{amtVal.toLocaleString("en-IN")}
              {showKeypad && <span style={{ animation: "pulse 1s infinite", borderLeft: `3px solid ${TOKEN.amber}`, marginLeft: 4 }}>&nbsp;</span>}
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
                <button key={v} onClick={() => { if (settings.haptic) triggerHaptic("medium"); setAmtVal(v); setAmtInput(v.toString()); }} style={S.fineBtn}>₹{v}</button>
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

    const balanceCard = (
      <div style={S.heroCard as any}>
        {/* Decorative glow orb */}
        <div style={{
          position: "absolute", top: -30, right: -20,
          width: 120, height: 120, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(239,159,39,0.2) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{ color: TOKEN.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em" }}>Total {periodLabel}</div>
        <div style={{
          fontSize: 44, fontWeight: 800, color: TOKEN.text,
          fontFamily: TOKEN.mono, letterSpacing: "-2px", lineHeight: 1.1,
        }}>
          {fmt(periodTotal, settings.currency || "₹")}
        </div>
        <div style={{ fontSize: 12, color: TOKEN.muted }}>{subText}</div>
        {incomeTotal > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <div style={{
              padding: "3px 10px", borderRadius: 20,
              background: "rgba(29,158,117,0.14)",
              border: "1px solid rgba(29,158,117,0.25)",
              color: TOKEN.success, fontSize: 11, fontWeight: 600,
            }}>
              +{fmt(incomeTotal, settings.currency || "₹")} income
            </div>
          </div>
        )}
        {/* Week sparkline */}
        <div style={{ marginTop: 8 }}>
          <BarChart data={barData} currency={settings.currency || "₹"} />
        </div>
      </div>
    );

    const budgetAlert = !budgetAlertDismissed && todayTotal > settings.dailyBudget && (
      <div style={{
        padding: "12px 16px",
        background: `rgba(226,75,74,0.08)`,
        borderRadius: 16,
        border: `1px solid rgba(226,75,74,0.25)`,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <span style={{ fontSize: 20 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: TOKEN.danger, fontSize: 13, fontWeight: 600 }}>Daily budget exceeded!</div>
          <div style={{ color: TOKEN.muted, fontSize: 11 }}>
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
          ...S.card, flexDirection: "row", alignItems: "center", gap: 12, cursor: "pointer",
          border: `1px solid rgba(239,159,39,0.2)`,
          background: "rgba(239,159,39,0.04)",
        } as any}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: "rgba(239,159,39,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
        }}>🎯</div>
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ color: TOKEN.textSub, fontSize: 13, fontWeight: 600 }}>Budget Goals</div>
          <div style={{ color: TOKEN.muted, fontSize: 11 }}>
            {budgetGoals.filter(g => categoryTotal(expenses, g.categoryId) >= g.limit).length} categor{budgetGoals.filter(g => categoryTotal(expenses, g.categoryId) >= g.limit).length !== 1 ? "ies" : "y"} at limit
          </div>
        </div>
        <span style={{ color: TOKEN.amber, fontSize: 18 }}>›</span>
      </button>
    );

    const walletsOverview = (
      <div>
        <div style={{ ...S.row, marginBottom: 10 }}>
          <div style={{ color: TOKEN.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Accounts</div>
          <button onClick={() => go("manage_wallets")} style={{ background: "none", border: "none", color: TOKEN.amber, fontSize: 11, cursor: "pointer" }}>Manage</button>
        </div>
        <div style={{ ...S.walletGrid, display: "grid", gridTemplateColumns: isDesktop ? "repeat(auto-fill, minmax(150px, 1fr))" : "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          {wallets.map(w => {
            const balance = sumWalletBalance(expenses, w.id, w.initialBalance);
            return (
              <div key={w.id} style={{
                ...S.walletCard,
                background: `linear-gradient(135deg, ${TOKEN.surface} 0%, ${TOKEN.surfaceElevated} 100%)`,
                borderRadius: 16,
                padding: 14,
                transition: "transform 0.2s, box-shadow 0.2s",
              }} className="wallet-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 22 }}>{w.icon}</span>
                  <div style={{ ...S.walletTag as any, background: TOKEN.surfaceHighlight }}>{w.label}</div>
                </div>
                <div style={{
                  fontSize: 18, fontWeight: 700, color: balance < 0 ? TOKEN.danger : TOKEN.text,
                  fontFamily: TOKEN.mono, letterSpacing: "-0.5px", marginTop: 4,
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
          <button onClick={() => go("hist")} style={{
            background: "rgba(239,159,39,0.1)", border: "none",
            color: TOKEN.amber, fontSize: 11, fontWeight: 600,
            padding: "4px 10px", borderRadius: 20, cursor: "pointer",
          }}>See all →</button>
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
      <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
        <button onClick={() => go("cat")} style={S.fab} className="fab-btn">
          <PlusIcon color={TOKEN.amberText} />
          <span style={{ color: TOKEN.amberText, fontSize: 14, fontWeight: 700, letterSpacing: "0.02em" }}>Add Expense</span>
        </button>
      </div>
    );

    const monthlyBreakdownLink = (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8 }}>
        <button
          onClick={() => go("monthly_breakdown")}
          style={{
            ...S.card, flexDirection: "row", alignItems: "center",
            gap: 12, cursor: "pointer",
          } as any}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "rgba(99,102,241,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>📅</div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ color: TOKEN.textSub, fontSize: 13, fontWeight: 600 }}>Monthly Breakdown</div>
            <div style={{ color: TOKEN.muted, fontSize: 11 }}>Day-by-day spending</div>
          </div>
          <span style={{ color: TOKEN.amber, fontSize: 18 }}>›</span>
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
        <div style={{ ...S.tabRow, padding: 4, borderRadius: 14 }}>
          {(["today", "week", "month"] as PeriodName[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className="period-btn"
              style={{
                flex: 1, padding: "8px 4px", borderRadius: 10, border: "none", cursor: "pointer",
                background: period === p ? TOKEN.amber : "transparent",
                color: period === p ? TOKEN.amberText : TOKEN.muted,
                fontWeight: period === p ? 700 : 400,
                fontSize: 12,
                transition: "all 0.2s",
                letterSpacing: "0.02em",
              }}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        {isDesktop ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start", marginTop: 8 }}>
            {/* Left Column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {balanceCard}
              {budgetAlert}
              {walletsOverview}
            </div>
            {/* Right Column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {categoryBreakdown}
              {recentTransactions}
              {securitySetup}
              {budgetGoalsLink}
              {monthlyBreakdownLink}
              {fab}
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
            {monthlyBreakdownLink}
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
          <button onClick={() => {
            // Quick Excel export from history
            import("xlsx").then(XLSX => {
              const data = filteredExpenses.map(e => ({
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

        {/* Search */}
        <div style={{ ...S.card, flexDirection: "row", gap: 8, alignItems: "center" }} className="card">
          <span style={{ color: TOKEN.muted, fontSize: 14 }}>🔍</span>
          <input
            type="text"
            value={histSearch}
            onChange={(e) => setHistSearch(e.target.value)}
            placeholder="Search expenses…"
            style={S.noteInput}
          />
        </div>

        {/* Category filter chips */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {["all", ...categories.map((c) => c.id)].map((f) => {
            const cat = categories.find((c) => c.id === f);
            const active = histCat === f;
            return (
              <button
                key={f}
                onClick={() => setHistCat(f)}
                style={{
                  whiteSpace: "nowrap", padding: "5px 12px", borderRadius: 20,
                  fontSize: 11, cursor: "pointer",
                  border: `0.5px solid ${active ? TOKEN.amber : TOKEN.borderSub}`,
                  background: active ? TOKEN.surfaceElevated : "transparent",
                  color: active ? TOKEN.amber : "#666",
                }}
              >
                {cat ? `${cat.icon} ${cat.label}` : "All"}
              </button>
            );
          })}
        </div>

        {/* Grouped list */}
        {historyDates.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: TOKEN.muted, fontSize: 13 }}>
            No expenses found
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

        <SectionLabel>Appearance</SectionLabel>
        <TogRow 
          label="Light Theme" 
          sub="Use a bright, high-contrast palette" 
          val={settings.theme === "light"} 
          onChange={(v) => updateSetting("theme", v ? "light" : "dark")} 
        />
        <TogRow 
          label="Desktop Layout" 
          sub="Use full screen width on large displays" 
          val={isDesktop} 
          onChange={(v) => updateSetting("layoutMode", v ? "desktop" : "mobile")} 
        />

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
            onClick={() => go("subscriptions")}
            className="settings-item card"
            style={{ ...S.card, flexDirection: "row", justifyContent: "space-between", alignItems: "center", cursor: "pointer", border: `1px solid ${TOKEN.amber}` }}
          >
            <div style={{ color: TOKEN.text, fontSize: 13, fontWeight: 500 }}>Manage Subscriptions</div>
            <span style={{ color: TOKEN.amber }}>➜</span>
          </button>

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
            onClick={() => { if (window.confirm("Clear all expense data? This cannot be undone.")) setExpenses([]); }}
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
                if (settings.biometric) {
                  go("registry"); // Offer to register fingerprint after PIN setup
                } else {
                  go("set");
                }
              }
            }} style={{ ...S.keyBtn, color: TOKEN.success, fontSize: 16 } as any}>SAVE</button>
          </div>
        </div>
      </div>
    );
  }

  function renderRegistry() {
    return (
      <div style={S.screenBase} className="screen-enter form-screen">
        <div style={{ ...S.row, padding: "20px 20px 12px" }}>
          <button onClick={() => go("set")} style={S.iconBtn} aria-label="Back">←</button>
          <div style={S.heading}>Security Registry</div>
          <div style={{ width: 34 }} />
        </div>
        
        <div style={{ padding: 24, textAlign: "center", display: "flex", flexDirection: "column", gap: 30, flex: 1, justifyContent: "center" }}>
          <div style={{ ...S.biometricRing, width: 120, height: 120, margin: "0 auto", animation: "pulseSuccess 2s infinite" }}>
            <FingerprintIcon size={50} color={TOKEN.amber} />
          </div>
          
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: TOKEN.text, marginBottom: 8 }}>Register Fingerprint</div>
            <div style={{ color: TOKEN.muted, fontSize: 14, lineHeight: 1.5 }}>
              Link your device's biometric data to Kharcha for faster, more secure access to your finances.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button onClick={async () => {
              const success = await registerBiometrics();
              if (success) go("set");
            }} style={S.primaryBtn}>
              Start Registration
            </button>
            <button onClick={() => go("set")} style={{ background: "none", border: "none", color: TOKEN.muted, fontSize: 13, cursor: "pointer" }}>
              Skip for now
            </button>
          </div>
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
    const monthName = now.toLocaleString("default", { month: "long", year: "numeric" });
    const dayData = getDayByDayMonthly(expenses);
    const totalThisMonth = dayData.reduce((s, d) => s + d.total, 0);
    const daysInMonth = dayData.length;
    const currentDay = now.getDate();
    const avgPerDay = currentDay > 0 ? totalThisMonth / currentDay : 0;
    const remaining = settings.monthlyBudget - totalThisMonth;
    const dailyRemaining = remaining > 0 && currentDay < daysInMonth
      ? remaining / (daysInMonth - currentDay)
      : 0;
    const sparkData = dayData.map(d => d.total);
    const peakDay = dayData.reduce((best, d) => d.total > best.total ? d : best, { day: 0, total: 0 });

    return (
      <div style={S.screenBase} className="screen-enter">
        <div style={{ ...S.row, padding: "20px 20px 12px", borderBottom: `0.5px solid ${TOKEN.border}` }}>
          <button onClick={() => go("dash")} style={S.iconBtn} aria-label="Back"><ArrowLeftIcon color={TOKEN.dim} /></button>
          <div style={S.heading}>{monthName}</div>
          <div style={{ width: 34 }} />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Summary stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "Spent", value: fmt(totalThisMonth, cur), color: TOKEN.amber },
              { label: "Budget left", value: remaining >= 0 ? fmt(remaining, cur) : `-${fmt(-remaining, cur)}`, color: remaining >= 0 ? TOKEN.success : TOKEN.danger },
              { label: "Avg / day", value: fmt(avgPerDay, cur), color: TOKEN.text },
              { label: "Safe daily", value: dailyRemaining > 0 ? fmt(dailyRemaining, cur) : "—", color: TOKEN.text },
            ].map(s => (
              <div key={s.label} style={{ ...S.card, padding: 14 }} className="card">
                <div style={{ color: TOKEN.muted, fontSize: 10, marginBottom: 4 }}>{s.label}</div>
                <div style={{ color: s.color, fontSize: 16, fontWeight: 700, fontFamily: TOKEN.mono }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Sparkline */}
          <div style={{ ...S.card, gap: 12 }} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: TOKEN.textSub }}>Daily Spending</div>
              {peakDay.total > 0 && (
                <div style={{ fontSize: 11, color: TOKEN.muted }}>Peak: Day {peakDay.day} ({fmt(peakDay.total, cur)})</div>
              )}
            </div>
            <SparkLine data={sparkData} height={64} color={TOKEN.amber} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: TOKEN.muted }}>
              <span>1</span>
              <span>{Math.floor(daysInMonth / 2)}</span>
              <span>{daysInMonth}</span>
            </div>
          </div>

          {/* Budget progress */}
          <div style={{ ...S.card, gap: 10 }} className="card">
            <div style={{ fontSize: 13, fontWeight: 600, color: TOKEN.textSub }}>Monthly Budget</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: TOKEN.muted }}>
              <span>{fmt(totalThisMonth, cur)} spent</span>
              <span>{fmt(settings.monthlyBudget, cur)} budget</span>
            </div>
            <div style={{ height: 8, background: TOKEN.surfaceHighlight, borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.min(100, (totalThisMonth / settings.monthlyBudget) * 100)}%`,
                background: totalThisMonth > settings.monthlyBudget ? TOKEN.danger : TOKEN.amber,
                borderRadius: 4,
                transition: "width 0.5s ease-out"
              }} />
            </div>
            <div style={{ fontSize: 11, color: TOKEN.muted }}>
              {currentDay} of {daysInMonth} days elapsed ({Math.round((currentDay / daysInMonth) * 100)}% of month)
            </div>
          </div>

          {/* Day-by-day list (non-zero days only) */}
          <div style={{ ...S.card, gap: 8 }} className="card">
            <div style={{ fontSize: 13, fontWeight: 600, color: TOKEN.textSub, marginBottom: 4 }}>Day-by-Day</div>
            {dayData.filter(d => d.total > 0).length === 0 ? (
              <div style={{ color: TOKEN.muted, fontSize: 13, textAlign: "center", padding: "16px 0" }}>No expenses this month yet.</div>
            ) : (
              dayData.filter(d => d.total > 0).map(d => {
                const pct = Math.min(100, (d.total / (peakDay.total || 1)) * 100);
                return (
                  <div key={d.day} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 28, textAlign: "right", color: TOKEN.muted, fontSize: 11, flexShrink: 0 }}>
                      {d.day}
                    </div>
                    <div style={{ flex: 1, height: 6, background: TOKEN.surfaceHighlight, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: TOKEN.amber, borderRadius: 3, transition: "width 0.4s" }} />
                    </div>
                    <div style={{ width: 72, textAlign: "right", color: TOKEN.text, fontSize: 12, fontFamily: TOKEN.mono, flexShrink: 0 }}>
                      {fmt(d.total, cur)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
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
            alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20
          }}>
            <div style={{
              background: TOKEN.surface, borderRadius: 24, padding: 24, width: "100%", maxWidth: 340,
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

  function Sidebar() {
    const tabs: { screen: ScreenName; icon: string; label: string }[] = [
      { screen: "dash", icon: "📊", label: "Dashboard" },
      { screen: "reports", icon: "📈", label: "Reports" },
      { screen: "hist", icon: "🕒", label: "History" },
      { screen: "set", icon: "⚙️", label: "Settings" },
    ];

    return (
      <div style={S.sidebar}>
        {/* Brand Logo Section */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          paddingBottom: 24,
          borderBottom: `1px solid rgba(255,255,255,0.05)`,
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
          <div>
            <div style={{ fontWeight: 800, color: TOKEN.text, fontSize: 17, letterSpacing: "-0.3px" }}>Kharcha</div>
            <div style={{ fontSize: 11, color: TOKEN.muted, marginTop: 1 }}>{settings.userName || "User"}</div>
          </div>
        </div>

        {/* Nav Items */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
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
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "11px 14px",
                  borderRadius: 14, border: "none", cursor: "pointer",
                  background: isActive ? "rgba(239,159,39,0.1)" : "transparent",
                  color: isActive ? TOKEN.amber : TOKEN.textSub,
                  fontWeight: isActive ? 700 : 500,
                  fontSize: 14,
                  transition: "all 0.18s",
                  position: "relative",
                  borderLeft: isActive ? `3px solid ${TOKEN.amber}` : "3px solid transparent",
                }}
              >
                <span style={{ fontSize: 18 }}>{t.icon}</span>
                {t.label}
                {isActive && (
                  <div style={{
                    position: "absolute", right: 12,
                    width: 6, height: 6, borderRadius: "50%",
                    background: TOKEN.amber,
                    boxShadow: `0 0 8px ${TOKEN.amber}`,
                  }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Quick Add Button */}
        <button
          onClick={() => { if (settings.haptic) triggerHaptic("medium"); go("cat"); }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "12px", borderRadius: 14, cursor: "pointer",
            background: `linear-gradient(135deg, rgba(239,159,39,0.2), rgba(239,159,39,0.08))`,
            border: `1px solid rgba(239,159,39,0.2)`,
            color: TOKEN.amber, fontWeight: 700, fontSize: 13,
            transition: "all 0.2s",
          }}
          className="sidebar-item"
        >
          <PlusIcon size={16} color={TOKEN.amber} />
          Add Expense
        </button>

        {/* Footer */}
        <div style={{ paddingTop: 16, borderTop: `1px solid rgba(255,255,255,0.05)`, marginTop: 8 }}>
          <div style={{ color: TOKEN.dim, fontSize: 10, textAlign: "center", letterSpacing: "0.06em" }}>KHARCHA v2.0</div>
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
  // isDesktop is now managed by responsive state

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
      <div style={isDesktop ? S.desktopContainer : S.phone} className={isDesktop ? "app-desktop" : "app-phone"}>
        {!isDesktop && <StatusBar />}
        {isDesktop && ["dash", "hist", "reports", "set"].includes(screen) && <Sidebar />}
        <div style={isDesktop ? S.desktopContent : S.body}>
          {screen === "user_select" && renderUserSelect()}
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
        </div>
        {!isDesktop && ["dash", "hist", "reports", "set"].includes(screen) && <BottomNav />}
        {!isDesktop && <HomeBar />}
      </div>
      {renderCropModal()}
    </div>
  );
}
