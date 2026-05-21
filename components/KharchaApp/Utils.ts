import { Expense, PeriodName, Category } from "./Types";

export function fmt(n: number, currency: string = "₹") {
  const locale = currency === "₹" ? "en-IN" : "en-US";
  return currency + Math.round(Number(n)).toLocaleString(locale);
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

export function dateLabel(key: string) {
  const today = todayKey();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Date(key).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function generateId() {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

export function loadStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

export function saveStorage<T>(key: string, val: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

export function filterByPeriod(expenses: Expense[], period: PeriodName) {
  const now = new Date();
  const today = todayKey();

  if (period === "today") {
    return expenses.filter((e) => e.createdAt.startsWith(today) && e.type !== "income");
  }

  if (period === "week") {
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    return expenses.filter((e) => new Date(e.createdAt) >= weekAgo && e.type !== "income");
  }

  if (period === "month") {
    return expenses.filter((e) => {
      const d = new Date(e.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && e.type !== "income";
    });
  }

  return expenses.filter(e => e.type !== "income");
}

export function sumExpenses(expenses: Expense[]) {
  return expenses.reduce((s, e) => s + (e.type === "income" ? 0 : e.amount), 0);
}

export function sumIncome(expenses: Expense[]) {
  return expenses.reduce((s, e) => s + (e.type === "income" ? e.amount : 0), 0);
}

export function sumWalletBalance(expenses: Expense[], walletId: string, initialBalance: number = 0) {
  return expenses.reduce((s, e) => {
    if (e.walletId !== walletId) return s;
    return e.type === "income" ? s + e.amount : s - e.amount;
  }, initialBalance);
}

export function smartMatchCategory(text: string, keywords: Record<string, string[]>): string | null {
  const lower = text.toLowerCase();
  for (const [catId, words] of Object.entries(keywords)) {
    if (words.some(word => lower.includes(word))) {
      return catId;
    }
  }
  return null;
}

export function categoryTotal(expenses: Expense[], catId: string) {
  const now = new Date();
  return expenses
    .filter((e) => {
      const d = new Date(e.createdAt);
      return e.category === catId && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && e.type !== "income";
    })
    .reduce((s, e) => s + e.amount, 0);
}

export function weeklyTotals(expenses: Expense[]) {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // Monday = 0
  const totals = Array(7).fill(0);
  expenses.forEach((e) => {
    if (e.type === "income") return;
    const d = new Date(e.createdAt);
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
    const idx = dow - diff;
    if (idx >= 0 && idx < 7) totals[idx] += e.amount;
  });
  return totals;
}

export function groupByDate(expenses: Expense[]) {
  const groups: { [key: string]: Expense[] } = {};
  expenses.forEach((e) => {
    const key = e.createdAt.slice(0, 10);
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });
  return groups;
}

// ─── Advanced Analytics ───────────────────────────────────────────────────────

export function getTrendData(expenses: Expense[], days = 30) {
  const data: { name: string; amount: number; income: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const dayExps = expenses.filter(e => e.createdAt.startsWith(key));
    data.push({
      name: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      amount: sumExpenses(dayExps),
      income: sumIncome(dayExps)
    });
  }
  return data;
}

export function getCategoryBreakdown(expenses: Expense[], categories: Category[]) {
  return categories.map(cat => ({
    name: cat.label,
    value: categoryTotal(expenses, cat.id),
    color: cat.color
  })).filter(c => c.value > 0);
}

export function getDailyStats(expenses: Expense[]) {
  const today = new Date().toISOString().slice(0, 10);
  const todayExps = expenses.filter(e => e.createdAt.slice(0, 10) === today && e.type !== "income");
  
  if (todayExps.length === 0) return null;

  const total = sumExpenses(todayExps);
  const count = todayExps.length;
  const highest = Math.max(...todayExps.map(e => e.amount));
  
  const catCounts: Record<string, number> = {};
  todayExps.forEach(e => catCounts[e.category] = (catCounts[e.category] || 0) + e.amount);
  const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0][0];

  return { total, count, highest, topCat };
}

export function getWeeklyStats(expenses: Expense[]) {
  const now = new Date();
  const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 1));
  const startOfLastWeek = new Date(new Date(startOfWeek).setDate(startOfWeek.getDate() - 7));
  
  const thisWeek = expenses.filter(e => new Date(e.createdAt) >= startOfWeek && e.type !== "income");
  const lastWeek = expenses.filter(e => {
    const d = new Date(e.createdAt);
    return d >= startOfLastWeek && d < startOfWeek && e.type !== "income";
  });

  const thisTotal = sumExpenses(thisWeek);
  const lastTotal = sumExpenses(lastWeek);
  
  const weekendExps = thisWeek.filter(e => {
    const d = new Date(e.createdAt).getDay();
    return d === 0 || d === 6; // Sat, Sun
  });
  const weekdayExps = thisWeek.filter(e => {
    const d = new Date(e.createdAt).getDay();
    return d > 0 && d < 6;
  });

  return {
    thisTotal,
    lastTotal,
    diff: lastTotal > 0 ? ((thisTotal - lastTotal) / lastTotal) * 100 : 0,
    weekendTotal: sumExpenses(weekendExps),
    weekdayTotal: sumExpenses(weekdayExps)
  };
}

export function getForecast(expenses: Expense[]) {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  
  const thisMonth = expenses.filter(e => {
    const d = new Date(e.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && e.type !== "income";
  });
  
  const spentSoFar = sumExpenses(thisMonth);
  const avgPerDay = spentSoFar / currentDay;
  const predicted = avgPerDay * daysInMonth;

  return { spentSoFar, avgPerDay, predicted, progress: (currentDay / daysInMonth) * 100 };
}

export function getMerchantData(expenses: Expense[]) {
  const counts: Record<string, { amount: number; count: number }> = {};
  expenses.forEach(e => {
    if (e.type === "income") return;
    const key = e.note.trim() || e.category;
    if (!counts[key]) counts[key] = { amount: 0, count: 0 };
    counts[key].amount += e.amount;
    counts[key].count += 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 10)
    .map(([name, data]) => ({ name, ...data }));
}

export function getCalendarData(expenses: Expense[]) {
  const data: Record<string, number> = {};
  expenses.forEach(e => {
    if (e.type === "income") return;
    const key = e.createdAt.slice(0, 10);
    data[key] = (data[key] || 0) + e.amount;
  });
  return data;
}

export function getHeatmapData(expenses: Expense[]) {
  const data: { date: string; count: number; intensity: number }[] = [];
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 2, 1); // Last 3 months
  
  for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const dayExps = expenses.filter(e => e.createdAt.startsWith(key) && e.type !== "income");
    const total = sumExpenses(dayExps);
    data.push({
      date: key,
      count: total,
      intensity: total === 0 ? 0 : total < 500 ? 1 : total < 2000 ? 2 : total < 5000 ? 3 : 4
    });
  }
  return data;
}

export function calculateHealthScore(expenses: Expense[], monthlyBudget: number) {
  const now = new Date();
  const thisMonth = expenses.filter(e => {
    const d = new Date(e.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  
  const totalSpent = sumExpenses(thisMonth);
  const totalIncome = sumIncome(thisMonth);
  
  let score = 70; // Base score
  
  // Budget Discipline (Max 15 points)
  if (totalSpent < monthlyBudget) score += 15;
  else if (totalSpent < monthlyBudget * 1.2) score += 5;
  else score -= 10;
  
  // Savings Ratio (Max 15 points)
  if (totalIncome > 0) {
    const ratio = (totalIncome - totalSpent) / totalIncome;
    if (ratio > 0.2) score += 15;
    else if (ratio > 0.1) score += 5;
  }
  
  // Consistency (Max 5 points)
  const daysLogged = new Set(thisMonth.map(e => e.createdAt.slice(0, 10))).size;
  if (daysLogged > 20) score += 5;

  return Math.max(0, Math.min(100, score));
}

export function generateInsights(expenses: Expense[]) {
  const insights: string[] = [];
  const now = new Date();
  const thisMonth = expenses.filter(e => {
    const d = new Date(e.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const lastMonth = expenses.filter(e => {
    const d = new Date(e.createdAt);
    return d.getMonth() === (now.getMonth() === 0 ? 11 : now.getMonth() - 1);
  });

  const totalThis = sumExpenses(thisMonth);
  const totalLast = sumExpenses(lastMonth);

  if (totalLast > 0) {
    const diff = ((totalThis - totalLast) / totalLast) * 100;
    if (diff > 5) {
      insights.push(`⚠️ Your spending is up ${diff.toFixed(0)}% compared to last month.`);
    } else if (diff < -5) {
      insights.push(`✅ Great! You've saved ${Math.abs(diff).toFixed(0)}% more than last month.`);
    }
  }

  const foodTotal = thisMonth.filter(e => e.category === "food").reduce((s, e) => s + e.amount, 0);
  if (foodTotal > totalThis * 0.4 && totalThis > 0) {
    insights.push("🍔 Food accounts for over 40% of your budget. Consider meal prepping.");
  }

  const billTotal = thisMonth.filter(e => e.category === "bills").reduce((s, e) => s + e.amount, 0);
  if (billTotal > 0) {
    insights.push(`📅 You have ${thisMonth.filter(e => e.category === "bills").length} recurring bills this month.`);
  }

  const peakDay = thisMonth.reduce((acc: any, e) => {
    const d = new Date(e.createdAt).toLocaleDateString("en-US", { weekday: "long" });
    acc[d] = (acc[d] || 0) + e.amount;
    return acc;
  }, {});
  const topDay = Object.entries(peakDay).sort((a: any, b: any) => b[1] - a[1])[0];
  if (topDay) {
    insights.push(`🛍️ ${topDay[0]} is your heaviest spending day.`);
  }

  return insights;
}

// ─── Haptics ──────────────────────────────────────────────────────────────────

export type HapticType = "light" | "medium" | "heavy" | "success" | "warning" | "error";

export function triggerHaptic(type: HapticType = "light") {
  if (typeof window === "undefined" || !window.navigator.vibrate) return;

  const patterns: Record<HapticType, number | number[]> = {
    light: 10,
    medium: 20,
    heavy: 40,
    success: [10, 30, 10],
    warning: [40, 60, 40],
    error: [60, 40, 60, 40, 100],
  };

  try {
    window.navigator.vibrate(patterns[type]);
  } catch (e) {
    console.warn("Haptic feedback failed", e);
  }
}

// ─── CSV Import ───────────────────────────────────────────────────────────────

export function parseCSVToExpenses(csv: string, existingExpenses: Expense[]): Expense[] {
  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/"/g, ""));
  const dateIdx   = header.findIndex(h => h.includes("date"));
  const amtIdx    = header.findIndex(h => h.includes("amount") || h.includes("amt"));
  const catIdx    = header.findIndex(h => h.includes("category") || h.includes("cat"));
  const noteIdx   = header.findIndex(h => h.includes("note") || h.includes("desc"));
  const typeIdx   = header.findIndex(h => h.includes("type"));

  if (dateIdx < 0 || amtIdx < 0) return [];

  // Build a dedup set from existing expenses
  const existingKeys = new Set(
    existingExpenses.map(e =>
      `${e.createdAt.slice(0, 10)}|${e.amount}|${e.category}|${e.note}`
    )
  );

  const result: Expense[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim().replace(/"/g, ""));
    const rawDate = dateIdx >= 0 ? cols[dateIdx] : "";
    const rawAmt  = amtIdx  >= 0 ? cols[amtIdx]  : "0";
    const rawCat  = catIdx  >= 0 ? cols[catIdx]?.toLowerCase() : "other";
    const rawNote = noteIdx >= 0 ? cols[noteIdx]  : "";
    const rawType = typeIdx >= 0 ? cols[typeIdx]?.toLowerCase() : "expense";

    const amount = parseFloat(rawAmt.replace(/[^0-9.]/g, ""));
    if (isNaN(amount) || amount <= 0) continue;

    // Normalise date to ISO
    let isoDate = rawDate;
    const parts = rawDate.match(/(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})/);
    if (parts) {
      const [, a, b, c] = parts;
      isoDate = a.length === 4 ? `${a}-${b.padStart(2,"0")}-${c.padStart(2,"0")}`
              : `${c}-${b.padStart(2,"0")}-${a.padStart(2,"0")}`;
    }

    const dedup = `${isoDate}|${amount}|${rawCat}|${rawNote}`;
    if (existingKeys.has(dedup)) continue;
    existingKeys.add(dedup);

    result.push({
      id: generateId(),
      category: rawCat || "other",
      amount,
      note: rawNote,
      createdAt: new Date(isoDate + "T12:00:00").toISOString(),
      type: rawType === "income" ? "income" : "expense",
    });
  }

  return result;
}

// ─── Month day-by-day breakdown ───────────────────────────────────────────────

export function getDayByDayMonthly(expenses: Expense[]) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const result: { day: number; total: number }[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayTotal = expenses
      .filter(e => e.createdAt.startsWith(key) && e.type !== "income")
      .reduce((s, e) => s + e.amount, 0);
    result.push({ day: d, total: dayTotal });
  }
  return result;
}

