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
} from "./SubComponents";

// ─── App ──────────────────────────────────────────────────────────────────────
export default function KharchaApp() {

  // ── Core state ──────────────────────────────────────────────────────────────
  const [screen, setScreen]     = useState<ScreenName>("lock");
  const [expenses, setExpenses] = useState<Expense[]>(() =>
    loadStorage<Expense[]>(STORAGE_KEYS.EXPENSES, [])
  );
  const [settings, setSettings] = useState<Settings>(() =>
    loadStorage<Settings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS)
  );

  // ── Amount screen ────────────────────────────────────────────────────────────
  const [selCat, setSelCat] = useState<Category>(CATEGORIES[0]);
  const [amtVal, setAmtVal] = useState<number>(150);
  const [note,   setNote]   = useState<string>("");

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

  // ── Persist on change ────────────────────────────────────────────────────────
  useEffect(() => saveStorage(STORAGE_KEYS.EXPENSES, expenses), [expenses]);
  useEffect(() => saveStorage(STORAGE_KEYS.SETTINGS, settings), [settings]);

  // ── Navigation ───────────────────────────────────────────────────────────────
  const go = useCallback((s: ScreenName) => {
    setScreen(s);
    setVoiceOpen(false);
    setPinInput("");
  }, []);

  const handleBiometric = useCallback(async () => {
    // Check if biometric is enabled
    if (!settings.biometric) return;

    // Simulate biometric check
    // In a real app, you'd use navigator.credentials.get
    setScreen("dash");
  }, [settings.biometric]);

  const handlePinInput = useCallback((num: string) => {
    const next = pinInput + num;
    if (next.length <= 4) {
      setPinInput(next);
      if (next.length === 4) {
        if (next === "1234") { // Default PIN for now
          setTimeout(() => go("dash"), 200);
        } else {
          setShake(true);
          setTimeout(() => {
            setShake(false);
            setPinInput("");
          }, 500);
        }
      }
    }
  }, [pinInput, go]);

  const clearPin = () => setPinInput("");

  // ── Expense actions ──────────────────────────────────────────────────────────
  const addExpense = useCallback(() => {
    const e: Expense = {
      id:        generateId(),
      category:  selCat.id,
      amount:    amtVal,
      note:      note.trim(),
      createdAt: new Date().toISOString(),
    };
    setExpenses((prev) => [e, ...prev]);
    setNote("");
    setAmtVal(150);
    go("dash");
  }, [selCat, amtVal, note, go]);

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

  const topCats = CATEGORIES
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
    return (
      <div style={{ ...S.screen, ...(shake ? S.shakeAnim : {}) } as any}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.18em", color: TOKEN.muted, marginBottom: 8, textTransform: "uppercase" }}>
            Secure Access
          </div>
          <div style={{ fontSize: 32, fontWeight: 600, color: TOKEN.text, letterSpacing: -1, fontFamily: TOKEN.mono }}>
            KHARCHA
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 32, width: "100%", margin: "20px 0" }}>
            <button onClick={handleBiometric} aria-label="Biometric" style={S.biometricBtn}>
                <FingerprintIcon size={44} />
            </button>
            
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ color: TOKEN.muted, fontSize: 12 }}>Enter PIN</div>
                <div style={{ display: "flex", gap: 12 }}>
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} style={{
                        ...S.pinDot,
                        borderColor: pinInput.length > i ? TOKEN.amber : TOKEN.border,
                        background: pinInput.length > i ? `${TOKEN.amber}20` : TOKEN.borderSub,
                    } as any}>
                    {pinInput.length > i && <div style={{ width: 10, height: 10, borderRadius: "50%", background: TOKEN.amber }} />}
                    </div>
                ))}
                </div>
            </div>
        </div>

        <div style={S.keypadGrid as any}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <button key={n} onClick={() => handlePinInput(n.toString())} style={S.keyBtn as any}>{n}</button>
            ))}
            <button onClick={clearPin} style={{ ...S.keyBtn, color: TOKEN.danger } as any}>✕</button>
            <button onClick={() => handlePinInput("0")} style={S.keyBtn as any}>0</button>
            <button onClick={handleBiometric} style={{ ...S.keyBtn, display: "flex", alignItems: "center", justifyContent: "center" } as any}>
                <FingerprintIcon size={24} />
            </button>
        </div>

        <div style={S.lastSession as any}>
          <span style={{ color: TOKEN.muted, fontSize: 11 }}>
            {expenses.length > 0
              ? `Protecting ${expenses.length} records • ${fmt(sumExpenses(expenses))}`
              : "No expenses yet — Secure & Offline"}
          </span>
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

        {/* Today banner */}
        <div style={{ ...S.card, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={S.label}>Today's total</div>
            <div style={{ fontSize: 24, fontWeight: 500, color: TOKEN.amber, fontFamily: TOKEN.mono }}>
              {fmt(todayTotal)}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={S.label}>{todayExpenses.length} expenses</div>
            <div style={S.label}>{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
          </div>
        </div>

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

        {/* Category grid */}
        {!voiceOpen && (
          <div style={S.catGrid}>
            {CATEGORIES.map((cat) => {
              const total = categoryTotal(expenses, cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() => { setSelCat(cat); go("amt"); }}
                  style={{
                    ...S.catBtn,
                    borderColor: selCat.id === cat.id ? cat.color : "#2E2E3E",
                    background:  selCat.id === cat.id ? cat.bg   : "#1A1A24",
                  }}
                >
                  <div style={{ ...S.picon, background: cat.bg }}>
                    <span style={{ fontSize: 18 }}>{cat.icon}</span>
                  </div>
                  <div style={{ color: "#E0DEDB", fontSize: 13, fontWeight: 500 }}>{cat.label}</div>
                  {total > 0 && <div style={{ color: TOKEN.muted, fontSize: 10 }}>{fmt(total)} this month</div>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  function renderAmt() {
    const remaining = Math.max(0, settings.dailyBudget - todayTotal);
    const over      = remaining === 0;

    return (
      <div style={S.screenPad}>
        {/* Header */}
        <div style={S.row}>
          <button onClick={() => go("cat")} style={S.iconBtn} aria-label="Back">
            <span style={{ color: "#888", fontSize: 16 }}>←</span>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ ...S.picon, background: selCat.bg }}>
              <span style={{ fontSize: 16 }}>{selCat.icon}</span>
            </div>
            <span style={{ color: TOKEN.text, fontSize: 15, fontWeight: 500 }}>{selCat.label}</span>
          </div>
          <div style={{
            fontSize: 11, padding: "4px 10px", borderRadius: 10,
            background: over ? "#251813" : "#1A2212",
            color:      over ? "#D85A30" : "#8BBF3A",
          }}>
            {over ? "Over budget" : `${fmt(remaining)} left`}
          </div>
        </div>

        {/* Note input */}
        <div style={S.card}>
          <div style={S.label}>Note (optional)</div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Lunch, Petrol, Hotel…"
            style={S.noteInput}
          />
        </div>

        {/* Amount wheel */}
        <div style={{ ...S.card, alignItems: "center", gap: 10 }}>
          <div style={S.label}>Amount (₹)</div>
          <button onClick={() => setAmtVal((v) => v + 50)} style={S.adjBtn} aria-label="+50">▲</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 52, fontWeight: 500, color: TOKEN.text, fontFamily: TOKEN.mono, letterSpacing: -2 }}>
              ₹{amtVal.toLocaleString("en-IN")}
            </div>
          </div>
          <button onClick={() => setAmtVal((v) => Math.max(1, v - 50))} style={S.adjBtn} aria-label="-50">▼</button>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
            {([-10, -1, 1, 10] as const).map((d) => (
              <button key={d} onClick={() => setAmtVal((v) => Math.max(1, v + d))} style={S.fineBtn}>
                {d > 0 ? "+" : ""}{d}
              </button>
            ))}
          </div>
        </div>

        {/* Presets */}
        <div>
          <div style={{ ...S.label, marginBottom: 6 }}>Quick presets</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {AMOUNT_PRESETS.map((p) => (
              <button key={p} onClick={() => setAmtVal(p)} style={S.presetBtn}>{fmt(p)}</button>
            ))}
          </div>
        </div>

        <button onClick={addExpense} style={{ ...S.primaryBtn, marginTop: "auto" }}>
          Save Expense
        </button>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  function renderDash() {
    return (
      <div style={S.screenPad}>
        {/* Header */}
        <div style={S.row}>
          <div>
            <div style={S.label}>
              {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            </div>
            <div style={S.heading}>Overview</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => go("hist")} style={S.iconBtn} aria-label="History">📋</button>
            <button onClick={() => go("set")}  style={S.iconBtn} aria-label="Settings">⚙️</button>
          </div>
        </div>

        {/* Period tabs */}
        <div style={S.tabRow}>
          {(["today", "week", "month"] as PeriodName[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                flex: 1, padding: 7, borderRadius: 8, border: "none",
                fontSize: 12, cursor: "pointer",
                background: period === p ? TOKEN.amber : "transparent",
                color:      period === p ? TOKEN.amberText : TOKEN.muted,
                fontWeight: period === p ? 600 : 400,
              }}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        {/* Budget card */}
        <BudgetCard
          total={periodTotal}
          budget={settings.dailyBudget}
          count={periodExpenses.length}
          period={period}
        />

        {/* Weekly chart */}
        <div style={S.card}>
          <div style={{ color: "#666678", fontSize: 12, marginBottom: 10 }}>This week</div>
          <BarChart data={barData} />
        </div>

        {/* Category breakdown */}
        {topCats.length > 0 && (
          <div style={S.card}>
            <div style={{ color: "#666678", fontSize: 12, marginBottom: 10 }}>By category</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {topCats.map((c) => (
                <CategoryBar key={c.id} icon={c.icon} label={c.label} color={c.color} total={c.total} max={maxCatTotal} />
              ))}
            </div>
          </div>
        )}

        {/* Recent expenses */}
        {expenses.slice(0, 3).length > 0 && (
          <>
            <div style={{ ...S.label, marginTop: 4 }}>Recent</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {expenses.slice(0, 3).map((e) => (
                <ExpenseRow key={e.id} expense={e} onDelete={deleteExpense} />
              ))}
            </div>
          </>
        )}

        {expenses.length === 0 && (
          <div style={{ textAlign: "center", padding: "24px 0", color: TOKEN.muted, fontSize: 13 }}>
            No expenses yet. Tap below to add one!
          </div>
        )}

        {/* FAB */}
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
          <button onClick={() => go("cat")} style={S.fab}>
            <span style={{ color: TOKEN.amberText, fontSize: 16 }}>＋</span>
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
          {["all", ...CATEGORIES.map((c) => c.id)].map((f) => {
            const cat    = CATEGORIES.find((c) => c.id === f);
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
                  <ExpenseRow key={e.id} expense={e} onDelete={deleteExpense} />
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

        <SectionLabel>Preferences</SectionLabel>
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
        </div>
        <HomeBar />
      </div>
    </div>
  );
}
