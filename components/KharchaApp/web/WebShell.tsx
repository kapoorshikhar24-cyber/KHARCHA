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
import { WebNavigationTab } from "../types/Platform";
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
import enterpriseStorage, { EnterpriseAuditLog } from "../EnterpriseStorage";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

interface WebShellProps {
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
  onSwitchToDesktopMode: () => void;
}

export default function WebShell({
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
  onSwitchToDesktopMode,
}: WebShellProps) {
  // Navigation & Layout State
  const [activeTab, setActiveTab] = useState<WebNavigationTab>("overview");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodName>("month");
  const [globalSearch, setGlobalSearch] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Quick Add Modal State
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [addAmount, setAddAmount] = useState<string>("");
  const [addCategory, setAddCategory] = useState<string>("food");
  const [addWallet, setAddWallet] = useState<string>("cash");
  const [addNote, setAddNote] = useState<string>("");
  const [addType, setAddType] = useState<"expense" | "income">("expense");
  const [addDate, setAddDate] = useState<string>(todayKey());
  const [addRecurring, setAddRecurring] = useState(false);

  // Voice Entry Review Modal State
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [parsedExpense, setParsedExpense] = useState<{
    amount: number;
    category: string;
    note: string;
    walletId: string;
    type: "expense" | "income";
  } | null>(null);

  // Transaction Ledger Table State
  const [txSearch, setTxSearch] = useState("");
  const [txCatFilter, setTxCatFilter] = useState("all");
  const [txWalletFilter, setTxWalletFilter] = useState("all");
  const [txTypeFilter, setTxTypeFilter] = useState<"all" | "expense" | "income">("all");
  const [txSort, setTxSort] = useState<"date_desc" | "date_asc" | "amount_desc" | "amount_asc">("date_desc");
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<EnterpriseAuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch audit logs when audit tab opened
  useEffect(() => {
    if (activeTab === "audit") {
      setAuditLoading(true);
      enterpriseStorage.getAuditLogs(user.id, 40).then((logs) => {
        setAuditLogs(logs);
        setAuditLoading(false);
      });
    }
  }, [activeTab, user.id]);

  // ── Financial Calculations ──────────────────────────────────────────────────
  const periodExpenses = useMemo(() => filterByPeriod(expenses, selectedPeriod), [expenses, selectedPeriod]);
  const totalPeriodExpense = useMemo(() => sumExpenses(periodExpenses), [periodExpenses]);
  const totalPeriodIncome = useMemo(() => sumIncome(periodExpenses), [periodExpenses]);
  const totalWalletBalance = useMemo(() => wallets.reduce((acc, w) => acc + sumWalletBalance(expenses, w.id, w.initialBalance || 0), 0), [wallets, expenses]);

  const todayExpenses = useMemo(() => filterByPeriod(expenses, "today"), [expenses]);
  const weekExpenses = useMemo(() => filterByPeriod(expenses, "week"), [expenses]);
  const monthExpenses = useMemo(() => filterByPeriod(expenses, "month"), [expenses]);

  const todayTotal = useMemo(() => sumExpenses(todayExpenses), [todayExpenses]);
  const weekTotal = useMemo(() => sumExpenses(weekExpenses), [weekExpenses]);
  const monthTotal = useMemo(() => sumExpenses(monthExpenses), [monthExpenses]);

  const remainingMonthlyBudget = useMemo(() => {
    const budget = settings.monthlyBudget || 50000;
    return Math.max(0, budget - monthTotal);
  }, [settings.monthlyBudget, monthTotal]);

  const monthlyBudgetUtilization = useMemo(() => {
    const budget = settings.monthlyBudget || 50000;
    return Math.min(100, Math.round((monthTotal / budget) * 100));
  }, [settings.monthlyBudget, monthTotal]);

  // Category Distribution for Chart
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    periodExpenses
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
  }, [periodExpenses, categories]);

  // Daily Spending for Bar Chart
  const dailyChartData = useMemo(() => {
    const days: { [dateStr: string]: number } = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const str = d.toISOString().slice(0, 10);
      days[str] = 0;
    }

    expenses.forEach((e) => {
      if (e.type !== "income") {
        const dateKey = (e.createdAt || "").slice(0, 10);
        if (days[dateKey] !== undefined) {
          days[dateKey] += e.amount;
        }
      }
    });

    return Object.entries(days).map(([dateStr, amount]) => ({
      day: new Date(dateStr).toLocaleDateString("en-US", { weekday: "short" }),
      amount,
    }));
  }, [expenses]);

  // Filtered Transactions for Table
  const filteredTransactions = useMemo(() => {
    let list = [...expenses];
    if (txSearch.trim()) {
      const q = txSearch.toLowerCase();
      list = list.filter(
        (e) =>
          e.note?.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          e.amount.toString().includes(q)
      );
    }
    if (txCatFilter !== "all") {
      list = list.filter((e) => e.category === txCatFilter);
    }
    if (txWalletFilter !== "all") {
      list = list.filter((e) => e.walletId === txWalletFilter);
    }
    if (txTypeFilter !== "all") {
      list = list.filter((e) => (e.type || "expense") === txTypeFilter);
    }

    list.sort((a, b) => {
      if (txSort === "date_desc") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (txSort === "date_asc") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (txSort === "amount_desc") return b.amount - a.amount;
      if (txSort === "amount_asc") return a.amount - b.amount;
      return 0;
    });

    return list;
  }, [expenses, txSearch, txCatFilter, txWalletFilter, txTypeFilter, txSort]);

  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, currentPage]);

  const totalPages = Math.ceil(filteredTransactions.length / pageSize) || 1;

  // ── Quick Add Handler ───────────────────────────────────────────────────────
  const handleSaveQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(addAmount);
    if (!parsedAmount || parsedAmount <= 0) {
      alert("Please enter a valid expense amount.");
      return;
    }

    onAddExpense({
      amount: parsedAmount,
      category: addCategory,
      walletId: addWallet,
      note: addNote.trim(),
      type: addType,
      createdAt: addDate ? new Date(addDate).toISOString() : new Date().toISOString(),
      isRecurring: addRecurring,
    });

    setAddAmount("");
    setAddNote("");
    setQuickAddOpen(false);
    triggerHaptic("success");
  };

  // ── Voice Logging Handler ───────────────────────────────────────────────────
  const handleStartVoice = () => {
    if (typeof window === "undefined" || !("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      alert("Voice recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceTranscript("Listening... Speak your expense (e.g. 'Spent 250 on lunch with UPI')");
      setVoiceModalOpen(true);
      setParsedExpense(null);
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
      if (lower.includes("upi") || lower.includes("gpay") || lower.includes("paytm")) wId = "upi";
      else if (lower.includes("bank") || lower.includes("card") || lower.includes("debit")) wId = "bank";

      const finalType = lower.includes("salary") || lower.includes("received") || lower.includes("income") ? "income" : "expense";

      setParsedExpense({
        amount: amt || 100,
        category: catId,
        note: text,
        walletId: wId,
        type: finalType,
      });
      triggerHaptic("medium");
    };

    recognition.onerror = (err: any) => {
      setIsListening(false);
      setVoiceTranscript("Voice capture cancelled or failed. Please try again.");
    };

    recognition.start();
  };

  const handleConfirmVoiceExpense = () => {
    if (!parsedExpense) return;
    onAddExpense({
      amount: parsedExpense.amount,
      category: parsedExpense.category,
      walletId: parsedExpense.walletId,
      note: parsedExpense.note,
      type: parsedExpense.type,
      createdAt: new Date().toISOString(),
    });
    setVoiceModalOpen(false);
    setParsedExpense(null);
    triggerHaptic("success");
  };

  // ── Export Handlers ─────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const headers = ["ID", "Date", "Category", "Wallet", "Type", "Amount", "Note"];
    const rows = filteredTransactions.map((t) => [
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
    link.download = `kharcha_transactions_${todayKey()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ── Bulk Delete ─────────────────────────────────────────────────────────────
  const handleConfirmBulkDelete = () => {
    if (selectedTxIds.length === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedTxIds.length} selected transactions?`)) {
      onBulkDeleteExpenses(selectedTxIds);
      setSelectedTxIds([]);
      triggerHaptic("medium");
    }
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        background: "#08080d",
        color: "#ffffff",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        overflow: "hidden",
      }}
    >
      {/* ─── 1. LEFT SIDEBAR (Desktop / Tablet) ─────────────────────────── */}
      {!isMobile && (
        <aside
          style={{
            width: isSidebarCollapsed ? 76 : 240,
            background: "rgba(16, 16, 26, 0.8)",
            backdropFilter: "blur(20px)",
            borderRight: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            flexDirection: "column",
            transition: "width 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            zIndex: 30,
          }}
        >
          {/* Logo & Brand */}
          <div
            style={{
              padding: "20px 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: isSidebarCollapsed ? "center" : "space-between",
              borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  background: "linear-gradient(135deg, rgba(239, 159, 39, 0.3), rgba(216, 90, 48, 0.2))",
                  border: "1px solid rgba(239, 159, 39, 0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  boxShadow: "0 4px 14px rgba(239, 159, 39, 0.2)",
                }}
              >
                🪙
              </div>
              {!isSidebarCollapsed && (
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.02em" }}>KHARCHA</div>
                  <div style={{ fontSize: 10, color: TOKEN.amber, fontWeight: 700, letterSpacing: "0.15em" }}>WEB SAAS</div>
                </div>
              )}
            </div>
            {!isSidebarCollapsed && (
              <button
                onClick={() => setIsSidebarCollapsed(true)}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.4)",
                  cursor: "pointer",
                  fontSize: 14,
                }}
                title="Collapse Sidebar"
              >
                ◀
              </button>
            )}
          </div>

          {/* Nav List */}
          <nav style={{ flex: 1, padding: "14px 10px", display: "flex", flexDirection: "column", gap: 4, overflowY: "auto" }}>
            {[
              { id: "overview", label: "Overview", icon: "📊" },
              { id: "transactions", label: "Transactions", icon: "📋" },
              { id: "wallets", label: "Wallets & Accounts", icon: "💼" },
              { id: "budgets", label: "Budgets & Goals", icon: "🎯" },
              { id: "recurring", label: "Subscriptions", icon: "🔄" },
              { id: "reports", label: "Analytics & Reports", icon: "📈" },
              { id: "audit", label: "Activity History", icon: "🛡️" },
              { id: "settings", label: "Settings", icon: "⚙️" },
            ].map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as WebNavigationTab);
                    triggerHaptic("light");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: isSidebarCollapsed ? "12px 0" : "10px 14px",
                    justifyContent: isSidebarCollapsed ? "center" : "flex-start",
                    borderRadius: 12,
                    border: "none",
                    background: active ? "rgba(239, 159, 39, 0.12)" : "transparent",
                    color: active ? TOKEN.amber : "rgba(255, 255, 255, 0.7)",
                    fontWeight: active ? 700 : 500,
                    fontSize: 13,
                    cursor: "pointer",
                    transition: "all 0.18s",
                    borderLeft: active ? `3px solid ${TOKEN.amber}` : "3px solid transparent",
                  }}
                  title={item.label}
                >
                  <span style={{ fontSize: 17 }}>{item.icon}</span>
                  {!isSidebarCollapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </nav>

          {/* Sidebar Footer & User Card */}
          <div style={{ padding: 12, borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 12,
                background: "rgba(255, 255, 255, 0.04)",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: TOKEN.amber,
                  color: "#1a0800",
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  flexShrink: 0,
                }}
              >
                {user.avatar ? (
                  <img src={user.avatar} style={{ width: "100%", height: "100%", borderRadius: "50%" }} alt={user.name} />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              {!isSidebarCollapsed && (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user.name}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Authenticated</div>
                </div>
              )}
            </div>

            {/* Platform Switcher Pill */}
            {!isSidebarCollapsed && (
              <button
                onClick={onSwitchToDesktopMode}
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: "7px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(239, 159, 39, 0.25)",
                  background: "rgba(239, 159, 39, 0.06)",
                  color: TOKEN.amber,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <span>💻</span>
                <span>Switch to Windows UI</span>
              </button>
            )}
          </div>
        </aside>
      )}

      {/* ─── 2. MAIN APP CONTENT AREA ───────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {/* Top Navbar */}
        <header
          style={{
            height: 64,
            padding: "0 24px",
            background: "rgba(16, 16, 26, 0.6)",
            backdropFilter: "blur(20px)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            zIndex: 20,
          }}
        >
          {/* Breadcrumb / Left */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isSidebarCollapsed && !isMobile && (
              <button
                onClick={() => setIsSidebarCollapsed(false)}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "none",
                  color: "#ffffff",
                  padding: "6px 10px",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                ☰
              </button>
            )}
            <div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                KHARCHA WEB / {activeTab}
              </div>
              <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, textTransform: "capitalize" }}>
                {activeTab === "overview" && "Financial Dashboard"}
                {activeTab === "transactions" && "Transaction Ledger"}
                {activeTab === "wallets" && "Wallets & Capital"}
                {activeTab === "budgets" && "Monthly Budget Caps"}
                {activeTab === "recurring" && "Recurring Subscriptions"}
                {activeTab === "reports" && "Visual Analytics"}
                {activeTab === "audit" && "Security & Audit Ledger"}
                {activeTab === "settings" && "Account & Preferences"}
              </h1>
            </div>
          </div>

          {/* Right Action Tools */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Period Filter (Today / Week / Month) */}
            <div
              style={{
                display: isMobile ? "none" : "flex",
                background: "rgba(0, 0, 0, 0.35)",
                padding: 3,
                borderRadius: 12,
                border: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              {(["today", "week", "month"] as PeriodName[]).map((p) => {
                const isSel = selectedPeriod === p;
                return (
                  <button
                    key={p}
                    onClick={() => {
                      setSelectedPeriod(p);
                      triggerHaptic("light");
                    }}
                    style={{
                      background: isSel ? "rgba(239, 159, 39, 0.2)" : "transparent",
                      border: "none",
                      color: isSel ? TOKEN.amber : "rgba(255, 255, 255, 0.5)",
                      fontWeight: isSel ? 700 : 500,
                      fontSize: 11.5,
                      padding: "4px 10px",
                      borderRadius: 8,
                      cursor: "pointer",
                      textTransform: "capitalize",
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            {/* Quick Add Expense Button */}
            <button
              onClick={() => {
                setQuickAddOpen(true);
                triggerHaptic("medium");
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 12,
                border: "1px solid rgba(239, 159, 39, 0.4)",
                background: "linear-gradient(135deg, #EF9F27 0%, #D85A30 100%)",
                color: "#180a00",
                fontWeight: 700,
                fontSize: 12.5,
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(239, 159, 39, 0.25)",
              }}
            >
              <span>➕</span>
              <span style={{ display: isMobile ? "none" : "inline" }}>Add Expense</span>
            </button>

            {/* Voice AI Button */}
            <button
              onClick={handleStartVoice}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: "1px solid rgba(239, 159, 39, 0.3)",
                background: "rgba(239, 159, 39, 0.08)",
                color: TOKEN.amber,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 15,
              }}
              title="Voice AI Expense Logging"
            >
              🎙️
            </button>

            {/* Theme Toggle */}
            <button
              onClick={() => {
                const next = settings.theme === "light" ? "dark" : "light";
                onUpdateSettings({ theme: next });
              }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.7)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Toggle Theme"
            >
              {settings.theme === "light" ? "🌙" : "☀️"}
            </button>

            {/* Switch User */}
            <button
              onClick={onSwitchUser}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.6)",
                fontSize: 11.5,
                cursor: "pointer",
              }}
              title="Switch Profile / Sign In"
            >
              Switch
            </button>
          </div>
        </header>

        {/* Dynamic Workspace Scroll Container */}
        <main style={{ flex: 1, overflowY: "auto", padding: isMobile ? 16 : 24 }}>
          {/* ── TAB 1: OVERVIEW ────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Financial Summary KPI Cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)",
                  gap: 14,
                }}
              >
                <div style={kpiCardStyle}>
                  <div style={kpiLabelStyle}>Today's Spending</div>
                  <div style={kpiValueStyle}>{fmt(todayTotal)}</div>
                  <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)" }}>{todayExpenses.length} records</div>
                </div>

                <div style={kpiCardStyle}>
                  <div style={kpiLabelStyle}>This Week</div>
                  <div style={kpiValueStyle}>{fmt(weekTotal)}</div>
                  <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)" }}>{weekExpenses.length} records</div>
                </div>

                <div style={kpiCardStyle}>
                  <div style={kpiLabelStyle}>This Month</div>
                  <div style={kpiValueStyle}>{fmt(monthTotal)}</div>
                  <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)" }}>Monthly Budget: {fmt(settings.monthlyBudget || 50000)}</div>
                </div>

                <div style={kpiCardStyle}>
                  <div style={kpiLabelStyle}>Remaining Budget</div>
                  <div style={{ ...kpiValueStyle, color: remainingMonthlyBudget > 0 ? "#10b981" : "#ef4444" }}>
                    {fmt(remainingMonthlyBudget)}
                  </div>
                  <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)" }}>
                    {monthlyBudgetUtilization}% consumed
                  </div>
                </div>

                <div style={kpiCardStyle}>
                  <div style={kpiLabelStyle}>Total Net Capital</div>
                  <div style={{ ...kpiValueStyle, color: TOKEN.amber }}>{fmt(totalWalletBalance)}</div>
                  <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)" }}>Across {wallets.length} accounts</div>
                </div>
              </div>

              {/* Charts Row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "3fr 2fr",
                  gap: 16,
                }}
              >
                {/* 7-Day Spending Trend */}
                <div style={glassCardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>7-Day Spending Velocity</h3>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Last 7 Days</span>
                  </div>
                  <div style={{ height: 190, width: "100%" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyChartData}>
                        <XAxis dataKey="day" stroke="rgba(255,255,255,0.3)" fontSize={11} />
                        <YAxis stroke="rgba(255,255,255,0.3)" fontSize={11} />
                        <Tooltip
                          contentStyle={{
                            background: "rgba(20,20,30,0.95)",
                            borderColor: "rgba(255,255,255,0.1)",
                            borderRadius: 10,
                          }}
                        />
                        <Bar dataKey="amount" fill="#EF9F27" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Category Breakdown Donut */}
                <div style={glassCardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Category Distribution</h3>
                    <span style={{ fontSize: 11, color: TOKEN.amber }}>{categoryData.length} categories</span>
                  </div>
                  <div style={{ height: 190, width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {categoryData.length === 0 ? (
                      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>No expenses recorded in this period</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={48}
                            outerRadius={75}
                            paddingAngle={3}
                          >
                            {categoryData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: "rgba(20,20,30,0.95)",
                              borderColor: "rgba(255,255,255,0.1)",
                              borderRadius: 10,
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              {/* Recent Activity Table */}
              <div style={glassCardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Recent Ledger Entries</h3>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                      Latest transactions recorded for {user.name}
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab("transactions")}
                    style={{
                      background: "none",
                      border: "none",
                      color: TOKEN.amber,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    View All Transactions →
                  </button>
                </div>

                {expenses.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px 0", color: "rgba(255,255,255,0.3)" }}>
                    No transactions yet. Click "+ Add Expense" to start!
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {expenses.slice(0, 5).map((exp) => {
                      const cat = categories.find((c) => c.id === exp.category);
                      const isInc = exp.type === "income";
                      return (
                        <div
                          key={exp.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 14px",
                            borderRadius: 12,
                            background: "rgba(255, 255, 255, 0.03)",
                            border: "1px solid rgba(255, 255, 255, 0.05)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                background: cat?.bg || "rgba(255,255,255,0.06)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 17,
                              }}
                            >
                              {cat?.icon || "💵"}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700 }}>{cat?.label || exp.category}</div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                                {exp.note || "No description"} • {dateLabel(exp.createdAt)}
                              </div>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: isInc ? "#10b981" : "#ffffff" }}>
                              {isInc ? "+" : "-"}
                              {fmt(exp.amount)}
                            </div>
                            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>
                              {exp.walletId || "Cash"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 2: TRANSACTIONS MANAGEMENT ────────────────────────── */}
          {activeTab === "transactions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Controls & Filter Bar */}
              <div
                style={{
                  ...glassCardStyle,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "16px 20px",
                }}
              >
                {/* Search & Category Filter */}
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, flex: 1 }}>
                  <input
                    type="text"
                    placeholder="Search by notes, category, amount..."
                    value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                    style={{
                      background: "rgba(0,0,0,0.3)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 10,
                      padding: "8px 12px",
                      color: "#ffffff",
                      fontSize: 12.5,
                      minWidth: 200,
                    }}
                  />

                  <select
                    value={txCatFilter}
                    onChange={(e) => setTxCatFilter(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="all">All Categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icon} {c.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={txWalletFilter}
                    onChange={(e) => setTxWalletFilter(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="all">All Wallets</option>
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.icon} {w.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={txTypeFilter}
                    onChange={(e) => setTxTypeFilter(e.target.value as any)}
                    style={selectStyle}
                  >
                    <option value="all">All Types</option>
                    <option value="expense">Expenses Only</option>
                    <option value="income">Income Only</option>
                  </select>
                </div>

                {/* Actions & Export */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {selectedTxIds.length > 0 && (
                    <button
                      onClick={handleConfirmBulkDelete}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(239, 68, 68, 0.4)",
                        background: "rgba(239, 68, 68, 0.15)",
                        color: "#ef4444",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Delete ({selectedTxIds.length})
                    </button>
                  )}

                  <button
                    onClick={handleExportCSV}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(255,255,255,0.05)",
                      color: "#ffffff",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Export CSV
                  </button>
                </div>
              </div>

              {/* Transactions Table */}
              <div style={glassCardStyle}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}>
                        <th style={{ padding: "12px 14px", width: 40 }}>
                          <input
                            type="checkbox"
                            checked={
                              paginatedTransactions.length > 0 &&
                              paginatedTransactions.every((t) => selectedTxIds.includes(t.id))
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTxIds(Array.from(new Set([...selectedTxIds, ...paginatedTransactions.map((t) => t.id)])));
                              } else {
                                setSelectedTxIds(selectedTxIds.filter((id) => !paginatedTransactions.some((t) => t.id === id)));
                              }
                            }}
                          />
                        </th>
                        <th style={{ padding: "12px 14px" }}>Date</th>
                        <th style={{ padding: "12px 14px" }}>Category</th>
                        <th style={{ padding: "12px 14px" }}>Description</th>
                        <th style={{ padding: "12px 14px" }}>Wallet</th>
                        <th style={{ padding: "12px 14px", textAlign: "right" }}>Amount</th>
                        <th style={{ padding: "12px 14px", textAlign: "center", width: 80 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.3)" }}>
                            No transactions matched your filters.
                          </td>
                        </tr>
                      ) : (
                        paginatedTransactions.map((tx) => {
                          const cat = categories.find((c) => c.id === tx.category);
                          const wal = wallets.find((w) => w.id === tx.walletId);
                          const isInc = tx.type === "income";
                          const isSelected = selectedTxIds.includes(tx.id);

                          return (
                            <tr
                              key={tx.id}
                              style={{
                                borderBottom: "1px solid rgba(255,255,255,0.04)",
                                background: isSelected ? "rgba(239, 159, 39, 0.08)" : "transparent",
                              }}
                            >
                              <td style={{ padding: "12px 14px" }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) setSelectedTxIds([...selectedTxIds, tx.id]);
                                    else setSelectedTxIds(selectedTxIds.filter((id) => id !== tx.id));
                                  }}
                                />
                              </td>
                              <td style={{ padding: "12px 14px", color: "rgba(255,255,255,0.6)" }}>
                                {new Date(tx.createdAt).toLocaleDateString()}
                              </td>
                              <td style={{ padding: "12px 14px" }}>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "3px 8px",
                                    borderRadius: 8,
                                    background: cat?.bg || "rgba(255,255,255,0.08)",
                                    fontSize: 12,
                                    fontWeight: 600,
                                  }}
                                >
                                  <span>{cat?.icon || "💵"}</span>
                                  <span>{cat?.label || tx.category}</span>
                                </span>
                              </td>
                              <td style={{ padding: "12px 14px", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {tx.note || "—"}
                              </td>
                              <td style={{ padding: "12px 14px", color: "rgba(255,255,255,0.6)" }}>
                                {wal?.icon} {wal?.label || tx.walletId || "Cash"}
                              </td>
                              <td
                                style={{
                                  padding: "12px 14px",
                                  textAlign: "right",
                                  fontWeight: 800,
                                  color: isInc ? "#10b981" : "#ffffff",
                                }}
                              >
                                {isInc ? "+" : "-"}
                                {fmt(tx.amount)}
                              </td>
                              <td style={{ padding: "12px 14px", textAlign: "center" }}>
                                <button
                                  onClick={() => onDeleteExpense(tx.id)}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    color: "rgba(239, 68, 68, 0.7)",
                                    cursor: "pointer",
                                    fontSize: 14,
                                  }}
                                  title="Delete Expense"
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 16,
                    paddingTop: 12,
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    fontSize: 12,
                    color: "rgba(255,255,255,0.4)",
                  }}
                >
                  <div>
                    Showing {Math.min(filteredTransactions.length, (currentPage - 1) * pageSize + 1)} to{" "}
                    {Math.min(filteredTransactions.length, currentPage * pageSize)} of {filteredTransactions.length}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.04)",
                        color: "#fff",
                        cursor: currentPage > 1 ? "pointer" : "default",
                        opacity: currentPage > 1 ? 1 : 0.4,
                      }}
                    >
                      Prev
                    </button>
                    <span style={{ padding: "4px 8px", color: TOKEN.amber }}>
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      style={{
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.04)",
                        color: "#fff",
                        cursor: currentPage < totalPages ? "pointer" : "default",
                        opacity: currentPage < totalPages ? 1 : 0.4,
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 3: WALLETS & ACCOUNTS ──────────────────────────────── */}
          {activeTab === "wallets" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 16 }}>
                {wallets.map((w) => {
                  const bal = expenses
                    .filter((e) => e.walletId === w.id)
                    .reduce((acc, curr) => acc + (curr.type === "income" ? curr.amount : -curr.amount), w.initialBalance || 0);

                  return (
                    <div
                      key={w.id}
                      style={{
                        ...glassCardStyle,
                        borderLeft: `4px solid ${w.color || TOKEN.amber}`,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 14,
                            background: `${w.color}22`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 22,
                          }}
                        >
                          {w.icon}
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700 }}>{w.label}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Initial: {fmt(w.initialBalance || 0)}</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 18 }}>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Current Balance</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: w.color || TOKEN.amber }}>{fmt(bal)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── TAB 4: BUDGETS & GOALS ─────────────────────────────────── */}
          {activeTab === "budgets" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={glassCardStyle}>
                <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Category Budget Caps</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {categories.map((c) => {
                    const spent = monthExpenses.filter((e) => e.category === c.id && e.type !== "income").reduce((s, x) => s + x.amount, 0);
                    const goal = budgetGoals.find((g) => g.categoryId === c.id)?.limit || 5000;
                    const pct = Math.min(100, Math.round((spent / goal) * 100));

                    return (
                      <div key={c.id}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                            <span>{c.icon}</span>
                            <span>{c.label}</span>
                          </span>
                          <span>
                            {fmt(spent)} / {fmt(goal)} ({pct}%)
                          </span>
                        </div>
                        <div style={{ height: 6, width: "100%", background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${pct}%`,
                              background: pct > 90 ? "#ef4444" : pct > 75 ? "#f59e0b" : c.color || TOKEN.amber,
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 5: SUBSCRIPTIONS & RECURRING ──────────────────────── */}
          {activeTab === "recurring" && (
            <div style={glassCardStyle}>
              <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Active Subscriptions & Recurring Bills</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {expenses
                  .filter((e) => e.isRecurring)
                  .map((e) => {
                    const cat = categories.find((c) => c.id === e.category);
                    return (
                      <div
                        key={e.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "12px 16px",
                          borderRadius: 12,
                          background: "rgba(255,255,255,0.03)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 20 }}>🔄</span>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{cat?.label || e.category}</div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                              {e.note || "Subscription"} • Billed Monthly
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: TOKEN.amber }}>{fmt(e.amount)} / mo</div>
                      </div>
                    );
                  })}
                {expenses.filter((e) => e.isRecurring).length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                    No recurring payments configured yet. Check "Recurring" when adding an expense!
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TAB 6: REPORTS ─────────────────────────────────────────── */}
          {activeTab === "reports" && (
            <ReportsScreen expenses={expenses} categories={categories} settings={settings} onBack={() => setActiveTab("overview")} />
          )}

          {/* ── TAB 7: AUDIT LEDGER ────────────────────────────────────── */}
          {activeTab === "audit" && (
            <div style={glassCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Enterprise Audit Trail</h3>
                <span style={{ fontSize: 11, color: TOKEN.amber }}>SQLite ACID Log</span>
              </div>
              {auditLoading ? (
                <div style={{ padding: 30, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Loading audit records...</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.03)",
                        fontSize: 12,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <span style={{ color: TOKEN.amber, fontWeight: 700, marginRight: 8 }}>{log.action}</span>
                        <span style={{ color: "rgba(255,255,255,0.7)" }}>{log.entity}</span>
                        {log.details && (
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{log.details}</div>
                        )}
                      </div>
                      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)" }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TAB 8: SETTINGS ────────────────────────────────────────── */}
          {activeTab === "settings" && (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
              <div style={glassCardStyle}>
                <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Account Profile</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>User Name</label>
                    <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{user.name}</div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Email Address</label>
                    <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{user.email || "Offline / Unset"}</div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Member Since</label>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={onSignOut}
                    style={{
                      marginTop: 10,
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(239, 68, 68, 0.4)",
                      background: "rgba(239, 68, 68, 0.15)",
                      color: "#ef4444",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: 12.5,
                    }}
                  >
                    Log Out of Account
                  </button>
                </div>
              </div>

              <div style={glassCardStyle}>
                <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>Financial Budgets</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Monthly Budget Target (₹)</label>
                    <input
                      type="number"
                      value={settings.monthlyBudget}
                      onChange={(e) => onUpdateSettings({ monthlyBudget: parseFloat(e.target.value) || 0 })}
                      style={{
                        width: "100%",
                        background: "rgba(0,0,0,0.3)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 10,
                        padding: "8px 12px",
                        color: "#fff",
                        marginTop: 4,
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Daily Budget Cap (₹)</label>
                    <input
                      type="number"
                      value={settings.dailyBudget}
                      onChange={(e) => onUpdateSettings({ dailyBudget: parseFloat(e.target.value) || 0 })}
                      style={{
                        width: "100%",
                        background: "rgba(0,0,0,0.3)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 10,
                        padding: "8px 12px",
                        color: "#fff",
                        marginTop: 4,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ─── 3. MOBILE BOTTOM NAVIGATION (< 768px) ─────────────────── */}
        {isMobile && (
          <nav
            style={{
              height: 60,
              background: "rgba(16, 16, 26, 0.95)",
              backdropFilter: "blur(20px)",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              justifyContent: "space-around",
              alignItems: "center",
              zIndex: 30,
            }}
          >
            {[
              { id: "overview", icon: "📊", label: "Dash" },
              { id: "transactions", icon: "📋", label: "Ledger" },
              { id: "reports", icon: "📈", label: "Reports" },
              { id: "wallets", icon: "💼", label: "Wallets" },
              { id: "settings", icon: "⚙️", label: "Settings" },
            ].map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as WebNavigationTab);
                    triggerHaptic("light");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: active ? TOKEN.amber : "rgba(255,255,255,0.4)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 3,
                    fontSize: 10,
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 18 }}>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {/* ─── 4. QUICK ADD EXPENSE MODAL ─────────────────────────────────── */}
      {quickAddOpen && (
        <div style={modalBackdropStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Record Transaction</h3>
              <button
                onClick={() => setQuickAddOpen(false)}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 18, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveQuickAdd} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Type Switcher */}
              <div style={{ display: "flex", gap: 8, background: "rgba(0,0,0,0.3)", padding: 4, borderRadius: 12 }}>
                <button
                  type="button"
                  onClick={() => setAddType("expense")}
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    borderRadius: 9,
                    border: "none",
                    background: addType === "expense" ? "rgba(239, 68, 68, 0.2)" : "transparent",
                    color: addType === "expense" ? "#ef4444" : "rgba(255,255,255,0.5)",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setAddType("income")}
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    borderRadius: 9,
                    border: "none",
                    background: addType === "income" ? "rgba(16, 185, 129, 0.2)" : "transparent",
                    color: addType === "income" ? "#10b981" : "rgba(255,255,255,0.5)",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Income
                </button>
              </div>

              {/* Amount */}
              <div>
                <label style={fieldLabelStyle}>Amount ({settings.currency || "₹"})</label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                  autoFocus
                  required
                  style={{
                    width: "100%",
                    fontSize: 22,
                    fontWeight: 800,
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: "rgba(0,0,0,0.4)",
                    border: "1px solid rgba(239, 159, 39, 0.3)",
                    color: TOKEN.amber,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Category */}
              <div>
                <label style={fieldLabelStyle}>Category</label>
                <select
                  value={addCategory}
                  onChange={(e) => setAddCategory(e.target.value)}
                  style={{ ...selectStyle, width: "100%" }}
                >
                  {(addType === "expense" ? CATEGORIES : INCOME_CATEGORIES).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Wallet */}
              <div>
                <label style={fieldLabelStyle}>Wallet / Account</label>
                <select
                  value={addWallet}
                  onChange={(e) => setAddWallet(e.target.value)}
                  style={{ ...selectStyle, width: "100%" }}
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.icon} {w.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label style={fieldLabelStyle}>Note / Context</label>
                <input
                  type="text"
                  placeholder="e.g. Lunch with team, Groceries"
                  value={addNote}
                  onChange={(e) => setAddNote(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 10,
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#ffffff",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <button
                type="submit"
                style={{
                  marginTop: 6,
                  padding: "12px",
                  borderRadius: 12,
                  border: "none",
                  background: "linear-gradient(135deg, #EF9F27 0%, #D85A30 100%)",
                  color: "#180a00",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Save Transaction →
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── 5. VOICE ENTRY CONFIRMATION REVIEW MODAL ───────────────────── */}
      {voiceModalOpen && (
        <div style={modalBackdropStyle}>
          <div style={modalContentStyle}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: "50%",
                  margin: "0 auto 10px",
                  background: isListening ? "rgba(239, 68, 68, 0.2)" : "rgba(239, 159, 39, 0.2)",
                  border: `2px solid ${isListening ? "#ef4444" : TOKEN.amber}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  animation: isListening ? "pulse 1.5s infinite" : "none",
                }}
              >
                🎙️
              </div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Voice AI Intelligence</h3>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: "6px 0 0" }}>{voiceTranscript}</p>
            </div>

            {parsedExpense && (
              <div
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14,
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 11, color: TOKEN.amber, fontWeight: 700, textTransform: "uppercase" }}>
                  Parsed Transaction Details
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Amount</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: TOKEN.amber }}>{fmt(parsedExpense.amount)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Category</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{parsedExpense.category}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Wallet</span>
                  <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase" }}>{parsedExpense.walletId}</span>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button
                    onClick={handleConfirmVoiceExpense}
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: 10,
                      border: "none",
                      background: "linear-gradient(135deg, #EF9F27 0%, #D85A30 100%)",
                      color: "#180a00",
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Confirm & Save
                  </button>
                  <button
                    onClick={() => setVoiceModalOpen(false)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(255,255,255,0.04)",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inline Styles Helpers ──────────────────────────────────────────────────
const glassCardStyle: React.CSSProperties = {
  background: "rgba(20, 20, 32, 0.65)",
  backdropFilter: "blur(20px)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 18,
  padding: "18px 20px",
};

const kpiCardStyle: React.CSSProperties = {
  background: "rgba(20, 20, 32, 0.65)",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(255, 255, 255, 0.07)",
  borderRadius: 16,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const kpiLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "rgba(255, 255, 255, 0.5)",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const kpiValueStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: "-0.02em",
};

const selectStyle: React.CSSProperties = {
  background: "rgba(0,0,0,0.3)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10,
  padding: "8px 12px",
  color: "#ffffff",
  fontSize: 12.5,
};

const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11.5,
  fontWeight: 600,
  color: "rgba(255, 255, 255, 0.6)",
  marginBottom: 4,
};

const modalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0,0,0,0.75)",
  backdropFilter: "blur(8px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 16,
};

const modalContentStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "rgba(24, 24, 38, 0.95)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: 24,
  padding: "24px 22px",
  boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
};
