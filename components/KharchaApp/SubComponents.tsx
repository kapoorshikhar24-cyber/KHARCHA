"use client";
// SubComponents.tsx — Reusable UI widgets for Kharcha

import { useState, useEffect, CSSProperties } from "react";
import type { Expense, Category, BudgetGoal } from "./Types";
import { S, TOKEN } from "./Styles";
import { DAY_LABELS } from "./Constants";
import { fmt, dateLabel } from "./Utils";

// ─── Global Auth Styles (Keyframes) ──────────────────────────────────────────
export function GlobalStyles() {
  return (
    <style dangerouslySetInnerHTML={{ __html: `
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');

      .theme-dark {
        --token-bg: #05050A;
        --token-phone: #0C0C14;
        --token-text: #F0EEE5;
        --token-textSub: #D0CEC8;
        --token-textFaint: #C0BEB8;
        --token-muted: #44445A;
        --token-dim: #55556A;
        --token-border: #28283C;
        --token-borderSub: #1A1A26;
        --token-amber: #EF9F27;
        --token-amberGlow: rgba(239,159,39,0.18);
        --token-amberText: #3A1E00;
        --token-danger: #E24B4A;
        --token-dangerGlow: rgba(226,75,74,0.15);
        --token-success: #1D9E75;
        --token-successGlow: rgba(29,158,117,0.15);
        --token-surface: #14141E;
        --token-surfaceElevated: #1A1A26;
        --token-surfaceHighlight: #242432;
        --token-glass: rgba(14,14,22,0.75);
      }
      .theme-light {
        --token-bg: #F0F0F5;
        --token-phone: #FFFFFF;
        --token-text: #1C1C1E;
        --token-textSub: #3A3A3C;
        --token-textFaint: #636366;
        --token-muted: #AEAEB2;
        --token-dim: #8E8E93;
        --token-border: #E0E0EA;
        --token-borderSub: #F0F0F7;
        --token-amber: #EF9F27;
        --token-amberGlow: rgba(239,159,39,0.12);
        --token-amberText: #FFFFFF;
        --token-danger: #FF3B30;
        --token-dangerGlow: rgba(255,59,48,0.12);
        --token-success: #34C759;
        --token-successGlow: rgba(52,199,89,0.12);
        --token-surface: #F2F2F7;
        --token-surfaceElevated: #FFFFFF;
        --token-surfaceHighlight: #E5E5EA;
        --token-glass: rgba(255,255,255,0.75);
      }

      /* ── Base font ───────────────────────────────────────────── */
      * { font-family: 'Outfit', system-ui, sans-serif !important; }

      /* ── Keyframes ───────────────────────────────────────────── */
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20%, 60%  { transform: translateX(-6px); }
        40%, 80%  { transform: translateX(6px); }
      }
      @keyframes scan {
        0%   { transform: translateY(-40px); opacity: 0; }
        50%  { opacity: 1; }
        100% { transform: translateY(40px);  opacity: 0; }
      }
      @keyframes pulse {
        0%   { transform: scale(1);   opacity: 0.5; }
        100% { transform: scale(1.5); opacity: 0; }
      }
      @keyframes pop {
        0%   { transform: scale(1); }
        50%  { transform: scale(1.08); }
        100% { transform: scale(1); }
      }
      @keyframes pulseSuccess {
        0%   { box-shadow: 0 0 0 0  rgba(29, 158, 117, 0.4); }
        70%  { box-shadow: 0 0 0 20px rgba(29, 158, 117, 0); }
        100% { box-shadow: 0 0 0 0  rgba(29, 158, 117, 0); }
      }
      @keyframes pulseError {
        0%   { box-shadow: 0 0 0 0  rgba(226, 75, 74, 0.4); }
        70%  { box-shadow: 0 0 0 20px rgba(226, 75, 74, 0); }
        100% { box-shadow: 0 0 0 0  rgba(226, 75, 74, 0); }
      }
      @keyframes slideUp {
        from { transform: translateY(18px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes popIn {
        0%   { transform: scale(0.90); opacity: 0; }
        65%  { transform: scale(1.04); opacity: 1; }
        100% { transform: scale(1);    opacity: 1; }
      }
      @keyframes glowPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(239,159,39,0.0); }
        50%       { box-shadow: 0 0 22px 4px rgba(239,159,39,0.25); }
      }
      @keyframes barGrow {
        from { transform: scaleY(0); }
        to   { transform: scaleY(1); }
      }
      @keyframes shimmer {
        0%   { background-position: -600px 0; }
        100% { background-position:  600px 0; }
      }
      @keyframes fabPulse {
        0%, 100% { box-shadow: 0 8px 24px rgba(239,159,39,0.20); }
        50%       { box-shadow: 0 8px 36px rgba(239,159,39,0.45); }
      }
      @keyframes sidebarSlide {
        from { opacity: 0; transform: translateX(-8px); }
        to   { opacity: 1; transform: translateX(0); }
      }

      /* ── Screen enter ─────────────────────────────────────────── */
      .screen-enter { animation: slideUp 0.28s cubic-bezier(0.25,0.46,0.45,0.94) both; }

      /* ── Interactive states ─────────────────────────────────── */
      .cat-btn:hover  { transform: translateY(-2px) !important; }
      .fab-btn:hover  { transform: translateY(-2px) !important; box-shadow: 0 12px 36px rgba(239,159,39,0.45) !important; }
      .icon-btn:hover { background: rgba(255,255,255,0.07) !important; }
      .nav-item:hover { background: rgba(239,159,39,0.07) !important; }
      .sidebar-item:hover { background: rgba(239,159,39,0.07) !important; }
      .period-btn:hover   { opacity: 0.85 !important; }

      /* ── Wallet card hover ─────────────────────────────────── */
      .wallet-card:hover { transform: translateY(-2px) !important; box-shadow: 0 8px 20px rgba(0,0,0,0.3) !important; }

      /* ── Scrollbars ────────────────────────────────────────── */
      ::-webkit-scrollbar { width: 4px; height: 4px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(239,159,39,0.2); border-radius: 2px; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(239,159,39,0.4); }

      /* ── Responsive overrides ──────────────────────────────── */
      @media (max-width: 600px) {
        .app-root  { padding: 0 !important; }
        .app-phone {
          width: 100vw !important; height: 100vh !important;
          min-height: 100vh !important; max-width: 100vw !important;
          border-radius: 0 !important; border: none !important; box-shadow: none !important;
        }
        .status-bar-sim, .home-bar-sim { display: none !important; }
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
    <div style={S.statusBar} className="status-bar-sim">
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
    <div style={S.homeBar} className="home-bar-sim">
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

export function ArrowDownIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5l0 14" />
      <path d="M19 12l-7 7l-7 -7" />
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
      style={{ ...S.toggle, background: on ? TOKEN.amber : TOKEN.borderSub }}
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
  currency?: string;
}

export function BarChart({ data, currency = "₹" }: BarChartProps) {
  const max = Math.max(...data, 1);
  const todayIdx = (new Date().getDay() + 6) % 7;
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80, position: "relative" }}>
        {data.map((v, i) => {
          const pct = v > 0 ? Math.max(8, Math.round((v / max) * 76)) : 4;
          const isToday = i === todayIdx;
          const isHovered = hovered === i;
          return (
            <div
              key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              title={v > 0 ? fmt(v, currency) : "No data"}
              style={{
                flex: 1,
                height: pct,
                background: isToday
                  ? `linear-gradient(180deg, #F5B93C 0%, ${TOKEN.amber} 100%)`
                  : v > 0
                    ? `linear-gradient(180deg, rgba(255,255,255,0.12) 0%, ${TOKEN.surfaceHighlight} 100%)`
                    : TOKEN.surfaceElevated,
                borderRadius: "4px 4px 2px 2px",
                alignSelf: "flex-end",
                cursor: "pointer",
                transition: "height 0.4s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.2s",
                border: isToday ? "none" : `0.5px solid ${TOKEN.borderSub}`,
                opacity: hovered !== null && !isHovered && !isToday ? 0.5 : 1,
                boxShadow: isToday ? `0 0 12px rgba(239,159,39,0.3)` : "none",
                position: "relative",
              }}
            >
              {isHovered && v > 0 && (
                <div style={{
                  position: "absolute",
                  bottom: "calc(100% + 6px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: TOKEN.surfaceElevated,
                  border: `1px solid ${TOKEN.border}`,
                  borderRadius: 6,
                  padding: "3px 7px",
                  fontSize: 10,
                  color: TOKEN.text,
                  whiteSpace: "nowrap",
                  zIndex: 10,
                  pointerEvents: "none",
                  fontWeight: 500,
                }}>
                  {fmt(v, currency)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        {DAY_LABELS.map((d, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 10,
              fontWeight: i === todayIdx ? 600 : 400,
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
    default:         return <span style={{ fontSize: size }}>{id}</span>;
  }
}

// ─── ExpenseRow ───────────────────────────────────────────────────────────────
interface ExpenseRowProps {
  expense: Expense;
  onDelete: (id: string) => void;
  onEdit?: (expense: Expense) => void;
  categories: Category[];
  currency?: string;
}

export function ExpenseRow({ expense, onDelete, onEdit, categories, currency = "₹" }: ExpenseRowProps) {
  const [swiped, setSwiped] = useState(false);
  const cat = categories.find((c) => c.id === expense.category) ?? categories[0];

  return (
    <div
      style={{
        ...S.cardRow,
        transform: swiped ? "translateX(-112px)" : "translateX(0)",
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
          {expense.type === "income" && <span style={{ color: TOKEN.success, marginLeft: 4, fontSize: 10 }}>+INCOME</span>}
          {expense.isRecurring && <span style={{ color: TOKEN.amber, marginLeft: 4, fontSize: 10 }}>🔁</span>}
        </div>
      </div>
      <div
        style={{
          color: expense.type === "income" ? TOKEN.success : TOKEN.text,
          fontSize: 14,
          fontVariantNumeric: "tabular-nums",
          fontWeight: 500,
          fontFamily: TOKEN.mono,
        }}
      >
        {expense.type === "income" ? "+" : ""}{fmt(expense.amount, currency)}
      </div>

      {swiped && (
        <div style={{ display: "flex", gap: 4, position: "absolute", right: 0 }}>
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSwiped(false);
                onEdit(expense);
              }}
              style={{
                ...S.deleteSlide,
                background: "rgba(55, 138, 221, 0.15)",
                color: "#378ADD",
                width: 48
              }}
              aria-label="Edit expense"
            >
              ✏️
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(expense.id);
            }}
            style={{ ...S.deleteSlide, width: 48 }}
            aria-label="Delete expense"
          >
            🗑️
          </button>
        </div>
      )}
    </div>
  );
}

// ─── CategoryBar (dashboard breakdown) ───────────────────────────────────────
export function CategoryBar({ category, total, max, currency = "₹" }: { category: Category; total: number; max: number; currency?: string }) {
  const pct = Math.min(100, Math.round((total / max) * 100));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 8,
            background: `${category.color}20`,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <CatIcon id={category.icon} size={13} color={category.color} />
          </div>
          <span style={{ color: TOKEN.textSub, fontSize: 13, fontWeight: 500 }}>{category.label}</span>
        </div>
        <span style={{ color: TOKEN.text, fontSize: 13, fontWeight: 600 }}>{fmt(total, currency)}</span>
      </div>
      <div style={{ height: 6, background: TOKEN.surfaceHighlight, borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: `linear-gradient(90deg, ${category.color}BB, ${category.color})`,
          borderRadius: 3,
          transition: "width 0.5s cubic-bezier(0.25,0.46,0.45,0.94)",
          boxShadow: `0 0 6px ${category.color}40`,
        }} />
      </div>
    </div>
  );
}

// ─── BudgetCard ───────────────────────────────────────────────────────────────
export function BudgetCard({ total, count, date, currency = "₹" }: { total: number; count: number; date: string; currency?: string }) {
  return (
    <div style={{
      ...S.todayBanner,
      background: `linear-gradient(135deg, ${TOKEN.surface} 0%, ${TOKEN.surfaceElevated} 100%)`,
      borderRadius: 16,
      border: `1px solid ${TOKEN.border}`,
      boxShadow: "0 2px 12px rgba(0,0,0,0.18)",
    }}>
      <div>
        <div style={{ color: TOKEN.muted, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>Today's total</div>
        <div style={{ color: TOKEN.amber, fontSize: 26, fontWeight: 700, fontFamily: TOKEN.mono, letterSpacing: "-0.5px", marginTop: 2 }}>{fmt(total, currency)}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "3px 10px", borderRadius: 20,
          background: TOKEN.surfaceHighlight,
          color: TOKEN.textFaint, fontSize: 11, marginBottom: 4,
        }}>{count} expenses</div>
        <div style={{ color: TOKEN.muted, fontSize: 11 }}>{date}</div>
      </div>
    </div>
  );
}

export function OverviewCard({ total, sub, currency = "₹" }: { total: number; sub: string; currency?: string }) {
  return (
    <div style={{ ...S.card, padding: 18 }}>
      <div style={{ color: TOKEN.muted, fontSize: 11, marginBottom: 4 }}>Total spent</div>
      <div style={{ fontSize: 40, fontWeight: 500, color: TOKEN.text, fontFamily: TOKEN.mono, letterSpacing: -1 }}>{fmt(total, currency)}</div>
      <div style={{ color: TOKEN.muted, fontSize: 12, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

// ─── BudgetGoalBar ────────────────────────────────────────────────────────────
export function BudgetGoalBar({
  category, spent, limit, currency = "₹"
}: { category: Category; spent: number; limit: number; currency?: string }) {
  const pct = Math.min(100, Math.round((spent / limit) * 100));
  const isWarning = pct >= 80 && pct < 100;
  const isOver    = pct >= 100;
  const barColor  = isOver ? TOKEN.danger : isWarning ? "#EF9F27" : TOKEN.success;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CatIcon id={category.icon} size={14} color={category.color} />
          <span style={{ color: TOKEN.textFaint, fontSize: 13 }}>{category.label}</span>
          {isOver    && <span style={{ fontSize: 10, color: TOKEN.danger,  background: `${TOKEN.danger}22`,  padding: "2px 6px", borderRadius: 8 }}>OVER</span>}
          {isWarning && <span style={{ fontSize: 10, color: TOKEN.amber,   background: `${TOKEN.amber}22`,   padding: "2px 6px", borderRadius: 8 }}>NEAR LIMIT</span>}
        </div>
        <span style={{ fontSize: 12, color: TOKEN.textFaint, fontFamily: TOKEN.mono }}>
          {fmt(spent, currency)} / {fmt(limit, currency)}
        </span>
      </div>
      <div style={{ height: 6, background: TOKEN.surfaceHighlight, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 3, transition: "width 0.5s ease-out" }} />
      </div>
    </div>
  );
}

// ─── SparkLine mini chart ─────────────────────────────────────────────────────
export function SparkLine({ data, color = TOKEN.amber, height = 48 }: { data: number[]; color?: string; height?: number }) {
  const max = Math.max(...data, 1);
  const width = 300;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / max) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const fillPts = `0,${height} ${pts} ${width},${height}`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill="url(#sparkGrad)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

