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
        --token-bg: #07070A;
        --token-phone: #0D0D15;
        --token-text: #F8F8FC;
        --token-textSub: #E2E2EC;
        --token-textFaint: #B0B0C4;
        --token-muted: #8E8EA8;
        --token-dim: #6E6E88;
        --token-border: rgba(255, 255, 255, 0.08);
        --token-borderSub: rgba(255, 255, 255, 0.04);
        --token-amber: #EF9F27;
        --token-amberGlow: rgba(239,159,39,0.22);
        --token-amberText: #1A0A00;
        --token-danger: #EF4444;
        --token-dangerGlow: rgba(239,68,68,0.2);
        --token-success: #10B981;
        --token-successGlow: rgba(16,185,129,0.2);
        --token-surface: #141420;
        --token-surfaceElevated: #1B1B2A;
        --token-surfaceHighlight: #25253A;
        --token-glass: rgba(16,16,26,0.75);
        --token-desktopBg: rgba(13, 13, 21, 0.92);
        --token-titleBarBg: rgba(9, 9, 15, 0.95);
        --token-sidebarBg: rgba(11, 11, 19, 0.92);
        --token-heroBg: linear-gradient(145deg, rgba(239,159,39,0.18) 0%, rgba(216,90,48,0.08) 45%, rgba(18,18,28,0.92) 100%);
        --token-kpiBg: linear-gradient(145deg, rgba(24, 24, 36, 0.85) 0%, rgba(14, 14, 22, 0.9) 100%);
        --token-phoneBezel: #161622;
      }
      .theme-light {
        --token-bg: #F4F5F9;
        --token-phone: #FFFFFF;
        --token-text: #181822;
        --token-textSub: #333342;
        --token-textFaint: #565668;
        --token-muted: #7E7E94;
        --token-dim: #9E9EAE;
        --token-border: rgba(0, 0, 0, 0.09);
        --token-borderSub: rgba(0, 0, 0, 0.05);
        --token-amber: #D97706;
        --token-amberGlow: rgba(217, 119, 6, 0.2);
        --token-amberText: #FFFFFF;
        --token-danger: #E11D48;
        --token-dangerGlow: rgba(225, 29, 72, 0.15);
        --token-success: #059669;
        --token-successGlow: rgba(5, 150, 105, 0.15);
        --token-surface: #FFFFFF;
        --token-surfaceElevated: #F8F9FD;
        --token-surfaceHighlight: #ECEEF6;
        --token-glass: rgba(255, 255, 255, 0.85);
        --token-desktopBg: rgba(255, 255, 255, 0.96);
        --token-titleBarBg: #ECECF2;
        --token-sidebarBg: #F6F7FA;
        --token-heroBg: linear-gradient(145deg, rgba(245, 158, 11, 0.14) 0%, rgba(217, 119, 6, 0.07) 45%, rgba(255, 255, 255, 0.98) 100%);
        --token-kpiBg: linear-gradient(145deg, #FFFFFF 0%, #F8F9FD 100%);
        --token-phoneBezel: #E2E3EB;
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

export function MicIcon({ size = 16, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
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
  const isIncome = expense.type === "income";

  return (
    <div
      className="expense-row"
      style={{
        ...S.cardRow,
        borderLeft: `3px solid ${isIncome ? TOKEN.success : cat.color || TOKEN.amber}`,
        transform: swiped ? "translateX(-112px)" : "translateX(0)",
        transition: "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s, background 0.2s",
        cursor: "pointer",
      }}
      onClick={() => setSwiped((s) => !s)}
    >
      <div style={{
        ...S.picon,
        background: cat.bg || "rgba(255,255,255,0.06)",
        boxShadow: `0 2px 10px ${(cat.color || TOKEN.amber)}22`,
      }}>
        <CatIcon id={cat.icon} size={18} color={isIncome ? TOKEN.success : cat.color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: TOKEN.text, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {expense.note || cat.label}
        </div>
        <div style={{ color: TOKEN.muted, fontSize: 11, marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
          <span>{cat.label}</span>
          <span>&bull;</span>
          <span>{new Date(expense.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
          {isIncome && (
            <span style={{
              background: "rgba(16,185,129,0.15)", color: TOKEN.success,
              padding: "1px 6px", borderRadius: 8, fontSize: 9, fontWeight: 700, letterSpacing: "0.03em"
            }}>
              INCOME
            </span>
          )}
          {expense.isRecurring && <span title="Recurring">🔁</span>}
        </div>
      </div>
      <div
        style={{
          color: isIncome ? TOKEN.success : TOKEN.text,
          fontSize: 14,
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          fontFamily: TOKEN.mono,
          letterSpacing: "-0.3px",
          flexShrink: 0,
        }}
      >
        {isIncome ? "+" : "-"}{fmt(expense.amount, currency)}
      </div>

      {swiped && (
        <div style={{ display: "flex", gap: 4, position: "absolute", right: 0, height: "100%", alignItems: "center" }}>
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSwiped(false);
                onEdit(expense);
              }}
              style={{
                ...S.deleteSlide,
                background: "rgba(55, 138, 221, 0.2)",
                color: "#378ADD",
                width: 48,
                borderRadius: "8px 0 0 8px",
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
            style={{ ...S.deleteSlide, width: 48, borderRadius: "0 8px 8px 0" }}
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

// ─── Windows 11 Title Bar ─────────────────────────────────────────────────────
export function WindowsTitleBar({
  userName,
  onSwitchUser,
  onToggleUiMode,
  theme = "dark",
  onToggleTheme,
  isMaximized,
  onToggleMaximize,
}: {
  userName?: string;
  onSwitchUser?: () => void;
  onToggleUiMode: () => void;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}) {
  return (
    <div style={S.windowsTitleBar} className="windows-title-bar">
      {/* Left: Window Brand Icon & Name */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 20, height: 20, borderRadius: 5,
          background: "linear-gradient(135deg, #F59E0B, #D97706)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, boxShadow: "0 2px 6px rgba(245, 158, 11, 0.4)",
        }}>
          🪙
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: TOKEN.text, fontWeight: 700, letterSpacing: "-0.2px" }}>Kharcha</span>
          <span style={{ color: TOKEN.dim, fontSize: 11 }}>— Personal Finance [Windows Edition]</span>
        </div>
      </div>

      {/* Center: Current active user profile pill */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {userName && (
          <div
            onClick={onSwitchUser}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(255, 255, 255, 0.05)",
              border: `1px solid ${TOKEN.border}`,
              padding: "2px 10px", borderRadius: 12,
              fontSize: 11, color: TOKEN.textSub, cursor: "pointer",
            }}
            title="Click to Switch User Profile"
          >
            <span>👤</span>
            <span>{userName}</span>
            <span style={{ fontSize: 9, color: TOKEN.muted }}>▼</span>
          </div>
        )}

        {/* ☀️ / 🌙 Theme Toggle Button */}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: theme === "light" ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.08)",
              border: `1px solid ${TOKEN.border}`,
              color: TOKEN.text,
              padding: "3px 10px", borderRadius: 12,
              fontSize: 11, fontWeight: 600, cursor: "pointer",
              transition: "all 0.18s ease",
            }}
            className="ui-switch-pill"
            title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
          >
            <span>{theme === "light" ? "🌙" : "☀️"}</span>
            <span>{theme === "light" ? "Dark" : "Light"}</span>
          </button>
        )}

        {/* Instant Switch to Phone UI button */}
        <button
          onClick={onToggleUiMode}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "rgba(239, 159, 39, 0.12)",
            border: "1px solid rgba(239, 159, 39, 0.3)",
            color: TOKEN.amber,
            padding: "3px 12px", borderRadius: 12,
            fontSize: 11, fontWeight: 600, cursor: "pointer",
            transition: "all 0.18s ease",
          }}
          className="ui-switch-pill"
          title="Switch to Mobile Phone UI"
        >
          <span>📱</span>
          <span>Switch to Phone UI</span>
        </button>
      </div>

      {/* Right: Windows Window Controls */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <button
          style={{
            background: "transparent", border: "none", color: TOKEN.muted,
            width: 38, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontSize: 13,
          }}
          title="Minimize"
        >
          ─
        </button>
        <button
          onClick={onToggleMaximize}
          style={{
            background: "transparent", border: "none", color: TOKEN.muted,
            width: 38, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontSize: 12,
          }}
          title={isMaximized ? "Restore Window" : "Maximize Window"}
        >
          {isMaximized ? "❐" : "🗖"}
        </button>
        <button
          style={{
            background: "transparent", border: "none", color: TOKEN.muted,
            width: 38, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontSize: 14,
          }}
          className="win-close-btn"
          title="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ─── Mobile Phone Top Bar ─────────────────────────────────────────────────────
export function PhoneTopBar({
  userName,
  onSwitchUser,
  onToggleUiMode,
  theme = "dark",
  onToggleTheme,
  onOpenVoice,
}: {
  userName?: string;
  onSwitchUser?: () => void;
  onToggleUiMode: () => void;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
  onOpenVoice?: () => void;
}) {
  return (
    <div style={{
      padding: "10px 16px 8px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottom: `1px solid ${TOKEN.border}`,
      background: TOKEN.phone,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          onClick={onSwitchUser}
          style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "linear-gradient(135deg, rgba(239,159,39,0.25), rgba(216,90,48,0.2))",
            border: `1.5px solid ${TOKEN.amber}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, cursor: "pointer", fontWeight: 700, color: TOKEN.amber,
          }}
          title="Switch User Profile"
        >
          {userName?.charAt(0).toUpperCase() || "U"}
        </div>
        <div>
          <div style={{ fontSize: 11, color: TOKEN.muted, lineHeight: 1 }}>Welcome back,</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TOKEN.text }}>{userName || "User"}</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Theme Toggle Button */}
        {onToggleTheme && (
          <button
            onClick={onToggleTheme}
            style={{
              width: 30, height: 30, borderRadius: "50%",
              background: theme === "light" ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)",
              border: `1px solid ${TOKEN.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", fontSize: 13,
            }}
            title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        )}

        {/* Switch to Windows UI button */}
        <button
          onClick={onToggleUiMode}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "rgba(55, 138, 221, 0.15)",
            border: "1px solid rgba(55, 138, 221, 0.35)",
            color: "#378ADD",
            padding: "3px 10px", borderRadius: 12,
            fontSize: 10, fontWeight: 700, cursor: "pointer",
          }}
          title="Switch to Windows Desktop UI"
        >
          <span>🪟</span>
          <span>Windows UI</span>
        </button>

        {onOpenVoice && (
          <button
            onClick={onOpenVoice}
            style={{
              width: 30, height: 30, borderRadius: "50%",
              background: "rgba(239, 159, 39, 0.12)",
              border: `1px solid rgba(239, 159, 39, 0.25)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
            title="Voice AI"
          >
            <span style={{ fontSize: 13 }}>🎙️</span>
          </button>
        )}
      </div>
    </div>
  );
}

