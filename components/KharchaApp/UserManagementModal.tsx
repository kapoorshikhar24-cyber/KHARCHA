"use client";

import React, { useState } from "react";
import { TOKEN } from "./Styles";
import { UserProfile, Settings, UserIntegrationItem } from "./Types";
import enterpriseStorage from "./EnterpriseStorage";
import { triggerHaptic } from "./Utils";

interface UserManagementModalProps {
  user: UserProfile;
  settings: Settings;
  isOpen: boolean;
  onClose: () => void;
  onUpdateUser: (updatedUser: Partial<UserProfile>) => void;
  onUpdateSettings: (newSettings: Partial<Settings>) => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
}

type TabType = "profile" | "preferences" | "integrations" | "security";

const AVATAR_OPTIONS = ["🧑‍💻", "👨‍💼", "👩‍💼", "🦊", "🦁", "🚀", "💎", "⭐", "💼", "🌴"];
const CURRENCIES: { symbol: "₹" | "$" | "€" | "£"; label: string }[] = [
  { symbol: "₹", label: "₹ INR (Indian Rupee)" },
  { symbol: "$", label: "$ USD (US Dollar)" },
  { symbol: "€", label: "€ EUR (Euro)" },
  { symbol: "£", label: "£ GBP (British Pound)" },
];

export default function UserManagementModal({
  user,
  settings,
  isOpen,
  onClose,
  onUpdateUser,
  onUpdateSettings,
  onSignOut,
  onDeleteAccount,
}: UserManagementModalProps) {
  const isLight = settings.theme === "light";
  const [activeTab, setActiveTab] = useState<TabType>("profile");

  // Profile form state
  const [name, setName] = useState(user.name || "");
  const [displayName, setDisplayName] = useState(user.displayName || user.name || "");
  const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber || "");
  const [country, setCountry] = useState(user.country || "IN");
  const [timezone, setTimezone] = useState(user.timezone || "Asia/Kolkata");
  const [avatar, setAvatar] = useState(user.avatar || "🧑‍💻");

  // Preferences form state
  const [currency, setCurrency] = useState<"₹" | "$" | "€" | "£">((settings.currency as any) || "₹");
  const [monthlyBudget, setMonthlyBudget] = useState(settings.monthlyBudget?.toString() || "50000");
  const [dailyBudget, setDailyBudget] = useState(settings.dailyBudget?.toString() || "2000");
  const [resetDay, setResetDay] = useState(settings.monthlyResetDay?.toString() || "1");

  // Status & confirmation state
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInputText, setDeleteInputText] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    setIsSaving(true);
    triggerHaptic("light");

    const payload = {
      name,
      displayName,
      phoneNumber,
      country,
      timezone,
      avatar,
    };

    const res = await enterpriseStorage.updateUserProfile(user.id, payload);
    setIsSaving(false);

    if (res.success) {
      triggerHaptic("success");
      setStatusMsg({ type: "success", text: "Profile updated successfully!" });
      onUpdateUser(payload);
    } else {
      triggerHaptic("error");
      setStatusMsg({ type: "error", text: res.error || "Failed to update profile." });
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    setIsSaving(true);
    triggerHaptic("light");

    const newSettings: Partial<Settings> = {
      currency: currency as any,
      monthlyBudget: parseFloat(monthlyBudget) || 50000,
      dailyBudget: parseFloat(dailyBudget) || 2000,
      monthlyResetDay: parseInt(resetDay, 10) || 1,
    };

    try {
      await enterpriseStorage.syncSettings(user.id, newSettings);
      onUpdateSettings(newSettings);
      setIsSaving(false);
      triggerHaptic("success");
      setStatusMsg({ type: "success", text: "Preferences saved successfully!" });
    } catch (err: any) {
      setIsSaving(false);
      triggerHaptic("error");
      setStatusMsg({ type: "error", text: err.message || "Failed to save preferences." });
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    triggerHaptic("light");
    const success = await enterpriseStorage.exportUserData(user.id);
    setIsExporting(false);
    if (success) {
      triggerHaptic("success");
      setStatusMsg({ type: "success", text: "Personal data exported as JSON." });
    } else {
      triggerHaptic("error");
      setStatusMsg({ type: "error", text: "Export failed. Please try again." });
    }
  };

  const handleDeleteAccountConfirm = async () => {
    if (deleteInputText.trim() !== user.email && deleteInputText.trim() !== "DELETE") {
      setStatusMsg({ type: "error", text: "Please type DELETE or your email to confirm deletion." });
      return;
    }
    setIsSaving(true);
    triggerHaptic("error");
    const success = await enterpriseStorage.deleteUser(user.id);
    setIsSaving(false);
    if (success) {
      onDeleteAccount();
    } else {
      setStatusMsg({ type: "error", text: "Failed to delete account. Please try again." });
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: isLight ? "#FFFFFF" : "#121216",
          color: isLight ? "#0F172A" : "#F8FAFC",
          borderRadius: 24,
          maxWidth: 680,
          width: "100%",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.5)",
          border: `1px solid ${isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.08)"}`,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: `1px solid ${isLight ? "#E2E8F0" : "rgba(255,255,255,0.08)"}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 28 }}>{avatar}</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Account & Settings Hub</h3>
              <div style={{ fontSize: 12, color: isLight ? "#64748B" : "#94A3B8" }}>
                {user.email || "Offline User"} • Member since {new Date(user.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 18,
              cursor: "pointer",
              color: isLight ? "#64748B" : "#94A3B8",
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            borderBottom: `1px solid ${isLight ? "#E2E8F0" : "rgba(255,255,255,0.08)"}`,
            background: isLight ? "#F8FAFC" : "rgba(255,255,255,0.02)",
            padding: "0 16px",
            gap: 8,
          }}
        >
          {(
            [
              { id: "profile", label: "👤 Profile" },
              { id: "preferences", label: "⚙️ Preferences" },
              { id: "integrations", label: "🔌 Integrations" },
              { id: "security", label: "🛡️ Account & Data" },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusMsg(null);
                  setActiveTab(tab.id);
                }}
                style={{
                  padding: "12px 14px",
                  border: "none",
                  borderBottom: isActive ? `2px solid ${TOKEN.amber}` : "2px solid transparent",
                  background: "none",
                  color: isActive ? TOKEN.amber : isLight ? "#64748B" : "#94A3B8",
                  fontWeight: isActive ? 700 : 500,
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Status Alert */}
        {statusMsg && (
          <div
            style={{
              margin: "12px 24px 0",
              padding: "8px 14px",
              borderRadius: 10,
              fontSize: 12.5,
              background: statusMsg.type === "success" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
              color: statusMsg.type === "success" ? "#10B981" : "#EF4444",
              border: `1px solid ${statusMsg.type === "success" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
            }}
          >
            {statusMsg.text}
          </div>
        )}

        {/* Tab Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {/* ── TAB 1: PROFILE ────────────────────────────────────────────── */}
          {activeTab === "profile" && (
            <form onSubmit={handleSaveProfile} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Avatar Selector */}
              <div>
                <label style={labelStyle(isLight)}>Profile Badge Avatar</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                  {AVATAR_OPTIONS.map((av) => (
                    <button
                      key={av}
                      type="button"
                      onClick={() => setAvatar(av)}
                      style={{
                        width: 40,
                        height: 40,
                        fontSize: 20,
                        borderRadius: 10,
                        border: avatar === av ? `2px solid ${TOKEN.amber}` : `1px solid ${isLight ? "#E2E8F0" : "rgba(255,255,255,0.08)"}`,
                        background: avatar === av ? "rgba(217, 119, 6, 0.15)" : isLight ? "#F8FAFC" : "rgba(255,255,255,0.03)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle(isLight)}>Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    style={inputBoxStyle(isLight)}
                  />
                </div>
                <div>
                  <label style={labelStyle(isLight)}>Display Nickname</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    style={inputBoxStyle(isLight)}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle(isLight)}>Mobile Phone</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+91 9876543210"
                    style={inputBoxStyle(isLight)}
                  />
                </div>
                <div>
                  <label style={labelStyle(isLight)}>Time Zone</label>
                  <input
                    type="text"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    style={inputBoxStyle(isLight)}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button type="submit" disabled={isSaving} style={primaryBtnStyle}>
                  {isSaving ? "Saving Changes..." : "Save Profile"}
                </button>
              </div>
            </form>
          )}

          {/* ── TAB 2: PREFERENCES ────────────────────────────────────────── */}
          {activeTab === "preferences" && (
            <form onSubmit={handleSavePreferences} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={labelStyle(isLight)}>Preferred Currency</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
                  {CURRENCIES.map((c) => {
                    const isSel = currency === c.symbol;
                    return (
                      <button
                        key={c.symbol}
                        type="button"
                        onClick={() => setCurrency(c.symbol)}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          textAlign: "left",
                          border: isSel ? `2px solid ${TOKEN.amber}` : `1px solid ${isLight ? "#E2E8F0" : "rgba(255,255,255,0.08)"}`,
                          background: isSel ? "rgba(217, 119, 6, 0.12)" : isLight ? "#F8FAFC" : "rgba(255,255,255,0.03)",
                          color: isSel ? TOKEN.amber : isLight ? "#0F172A" : "#F8FAFC",
                          fontWeight: isSel ? 700 : 500,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={labelStyle(isLight)}>Monthly Budget ({currency})</label>
                  <input
                    type="number"
                    value={monthlyBudget}
                    onChange={(e) => setMonthlyBudget(e.target.value)}
                    style={inputBoxStyle(isLight)}
                  />
                </div>
                <div>
                  <label style={labelStyle(isLight)}>Daily Budget ({currency})</label>
                  <input
                    type="number"
                    value={dailyBudget}
                    onChange={(e) => setDailyBudget(e.target.value)}
                    style={inputBoxStyle(isLight)}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle(isLight)}>Monthly Budget Reset Day</label>
                <select
                  value={resetDay}
                  onChange={(e) => setResetDay(e.target.value)}
                  style={inputBoxStyle(isLight)}
                >
                  <option value="1">1st of Month</option>
                  <option value="5">5th of Month</option>
                  <option value="10">10th of Month</option>
                  <option value="15">15th of Month</option>
                  <option value="25">25th of Month</option>
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button type="submit" disabled={isSaving} style={primaryBtnStyle}>
                  {isSaving ? "Saving..." : "Save Preferences"}
                </button>
              </div>
            </form>
          )}

          {/* ── TAB 3: INTEGRATIONS ───────────────────────────────────────── */}
          {activeTab === "integrations" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={featureBoxStyle(isLight)}>
                <span style={{ fontSize: 26 }}>📱</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>Android Bank SMS Tracking</div>
                  <div style={{ fontSize: 12, color: isLight ? "#64748B" : "#94A3B8" }}>
                    Paired Android devices process transactional SMS locally and push expense records.
                  </div>
                </div>
                <span style={{ padding: "4px 8px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: "rgba(16,185,129,0.15)", color: "#10B981" }}>
                  Active
                </span>
              </div>

              <div style={featureBoxStyle(isLight)}>
                <span style={{ fontSize: 26 }}>☁️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>Relational Database Cloud Sync</div>
                  <div style={{ fontSize: 12, color: isLight ? "#64748B" : "#94A3B8" }}>
                    ACID-compliant relational sync backed by Prisma ORM.
                  </div>
                </div>
                <span style={{ padding: "4px 8px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: "rgba(16,185,129,0.15)", color: "#10B981" }}>
                  Connected
                </span>
              </div>
            </div>
          )}

          {/* ── TAB 4: SECURITY & ACCOUNT DATA ────────────────────────────── */}
          {activeTab === "security" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Export Data */}
              <div style={featureBoxStyle(isLight)}>
                <span style={{ fontSize: 26 }}>📦</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>Export Financial Data</div>
                  <div style={{ fontSize: 12, color: isLight ? "#64748B" : "#94A3B8" }}>
                    Download a full JSON archive of all your expenses, wallets, and audit logs.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleExportData}
                  disabled={isExporting}
                  style={secondaryBtnStyle(isLight)}
                >
                  {isExporting ? "Exporting..." : "Export JSON"}
                </button>
              </div>

              {/* Log Out */}
              <div style={featureBoxStyle(isLight)}>
                <span style={{ fontSize: 26 }}>🚪</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>Sign Out</div>
                  <div style={{ fontSize: 12, color: isLight ? "#64748B" : "#94A3B8" }}>
                    End active session and return to the login screen.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    background: "rgba(239, 68, 68, 0.12)",
                    color: "#EF4444",
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: "pointer",
                  }}
                >
                  Sign Out
                </button>
              </div>

              {/* Account Deletion */}
              <div
                style={{
                  padding: 16,
                  borderRadius: 14,
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  background: "rgba(239, 68, 68, 0.05)",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: "#EF4444", marginBottom: 4 }}>
                  ⚠️ Danger Zone: Delete Account
                </div>
                <div style={{ fontSize: 12, color: isLight ? "#64748B" : "#94A3B8", lineHeight: 1.4, marginBottom: 12 }}>
                  Permanently erase your account, transaction ledger, wallets, and category settings. This action cannot be undone.
                </div>

                {!showDeleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "none",
                      background: "#EF4444",
                      color: "#FFFFFF",
                      fontWeight: 700,
                      fontSize: 12.5,
                      cursor: "pointer",
                    }}
                  >
                    Request Account Deletion
                  </button>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>
                      Type <strong>DELETE</strong> to confirm permanent deletion:
                    </div>
                    <input
                      type="text"
                      value={deleteInputText}
                      onChange={(e) => setDeleteInputText(e.target.value)}
                      placeholder="DELETE"
                      style={inputBoxStyle(isLight)}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={handleDeleteAccountConfirm}
                        disabled={isSaving}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 10,
                          border: "none",
                          background: "#DC2626",
                          color: "#FFFFFF",
                          fontWeight: 700,
                          fontSize: 12.5,
                          cursor: "pointer",
                        }}
                      >
                        {isSaving ? "Deleting..." : "Permanently Delete Account"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowDeleteConfirm(false);
                          setDeleteInputText("");
                        }}
                        style={secondaryBtnStyle(isLight)}
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
      </div>
    </div>
  );
}

// ─── Inline Styles ──────────────────────────────────────────────────────────
const labelStyle = (isLight: boolean): React.CSSProperties => ({
  display: "block",
  fontSize: 11.5,
  fontWeight: 700,
  color: isLight ? "#475569" : "#94A3B8",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
});

const inputBoxStyle = (isLight: boolean): React.CSSProperties => ({
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)"}`,
  background: isLight ? "#F8FAFC" : "rgba(255,255,255,0.04)",
  color: isLight ? "#0F172A" : "#F8FAFC",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  fontWeight: 500,
});

const featureBoxStyle = (isLight: boolean): React.CSSProperties => ({
  display: "flex",
  gap: 14,
  alignItems: "center",
  padding: "14px 16px",
  borderRadius: 14,
  background: isLight ? "#F8FAFC" : "rgba(255,255,255,0.03)",
  border: `1px solid ${isLight ? "#E2E8F0" : "rgba(255,255,255,0.06)"}`,
});

const primaryBtnStyle: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 12,
  border: "none",
  background: "linear-gradient(135deg, #D97706 0%, #EA580C 100%)",
  color: "#FFFFFF",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};

const secondaryBtnStyle = (isLight: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  borderRadius: 10,
  border: `1px solid ${isLight ? "#CBD5E1" : "rgba(255,255,255,0.12)"}`,
  background: isLight ? "#FFFFFF" : "rgba(255,255,255,0.04)",
  color: isLight ? "#475569" : "#CBD5E1",
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
});
