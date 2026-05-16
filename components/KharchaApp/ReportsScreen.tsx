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
  generateInsights, sumExpenses, sumIncome, triggerHaptic,
  calculateHealthScore, getMerchantData, getCalendarData 
} from "./Utils";
import { ArrowLeftIcon } from "./SubComponents";

interface ReportsScreenProps {
  expenses: Expense[];
  categories: Category[];
  settings: Settings;
  onBack: () => void;
}

const AnimatedCounter = ({ value, prefix = "" }: { value: number; prefix?: string }) => {
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
  return <span>{prefix}{Math.round(displayValue).toLocaleString("en-IN")}</span>;
};

export default function ReportsScreen({ expenses, categories, settings, onBack }: ReportsScreenProps) {
  const [activeView, setActiveView] = useState<"overview" | "calendar" | "merchants">("overview");
  const [trendDays, setTrendDays] = useState(30);
  const isLight = settings.theme === "light";
  
  const trendData = useMemo(() => getTrendData(expenses, trendDays), [expenses, trendDays]);
  const catData = useMemo(() => getCategoryBreakdown(expenses, categories), [expenses, categories]);
  const heatmapData = useMemo(() => getHeatmapData(expenses), [expenses]);
  const insights = useMemo(() => generateInsights(expenses), [expenses]);
  const healthScore = useMemo(() => calculateHealthScore(expenses, settings.monthlyBudget || 50000), [expenses, settings.monthlyBudget]);
  const merchantData = useMemo(() => getMerchantData(expenses), [expenses]);
  const calendarData = useMemo(() => getCalendarData(expenses), [expenses]);

  const totalSpent = useMemo(() => sumExpenses(expenses.filter(e => {
    const d = new Date(e.createdAt);
    return d.getMonth() === new Date().getMonth();
  })), [expenses]);
  
  const totalIncome = useMemo(() => sumIncome(expenses.filter(e => {
    const d = new Date(e.createdAt);
    return d.getMonth() === new Date().getMonth();
  })), [expenses]);

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
      <div style={{ ...S.reportCard, flexDirection: "row", alignItems: "center", justifyContent: "space-between", background: isLight ? "rgba(239, 159, 39, 0.05)" : "linear-gradient(135deg, rgba(239, 159, 39, 0.1) 0%, rgba(6, 6, 8, 0) 100%)" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TOKEN.text }}>Financial Health</div>
          <div style={{ fontSize: 11, color: TOKEN.muted, marginTop: 4 }}>Based on your budget & savings</div>
        </div>
        <div style={{ ...S.healthRing, borderColor: healthScore > 80 ? TOKEN.success : healthScore > 50 ? TOKEN.amber : TOKEN.danger }}>
          {healthScore}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={S.reportCard}>
          <div style={S.metricLabel}>Spent</div>
          <div style={S.metricValue}><AnimatedCounter value={totalSpent} prefix="₹" /></div>
        </div>
        <div style={S.reportCard}>
          <div style={S.metricLabel}>Income</div>
          <div style={{ ...S.metricValue, color: TOKEN.success }}><AnimatedCounter value={totalIncome} prefix="₹" /></div>
        </div>
      </div>

      <div style={S.reportCard}>
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
        <div style={{ height: 200, width: "100%", marginTop: 16 }}>
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

      {/* Category Mix with Percentages and Totals */}
      <div style={S.reportCard}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Category Mix</div>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={catData} innerRadius={60} outerRadius={80} dataKey="value" paddingAngle={5}>
                {catData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(val: any) => fmt(Number(val || 0))} contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {catData.map(c => {
            const perc = ((c.value / totalSpent) * 100).toFixed(1);
            return (
              <div key={c.name} style={{ ...S.row, fontSize: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />
                  <span style={{ color: TOKEN.textSub, fontWeight: 500 }}>{c.name}</span>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ color: TOKEN.muted, fontSize: 11 }}>{perc}%</span>
                  <span style={{ color: TOKEN.text, fontWeight: 600, fontFamily: TOKEN.mono }}>{fmt(c.value)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Spending Activity Heatmap for Light Mode */}
      <div style={S.reportCard}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Spending Activity</div>
        <div style={{ fontSize: 10, color: TOKEN.muted, marginBottom: 12 }}>Frequency of transactions</div>
        <div style={S.heatmapGrid}>
          {heatmapData.slice(-28).map((d, i) => {
            let opacity = 0.05;
            if (d.intensity === 1) opacity = 0.2;
            if (d.intensity === 2) opacity = 0.4;
            if (d.intensity === 3) opacity = 0.7;
            if (d.intensity === 4) opacity = 1.0;
            
            return (
              <div 
                key={i} 
                title={`${new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}: ${fmt(d.count)}`}
                onClick={() => { if (settings.haptic) triggerHaptic("light"); }}
                style={{ 
                  ...S.heatmapCell, 
                  background: d.intensity === 0 
                    ? (isLight ? "rgba(0,0,0,0.03)" : TOKEN.surfaceHighlight)
                    : TOKEN.amber,
                  opacity: d.intensity === 0 ? 1 : opacity,
                  border: isLight && d.intensity === 0 ? "1px solid rgba(0,0,0,0.02)" : "none",
                  cursor: "pointer"
                }} 
              />
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 12 }}>
          <div style={{ fontSize: 9, color: TOKEN.muted }}>Less</div>
          {[0, 0.2, 0.4, 0.7, 1].map((v, i) => (
            <div key={i} style={{ 
              width: 10, height: 10, borderRadius: 2, 
              background: v === 0 ? (isLight ? "rgba(0,0,0,0.03)" : TOKEN.surfaceHighlight) : TOKEN.amber,
              opacity: v || 1
            }} />
          ))}
          <div style={{ fontSize: 9, color: TOKEN.muted }}>More</div>
        </div>
      </div>

      <div style={S.reportCard}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Observations</div>
        {insights.map((ins, i) => (
          <div key={i} style={S.insightItem}>
            <div style={{ fontSize: 12, color: TOKEN.textSub, lineHeight: 1.5 }}>{ins}</div>
          </div>
        ))}
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
      <div style={S.reportCard}>
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
        <div style={{ marginTop: 20, padding: 12, background: isLight ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)", borderRadius: 12 }}>
          <div style={{ fontSize: 12, color: TOKEN.muted }}>Daily Average</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: TOKEN.text }}>{fmt(totalSpent / daysInMonth)}</div>
        </div>
      </div>
    );
  };

  const renderMerchants = () => (
    <div style={S.reportCard}>
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
            <div style={{ fontSize: 14, fontWeight: 700, color: TOKEN.text, fontFamily: TOKEN.mono }}>{fmt(m.amount)}</div>
            <div style={{ fontSize: 9, color: TOKEN.muted }}>{((m.amount / totalSpent) * 100).toFixed(1)}%</div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={S.screenBase}>
      <div style={{ ...S.row, padding: "20px 20px 10px", background: TOKEN.bg, position: "sticky", top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={S.iconBtn}><ArrowLeftIcon color={TOKEN.dim} /></button>
        <div style={S.heading}>Intelligence</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={exportExcel} style={S.iconBtn}>📊</button>
          <button onClick={exportPDF} style={S.iconBtn}>📄</button>
        </div>
      </div>

      <div style={{ padding: "0 20px 10px", display: "flex", gap: 8, overflowX: "auto", msOverflowStyle: "none", scrollbarWidth: "none" }}>
        {[
          { id: "overview", label: "Overview", icon: "📈" },
          { id: "calendar", label: "Calendar", icon: "📅" },
          { id: "merchants", label: "Places", icon: "📍" },
        ].map(v => (
          <button 
            key={v.id} 
            onClick={() => { setActiveView(v.id as any); triggerHaptic("light"); }}
            style={{
              padding: "8px 16px", borderRadius: 12, border: `1px solid ${activeView === v.id ? TOKEN.amber : TOKEN.border}`,
              background: activeView === v.id ? "rgba(239, 159, 39, 0.1)" : TOKEN.surface,
              color: activeView === v.id ? TOKEN.amber : TOKEN.muted,
              fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap"
            }}
          >
            <span>{v.icon}</span>
            {v.label}
          </button>
        ))}
      </div>

      <div id="report-content" style={S.screenPad}>
        {activeView === "overview" && renderOverview()}
        {activeView === "calendar" && renderCalendar()}
        {activeView === "merchants" && renderMerchants()}
      </div>
      <div style={{ height: 80 }} />
    </div>
  );
}
