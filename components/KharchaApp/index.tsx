"use client";
/**
 * KharchaApp/index.tsx
 * Main entry point. Handles all state, screen routing, and screen rendering.
 *
 * Usage in Next.js:
 *   import KharchaApp from "@/components/KharchaApp";
 *   export default function Page() { return <KharchaApp />; }
 */

import { useState, useEffect, useCallback } from "react";
import type { ScreenName, PeriodName, Category, Expense, Settings } from "./Types";
import { CATEGORIES, AMOUNT_PRESETS, DEFAULT_SETTINGS, STORAGE_KEYS } from "./Constants";
import {
  fmt, todayKey, greeting, dateLabel,
  loadStorage, saveStorage,
  filterByPeriod, sumExpenses, categoryTotal,
  weeklyTotals, groupByDate, generateId,
} from "./Utils";
import { S, TOKEN } from "./Styles";
import {
  StatusBar, HomeBar, Toggle, FingerprintIcon,
  SectionLabel, TogRow,
  BarChart, ExpenseRow, CategoryBar, BudgetCard,
  CatIcon, ArrowLeftIcon, BellIcon, PlusIcon, OverviewCard,
  AuthStyles, BiometricOverlay,
} from "./SubComponents";

// ─── App ──────────────────────────────────────────────────────────────────────
export default function KharchaApp() {

  // ── Core state ──────────────────────────────────────────────────────────────
  const [screen, setScreen]     = useState<ScreenName>("lock");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hasLoaded, setHasLoaded] = useState(false);

  // ── Amount screen ────────────────────────────────────────────────────────────
  const [selCat, setSelCat] = useState<Category>(CATEGORIES[0]);
  const [amtVal, setAmtVal] = useState<number>(150);
  const [note,   setNote]   = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  // ── Categories ──────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<Category[]>(CATEGORIES);

  // ── Dashboard ────────────────────────────────────────────────────────────────
  const [period, setPeriod] = useState<PeriodName>("today");

  // ── History ──────────────────────────────────────────────────────────────────
  const [histCat,    setHistCat]    = useState<string>("all");
  const [histSearch, setHistSearch] = useState<string>("");

  // ── Voice ────────────────────────────────────────────────────────────────────
  const [voiceOpen, setVoiceOpen] = useState<boolean>(false);
  const [voiceStep, setVoiceStep] = useState<0 | 1>(0);

  // ── Auth state ──────────────────────────────────────────────────────────────
  const [pinInput, setPinInput] = useState<string>("");
  const [shake, setShake] = useState(false);
  const [bioStatus, setBioStatus] = useState<null | "scanning" | "success" | "fail">(null);
  const [loginSuccess, setLoginSuccess] = useState(false);

  // ── Load from storage ────────────────────────────────────────────────────────
  useEffect(() => {
    const savedExp = loadStorage<Expense[]>(STORAGE_KEYS.EXPENSES, []);
    const savedSet = loadStorage<Settings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    setExpenses(savedExp);
    setSettings(savedSet);
    setCategories(savedSet.customCategories || CATEGORIES);
    setHasLoaded(true);
  }, []);

  // ── Navigation ───────────────────────────────────────────────────────────────
  const go = useCallback((s: ScreenName) => {
    setScreen(s);
    setVoiceOpen(false);
    setPinInput("");
  }, []);

  // ── Auth Handlers ───────────────────────────────────────────────────────────
  const handleBiometric = useCallback(async () => {
    if (!settings.biometric || bioStatus) return;

    setBioStatus("scanning");
    
    // Simulate biometric check duration
    await new Promise(r => setTimeout(r, 1500));

    // For a real PWA, you'd use navigator.credentials here
    // For now, we simulate success
    const success = true; 

    if (success) {
      setBioStatus("success");
      setTimeout(() => {
        setBioStatus(null);
        go("cat");
      }, 800);
    } else {
      setBioStatus("fail");
      setTimeout(() => setBioStatus(null), 2000);
    }
  }, [settings.biometric, bioStatus, go]);

  const handlePinInput = useCallback((num: string) => {
    if (loginSuccess) return;
    
    const next = pinInput + num;
    if (next.length <= 4) {
      setPinInput(next);
      
      // Haptic feedback simulation
      if (settings.haptic && window.navigator.vibrate) {
        window.navigator.vibrate(10);
      }

      if (next.length === 4) {
        if (next === settings.pinCode) {
          setLoginSuccess(true);
          setTimeout(() => {
            setLoginSuccess(false);
            go("cat");
          }, 400);
        } else {
          setShake(true);
          if (settings.haptic && window.navigator.vibrate) {
            window.navigator.vibrate([50, 50, 50]);
          }
          setTimeout(() => {
            setShake(false);
            setPinInput("");
          }, 500);
        }
      }
    }
  }, [pinInput, go, settings.pinCode, settings.haptic, loginSuccess]);

  // ── Auto-trigger biometric on lock screen ───────────────────────────────────
  useEffect(() => {
    if (screen === "lock" && settings.biometric && hasLoaded && !bioStatus) {
      const timer = setTimeout(handleBiometric, 500);
      return () => clearTimeout(timer);
    }
  }, [screen, settings.biometric, hasLoaded, handleBiometric]);

  // ── Persist on change ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasLoaded) return;
    saveStorage(STORAGE_KEYS.EXPENSES, expenses);
  }, [expenses, hasLoaded]);

  useEffect(() => {
    if (!hasLoaded) return;
    const nextSettings = { ...settings, customCategories: categories };
    saveStorage(STORAGE_KEYS.SETTINGS, nextSettings);
  }, [settings, categories, hasLoaded]);

  const clearPin = () => setPinInput("");

  // ── Expense actions ──────────────────────────────────────────────────────────
  const updateAmt = useCallback((delta: number) => {
    setAmtVal((prev) => Math.max(1, prev + delta));
  }, []);

  const addExpense = useCallback(() => {
    if (isSaving) return;
    
    setIsSaving(true);
    const e: Expense = {
      id:        generateId(),
      category:  selCat.id,
      amount:    amtVal,
      note:      note.trim(),
      createdAt: new Date().toISOString(),
    };
    setExpenses((prev) => [e, ...prev]);
    
    setTimeout(() => {
      setIsSaving(false);
      setNote("");
      setAmtVal(150);
      go("dash");
    }, 900);
  }, [selCat, amtVal, note, go, isSaving]);

  const deleteExpense = useCallback((id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const updateSetting = useCallback(<K extends keyof Settings>(key: K, val: Settings[K]) => {
    setSettings((s) => ({ ...s, [key]: val }));
  }, []);

  // ── Derived values ───────────────────────────────────────────────────────────
  const todayExpenses  = filterByPeriod(expenses, "today");
  const todayTotal     = sumExpenses(todayExpenses);
  const periodExpenses = filterByPeriod(expenses, period);
  const periodTotal    = sumExpenses(periodExpenses);
  const barData        = weeklyTotals(expenses);

  const topCats = categories
    .map((c) => ({ ...c, total: categoryTotal(expenses, c.id) }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 4);
  const maxCatTotal = Math.max(...topCats.map((c) => c.total), 1);

  const filteredExpenses = expenses.filter((e) => {
    const catMatch  = histCat === "all" || e.category === histCat;
    const noteMatch = !histSearch ||
      (e.note || "").toLowerCase().includes(histSearch.toLowerCase()) ||
      e.category.includes(histSearch.toLowerCase());
    return catMatch && noteMatch;
  });
  const groupedHistory = groupByDate(filteredExpenses);
  const historyDates   = Object.keys(groupedHistory).sort().reverse();

  // ── Voice simulation ─────────────────────────────────────────────────────────
  function startVoice() {
    setVoiceStep(0);
    setVoiceOpen(true);
    setTimeout(() => setVoiceStep(1), 2000);
  }

  function confirmVoice() {
    const e: Expense = {
      id:        generateId(),
      category:  "food",
      amount:    200,
      note:      "Sharma dhaba",
      createdAt: new Date().toISOString(),
    };
    setExpenses((prev) => [e, ...prev]);
    setVoiceOpen(false);
    go("dash");
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  SCREENS
  // ════════════════════════════════════════════════════════════════════════════

  function renderLock() {
    const digits = pinInput.padEnd(4, "");

    const handleForgot = () => {
      if (window.confirm("Forgot PIN? This will reset all your app data for security. Proceed?")) {
        localStorage.clear();
        window.location.reload();
      }
    };

    return (
      <div style={{ ...S.screen, gap: 30, position: "relative", ...(shake ? { animation: "shake 0.4s ease-in-out" } : {}) } as any}>
        <AuthStyles />
        
        {bioStatus && <BiometricOverlay status={bioStatus} onCancel={() => setBioStatus(null)} />}

        {/* Title Section */}
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.2em", color: TOKEN.muted, marginBottom: 8, textTransform: "uppercase", fontWeight: 600 }}>
            Secure Vault
          </div>
          <div style={{ fontSize: 32, fontWeight: 600, color: TOKEN.text, letterSpacing: -1, fontFamily: TOKEN.mono }}>
            KHARCHA
          </div>
        </div>

        {/* PIN dots */}
        <div style={{ display: "flex", gap: 18, justifyContent: "center" }}>
          {[0, 1, 2, 3].map((i) => {
            const filled = i < pinInput.length;
            const isLast = i === pinInput.length - 1;
            return (
              <div key={i} style={{
                width: 16, height: 16, borderRadius: "50%",
                background: filled ? (loginSuccess ? TOKEN.success : TOKEN.amber) : "transparent",
                border: `2px solid ${filled ? (loginSuccess ? TOKEN.success : TOKEN.amber) : TOKEN.dim}`,
                transition: "all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                transform: isLast ? "scale(1.2)" : "scale(1)",
                boxShadow: filled ? `0 0 10px ${loginSuccess ? TOKEN.success : TOKEN.amber}40` : "none",
              }} />
            );
          })}
        </div>

        {/* Number keypad */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16, width: "100%", maxWidth: 260, margin: "0 auto",
        }}>
          {[1,2,3,4,5,6,7,8,9].map((n) => (
            <button key={n} onClick={() => handlePinInput(n.toString())} style={{
              ...S.keyBtn,
              background: "#16161F",
              border: `1px solid ${TOKEN.border}`,
              fontSize: 24,
            } as any}>
              {n}
            </button>
          ))}
          {/* Biometric */}
          <button onClick={handleBiometric} aria-label="Biometric unlock" style={{
            ...S.keyBtn,
            background: "#171720",
            border: `1.5px solid ${TOKEN.amber}`,
            color: TOKEN.amber,
          } as any}>
            <FingerprintIcon size={28} />
          </button>
          {/* 0 */}
          <button onClick={() => handlePinInput("0")} style={S.keyBtn as any}>
            0
          </button>
          {/* Backspace */}
          <button onClick={() => setPinInput(p => p.slice(0, -1))} aria-label="Delete last digit" style={{
            ...S.keyBtn,
            color: TOKEN.danger,
            fontSize: 20,
          } as any}>
            ⌫
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <button onClick={handleForgot} style={S.forgotBtn}>
            Forgot PIN?
          </button>
          <div style={{ color: TOKEN.muted, fontSize: 11, textAlign: "center", opacity: 0.7 }}>
            {expenses.length} records secured
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  function renderCat() {
    return (
      <div style={S.screenPad}>
        {/* Header */}
        <div style={{ ...S.row, marginBottom: 4 }}>
          <div>
            <div style={S.label}>Good {greeting()} 👋</div>
            <div style={S.heading}>New Expense</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={startVoice} style={S.iconBtn} aria-label="Voice logging">
              <span style={{ fontSize: 16 }}>🎙️</span>
            </button>
            <button onClick={() => go("dash")} style={S.iconBtn} aria-label="Close">
              <span style={{ color: TOKEN.dim, fontSize: 16 }}>✕</span>
            </button>
          </div>
        </div>

        <BudgetCard total={todayTotal} count={todayExpenses.length} date={dateLabel(todayKey())} />

        {/* Voice overlay */}
        {voiceOpen && (
          <div style={S.voiceBox}>
            <div style={S.label}>Say something like</div>
            <div style={{ fontSize: 13, color: "#D0CEC8", fontStyle: "italic", textAlign: "center" }}>
              "Spent 200 on food at Sharma dhaba"
            </div>
            <div
              style={{ ...S.voiceRing, background: voiceStep === 0 ? "#171720" : "#251E13" }}
              onClick={() => voiceStep === 0 && setVoiceStep(1)}
            >
              <span style={{ fontSize: 28 }}>🎙️</span>
            </div>
            <div style={{ fontSize: 12, color: TOKEN.amber }}>
              {voiceStep === 0 ? "Listening…" : "Done — tap Confirm"}
            </div>
            {voiceStep === 1 && (
              <>
                <div style={S.voiceResult}>
                  <div style={S.label}>Detected</div>
                  <div style={{ color: TOKEN.amber, fontSize: 15, fontWeight: 500 }}>₹200 — Food</div>
                  <div style={{ color: "#C0BEB8", fontSize: 12, marginTop: 2 }}>"Sharma dhaba"</div>
                </div>
                <button onClick={confirmVoice} style={S.confirmBtn}>Confirm &amp; Save</button>
              </>
            )}
            <button onClick={() => setVoiceOpen(false)}
              style={{ background: "none", border: "none", color: TOKEN.muted, cursor: "pointer", fontSize: 12 }}>
              Cancel
            </button>
          </div>
        )}

        <div style={{ color: "#666678", fontSize: 12, marginTop: 4 }}>Select category</div>
        
        <div style={S.catGrid}>
          {categories.map((cat) => {
            const total = categoryTotal(expenses, cat.id);
            return (
              <button
                key={cat.id}
                onClick={() => { setSelCat(cat); go("amt"); }}
                style={{
                  ...S.catBtn,
                  borderColor: selCat.id === cat.id ? cat.color : "#2E2E3E",
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

  // ────────────────────────────────────────────────────────────────────────────
  function renderAmt() {
    return (
      <div style={S.screenPad}>
        <div style={S.row}>
          <button onClick={() => go("cat")} style={S.iconBtn} aria-label="Back"><ArrowLeftIcon color={TOKEN.dim} /></button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ ...S.picon, background: selCat.bg, width: 28, height: 28 }}>
              <CatIcon id={selCat.icon} size={14} color={selCat.color} />
            </div>
            <span style={{ color: TOKEN.text, fontSize: 15, fontWeight: 500 }}>{selCat.label}</span>
          </div>
          <div style={{ width: 34 }} />
        </div>

        <div style={S.card}>
          <div style={{ color: TOKEN.muted, fontSize: 11, marginBottom: 6 }}>Note</div>
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Lunch, Petrol, Shopping…"
            style={S.noteInput}
          />
        </div>

        <div style={{ ...S.card, flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
          <div style={{ color: TOKEN.muted, fontSize: 12 }}>Amount (₹)</div>
          <button onClick={() => updateAmt(50)} style={S.adjBtn as any}>▲</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 52, fontWeight: 500, color: TOKEN.text, fontFamily: TOKEN.mono, letterSpacing: "-2px" }}>
              ₹{amtVal.toLocaleString("en-IN")}
            </div>
            <div style={{ color: TOKEN.muted, fontSize: 11, marginTop: 4 }}>±₹50 steps</div>
          </div>
          <button onClick={() => updateAmt(-50)} style={S.adjBtn as any}>▼</button>
          
          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
            <button onClick={() => updateAmt(-10)} style={S.fineBtn}>−10</button>
            <button onClick={() => updateAmt(-1)}  style={S.fineBtn}>−1</button>
            <button onClick={() => updateAmt(1)}   style={S.fineBtn}>+1</button>
            <button onClick={() => updateAmt(10)}  style={S.fineBtn}>+10</button>
          </div>
        </div>

        <button 
          onClick={addExpense} 
          style={{
            ...S.primaryBtn,
            background: isSaving ? TOKEN.success : TOKEN.amber,
            color: isSaving ? "#E1F5EE" : TOKEN.amberText,
          }}
        >
          {isSaving ? "✓ Saved!" : "Save Expense"}
        </button>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  function renderDash() {
    const periodLabel = period === "today" ? "today" : period === "week" ? "this week" : "this month";
    const subText = `${periodExpenses.length} expense${periodExpenses.length !== 1 ? "s" : ""} ${periodLabel}`;

    return (
      <div style={S.screenPad}>
        <div style={S.row}>
          <div>
            <div style={{ color: TOKEN.muted, fontSize: 12 }}>{dateLabel(todayKey())}</div>
            <div style={S.heading}>Overview</div>
          </div>
          <button onClick={() => go("set")} style={S.iconBtn} aria-label="Settings"><BellIcon color={TOKEN.dim} /></button>
        </div>

        <div style={S.tabRow}>
          {(["today", "week", "month"] as PeriodName[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                flex: 1, padding: 7, borderRadius: 8, border: "none", cursor: "pointer",
                background: period === p ? TOKEN.amber : "transparent",
                color:      period === p ? TOKEN.amberText : TOKEN.muted,
                fontWeight: period === p ? 500 : 400,
                fontSize: 12,
              }}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        <OverviewCard total={periodTotal} sub={subText} />

        <div style={{ ...S.card, gap: 12 }}>
          <div style={{ color: "#666678", fontSize: 12 }}>By category</div>
          {topCats.map((c) => (
            <CategoryBar key={c.id} category={c} total={c.total} max={maxCatTotal} />
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <div style={{ color: "#666678", fontSize: 12 }}>Recent</div>
          <button onClick={() => go("hist")} style={{ background: "none", border: "none", color: TOKEN.amber, fontSize: 12 }}>See all</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {expenses.slice(0, 3).map((e) => (
            <ExpenseRow key={e.id} expense={e} categories={categories} onDelete={deleteExpense} />
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0" }}>
          <button onClick={() => go("cat")} style={S.fab}>
            <PlusIcon color={TOKEN.amberText} />
            <span style={{ color: TOKEN.amberText, fontSize: 14, fontWeight: 500 }}>Add expense</span>
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  function renderHist() {
    return (
      <div style={S.screenPad}>
        {/* Header */}
        <div style={S.row}>
          <button onClick={() => go("dash")} style={S.iconBtn} aria-label="Back">←</button>
          <div style={S.heading}>History</div>
          <div style={{ width: 34 }} />
        </div>

        {/* Search */}
        <div style={{ ...S.card, flexDirection: "row", gap: 8, alignItems: "center" }}>
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
            const cat    = categories.find((c) => c.id === f);
            const active = histCat === f;
            return (
              <button
                key={f}
                onClick={() => setHistCat(f)}
                style={{
                  whiteSpace: "nowrap", padding: "5px 12px", borderRadius: 20,
                  fontSize: 11, cursor: "pointer",
                  border:      `0.5px solid ${active ? TOKEN.amber : "#2E2E3E"}`,
                  background:  active ? "#251E13" : "transparent",
                  color:       active ? TOKEN.amber : "#666",
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
                {dateLabel(date)} • {fmt(sumExpenses(groupedHistory[date]))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {groupedHistory[date].map((e) => (
                  <ExpenseRow key={e.id} expense={e} categories={categories} onDelete={deleteExpense} />
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
      <div style={S.screenBase}>
        {/* Header */}
        <div style={{ ...S.row, padding: "20px 20px 12px", borderBottom: `0.5px solid ${TOKEN.border}` }}>
          <button onClick={() => go("dash")} style={S.iconBtn} aria-label="Back">←</button>
          <div style={S.heading}>Settings</div>
          <div style={{ width: 34 }} />
        </div>

        {/* Profile */}
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: `0.5px solid ${TOKEN.borderSub}` }}>
          <div style={{ width: 46, height: 46, borderRadius: "50%", background: "#251E13", border: `1.5px solid ${TOKEN.amber}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: TOKEN.amber, fontSize: 16, fontWeight: 500 }}>
              {(settings.userName || "U").slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div style={{ flex: 1 }}>
            <input value={settings.userName} onChange={(e) => updateSetting("userName", e.target.value)}
              style={{ ...S.noteInput, fontSize: 14, color: TOKEN.text, fontWeight: 500 }} placeholder="Your name" />
            <input value={settings.userEmail} onChange={(e) => updateSetting("userEmail", e.target.value)}
              style={{ ...S.noteInput, fontSize: 12, color: TOKEN.muted, marginTop: 2 }} placeholder="Email" type="email" />
          </div>
          <span style={{ fontSize: 10, padding: "3px 9px", borderRadius: 10, background: "#1D9E7520", color: TOKEN.success, border: `0.5px solid ${TOKEN.success}60` }}>
            {expenses.length} saved
          </span>
        </div>

        <SectionLabel>Security</SectionLabel>
        <TogRow label="Biometric unlock" sub="Fingerprint / Face ID" val={settings.biometric} onChange={(v) => updateSetting("biometric", v)} />
        <TogRow label="PIN fallback"     sub="4-digit backup PIN"    val={settings.pin}       onChange={(v) => updateSetting("pin", v)} />
        <button onClick={() => go("change_pin")} style={S.menuItem}>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ color: TOKEN.textSub, fontSize: 13 }}>Change PIN</div>
            <div style={{ color: TOKEN.muted, fontSize: 11 }}>Update your 4-digit security code</div>
          </div>
          <span style={{ color: TOKEN.muted }}>›</span>
        </button>

        <SectionLabel>Preferences</SectionLabel>
        <button onClick={() => go("manage_cats")} style={S.menuItem}>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ color: TOKEN.textSub, fontSize: 13 }}>Manage Categories</div>
            <div style={{ color: TOKEN.muted, fontSize: 11 }}>Add, edit or remove expense types</div>
          </div>
          <span style={{ color: TOKEN.muted }}>›</span>
        </button>
        <TogRow label="Voice logging"   sub="AI expense detection"    val={settings.voice}   onChange={(v) => updateSetting("voice", v)} />
        <TogRow label="Haptic feedback" sub="Vibrate on amount change" val={settings.haptic}  onChange={(v) => updateSetting("haptic", v)} />
        <TogRow label="Offline mode"    sub="Cache entries locally"    val={settings.offline} onChange={(v) => updateSetting("offline", v)} />

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
      <div style={S.screenBase}>
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
              <button key={n} onClick={() => handlePinInput(n.toString())} style={S.keyBtn as any}>{n}</button>
            ))}
            <button onClick={clearPin} style={{ ...S.keyBtn, color: TOKEN.danger } as any}>✕</button>
            <button onClick={() => handlePinInput("0")} style={S.keyBtn as any}>0</button>
            <button onClick={() => {
              if (pinInput.length === 4) {
                updateSetting("pinCode", pinInput);
                go("set");
              }
            }} style={{ ...S.keyBtn, color: TOKEN.success, fontSize: 16 } as any}>SAVE</button>
          </div>
        </div>
      </div>
    );
  }

  function renderManageCats() {
    return (
      <div style={S.screenBase}>
        <div style={{ ...S.row, padding: "20px 20px 12px", borderBottom: `0.5px solid ${TOKEN.border}` }}>
          <button onClick={() => go("set")} style={S.iconBtn} aria-label="Back">←</button>
          <div style={S.heading}>Categories</div>
          <div style={{ width: 34 }} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 20px" }}>
          {categories.map((cat, idx) => (
            <div key={cat.id} style={{ ...S.togRow, padding: "12px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ ...S.picon, background: cat.bg }}>
                  <CatIcon id={cat.icon} size={18} color={cat.color} />
                </div>
                <div style={{ color: TOKEN.textSub }}>{cat.label}</div>
              </div>
              <button onClick={() => {
                setCategories(prev => prev.filter((_, i) => i !== idx));
              }} style={{ background: "none", border: "none", color: TOKEN.danger, cursor: "pointer" }}>Delete</button>
            </div>
          ))}
          <div style={{ marginTop: 20, padding: 14, background: "#16161F", borderRadius: 12, border: `1.5px dashed ${TOKEN.border}`, textAlign: "center", color: TOKEN.muted, fontSize: 13, cursor: "pointer" }}
               onClick={() => {
                 const name = window.prompt("Category Name?");
                 const icon = window.prompt("Icon (Emoji)?") || "📦";
                 if (name) {
                   const newCat: Category = {
                     id: name.toLowerCase().replace(/\s+/g, "_"),
                     label: name,
                     icon: icon,
                     color: TOKEN.amber,
                     bg: "#1A1A24"
                   };
                   setCategories(prev => [...prev, newCat]);
                 }
               }}>
            + Add New Category
          </div>
        </div>
      </div>
    );
  }

  // ─── Root render ─────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      <div style={S.phone}>
        <StatusBar />
        <div style={S.body}>
          {screen === "lock" && renderLock()}
          {screen === "cat"  && renderCat()}
          {screen === "amt"  && renderAmt()}
          {screen === "dash" && renderDash()}
          {screen === "hist" && renderHist()}
          {screen === "set"  && renderSet()}
          {screen === "change_pin" && renderChangePin()}
          {screen === "manage_cats" && renderManageCats()}
        </div>
        <HomeBar />
      </div>
    </div>
  );
}
