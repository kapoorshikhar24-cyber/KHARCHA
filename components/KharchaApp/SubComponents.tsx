"use client";
// SubComponents.tsx — Reusable UI widgets for Kharcha

import { useState, useEffect, CSSProperties } from "react";
import type { Expense, Category } from "./Types";
import { S, TOKEN } from "./Styles";
import { DAY_LABELS } from "./Constants";
import { fmt, dateLabel } from "./Utils";

// ─── Global Auth Styles (Keyframes) ──────────────────────────────────────────
export function AuthStyles() {
  return (
    <style dangerouslySetInnerHTML={{ __html: `
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20%, 60% { transform: translateX(-6px); }
        40%, 80% { transform: translateX(6px); }
      }
      @keyframes scan {
        0% { transform: translateY(-40px); opacity: 0; }
        50% { opacity: 1; }
        100% { transform: translateY(40px); opacity: 0; }
      }
      @keyframes pulse {
        0% { transform: scale(1); opacity: 0.5; }
        100% { transform: scale(1.5); opacity: 0; }
      }
      @keyframes pop {
        0% { transform: scale(1); }
        50% { transform: scale(1.2); }
        100% { transform: scale(1); }
      }
    `}} />
  );
}

// ─── StatusBar ────────────────────────────────────────────────────────────────
export function StatusBar() {
  const [time, setTime] = useState("");

  useEffect(() => {
    const tick = () => {
      setTime(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      );
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={S.statusBar}>
      <span style={S.statusTime}>{time}</span>
      <div style={S.notch} />
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <WifiIcon size={13} color={TOKEN.dim} />
        <BatteryIcon size={13} color={TOKEN.dim} />
      </div>
    </div>
  );
}

// ─── HomeBar ──────────────────────────────────────────────────────────────────
export function HomeBar() {
  return (
    <div style={S.homeBar}>
      <div style={S.homeIndicator} />
    </div>
  );
}

// ─── FingerprintIcon ──────────────────────────────────────────────────────────
export function FingerprintIcon({ size = 24, color = TOKEN.amber }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.9 7a8 8 0 0 1 1.1 5v1a6 6 0 0 0 .8 3" />
      <path d="M8 11a4 4 0 0 1 8 0v1a10 10 0 0 0 .8 4" />
      <path d="M12 11v2a14 14 0 0 0 .8 4.7" />
      <path d="M5.1 11.7a9 9 0 0 1 14.9 -1.7" />
      <path d="M3.5 13a12 12 0 0 1 17 0" />
      <path d="M12 21a10 10 0 0 1 -10 -10" />
    </svg>
  );
}

// ─── BiometricOverlay ─────────────────────────────────────────────────────────
export function BiometricOverlay({ status, onCancel }: { status: "scanning" | "success" | "fail"; onCancel: () => void }) {
  return (
    <div style={S.biometricOverlay}>
      <div style={S.biometricRing}>
        <div style={{ ...S.biometricPulse, animation: "pulse 2s infinite" }} />
        <FingerprintIcon size={60} color={status === "fail" ? TOKEN.danger : TOKEN.amber} />
        {status === "scanning" && <div style={{ ...S.scanBar, animation: "scan 2s infinite ease-in-out" }} />}
      </div>
      
      <div style={{ textAlign: "center" }}>
        <div style={{ color: TOKEN.text, fontSize: 18, fontWeight: 500 }}>
          {status === "scanning" ? "Authenticating..." : status === "success" ? "Success!" : "Failed"}
        </div>
        <div style={{ color: TOKEN.muted, fontSize: 13, marginTop: 4 }}>
          {status === "scanning" ? "Hold your finger on the sensor" : status === "success" ? "Unlocking Kharcha..." : "Try again or use PIN"}
        </div>
      </div>

      {status !== "success" && (
        <button onClick={onCancel} style={{ ...S.forgotBtn, marginTop: 40, textDecoration: "none", color: TOKEN.text }}>
          Cancel
        </button>
      )}
    </div>
  );
}

export function PlusIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5l0 14" />
      <path d="M5 12l14 0" />
    </svg>
  );
}

export function ArrowLeftIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l14 0" />
      <path d="M5 12l6 6" />
      <path d="M5 12l6 -6" />
    </svg>
  );
}

export function BellIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 5a2 2 0 0 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" />
      <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
    </svg>
  );
}

export function XIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6l-12 12" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

export function WifiIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 18l.01 0" />
      <path d="M9.172 15.172a4 4 0 0 1 5.656 0" />
      <path d="M6.343 12.343a8 8 0 0 1 11.314 0" />
      <path d="M3.515 9.515c4.686 -4.687 12.284 -4.687 17 0" />
    </svg>
  );
}

export function BatteryIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 7h11a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-11a2 2 0 0 1 -2 -2v-6a2 2 0 0 1 2 -2" />
      <path d="M19 10h1a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-1" />
      <path d="M7 10v4" />
      <path d="M10 10v4" />
    </svg>
  );
}

export function KitchenIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3v12l0 0a3 3 0 0 0 3 3l0 0v2" />
      <path d="M11 3v12" />
      <path d="M16 3v12l0 0a3 3 0 0 1 -3 3l0 0v2" />
      <path d="M9 18h4" />
    </svg>
  );
}

export function PlaneIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2 -7h-4l-2 2h-3l2 -4l-2 -4h3l2 2h4l-2 -7h3z" />
    </svg>
  );
}

export function GasStationIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 11h1a2 2 0 0 1 2 2v3a1.5 1.5 0 0 0 3 0V9l-3 -3" />
      <path d="M4 20V6a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v14" />
      <path d="M3 20l11 0" />
      <path d="M18 7v1a1 1 0 0 0 1 1h1" />
      <path d="M4 11l10 0" />
    </svg>
  );
}

export function ShoppingBagIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.331 8h11.339a2 2 0 0 1 1.977 2.304l-1.255 8.152a3 3 0 0 1 -2.966 2.544h-6.852a3 3 0 0 1 -2.965 -2.544l-1.255 -8.152a2 2 0 0 1 1.977 -2.304z" />
      <path d="M9 11v-5a3 3 0 0 1 6 0v5" />
    </svg>
  );
}

export function BuildingIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21l18 0" />
      <path d="M9 8l1 0" />
      <path d="M9 12l1 0" />
      <path d="M9 16l1 0" />
      <path d="M14 8l1 0" />
      <path d="M14 12l1 0" />
      <path d="M14 16l1 0" />
      <path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16" />
    </svg>
  );
}

export function ReceiptIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2" />
      <path d="M9 7l6 0" />
      <path d="M9 11l6 0" />
      <path d="M9 15l4 0" />
    </svg>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────
interface ToggleProps {
  on: boolean;
  onToggle: () => void;
}

export function Toggle({ on, onToggle }: ToggleProps) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={on}
      style={{ ...S.toggle, background: on ? TOKEN.amber : "#2E2E3E" }}
    >
      <div style={{ ...S.knob, left: on ? 18 : 2 }} />
    </button>
  );
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={S.sectionLabel}>{children}</div>;
}

// ─── TogRow (Settings toggle row) ────────────────────────────────────────────
interface TogRowProps {
  label: string;
  sub: string;
  val: boolean;
  onChange: (v: boolean) => void;
}

export function TogRow({ label, sub, val, onChange }: TogRowProps) {
  return (
    <div style={S.togRow}>
      <div>
        <div style={{ color: TOKEN.textSub, fontSize: 13 }}>{label}</div>
        <div style={{ color: TOKEN.muted, fontSize: 11 }}>{sub}</div>
      </div>
      <Toggle on={val} onToggle={() => onChange(!val)} />
    </div>
  );
}

// ─── BarChart ─────────────────────────────────────────────────────────────────
interface BarChartProps {
  data: number[];
}

export function BarChart({ data }: BarChartProps) {
  const max = Math.max(...data, 1);
  const todayIdx = (new Date().getDay() + 6) % 7;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 72 }}>
        {data.map((v, i) => {
          const h = v > 0 ? Math.max(6, Math.round((v / max) * 68)) : 4;
          const isToday = i === todayIdx;
          return (
            <div
              key={i}
              title={v > 0 ? fmt(v) : "No data"}
              style={{
                flex: 1,
                height: h,
                background: isToday ? TOKEN.amber : v > 0 ? "#252538" : "#1A1A24",
                borderRadius: "3px 3px 0 0",
                alignSelf: "flex-end",
                cursor: "pointer",
                transition: "height 0.4s",
                border: isToday ? "none" : `0.5px solid #2E2E3E`,
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
        {DAY_LABELS.map((d, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 10,
              color: i === todayIdx ? TOKEN.amber : TOKEN.muted,
            }}
          >
            {d}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CatIcon({ id, size = 18, color = "currentColor" }: { id: string; size?: number; color?: string }) {
  switch (id) {
    case "food":     return <KitchenIcon size={size} color={color} />;
    case "travel":   return <PlaneIcon size={size} color={color} />;
    case "fuel":     return <GasStationIcon size={size} color={color} />;
    case "shopping": return <ShoppingBagIcon size={size} color={color} />;
    case "lodging":  return <BuildingIcon size={size} color={color} />;
    case "bills":    return <ReceiptIcon size={size} color={color} />;
    default:         return <span style={{ fontSize: size }}>📦</span>;
  }
}

// ─── ExpenseRow ───────────────────────────────────────────────────────────────
interface ExpenseRowProps {
  expense: Expense;
  onDelete: (id: string) => void;
  categories: Category[]; // Added categories prop
}

export function ExpenseRow({ expense, onDelete, categories }: ExpenseRowProps) {
  const [swiped, setSwiped] = useState(false);
  const cat = categories.find((c) => c.id === expense.category) ?? categories[0];

  return (
    <div
      style={{
        ...S.cardRow,
        transform: swiped ? "translateX(-64px)" : "translateX(0)",
        transition: "transform 0.2s",
        cursor: "pointer",
      }}
      onClick={() => setSwiped((s) => !s)}
    >
      <div style={{ ...S.picon, background: cat.bg }}>
        <CatIcon id={cat.icon} size={18} color={cat.color} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: TOKEN.textSub, fontSize: 13, fontWeight: 400 }}>
          {expense.note || cat.label}
        </div>
        <div style={{ color: TOKEN.muted, fontSize: 11, marginTop: 2 }}>
          {cat.label} &bull; {new Date(expense.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
      <div
        style={{
          color: TOKEN.text,
          fontSize: 14,
          fontVariantNumeric: "tabular-nums",
          fontWeight: 500,
          fontFamily: TOKEN.mono,
        }}
      >
        {fmt(expense.amount)}
      </div>

      {swiped && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(expense.id);
          }}
          style={S.deleteSlide}
          aria-label="Delete expense"
        >
          🗑️
        </button>
      )}
    </div>
  );
}

// ─── CategoryBar (dashboard breakdown) ───────────────────────────────────────
interface CategoryBarProps {
  icon: string;
  label: string;
  color: string;
  total: number;
  max: number;
}

export function CategoryBar({ category, total, max }: { category: Category; total: number; max: number }) {
  const pct = Math.min(100, Math.round((total / max) * 100));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <CatIcon id={category.icon} size={14} color={category.color} />
          <span style={{ color: "#C8C6C0", fontSize: 13 }}>{category.label}</span>
        </div>
        <span style={{ color: "#C8C6C0", fontSize: 13, fontFamily: TOKEN.mono }}>{fmt(total)}</span>
      </div>
      <div style={{ height: 5, background: "#22222C", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: category.color, borderRadius: 3, transition: "width 0.4s ease-out" }} />
      </div>
    </div>
  );
}

// ─── BudgetCard ───────────────────────────────────────────────────────────────
interface BudgetCardProps {
  total: number;
  budget: number;
  count: number;
  period: string;
}

export function BudgetCard({ total, count, date }: { total: number; count: number; date: string }) {
  return (
    <div style={S.todayBanner}>
      <div>
        <div style={{ color: "#44445A", fontSize: 11 }}>Today's total</div>
        <div style={{ color: TOKEN.amber, fontSize: 24, fontWeight: 500, fontFamily: TOKEN.mono }}>{fmt(total)}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ color: "#44445A", fontSize: 11 }}>{count} expenses</div>
        <div style={{ color: "#44445A", fontSize: 11 }}>{date}</div>
      </div>
    </div>
  );
}

export function OverviewCard({ total, sub }: { total: number; sub: string }) {
  return (
    <div style={{ ...S.card, padding: 18 }}>
      <div style={{ color: "#44445A", fontSize: 11, marginBottom: 4 }}>Total spent</div>
      <div style={{ fontSize: 40, fontWeight: 500, color: TOKEN.text, fontFamily: TOKEN.mono, letterSpacing: -1 }}>{fmt(total)}</div>
      <div style={{ color: "#44445A", fontSize: 12, marginTop: 4 }}>{sub}</div>
    </div>
  );
}
