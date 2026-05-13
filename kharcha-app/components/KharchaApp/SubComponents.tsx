"use client";
// SubComponents.tsx — Reusable UI widgets for Kharcha

import { useState, useEffect, CSSProperties } from "react";
import type { Expense } from "./Types";
import { S, TOKEN } from "./Styles";
import { CATEGORIES, DAY_LABELS } from "./Constants";
import { fmt, dateLabel } from "./Utils";

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
        <span style={{ color: TOKEN.dim, fontSize: 12 }}>▲</span>
        <span style={{ color: TOKEN.dim, fontSize: 12 }}>▮</span>
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
export function FingerprintIcon({ size = 40, color = TOKEN.amber }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c0-4.4 3.6-8 8-8s8 3.6 8 8" />
      <path d="M5 15c0-2.8 2.2-5 5-5s5 2.2 5 5" />
      <path d="M8 18c0-1.1.9-2 2-2s2 .9 2 2" />
      <path d="M11 20c0-6.6 5.4-12 12-12" />
      <path d="M14 22c0-9.9 8.1-18 18-18" />
      <path d="M2 12v1" />
      <path d="M5 15v1" />
      <path d="M8 18v1" />
      <path d="M11 20v1" />
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

// ─── ExpenseRow ───────────────────────────────────────────────────────────────
interface ExpenseRowProps {
  expense: Expense;
  onDelete: (id: string) => void;
}

export function ExpenseRow({ expense, onDelete }: ExpenseRowProps) {
  const [swiped, setSwiped] = useState(false);
  const cat = CATEGORIES.find((c) => c.id === expense.category) ?? CATEGORIES[0];

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
        <span style={{ fontSize: 18 }}>{cat.icon}</span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: TOKEN.textSub, fontSize: 13 }}>
          {expense.note || cat.label}
        </div>
        <div style={{ color: TOKEN.muted, fontSize: 11, marginTop: 2 }}>
          {cat.label} •{" "}
          {new Date(expense.createdAt).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
      <div
        style={{
          color: TOKEN.text,
          fontSize: 13,
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

export function CategoryBar({ icon, label, color, total, max }: CategoryBarProps) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 14 }}>{icon}</span>
          <span style={{ color: TOKEN.textFaint, fontSize: 12 }}>{label}</span>
        </div>
        <span
          style={{ color: TOKEN.textFaint, fontSize: 12, fontFamily: TOKEN.mono }}
        >
          {fmt(total)}
        </span>
      </div>
      <div style={{ height: 5, background: "#22222C", borderRadius: 3 }}>
        <div
          style={{
            width: `${Math.round((total / max) * 100)}%`,
            height: "100%",
            background: color,
            borderRadius: 3,
            transition: "width 0.4s",
          }}
        />
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

export function BudgetCard({ total, budget, count, period }: BudgetCardProps) {
  const pct = Math.min(100, Math.round((total / budget) * 100));
  const over = pct > 90;

  return (
    <div style={S.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={S.label}>Total spent</div>
          <div
            style={{
              fontSize: 38,
              fontWeight: 500,
              color: TOKEN.text,
              fontFamily: TOKEN.mono,
              letterSpacing: -1,
            }}
          >
            {fmt(total)}
          </div>
          <div style={{ color: TOKEN.muted, fontSize: 12, marginTop: 4 }}>
            {count} expense{count !== 1 ? "s" : ""}
          </div>
        </div>

        {period === "today" && (
          <div style={{ textAlign: "right" }}>
            <div style={S.label}>Daily Budget</div>
            <div
              style={{
                color: TOKEN.amber,
                fontSize: 18,
                fontWeight: 500,
                fontFamily: TOKEN.mono,
              }}
            >
              {fmt(budget)}
            </div>
            <div
              style={{
                width: 80,
                height: 5,
                background: "#22222C",
                borderRadius: 3,
                marginTop: 6,
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: over ? "#D85A30" : TOKEN.amber,
                  borderRadius: 3,
                  transition: "width 0.4s",
                }}
              />
            </div>
            <div style={{ color: TOKEN.muted, fontSize: 11, marginTop: 3 }}>
              {pct}% used
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
