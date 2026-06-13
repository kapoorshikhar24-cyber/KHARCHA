"use client";

import React, { useMemo, useState, useEffect } from "react";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, BarChart, Bar, Legend 
} from "recharts";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import { Expense, Category, Settings } from "./Types";
import { S, TOKEN } from "./Styles";
import { 
  fmt, getTrendData, getCategoryBreakdown, getHeatmapData, 
  calculateHealthScore, generateInsights, getMerchantData,
  getDailyStats, getWeeklyStats, getForecast, sumIncome, sumExpenses, triggerHaptic, getCalendarData 
} from "./Utils";
import { ArrowLeftIcon } from "./SubComponents";

interface ReportsScreenProps {
  expenses: Expense[];
  categories: Category[];
  settings: Settings;
  isDesktop?: boolean;
  onBack: () => void;
}

const AnimatedCounter = ({ value, prefix = "", currency = "₹" }: { value: number; prefix?: string; currency?: string }) => {
  const [displayValue, setDisplayValue] = useState(0);
  useEffect(() => {
    let start = displayValue;
    const end = value;
    const duration = 1000;
    const startTime = performance.now();
    const update = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = start + (end - start) * (1 - Math.pow(1 - progress, 3));
      setDisplayValue(current);
      if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }, [value]);
  const locale = currency === "₹" ? "en-IN" : "en-US";
  return <span>{prefix}{Math.round(displayValue).toLocaleString(locale)}</span>;
};

export default function ReportsScreen({ expenses, categories, settings, isDesktop, onBack }: ReportsScreenProps) {
  const currency = settings.currency || "₹";
  const [activeTab, setActiveTab] = useState<"overview" | "calendar" | "places" | "intelligence">("overview");
  const [trendDays, setTrendDays] = useState(30);

  const daily = getDailyStats(expenses);
  const weekly = getWeeklyStats(expenses);
  const forecast = getForecast(expenses);
  const totalIncome = sumIncome(expenses);
  const totalSpent = sumExpenses(expenses);
  const isLight = settings.theme === "light";
  
  const trendData = useMemo(() => getTrendData(expenses, trendDays), [expenses, trendDays]);
  const catData = useMemo(() => getCategoryBreakdown(expenses, categories), [expenses, categories]);
  const heatmapData = useMemo(() => getHeatmapData(expenses), [expenses]);
  const insights = useMemo(() => generateInsights(expenses), [expenses]);
  const healthScore = useMemo(() => calculateHealthScore(expenses, settings.monthlyBudget || 50000), [expenses, settings.monthlyBudget]);
  const merchantData = useMemo(() => getMerchantData(expenses), [expenses]);
  const calendarData = useMemo(() => getCalendarData(expenses), [expenses]);

  const exportPDF = async () => {
    triggerHaptic("success");
    const element = document.getElementById("report-content");
    if (!element) return;
    const canvas = await html2canvas(element, { backgroundColor: isLight ? "#ffffff" : "#060608", scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, (canvas.height * pdfWidth) / canvas.width);
    pdf.save(`Kharcha_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportExcel = () => {
    triggerHaptic("success");
    const data = expenses.map(e => ({
      Date: e.createdAt.slice(0, 10),
      Type: e.type || "expense",
      Category: categories.find(c => c.id === e.category)?.label || e.category,
      Amount: e.amount,
      Note: e.note
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    XLSX.writeFile(wb, `Kharcha_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const renderOverview = () => (
    <>
      <div className="card" style={{ ...S.reportCard, flexDirection: "row", alignItems: "center", justifyContent: "space-between", background: isLight ? "rgba(239, 159, 39, 0.05)" : "linear-gradient(135deg, rgba(239, 159, 39, 0.1) 0%, rgba(6, 6, 8, 0) 100%)" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TOKEN.text }}>Financial Health</div>
          <div style={{ fontSize: 11, color: TOKEN.muted, marginTop: 4 }}>Based on your budget & savings</div>
        </div>
        <div style={{ ...S.healthRing, borderColor: healthScore > 80 ? TOKEN.success : healthScore > 50 ? TOKEN.amber : TOKEN.danger }}>
          {healthScore}
        </div>
      </div>

      <div style={isDesktop ? { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" } : { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="card" style={S.reportCard}>
          <div style={S.metricLabel}>Spent</div>
          <div style={S.metricValue}><AnimatedCounter value={totalSpent} prefix={currency} currency={currency} /></div>
        </div>
        <div className="card" style={S.reportCard}>
          <div style={S.metricLabel}>Today</div>
          <div style={{ ...S.metricValue, color: TOKEN.amber }}><AnimatedCounter value={daily?.total || 0} prefix={currency} currency={currency} /></div>
        </div>
      </div>

      <div className="card" style={S.reportCard}>
        <div style={S.row}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Spending Trend</div>
          <div style={{ display: "flex", background: TOKEN.surfaceHighlight, borderRadius: 8, padding: 2 }}>
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => { if (settings.haptic) triggerHaptic("light"); setTrendDays(d); }} style={{ 
                background: trendDays === d ? TOKEN.amber : "transparent",
                color: trendDays === d ? "#fff" : TOKEN.muted,
                border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 10, fontWeight: 600
              }}>{d}D</button>
            ))}
          </div>
        </div>
        <div style={{ height: isDesktop ? 400 : 200, width: "100%", marginTop: 16 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={TOKEN.amber} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={TOKEN.amber} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={TOKEN.success} stopOpacity={0.1}/>
                  <stop offset="95%" stopColor={TOKEN.success} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="name" hide />
              <Tooltip contentStyle={{ background: TOKEN.surface, border: "none", borderRadius: 12, boxShadow: "0 10px 20px rgba(0,0,0,0.15)" }} />
              <Area type="monotone" dataKey="amount" stroke={TOKEN.amber} fill="url(#colorAmt)" strokeWidth={3} />
              <Area type="monotone" dataKey="income" stroke={TOKEN.success} fill="url(#colorInc)" strokeWidth={2} strokeDasharray="5 5" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );

  const renderCalendar = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const blanks = Array.from({ length: (firstDay + 6) % 7 }, (_, i) => i);

    return (
      <div className="card" style={S.reportCard}>
        <div style={{ fontSize: 15, fontWeight: 700, textAlign: "center", marginBottom: 10 }}>
          {now.toLocaleString("default", { month: "long" })} {year}
        </div>
        <div style={S.calendarGrid}>
          {["M", "T", "W", "T", "F", "S", "S"].map(d => (
            <div key={d} style={{ background: TOKEN.surfaceHighlight, padding: 8, fontSize: 10, color: TOKEN.muted, textAlign: "center" }}>{d}</div>
          ))}
          {blanks.map(b => <div key={`b-${b}`} style={S.calendarDay} />)}
          {days.map(d => {
            const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const amount = calendarData[key] || 0;
            return (
              <div key={d} style={S.calendarDay}>
                <div style={{ fontSize: 10, color: amount > 0 ? TOKEN.amber : TOKEN.dim }}>{d}</div>
                {amount > 0 && <div style={{ fontSize: 8, fontWeight: 600, color: TOKEN.text }}>{amount < 1000 ? amount : (amount / 1000).toFixed(1) + "k"}</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderPlaces = () => (
    <div className="card" style={S.reportCard}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Top Spending Places</div>
      {merchantData.map((m, i) => (
        <div key={i} style={S.merchantItem}>
          <div style={{ ...S.picon, background: TOKEN.surfaceHighlight, width: 36, height: 36 }}>
            <span style={{ fontSize: 16 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "📍"}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: TOKEN.text }}>{m.name}</div>
            <div style={{ fontSize: 10, color: TOKEN.muted }}>{m.count} transactions</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: TOKEN.text, fontFamily: TOKEN.mono }}>{fmt(m.amount, currency)}</div>
            <div style={{ fontSize: 9, color: TOKEN.muted }}>{((m.amount / totalSpent) * 100).toFixed(1)}%</div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderIntelligence = () => {
    return (
      <div style={isDesktop ? { display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" } : { display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Financial Forecast */}
        <div className="card" style={S.reportCard}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Month Forecast</div>
          <div style={{ fontSize: 10, color: TOKEN.muted, marginBottom: 12 }}>Predicted spending based on current habits</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: TOKEN.amber, fontFamily: TOKEN.mono }}>{fmt(forecast.predicted, currency)}</div>
          <div style={{ height: 6, background: TOKEN.surfaceHighlight, borderRadius: 3, marginTop: 12, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, (forecast.spentSoFar / (forecast.predicted || 1)) * 100)}%`, background: TOKEN.amber }} />
          </div>
          <div style={{ ...S.row, marginTop: 8 }}>
            <div style={{ fontSize: 10, color: TOKEN.muted }}>Progress: {forecast.progress.toFixed(0)}% of month</div>
            <div style={{ fontSize: 10, color: TOKEN.textSub }}>Avg: {fmt(forecast.avgPerDay, currency)}/day</div>
          </div>
        </div>

        {/* Weekly Comparison */}
        <div className="card" style={S.reportCard}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Weekly Performance</div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: TOKEN.muted }}>This Week</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{fmt(weekly.thisTotal, currency)}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: TOKEN.muted }}>Last Week</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{fmt(weekly.lastTotal, currency)}</div>
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: weekly.diff > 0 ? TOKEN.danger : TOKEN.success }}>
            {weekly.diff > 0 ? "▲" : "▼"} {Math.abs(weekly.diff).toFixed(1)}% {weekly.diff > 0 ? "more" : "less"} than last week
          </div>
        </div>

        {/* Weekend Habits */}
        <div className="card" style={S.reportCard}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Spending Balance</div>
          <div style={{ display: "flex", height: 20, borderRadius: 10, overflow: "hidden", background: TOKEN.surfaceHighlight }}>
            <div style={{ width: `${(weekly.weekdayTotal / (weekly.thisTotal || 1)) * 100}%`, background: TOKEN.amber }} />
            <div style={{ width: `${(weekly.weekendTotal / (weekly.thisTotal || 1)) * 100}%`, background: "#378ADD" }} />
          </div>
          <div style={{ ...S.row, marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: TOKEN.amber }} />
              <span style={{ fontSize: 10, color: TOKEN.muted }}>Weekdays ({fmt(weekly.weekdayTotal, currency)})</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: "#378ADD" }} />
              <span style={{ fontSize: 10, color: TOKEN.muted }}>Weekends ({fmt(weekly.weekendTotal, currency)})</span>
            </div>
          </div>
        </div>

        {/* Cash Flow */}
        <div className="card" style={S.reportCard}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Cash Flow Summary</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={S.row}>
              <span style={{ fontSize: 12, color: TOKEN.textSub }}>Total Income</span>
              <span style={{ fontSize: 12, color: TOKEN.success, fontWeight: 600 }}>+{fmt(totalIncome, currency)}</span>
            </div>
            <div style={S.row}>
              <span style={{ fontSize: 12, color: TOKEN.textSub }}>Total Expenses</span>
              <span style={{ fontSize: 12, color: TOKEN.danger, fontWeight: 600 }}>-{fmt(totalSpent, currency)}</span>
            </div>
            <div style={{ height: 1, background: TOKEN.border, margin: "4px 0" }} />
            <div style={S.row}>
              <span style={{ fontSize: 12, fontWeight: 700 }}>Net Savings</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: (totalIncome - totalSpent) >= 0 ? TOKEN.success : TOKEN.danger }}>
                {fmt(totalIncome - totalSpent, currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Deep Insights */}
        <div className="card" style={S.reportCard}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Deep Insights</div>
          {insights.map((ins, i) => (
            <div key={i} style={S.insightItem}>
              <div style={{ fontSize: 12, color: TOKEN.textSub, lineHeight: 1.5 }}>{ins}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={S.screenBase} className="screen-enter">
      <div style={{ ...S.row, padding: "20px 20px 10px", background: TOKEN.bg, position: "sticky", top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={S.iconBtn}><ArrowLeftIcon color={TOKEN.dim} /></button>
        <div style={S.heading}>Intelligence</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportExcel} style={S.iconBtn}>📊</button>
          <button onClick={exportPDF} style={S.iconBtn}>📄</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, padding: "0 20px", marginBottom: 20 }}>
        {["overview", "calendar", "places", "intelligence"].map(t => (
          <button 
            key={t} 
            onClick={() => { if (settings.haptic) triggerHaptic("light"); setActiveTab(t as any); }}
            className="period-btn"
            style={{ 
              flex: 1, padding: "8px 4px", borderRadius: 10, border: "none", fontSize: 11, fontWeight: 600,
              background: activeTab === t ? TOKEN.amber : TOKEN.surfaceHighlight,
              color: activeTab === t ? "#fff" : TOKEN.muted,
              cursor: "pointer"
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div id="report-content" style={S.screenPad}>
        {activeTab === "overview" && renderOverview()}
        {activeTab === "calendar" && renderCalendar()}
        {activeTab === "places" && renderPlaces()}
        {activeTab === "intelligence" && renderIntelligence()}
      </div>
      <div style={{ height: 80 }} />
    </div>
  );
}
