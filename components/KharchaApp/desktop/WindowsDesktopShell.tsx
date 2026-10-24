"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { TOKEN } from "../Styles";
import {
  Expense,
  Settings,
  Category,
  Wallet,
  BudgetGoal,
  UserProfile,
  PeriodName,
} from "../Types";
import {
  fmt,
  sumExpenses,
  sumIncome,
  sumWalletBalance,
  filterByPeriod,
  todayKey,
  dateLabel,
  triggerHaptic,
  smartMatchCategory,
  extractVoiceAmount,
} from "../Utils";
import { CATEGORIES, INCOME_CATEGORIES, WALLETS, CATEGORY_KEYWORDS } from "../Constants";
import ReportsScreen from "../ReportsScreen";
import enterpriseStorage from "../EnterpriseStorage";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import SmsTrackingModal from "../SmsTrackingModal";

interface WindowsDesktopShellProps {
  user: UserProfile;
  users: UserProfile[];
  expenses: Expense[];
  settings: Settings;
  categories: Category[];
  wallets: Wallet[];
  budgetGoals: BudgetGoal[];
  onAddExpense: (expense: Omit<Expense, "id">) => void;
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => void;
  onBulkDeleteExpenses: (expenseIds: string[]) => void;
  onUpdateSettings: (newSettings: Partial<Settings>) => void;
  onSwitchUser: () => void;
  onSignOut: () => void;
  onSwitchToWebMode: () => void;
}

export default function WindowsDesktopShell({
  user,
  users,
  expenses,
  settings,
  categories,
  wallets,
  budgetGoals,
  onAddExpense,
  onEditExpense,
  onDeleteExpense,
  onBulkDeleteExpenses,
  onUpdateSettings,
  onSwitchUser,
  onSignOut,
  onSwitchToWebMode,
}: WindowsDesktopShellProps) {
  const isLight = settings.theme === "light";

  // Navigation State
  const [activeSection, setActiveSection] = useState<
    "overview" | "transactions" | "wallets" | "budgets" | "reports" | "settings"
  >("overview");

  // Window State (Electron or Browser Window Emulation)
  const [isMaximized, setIsMaximized] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>("Just now");

  // Persistent Quick Add Dock State
  const [quickAmount, setQuickAmount] = useState<string>("");
  const [quickCat, setQuickCat] = useState<string>("food");
  const [quickWallet, setQuickWallet] = useState<string>("cash");
  const [quickNote, setQuickNote] = useState<string>("");
  const [quickType, setQuickType] = useState<"expense" | "income">("expense");
  const [quickDate, setQuickDate] = useState<string>(todayKey());
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);

  // Desktop Ledger State
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerCat, setLedgerCat] = useState("all");
  const [ledgerWallet, setLedgerWallet] = useState("all");
  const [ledgerSort, setLedgerSort] = useState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc">("date_desc");
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const ledgerSearchInputRef = useRef<HTMLInputElement>(null);

  // Voice Entry State
  const [isListening, setIsListening] = useState(false);
  const [voiceVoiceModalOpen, setVoiceModalOpen] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceParsed, setVoiceParsed] = useState<{
    amount: number;
    category: string;
    note: string;
    walletId: string;
    type: "expense" | "income";
  } | null>(null);

  // Windows Auto-Launch setting state
  const [autoLaunchEnabled, setAutoLaunchEnabled] = useState(false);

  // Sync timestamp updater
  useEffect(() => {
    const updateTime = () => setLastSyncTime(new Date().toLocaleTimeString());
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [expenses]);

  // Check Electron Window & Auto-Launch
  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.isMaximized().then(setIsMaximized);
      window.electronAPI.onMaximizedChange(setIsMaximized);
      window.electronAPI.getAutoLaunchStatus().then(setAutoLaunchEnabled);

      window.electronAPI.onQuickAdd(() => {
        amountInputRef.current?.focus();
      });
      window.electronAPI.onNavigate((screen) => {
        if (screen === "transactions") setActiveSection("transactions");
        else if (screen === "settings") setActiveSection("settings");
        else setActiveSection("overview");
      });
    }
  }, []);

  // ── Keyboard Shortcuts (Ctrl+N, Ctrl+K, Ctrl+1, Ctrl+2, etc.) ─────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't override if typing in an input unless it's a Ctrl key combo
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          amountInputRef.current?.focus();
          amountInputRef.current?.select();
        } else if (e.key === "k" || e.key === "K") {
          e.preventDefault();
          setActiveSection("transactions");
          setTimeout(() => ledgerSearchInputRef.current?.focus(), 50);
        } else if (e.key === "1") {
          e.preventDefault();
          setActiveSection("overview");
        } else if (e.key === "2") {
          e.preventDefault();
          setActiveSection("transactions");
        } else if (e.key === "3") {
          e.preventDefault();
          setActiveSection("reports");
        } else if (e.key === "4") {
          e.preventDefault();
          setActiveSection("wallets");
        } else if (e.key === ",") {
          e.preventDefault();
          setActiveSection("settings");
        }
      } else if (e.key === "Escape") {
        setVoiceModalOpen(false);
        amountInputRef.current?.blur();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Window Chrome Actions ──────────────────────────────────────────────────
  const handleMinimize = () => {
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.minimize();
    }
  };

  const handleMaximize = () => {
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.maximize();
    } else {
      setIsMaximized(!isMaximized);
    }
  };

  const handleClose = () => {
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.close();
    } else {
      onSwitchToWebMode();
    }
  };

  // ── Financial Calculations ──────────────────────────────────────────────────
  const todayExpenses = useMemo(() => filterByPeriod(expenses, "today"), [expenses]);
  const weekExpenses = useMemo(() => filterByPeriod(expenses, "week"), [expenses]);
  const monthExpenses = useMemo(() => filterByPeriod(expenses, "month"), [expenses]);

  const todayTotal = useMemo(() => sumExpenses(todayExpenses), [todayExpenses]);
  const weekTotal = useMemo(() => sumExpenses(weekExpenses), [weekExpenses]);
  const monthTotal = useMemo(() => sumExpenses(monthExpenses), [monthExpenses]);
  const totalWalletCapital = useMemo(() => wallets.reduce((acc, w) => acc + sumWalletBalance(expenses, w.id, w.initialBalance || 0), 0), [wallets, expenses]);

  const remainingMonthlyBudget = useMemo(() => {
    const budget = settings.monthlyBudget || 50000;
    return Math.max(0, budget - monthTotal);
  }, [settings.monthlyBudget, monthTotal]);

  // Cash Flow Trend Area Chart Data
  const trendData = useMemo(() => {
    const days: { [key: string]: { date: string; expense: number; income: number } } = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const str = d.toISOString().slice(0, 10);
      days[str] = {
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        expense: 0,
        income: 0,
      };
    }

    expenses.forEach((e) => {
      const dateKey = (e.createdAt || "").slice(0, 10);
      if (days[dateKey]) {
        if (e.type === "income") days[dateKey].income += e.amount;
        else days[dateKey].expense += e.amount;
      }
    });

    return Object.values(days);
  }, [expenses]);

  // Category Distribution for Widescreen Panel
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    monthExpenses
      .filter((e) => e.type !== "income")
      .forEach((e) => {
        map.set(e.category, (map.get(e.category) || 0) + e.amount);
      });

    const colors = ["#EF9F27", "#378ADD", "#1D9E75", "#7F77DD", "#D85A30", "#BA75FF", "#5DCAA5", "#E24B4A"];
    return Array.from(map.entries()).map(([catId, amount], idx) => {
      const catObj = categories.find((c) => c.id === catId);
      return {
        name: catObj?.label || catId,
        value: amount,
        color: catObj?.color || colors[idx % colors.length],
      };
    });
  }, [monthExpenses, categories]);

  // Filtered Ledger Rows
  const filteredLedger = useMemo(() => {
    let list = [...expenses];
    if (ledgerSearch.trim()) {
      const q = ledgerSearch.toLowerCase();
      list = list.filter(
        (e) =>
          e.note?.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          e.amount.toString().includes(q)
      );
    }
    if (ledgerCat !== "all") list = list.filter((e) => e.category === ledgerCat);
    if (ledgerWallet !== "all") list = list.filter((e) => e.walletId === ledgerWallet);

    list.sort((a, b) => {
      if (ledgerSort === "date_desc") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (ledgerSort === "date_asc") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (ledgerSort === "amount_desc") return b.amount - a.amount;
      if (ledgerSort === "amount_asc") return a.amount - b.amount;
      return 0;
    });

    return list;
  }, [expenses, ledgerSearch, ledgerCat, ledgerWallet, ledgerSort]);

  // ── Quick Add Submission ────────────────────────────────────────────────────
  const handleQuickAddSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = parseFloat(quickAmount);
    if (!val || val <= 0) {
      alert("Please enter a valid amount.");
      return;
    }

    onAddExpense({
      amount: val,
      category: quickCat,
      walletId: quickWallet,
      note: quickNote.trim(),
      type: quickType,
      createdAt: quickDate ? new Date(quickDate + "T12:00:00").toISOString() : new Date().toISOString(),
    });

    // Windows Desktop Notification
    if (typeof window !== "undefined" && window.electronAPI) {
      window.electronAPI.showNotification({
        title: "Transaction Recorded",
        body: `${quickType === "income" ? "+" : "-"}${fmt(val)} in ${quickCat} (${quickWallet})`,
      });
    }

    setQuickAmount("");
    setQuickNote("");
    setQuickDate(todayKey());
    triggerHaptic("success");
    amountInputRef.current?.focus();
  };

  // ── Voice Logging ───────────────────────────────────────────────────────────
  const handleStartVoice = () => {
    if (typeof window === "undefined" || !("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      alert("Speech recognition is unavailable in this environment.");
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceTranscript("Listening... Speak your expense clearly");
      setVoiceModalOpen(true);
      setVoiceParsed(null);
    };

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setVoiceTranscript(text);
      setIsListening(false);

      const amt = extractVoiceAmount(text);
      const matchedCatId = smartMatchCategory(text, CATEGORY_KEYWORDS);
      const catId = matchedCatId || categories[0]?.id || "food";

      let wId = "cash";
      const lower = text.toLowerCase();
      if (lower.includes("upi") || lower.includes("gpay")) wId = "upi";
      else if (lower.includes("bank") || lower.includes("card")) wId = "bank";

      const finalType = lower.includes("salary") || lower.includes("received") ? "income" : "expense";

      setVoiceParsed({
        amount: amt || 100,
        category: catId,
        note: text,
        walletId: wId,
        type: finalType,
      });
    };

    recognition.onerror = () => setIsListening(false);
    recognition.start();
  };

  const handleConfirmVoice = () => {
    if (!voiceParsed) return;
    onAddExpense({
      amount: voiceParsed.amount,
      category: voiceParsed.category,
      walletId: voiceParsed.walletId,
      note: voiceParsed.note,
      type: voiceParsed.type,
      createdAt: new Date().toISOString(),
    });
    setVoiceModalOpen(false);
    setVoiceParsed(null);
  };

  // ── CSV Export ──────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const headers = ["ID", "Date", "Category", "Wallet", "Type", "Amount", "Note"];
    const rows = filteredLedger.map((t) => [
      `"${t.id}"`,
      `"${new Date(t.createdAt).toLocaleDateString()}"`,
      `"${t.category}"`,
      `"${t.walletId || "cash"}"`,
      `"${t.type || "expense"}"`,
      t.amount,
      `"${(t.note || "").replace(/"/g, '""')}"`,
    ]);
    const csvString = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF" + csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kharcha_desktop_ledger_${todayKey()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        background: TOKEN.bg,
        color: TOKEN.text,
        fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {/* ─── 1. CUSTOM WINDOWS TITLE BAR ─────────────────────────────────── */}
      <div
        style={{
          height: 36,
          background: TOKEN.titleBarBg,
          borderBottom: `1px solid ${TOKEN.borderSub}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 0 0 14px",
          ...({ WebkitAppRegion: "drag" } as React.CSSProperties),
          zIndex: 100,
        }}
      >
        {/* App Title & Sync Status */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, ...({ WebkitAppRegion: "no-drag" } as React.CSSProperties) }}>
          <span style={{ fontSize: 16 }}>🪙</span>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.02em", color: TOKEN.text }}>
            KHARCHA Enterprise — Windows Desktop
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "2px 8px",
              borderRadius: 6,
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              fontSize: 10.5,
              color: "#6ee7b7",
            }}
          >
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
            <span>SQLite ACID Synced</span>
          </div>
        </div>

        {/* Window Chrome Buttons (Minimize, Maximize, Close) */}
        <div style={{ display: "flex", height: "100%", ...({ WebkitAppRegion: "no-drag" } as React.CSSProperties) }}>
          {/* SMS Sync Button */}
          <button
            onClick={() => setSmsModalOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: "rgba(16, 185, 129, 0.12)",
              border: `1px solid rgba(16, 185, 129, 0.35)`,
              color: isLight ? "#059669" : "#10b981",
              margin: "auto 4px",
              padding: "3px 9px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
            title="Automatic Bank SMS Tracking & Android Sync"
          >
            <span>📱</span>
            <span>SMS Sync</span>
          </button>

          {/* Theme Toggle Button */}
          <button
            id="desktop-theme-toggle"
            onClick={() => {
              const next = settings.theme === "light" ? "dark" : "light";
              onUpdateSettings({ theme: next });
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: isLight ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.08)",
              border: `1px solid ${TOKEN.border}`,
              color: TOKEN.text,
              margin: "auto 6px",
              padding: "3px 10px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
            title={settings.theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
          >
            <span>{settings.theme === "light" ? "🌙" : "☀️"}</span>
            <span>{settings.theme === "light" ? "Dark" : "Light"}</span>
          </button>

          <button
            onClick={onSwitchToWebMode}
            style={{
              background: "none",
              border: "none",
              color: TOKEN.muted,
              padding: "0 12px",
              fontSize: 11,
              cursor: "pointer",
            }}
            title="Switch to Web SaaS View"
          >
            🌐 Web View
          </button>

          <button
            onClick={handleMinimize}
            style={titleBarButtonStyle}
            title="Minimize"
          >
            🗕
          </button>
          <button
            onClick={handleMaximize}
            style={titleBarButtonStyle}
            title={isMaximized ? "Restore" : "Maximize"}
          >
            {isMaximized ? "🗗" : "🗖"}
          </button>
          <button
            onClick={handleClose}
            style={titleBarCloseButtonStyle}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ─── 2. MAIN APPLICATION WORKSPACE ───────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        {/* Navigation Sidebar */}
        <aside
          style={{
            width: 210,
            background: TOKEN.sidebarBg,
            borderRight: `1px solid ${TOKEN.borderSub}`,
            display: "flex",
            flexDirection: "column",
            padding: "12px 8px",
            gap: 4,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {/* Section Links */}
          {[
            { id: "overview", icon: "📊", label: "Dashboard", hotkey: "Ctrl+1" },
            { id: "transactions", icon: "📋", label: "Ledger", hotkey: "Ctrl+2" },
            { id: "wallets", icon: "💼", label: "Accounts", hotkey: "Ctrl+4" },
            { id: "budgets", icon: "🎯", label: "Budgets", hotkey: "" },
            { id: "reports", icon: "📈", label: "Analytics", hotkey: "Ctrl+3" },
            { id: "settings", icon: "⚙️", label: "Settings", hotkey: "Ctrl+," },
          ].map((item) => {
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveSection(item.id as any);
                  triggerHaptic("light");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: active ? (isLight ? "rgba(217, 119, 6, 0.12)" : "rgba(239, 159, 39, 0.14)") : "transparent",
                  color: active ? TOKEN.amber : TOKEN.muted,
                  fontWeight: active ? 700 : 500,
                  fontSize: 12.5,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                {item.hotkey && (
                  <span style={{ fontSize: 9.5, opacity: 0.5, fontFamily: "monospace" }}>{item.hotkey}</span>
                )}
              </button>
            );
          })}

          <div style={{ flex: 1 }} />

          {/* Profile Card */}
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: TOKEN.surfaceHighlight,
              border: `1px solid ${TOKEN.borderSub}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: TOKEN.amber,
                  color: "#180a00",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {user.avatar ? (
                  <img src={user.avatar} style={{ width: "100%", height: "100%", borderRadius: "50%" }} alt={user.name} />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontSize: 12, fontWeight: 700, textOverflow: "ellipsis", whiteSpace: "nowrap", color: TOKEN.text }}>
                  {user.name}
                </div>
              </div>
            </div>
            <button
              onClick={onSwitchUser}
              style={{
                background: "none",
                border: "none",
                color: TOKEN.amber,
                fontSize: 11,
                cursor: "pointer",
              }}
              title="Switch Profile"
            >
              ⇄
            </button>
          </div>
        </aside>

        {/* ─── 3. WIDESCREEN WORKSPACE CONTENT ───────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflowY: "auto", overflowX: "hidden" }}>
          {/* Top KPI Metric Ribbon */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 12,
              padding: "14px 20px 8px",
            }}
          >
            <div style={desktopKpiBox}>
              <span style={desktopKpiTitle}>Today's Spending</span>
              <span style={desktopKpiVal}>{fmt(todayTotal)}</span>
            </div>
            <div style={desktopKpiBox}>
              <span style={desktopKpiTitle}>Weekly Total</span>
              <span style={desktopKpiVal}>{fmt(weekTotal)}</span>
            </div>
            <div style={desktopKpiBox}>
              <span style={desktopKpiTitle}>Monthly Spend</span>
              <span style={desktopKpiVal}>{fmt(monthTotal)}</span>
            </div>
            <div style={desktopKpiBox}>
              <span style={desktopKpiTitle}>Remaining Budget</span>
              <span style={{ ...desktopKpiVal, color: remainingMonthlyBudget > 0 ? "#10b981" : "#ef4444" }}>
                {fmt(remainingMonthlyBudget)}
              </span>
            </div>
            <div style={desktopKpiBox}>
              <span style={desktopKpiTitle}>Total Capital</span>
              <span style={{ ...desktopKpiVal, color: TOKEN.amber }}>{fmt(totalWalletCapital)}</span>
            </div>
          </div>

          {/* Dynamic Content Views */}
          <div style={{ flex: 1, display: "flex", minHeight: 0, padding: "8px 20px 14px", gap: 16 }}>
            {/* ── TAB: OVERVIEW / DASHBOARD ────────────────────────────── */}
            {activeSection === "overview" && (
              <div style={{ flex: 1, display: "flex", gap: 16, minHeight: 0 }}>
                {/* Left Area (Wide: Trend Chart + Dense Ledger) */}
                <div style={{ flex: 3, display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
                  {/* 14-Day Cash Flow Trend Chart */}
                  <div style={{ ...desktopCard, height: 210, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TOKEN.text }}>14-Day Cash Flow Velocity</span>
                      <span style={{ fontSize: 11, color: TOKEN.muted }}>Expenses vs Income</span>
                    </div>
                    <div style={{ flex: 1, width: "100%" }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trendData}>
                          <defs>
                            <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#EF9F27" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#EF9F27" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" stroke={isLight ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.3)"} fontSize={10} />
                          <YAxis stroke={isLight ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.3)"} fontSize={10} />
                          <Tooltip
                            contentStyle={{
                              background: isLight ? "#FFFFFF" : "rgba(16,16,24,0.95)",
                              borderColor: isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)",
                              borderRadius: 8,
                              fontSize: 11,
                              color: isLight ? "#181822" : "#FFFFFF",
                            }}
                          />
                          <Area type="monotone" dataKey="expense" stroke="#EF9F27" fillOpacity={1} fill="url(#colorExpense)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Dense Recent Transaction Table */}
                  <div style={{ ...desktopCard, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TOKEN.text }}>Ledger Quick Access</span>
                      <button
                        onClick={() => setActiveSection("transactions")}
                        style={{
                          background: "none",
                          border: "none",
                          color: TOKEN.amber,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Full Ledger (Ctrl+2) →
                      </button>
                    </div>
                    <div style={{ flex: 1, overflowY: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ color: TOKEN.muted, borderBottom: `1px solid ${TOKEN.borderSub}`, textAlign: "left" }}>
                            <th style={{ padding: "6px 8px" }}>Date</th>
                            <th style={{ padding: "6px 8px" }}>Category</th>
                            <th style={{ padding: "6px 8px" }}>Note</th>
                            <th style={{ padding: "6px 8px" }}>Wallet</th>
                            <th style={{ padding: "6px 8px", textAlign: "right" }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {expenses.slice(0, 10).map((tx) => {
                            const cat = categories.find((c) => c.id === tx.category);
                            return (
                              <tr key={tx.id} style={{ borderBottom: `1px solid ${TOKEN.borderSub}` }}>
                                <td style={{ padding: "6px 8px", color: TOKEN.muted }}>
                                  {new Date(tx.createdAt).toLocaleDateString()}
                                </td>
                                <td style={{ padding: "6px 8px", color: TOKEN.text }}>
                                  {cat?.icon} {cat?.label || tx.category}
                                </td>
                                <td style={{ padding: "6px 8px", color: TOKEN.text }}>{tx.note || "—"}</td>
                                <td style={{ padding: "6px 8px", color: TOKEN.muted }}>{tx.walletId || "Cash"}</td>
                                <td
                                  style={{
                                    padding: "6px 8px",
                                    textAlign: "right",
                                    fontWeight: 700,
                                    color: tx.type === "income" ? TOKEN.success : TOKEN.text,
                                  }}
                                >
                                  {tx.type === "income" ? "+" : "-"}
                                  {fmt(tx.amount)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Right Area (Docked Desktop Quick-Add Panel + Category Donut) */}
                <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Persistent Quick Add Panel */}
                  <div style={desktopCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, color: TOKEN.text }}>
                        <span>⚡</span>
                        <span>Quick Add Expense</span>
                      </div>
                      <span style={{ fontSize: 10, color: TOKEN.muted, fontFamily: "monospace" }}>Ctrl+N</span>
                    </div>

                    <form onSubmit={handleQuickAddSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {/* Amount input with presets */}
                      <div>
                        <div style={{ position: "relative" }}>
                          <input
                            ref={amountInputRef}
                            type="number"
                            step="any"
                            placeholder="Amount (₹)"
                            value={quickAmount}
                            onChange={(e) => setQuickAmount(e.target.value)}
                            style={{
                              width: "100%",
                              fontSize: 18,
                              fontWeight: 800,
                              padding: "8px 12px",
                              borderRadius: 8,
                              background: TOKEN.surfaceElevated,
                              border: "1px solid rgba(239, 159, 39, 0.4)",
                              color: TOKEN.amber,
                              boxSizing: "border-box",
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleStartVoice}
                            style={{
                              position: "absolute",
                              right: 8,
                              top: "50%",
                              transform: "translateY(-50%)",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontSize: 16,
                            }}
                            title="Voice Input"
                          >
                            🎙️
                          </button>
                        </div>

                        {/* Preset Denominations */}
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          {[50, 100, 200, 500].map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => {
                                const curr = parseFloat(quickAmount) || 0;
                                setQuickAmount((curr + val).toString());
                              }}
                              style={{
                                flex: 1,
                                padding: "3px 0",
                                borderRadius: 6,
                                border: `1px solid ${TOKEN.borderSub}`,
                                background: TOKEN.surfaceHighlight,
                                color: TOKEN.text,
                                fontSize: 10.5,
                                cursor: "pointer",
                              }}
                            >
                              +{val}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Category & Wallet select */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <select
                          value={quickCat}
                          onChange={(e) => setQuickCat(e.target.value)}
                          style={desktopSelectStyle}
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.icon} {c.label}
                            </option>
                          ))}
                        </select>

                        <select
                          value={quickWallet}
                          onChange={(e) => setQuickWallet(e.target.value)}
                          style={desktopSelectStyle}
                        >
                          {wallets.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.icon} {w.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Note */}
                      <input
                        type="text"
                        placeholder="Context / Note"
                        value={quickNote}
                        onChange={(e) => setQuickNote(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "6px 10px",
                          borderRadius: 8,
                          background: TOKEN.surfaceElevated,
                          border: `1px solid ${TOKEN.border}`,
                          color: TOKEN.text,
                          fontSize: 12,
                          boxSizing: "border-box",
                        }}
                      />

                      {/* Date (Past Date Selection) */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                          <span style={{ fontSize: 10, color: TOKEN.muted, textTransform: "uppercase", fontWeight: 700 }}>Date</span>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              type="button"
                              onClick={() => setQuickDate(todayKey())}
                              style={{
                                padding: "1px 6px",
                                borderRadius: 4,
                                border: `1px solid ${quickDate === todayKey() ? TOKEN.amber : TOKEN.borderSub}`,
                                background: quickDate === todayKey() ? "rgba(239, 159, 39, 0.15)" : TOKEN.surfaceHighlight,
                                color: quickDate === todayKey() ? TOKEN.amber : TOKEN.muted,
                                fontSize: 9.5,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Today
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const d = new Date();
                                d.setDate(d.getDate() - 1);
                                setQuickDate(d.toISOString().slice(0, 10));
                              }}
                              style={{
                                padding: "1px 6px",
                                borderRadius: 4,
                                border: `1px solid ${TOKEN.borderSub}`,
                                background: TOKEN.surfaceHighlight,
                                color: TOKEN.muted,
                                fontSize: 9.5,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Yesterday
                            </button>
                          </div>
                        </div>
                        <input
                          type="date"
                          value={quickDate}
                          onChange={(e) => setQuickDate(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "5px 8px",
                            borderRadius: 6,
                            background: TOKEN.surfaceElevated,
                            border: `1px solid ${TOKEN.border}`,
                            color: TOKEN.text,
                            fontSize: 11.5,
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      <button
                        type="submit"
                        style={{
                          padding: "9px 0",
                          borderRadius: 8,
                          border: "none",
                          background: "linear-gradient(135deg, #EF9F27 0%, #D85A30 100%)",
                          color: "#180a00",
                          fontWeight: 800,
                          fontSize: 12.5,
                          cursor: "pointer",
                          boxShadow: "0 4px 12px rgba(239, 159, 39, 0.25)",
                        }}
                      >
                        Save Transaction (Enter)
                      </button>
                    </form>
                  </div>

                  {/* Category Donut */}
                  <div style={{ ...desktopCard, flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: TOKEN.text }}>Category Breakdown</div>
                    <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {categoryData.length === 0 ? (
                        <div style={{ fontSize: 11, color: TOKEN.muted }}>No expenses recorded this month</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={categoryData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={38}
                              outerRadius={65}
                              paddingAngle={2}
                            >
                              {categoryData.map((entry, index) => (
                                <Cell key={`win-cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                background: isLight ? "#FFFFFF" : "rgba(16,16,24,0.95)",
                                borderColor: isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)",
                                borderRadius: 8,
                                fontSize: 11,
                                color: isLight ? "#181822" : "#FFFFFF",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB: TRANSACTIONS FULL LEDGER ────────────────────────── */}
            {activeSection === "transactions" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
                {/* Search & Actions Bar */}
                <div style={{ ...desktopCard, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      ref={ledgerSearchInputRef}
                      type="text"
                      placeholder="Search ledger (Ctrl+K)..."
                      value={ledgerSearch}
                      onChange={(e) => setLedgerSearch(e.target.value)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        background: TOKEN.surfaceElevated,
                        border: `1px solid ${TOKEN.border}`,
                        color: TOKEN.text,
                        fontSize: 12,
                        width: 240,
                      }}
                    />
                    <select
                      value={ledgerCat}
                      onChange={(e) => setLedgerCat(e.target.value)}
                      style={desktopSelectStyle}
                    >
                      <option value="all">All Categories</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.icon} {c.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={ledgerWallet}
                      onChange={(e) => setLedgerWallet(e.target.value)}
                      style={desktopSelectStyle}
                    >
                      <option value="all">All Accounts</option>
                      {wallets.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.icon} {w.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    {selectedRowIds.length > 0 && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete ${selectedRowIds.length} items?`)) {
                            onBulkDeleteExpenses(selectedRowIds);
                            setSelectedRowIds([]);
                          }
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          background: "rgba(239, 68, 68, 0.2)",
                          border: "1px solid rgba(239, 68, 68, 0.4)",
                          color: "#ef4444",
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Delete ({selectedRowIds.length})
                      </button>
                    )}
                    <button
                      onClick={handleExportCSV}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 6,
                        background: TOKEN.surfaceElevated,
                        border: `1px solid ${TOKEN.border}`,
                        color: TOKEN.text,
                        fontSize: 11.5,
                        cursor: "pointer",
                      }}
                    >
                      Export CSV
                    </button>
                  </div>
                </div>

                {/* Ledger Data Table */}
                <div style={{ ...desktopCard, flex: 1, overflowY: "auto", minHeight: 0 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ color: TOKEN.muted, borderBottom: `1px solid ${TOKEN.borderSub}`, textAlign: "left" }}>
                        <th style={{ padding: "8px 10px", width: 36 }}>
                          <input
                            type="checkbox"
                            checked={filteredLedger.length > 0 && selectedRowIds.length === filteredLedger.length}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedRowIds(filteredLedger.map((r) => r.id));
                              else setSelectedRowIds([]);
                            }}
                          />
                        </th>
                        <th style={{ padding: "8px 10px" }}>Date & Time</th>
                        <th style={{ padding: "8px 10px" }}>Category</th>
                        <th style={{ padding: "8px 10px" }}>Description</th>
                        <th style={{ padding: "8px 10px" }}>Wallet</th>
                        <th style={{ padding: "8px 10px", textAlign: "right" }}>Amount</th>
                        <th style={{ padding: "8px 10px", textAlign: "center", width: 60 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLedger.map((tx) => {
                        const cat = categories.find((c) => c.id === tx.category);
                        const isSelected = selectedRowIds.includes(tx.id);
                        return (
                          <tr
                            key={tx.id}
                            style={{
                              borderBottom: `1px solid ${TOKEN.borderSub}`,
                              background: isSelected ? "rgba(239, 159, 39, 0.08)" : "transparent",
                            }}
                          >
                            <td style={{ padding: "8px 10px" }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedRowIds([...selectedRowIds, tx.id]);
                                  else setSelectedRowIds(selectedRowIds.filter((id) => id !== tx.id));
                                }}
                              />
                            </td>
                            <td style={{ padding: "8px 10px", color: TOKEN.muted }}>
                              {new Date(tx.createdAt).toLocaleString()}
                            </td>
                            <td style={{ padding: "8px 10px", color: TOKEN.text }}>
                              {cat?.icon} {cat?.label || tx.category}
                            </td>
                            <td style={{ padding: "8px 10px", color: TOKEN.text }}>
                              <div>{tx.note || "—"}</div>
                              {tx.syncSource === "bank_sms" && (
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 2, padding: "1px 5px", borderRadius: 4, background: "rgba(16, 185, 129, 0.12)", color: "#10b981", fontSize: 9.5, fontWeight: 700 }}>
                                  <span>📱 Auto SMS</span>
                                  {tx.bankName && <span>• {tx.bankName}</span>}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "8px 10px", color: TOKEN.muted }}>
                              {tx.walletId || "Cash"}
                            </td>
                            <td
                              style={{
                                padding: "8px 10px",
                                textAlign: "right",
                                fontWeight: 700,
                                color: tx.type === "income" ? TOKEN.success : TOKEN.text,
                              }}
                            >
                              {tx.type === "income" ? "+" : "-"}
                              {fmt(tx.amount)}
                            </td>
                            <td style={{ padding: "8px 10px", textAlign: "center" }}>
                              <button
                                onClick={() => onDeleteExpense(tx.id)}
                                style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}
                                title="Delete Record"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB: WALLETS & ACCOUNTS ──────────────────────────────── */}
            {activeSection === "wallets" && (
              <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, overflowY: "auto" }}>
                {wallets.map((w) => {
                  const bal = expenses
                    .filter((e) => e.walletId === w.id)
                    .reduce((sum, e) => sum + (e.type === "income" ? e.amount : -e.amount), w.initialBalance || 0);

                  return (
                    <div key={w.id} style={{ ...desktopCard, borderLeft: `3px solid ${w.color}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 24 }}>{w.icon}</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{w.label}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Initial: {fmt(w.initialBalance || 0)}</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Balance</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: w.color }}>{fmt(bal)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── TAB: BUDGETS ─────────────────────────────────────────── */}
            {activeSection === "budgets" && (
              <div style={{ ...desktopCard, flex: 1, overflowY: "auto" }}>
                <h3 style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 700 }}>Category Limits & Thresholds</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {categories.map((c) => {
                    const spent = monthExpenses.filter((e) => e.category === c.id && e.type !== "income").reduce((s, x) => s + x.amount, 0);
                    const goal = budgetGoals.find((g) => g.categoryId === c.id)?.limit || 5000;
                    const pct = Math.min(100, Math.round((spent / goal) * 100));

                    return (
                      <div key={c.id} style={{ padding: "10px 14px", borderRadius: 8, background: TOKEN.surfaceHighlight }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4, color: TOKEN.text }}>
                          <span>
                            {c.icon} {c.label}
                          </span>
                          <span>
                            {fmt(spent)} / {fmt(goal)} ({pct}%)
                          </span>
                        </div>
                        <div style={{ height: 5, width: "100%", background: isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${pct}%`,
                              background: pct > 90 ? "#ef4444" : pct > 75 ? "#f59e0b" : c.color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── TAB: REPORTS ─────────────────────────────────────────── */}
            {activeSection === "reports" && (
              <div style={{ flex: 1, overflowY: "auto" }}>
                <ReportsScreen expenses={expenses} categories={categories} settings={settings} onBack={() => setActiveSection("overview")} />
              </div>
            )}

            {/* ── TAB: SETTINGS ────────────────────────────────────────── */}
            {activeSection === "settings" && (
              <div style={{ ...desktopCard, flex: 1, maxWidth: 540, overflowY: "auto" }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: TOKEN.text }}>Windows Application Preferences</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TOKEN.text }}>Theme (Light / Dark)</div>
                      <div style={{ fontSize: 11, color: TOKEN.muted }}>Choose light or dark visual mode</div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => onUpdateSettings({ theme: "dark" })}
                        style={{
                          padding: "5px 12px",
                          borderRadius: 6,
                          border: settings.theme !== "light" ? `2px solid ${TOKEN.amber}` : `1px solid ${TOKEN.borderSub}`,
                          background: settings.theme !== "light" ? "rgba(239, 159, 39, 0.12)" : TOKEN.surfaceHighlight,
                          color: TOKEN.text,
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        🌙 Dark
                      </button>
                      <button
                        onClick={() => onUpdateSettings({ theme: "light" })}
                        style={{
                          padding: "5px 12px",
                          borderRadius: 6,
                          border: settings.theme === "light" ? `2px solid ${TOKEN.amber}` : `1px solid ${TOKEN.borderSub}`,
                          background: settings.theme === "light" ? "rgba(239, 159, 39, 0.12)" : TOKEN.surfaceHighlight,
                          color: TOKEN.text,
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        ☀️ Light
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TOKEN.text }}>Launch on Windows Startup</div>
                      <div style={{ fontSize: 11, color: TOKEN.muted }}>Start KHARCHA minimized in background</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoLaunchEnabled}
                      onChange={async (e) => {
                        const enable = e.target.checked;
                        if (typeof window !== "undefined" && window.electronAPI) {
                          await window.electronAPI.toggleAutoLaunch(enable);
                        }
                        setAutoLaunchEnabled(enable);
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TOKEN.text }}>Windows Notifications</div>
                      <div style={{ fontSize: 11, color: TOKEN.muted }}>Show toast notifications on expense entry</div>
                    </div>
                    <span style={{ fontSize: 11, color: "#10b981" }}>Active</span>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: TOKEN.muted }}>Monthly Budget Target (₹)</label>
                    <input
                      type="number"
                      value={settings.monthlyBudget}
                      onChange={(e) => onUpdateSettings({ monthlyBudget: parseFloat(e.target.value) || 0 })}
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: 6,
                        background: TOKEN.surfaceElevated,
                        border: `1px solid ${TOKEN.border}`,
                        color: TOKEN.text,
                        marginTop: 4,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <button
                    onClick={onSignOut}
                    style={{
                      marginTop: 10,
                      padding: "8px 14px",
                      borderRadius: 6,
                      background: "rgba(239, 68, 68, 0.2)",
                      border: "1px solid rgba(239, 68, 68, 0.4)",
                      color: "#ef4444",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Sign Out of Desktop Account
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── 4. BOTTOM WINDOWS STATUS BAR ─────────────────────────────────── */}
      <footer
        style={{
          height: 26,
          background: TOKEN.titleBarBg,
          borderTop: `1px solid ${TOKEN.borderSub}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          fontSize: 11,
          color: TOKEN.muted,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span>Database: SQLite Prisma (Local ACID)</span>
          <span>•</span>
          <span>Last Sync: {lastSyncTime}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span>Active User: {user.name}</span>
          <span>•</span>
          <span style={{ color: TOKEN.amber }}>KHARCHA Desktop v2.5.0-win64</span>
        </div>
      </footer>

      {/* Voice Review Dialog */}
      {voiceVoiceModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: isLight ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            zIndex: 1000,
            padding: "24px 16px",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div style={{ ...desktopCard, width: 380, maxHeight: "90vh", overflowY: "auto", margin: "auto 0", padding: 20 }}>
            <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: TOKEN.text }}>Voice AI Processing</h4>
            <p style={{ fontSize: 12, color: TOKEN.muted }}>{voiceTranscript}</p>
            {voiceParsed && (
              <div style={{ background: TOKEN.surfaceHighlight, padding: 12, borderRadius: 8, marginTop: 10, border: `1px solid ${TOKEN.borderSub}` }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: TOKEN.amber }}>{fmt(voiceParsed.amount)}</div>
                <div style={{ fontSize: 12, color: TOKEN.text }}>Category: {voiceParsed.category}</div>
                <div style={{ fontSize: 12, color: TOKEN.muted }}>Wallet: {voiceParsed.walletId}</div>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              {voiceParsed && (
                <button
                  onClick={handleConfirmVoice}
                  style={{
                    flex: 1,
                    padding: "8px",
                    background: TOKEN.amber,
                    border: "none",
                    borderRadius: 6,
                    color: "#000",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Save
                </button>
              )}
              <button
                onClick={() => setVoiceModalOpen(false)}
                style={{
                  padding: "8px 14px",
                  background: TOKEN.surfaceElevated,
                  border: `1px solid ${TOKEN.border}`,
                  borderRadius: 6,
                  color: TOKEN.text,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── AUTOMATIC BANK SMS TRACKING & SIMULATOR MODAL ────────── */}
      <SmsTrackingModal
        isOpen={smsModalOpen}
        onClose={() => setSmsModalOpen(false)}
        userId={user.id}
        onAddTransaction={onAddExpense}
        isLight={isLight}
      />
    </div>
  );
}

// ─── Inline Style Helpers ───────────────────────────────────────────────────
const titleBarButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: TOKEN.muted,
  width: 44,
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  cursor: "pointer",
  transition: "background 0.15s",
};

const titleBarCloseButtonStyle: React.CSSProperties = {
  ...titleBarButtonStyle,
};

const desktopCard: React.CSSProperties = {
  background: TOKEN.surface,
  backdropFilter: "blur(20px)",
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 12,
  padding: 14,
  color: TOKEN.text,
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
};

const desktopKpiBox: React.CSSProperties = {
  background: TOKEN.surface,
  border: `1px solid ${TOKEN.borderSub}`,
  borderRadius: 8,
  padding: "8px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 2,
  color: TOKEN.text,
  boxShadow: "0 1px 4px rgba(0, 0, 0, 0.03)",
};

const desktopKpiTitle: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  color: TOKEN.muted,
  fontWeight: 600,
  letterSpacing: "0.05em",
};

const desktopKpiVal: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  color: TOKEN.text,
};

const desktopSelectStyle: React.CSSProperties = {
  background: TOKEN.surfaceElevated,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 6,
  padding: "6px 10px",
  color: TOKEN.text,
  fontSize: 11.5,
};

