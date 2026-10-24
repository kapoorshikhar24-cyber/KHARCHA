"use client";

import React, { useState, useEffect } from "react";
import { TOKEN } from "./Styles";
import { UserProfile, Settings, Category, Wallet } from "./Types";
import enterpriseStorage from "./EnterpriseStorage";
import { triggerHaptic } from "./Utils";

interface OnboardingFlowProps {
  user: UserProfile;
  initialSettings?: Settings | null;
  theme?: "dark" | "light";
  onComplete: (updatedUser: UserProfile, updatedSettings?: Settings) => void;
  onSkipAll?: () => void;
}

const CURRENCIES: { symbol: "₹" | "$" | "€" | "£"; label: string; code: string }[] = [
  { symbol: "₹", label: "₹ INR (Indian Rupee)", code: "INR" },
  { symbol: "$", label: "$ USD (US Dollar)", code: "USD" },
  { symbol: "€", label: "€ EUR (Euro)", code: "EUR" },
  { symbol: "£", label: "£ GBP (British Pound)", code: "GBP" },
];

const AVATAR_OPTIONS = [
  "🧑‍💻", "👨‍💼", "👩‍💼", "🦊", "🦁", "🚀", "💎", "⭐", "💼", "🌴"
];

const COUNTRIES = [
  { code: "IN", name: "🇮🇳 India (+91)" },
  { code: "US", name: "🇺🇸 United States (+1)" },
  { code: "GB", name: "🇬🇧 United Kingdom (+44)" },
  { code: "AE", name: "🇦🇪 United Arab Emirates (+971)" },
  { code: "SG", name: "🇸🇬 Singapore (+65)" },
  { code: "AU", name: "🇦🇺 Australia (+61)" },
  { code: "DE", name: "🇩🇪 Germany (+49)" },
  { code: "CA", name: "🇨🇦 Canada (+1)" },
];

export default function OnboardingFlow({
  user,
  initialSettings,
  theme = "dark",
  onComplete,
  onSkipAll,
}: OnboardingFlowProps) {
  const isLight = theme === "light";

  // Step state (1 to 6)
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [skippedSteps, setSkippedSteps] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Step 2: Profile fields
  const [fullName, setFullName] = useState(user.name || "");
  const [displayName, setDisplayName] = useState(user.displayName || user.name?.split(" ")[0] || "");
  const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber || "");
  const [country, setCountry] = useState(user.country || "IN");
  const [timezone, setTimezone] = useState(user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata");
  const [selectedAvatar, setSelectedAvatar] = useState(user.avatar || "🧑‍💻");

  // Step 3: Financial preferences
  const [currency, setCurrency] = useState<"₹" | "$" | "€" | "£">((initialSettings?.currency as any) || "₹");
  const [monthlyBudget, setMonthlyBudget] = useState(initialSettings?.monthlyBudget?.toString() || "50000");
  const [dailyBudget, setDailyBudget] = useState(initialSettings?.dailyBudget?.toString() || "2000");
  const [monthlyResetDay, setMonthlyResetDay] = useState(initialSettings?.monthlyResetDay?.toString() || "1");

  // Step 4: Integrations & permissions
  const [enableSms, setEnableSms] = useState(true);
  const [enablePush, setEnablePush] = useState(true);
  const [enableSync, setEnableSync] = useState(true);

  // Step 6 celebration
  const [celebrate, setCelebrate] = useState(false);

  // Load persistent onboarding state on mount
  useEffect(() => {
    let cancelled = false;
    async function loadProgress() {
      const res = await enterpriseStorage.getOnboardingState(user.id);
      if (!cancelled && res && res.onboarding) {
        if (res.onboarding.currentStep && res.onboarding.currentStep >= 1 && res.onboarding.currentStep <= 6) {
          setCurrentStep(res.onboarding.currentStep);
        }
        if (Array.isArray(res.onboarding.completedSteps)) {
          setCompletedSteps(res.onboarding.completedSteps);
        }
        if (Array.isArray(res.onboarding.skippedOptionalSteps)) {
          setSkippedSteps(res.onboarding.skippedOptionalSteps);
        }
        if (res.user) {
          if (res.user.displayName) setDisplayName(res.user.displayName);
          if (res.user.phoneNumber) setPhoneNumber(res.user.phoneNumber);
          if (res.user.timezone) setTimezone(res.user.timezone);
          if (res.user.avatar) setSelectedAvatar(res.user.avatar);
        }
        if (res.settings) {
          if (res.settings.currency) setCurrency(res.settings.currency as any);
          if (res.settings.monthlyBudget) setMonthlyBudget(res.settings.monthlyBudget.toString());
          if (res.settings.dailyBudget) setDailyBudget(res.settings.dailyBudget.toString());
        }
      }
    }
    loadProgress();
    return () => { cancelled = true; };
  }, [user.id]);

  // Step navigation & auto-save
  const goToStep = async (
    targetStep: number,
    stepKey?: string,
    isSkipped: boolean = false
  ) => {
    setErrorMsg(null);
    setIsSaving(true);
    triggerHaptic("light");

    const payload: any = {
      userId: user.id,
      step: targetStep,
      stepKey,
      isCompleted: !isSkipped,
      isSkipped,
      isFinalStep: targetStep === 6,
    };

    if (currentStep === 2) {
      payload.profileData = {
        name: fullName,
        displayName,
        phoneNumber,
        country,
        timezone,
        avatar: selectedAvatar,
      };
    } else if (currentStep === 3) {
      payload.preferencesData = {
        currency,
        monthlyBudget: parseFloat(monthlyBudget) || 50000,
        dailyBudget: parseFloat(dailyBudget) || 2000,
        monthlyResetDay: parseInt(monthlyResetDay, 10) || 1,
      };
    } else if (currentStep === 4) {
      payload.integrationsData = [
        {
          integrationType: "sms_detection",
          connectionStatus: enableSms ? "connected" : "disconnected",
          consentStatus: enableSms ? "granted" : "skipped",
        },
        {
          integrationType: "push_notifications",
          connectionStatus: enablePush ? "connected" : "disconnected",
          consentStatus: enablePush ? "granted" : "skipped",
        },
        {
          integrationType: "cloud_sync",
          connectionStatus: enableSync ? "connected" : "disconnected",
          consentStatus: enableSync ? "granted" : "skipped",
        },
      ];
    }

    const saveRes = await enterpriseStorage.saveOnboardingStep(payload);
    setIsSaving(false);

    if (saveRes && !saveRes.success && saveRes.error) {
      setErrorMsg(saveRes.error);
      return;
    }

    if (stepKey) {
      if (isSkipped) {
        setSkippedSteps((prev) => Array.from(new Set([...prev, stepKey])));
      } else {
        setCompletedSteps((prev) => Array.from(new Set([...prev, stepKey])));
      }
    }

    setCurrentStep(targetStep);
    if (targetStep === 6) {
      setCelebrate(true);
      triggerHaptic("success");
    }
  };

  const handleFinishOnboarding = () => {
    triggerHaptic("success");
    const updatedUser: UserProfile = {
      ...user,
      name: fullName,
      displayName,
      phoneNumber,
      country,
      timezone,
      avatar: selectedAvatar,
      isProfileCompleted: true,
      onboardingStatus: "completed",
    };

    const updatedSettings: Settings = {
      theme: initialSettings?.theme || "dark",
      biometric: initialSettings?.biometric ?? false,
      pin: initialSettings?.pin ?? false,
      pinCode: initialSettings?.pinCode || "1234",
      voice: initialSettings?.voice ?? true,
      haptic: initialSettings?.haptic ?? true,
      offline: initialSettings?.offline ?? true,
      dailyBudget: parseFloat(dailyBudget) || 2000,
      monthlyBudget: parseFloat(monthlyBudget) || 50000,
      monthlyResetDay: parseInt(monthlyResetDay, 10) || 1,
      userName: fullName,
      userEmail: user.email || "",
      profileImage: selectedAvatar,
      currency: currency as any,
    };

    onComplete(updatedUser, updatedSettings);
  };

  // Stepper Header items
  const stepsInfo = [
    { num: 1, key: "welcome", title: "Welcome" },
    { num: 2, key: "profile", title: "Profile" },
    { num: 3, key: "preferences", title: "Preferences" },
    { num: 4, key: "integrations", title: "Integrations" },
    { num: 5, key: "review", title: "Review" },
    { num: 6, key: "complete", title: "Complete" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: isLight
          ? "linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)"
          : "radial-gradient(ellipse at 50% 20%, #1A1A24 0%, #09090B 100%)",
        color: isLight ? "#0F172A" : "#F8FAFC",
        padding: "32px 16px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          background: isLight ? "#FFFFFF" : "#121216",
          border: `1px solid ${isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`,
          borderRadius: 24,
          boxShadow: isLight
            ? "0 25px 50px -12px rgba(0, 0, 0, 0.08)"
            : "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
          padding: "32px 28px",
          boxSizing: "border-box",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Top Progress Indicator */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: TOKEN.amber }}>
              Step {currentStep} of 6 • {stepsInfo[currentStep - 1]?.title}
            </span>
            <span style={{ fontSize: 11, color: isLight ? "#64748B" : "#94A3B8" }}>
              {Math.round((currentStep / 6) * 100)}% Complete
            </span>
          </div>

          <div
            style={{
              height: 6,
              width: "100%",
              background: isLight ? "#E2E8F0" : "rgba(255,255,255,0.08)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(currentStep / 6) * 100}%`,
                background: "linear-gradient(90deg, #D97706 0%, #F59E0B 100%)",
                transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />
          </div>

          {/* Stepper Dots */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            {stepsInfo.map((s) => {
              const isPast = currentStep > s.num;
              const isCurr = currentStep === s.num;
              return (
                <div
                  key={s.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 10,
                    fontWeight: isCurr ? 700 : 500,
                    color: isCurr ? TOKEN.amber : isPast ? "#10B981" : isLight ? "#94A3B8" : "#64748B",
                  }}
                >
                  <span style={{
                    width: 14, height: 14, borderRadius: "50%",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9,
                    background: isCurr ? TOKEN.amber : isPast ? "#10B981" : "transparent",
                    color: isCurr || isPast ? "#FFFFFF" : isLight ? "#94A3B8" : "#64748B",
                    border: isPast || isCurr ? "none" : `1px solid ${isLight ? "#CBD5E1" : "rgba(255,255,255,0.2)"}`
                  }}>
                    {isPast ? "✓" : s.num}
                  </span>
                  <span className="hidden sm:inline" style={{ display: "none" }}>{s.title}</span>
                </div>
              );
            })}
          </div>
        </div>

        {errorMsg && (
          <div
            style={{
              padding: "10px 14px",
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 12,
              color: "#EF4444",
              fontSize: 12.5,
              marginBottom: 18,
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* ─── STEP 1: WELCOME SCREEN ────────────────────────────────────────── */}
        {currentStep === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{ fontSize: 44, marginBottom: 8 }}>👋</div>
              <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>
                Welcome, {user.displayName || user.name || "Explorer"}!
              </h2>
              <p style={{ fontSize: 13.5, lineHeight: 1.5, color: isLight ? "#64748B" : "#94A3B8", margin: 0 }}>
                Let&apos;s set up your private financial control center in about <strong>2 minutes</strong>.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 12,
                margin: "4px 0",
              }}
            >
              <div style={featureBoxStyle(isLight)}>
                <span style={{ fontSize: 22 }}>🔒</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>Private & Offline-First</div>
                  <div style={{ fontSize: 12, color: isLight ? "#64748B" : "#94A3B8" }}>
                    Your data stays under your control. We never store bank passwords or UPI PINs.
                  </div>
                </div>
              </div>

              <div style={featureBoxStyle(isLight)}>
                <span style={{ fontSize: 22 }}>⚡</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>Smart SMS Tracking</div>
                  <div style={{ fontSize: 12, color: isLight ? "#64748B" : "#94A3B8" }}>
                    Optional Android SMS transaction detection to log debit alerts automatically.
                  </div>
                </div>
              </div>

              <div style={featureBoxStyle(isLight)}>
                <span style={{ fontSize: 22 }}>📊</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>Tailored Budgets & Analytics</div>
                  <div style={{ fontSize: 12, color: isLight ? "#64748B" : "#94A3B8" }}>
                    Track daily spending thresholds, multi-wallet balances, and category caps.
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
              <button
                type="button"
                onClick={() => goToStep(2, "welcome")}
                disabled={isSaving}
                style={primaryBtnStyle}
              >
                {isSaving ? "Saving..." : "Get Started →"}
              </button>
              <button
                type="button"
                onClick={() => goToStep(5, "welcome_skipped", true)}
                style={secondaryBtnStyle(isLight)}
              >
                Skip Setup
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 2: PERSONAL PROFILE ──────────────────────────────────────── */}
        {currentStep === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Personal Profile</h2>
              <p style={{ fontSize: 12.5, color: isLight ? "#64748B" : "#94A3B8", margin: 0 }}>
                How would you like to be addressed across your reports and dashboard?
              </p>
            </div>

            {/* Avatar Selection */}
            <div>
              <label style={labelStyle(isLight)}>Choose Avatar Badge</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                {AVATAR_OPTIONS.map((av) => (
                  <button
                    key={av}
                    type="button"
                    onClick={() => setSelectedAvatar(av)}
                    style={{
                      width: 44,
                      height: 44,
                      fontSize: 22,
                      borderRadius: 12,
                      border: selectedAvatar === av ? `2px solid ${TOKEN.amber}` : `1px solid ${isLight ? "#E2E8F0" : "rgba(255,255,255,0.1)"}`,
                      background: selectedAvatar === av ? "rgba(217, 119, 6, 0.15)" : isLight ? "#F8FAFC" : "rgba(255,255,255,0.04)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "transform 0.1s ease",
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
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Alex Mercer"
                  style={inputBoxStyle(isLight)}
                />
              </div>

              <div>
                <label style={labelStyle(isLight)}>Display Name / Nickname</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Alex"
                  style={inputBoxStyle(isLight)}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle(isLight)}>Country / Region</label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  style={inputBoxStyle(isLight)}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle(isLight)}>Time Zone</label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="e.g. Asia/Kolkata"
                  style={inputBoxStyle(isLight)}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle(isLight)}>Mobile Phone (Optional for SMS Sync)</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+91 98765 43210"
                style={inputBoxStyle(isLight)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <button
                type="button"
                onClick={() => goToStep(1)}
                style={secondaryBtnStyle(isLight)}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => goToStep(3, "profile")}
                disabled={isSaving}
                style={primaryBtnStyle}
              >
                Continue to Preferences →
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 3: FINANCIAL PREFERENCES ──────────────────────────────────── */}
        {currentStep === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Financial Preferences</h2>
              <p style={{ fontSize: 12.5, color: isLight ? "#64748B" : "#94A3B8", margin: 0 }}>
                Configure currency format and baseline budget limits for your account.
              </p>
            </div>

            {/* Currency Choice */}
            <div>
              <label style={labelStyle(isLight)}>Preferred Currency</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
                {CURRENCIES.map((c) => {
                  const isSel = currency === c.symbol;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => setCurrency(c.symbol)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        textAlign: "left",
                        border: isSel ? `2px solid ${TOKEN.amber}` : `1px solid ${isLight ? "#E2E8F0" : "rgba(255,255,255,0.08)"}`,
                        background: isSel ? "rgba(217, 119, 6, 0.12)" : isLight ? "#F8FAFC" : "rgba(255,255,255,0.03)",
                        cursor: "pointer",
                        color: isSel ? TOKEN.amber : isLight ? "#0F172A" : "#F8FAFC",
                        fontWeight: isSel ? 700 : 500,
                        fontSize: 13,
                        transition: "all 0.15s ease",
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
                <label style={labelStyle(isLight)}>Monthly Budget Target ({currency})</label>
                <input
                  type="number"
                  value={monthlyBudget}
                  onChange={(e) => setMonthlyBudget(e.target.value)}
                  placeholder="50000"
                  style={inputBoxStyle(isLight)}
                />
              </div>

              <div>
                <label style={labelStyle(isLight)}>Daily Budget Cap ({currency})</label>
                <input
                  type="number"
                  value={dailyBudget}
                  onChange={(e) => setDailyBudget(e.target.value)}
                  placeholder="2000"
                  style={inputBoxStyle(isLight)}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle(isLight)}>Monthly Budget Reset Day</label>
              <select
                value={monthlyResetDay}
                onChange={(e) => setMonthlyResetDay(e.target.value)}
                style={inputBoxStyle(isLight)}
              >
                <option value="1">1st of every month (Standard)</option>
                <option value="5">5th of every month</option>
                <option value="10">10th of every month (Salary Cycle)</option>
                <option value="15">15th of every month</option>
                <option value="25">25th of every month</option>
              </select>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <button
                type="button"
                onClick={() => goToStep(2)}
                style={secondaryBtnStyle(isLight)}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => goToStep(4, "preferences")}
                disabled={isSaving}
                style={primaryBtnStyle}
              >
                Continue to Integrations →
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 4: PERMISSIONS & INTEGRATIONS ────────────────────────────── */}
        {currentStep === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Integrations & Sync</h2>
              <p style={{ fontSize: 12.5, color: isLight ? "#64748B" : "#94A3B8", margin: 0 }}>
                Automate your financial tracking. All integrations are optional and strictly private.
              </p>
            </div>

            {/* Android SMS detection */}
            <div style={featureBoxStyle(isLight)}>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 24 }}>📱</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>Android Bank SMS Tracking</div>
                    <div style={{ fontSize: 11.5, color: isLight ? "#64748B" : "#94A3B8" }}>
                      Local on-device parser detects transactional debits. No credentials needed.
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={enableSms}
                  onChange={(e) => setEnableSms(e.target.checked)}
                  style={{ width: 20, height: 20, accentColor: TOKEN.amber, cursor: "pointer" }}
                />
              </div>
            </div>

            {/* Push Notifications */}
            <div style={featureBoxStyle(isLight)}>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 24 }}>🔔</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>Budget Overrun Alerts</div>
                    <div style={{ fontSize: 11.5, color: isLight ? "#64748B" : "#94A3B8" }}>
                      Get notified when daily or monthly category limits are reached.
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={enablePush}
                  onChange={(e) => setEnablePush(e.target.checked)}
                  style={{ width: 20, height: 20, accentColor: TOKEN.amber, cursor: "pointer" }}
                />
              </div>
            </div>

            {/* Cloud Sync */}
            <div style={featureBoxStyle(isLight)}>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 24 }}>☁️</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>Multi-Device Cloud Sync</div>
                    <div style={{ fontSize: 11.5, color: isLight ? "#64748B" : "#94A3B8" }}>
                      Keep web, desktop, and mobile synchronized securely.
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={enableSync}
                  onChange={(e) => setEnableSync(e.target.checked)}
                  style={{ width: 20, height: 20, accentColor: TOKEN.amber, cursor: "pointer" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <button
                type="button"
                onClick={() => goToStep(3)}
                style={secondaryBtnStyle(isLight)}
              >
                ← Back
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => goToStep(5, "integrations_skipped", true)}
                  style={secondaryBtnStyle(isLight)}
                >
                  Skip for Now
                </button>
                <button
                  type="button"
                  onClick={() => goToStep(5, "integrations")}
                  disabled={isSaving}
                  style={primaryBtnStyle}
                >
                  Review Summary →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 5: REVIEW & CONFIRMATION ─────────────────────────────────── */}
        {currentStep === 5 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Review & Confirm</h2>
              <p style={{ fontSize: 12.5, color: isLight ? "#64748B" : "#94A3B8", margin: 0 }}>
                Double check your setup before launching your financial dashboard.
              </p>
            </div>

            {/* Profile Review Card */}
            <div style={featureBoxStyle(isLight)}>
              <div style={{ width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>👤 Profile Details</span>
                  <button
                    type="button"
                    onClick={() => goToStep(2)}
                    style={{ background: "none", border: "none", color: TOKEN.amber, fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                  >
                    Edit
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
                  <span style={{ fontSize: 28 }}>{selectedAvatar}</span>
                  <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                    <div><strong>{fullName}</strong> ({displayName})</div>
                    <div style={{ color: isLight ? "#64748B" : "#94A3B8" }}>
                      {country} • {timezone} {phoneNumber ? `• ${phoneNumber}` : ""}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Preferences Review Card */}
            <div style={featureBoxStyle(isLight)}>
              <div style={{ width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>💰 Financial Budgets</span>
                  <button
                    type="button"
                    onClick={() => goToStep(3)}
                    style={{ background: "none", border: "none", color: TOKEN.amber, fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                  >
                    Edit
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12.5 }}>
                  <div>Currency: <strong>{currency}</strong></div>
                  <div>Reset Day: <strong>{monthlyResetDay}th</strong></div>
                  <div>Monthly Cap: <strong>{currency}{Number(monthlyBudget).toLocaleString()}</strong></div>
                  <div>Daily Cap: <strong>{currency}{Number(dailyBudget).toLocaleString()}</strong></div>
                </div>
              </div>
            </div>

            {/* Integrations Review Card */}
            <div style={featureBoxStyle(isLight)}>
              <div style={{ width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>🔌 Integrations Status</span>
                  <button
                    type="button"
                    onClick={() => goToStep(4)}
                    style={{ background: "none", border: "none", color: TOKEN.amber, fontSize: 12, cursor: "pointer", fontWeight: 700 }}
                  >
                    Edit
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12 }}>
                  <span style={{ padding: "4px 8px", borderRadius: 8, background: enableSms ? "rgba(16,185,129,0.15)" : "rgba(100,116,139,0.15)", color: enableSms ? "#10B981" : "#94A3B8" }}>
                    SMS Tracking: {enableSms ? "Enabled" : "Off"}
                  </span>
                  <span style={{ padding: "4px 8px", borderRadius: 8, background: enablePush ? "rgba(16,185,129,0.15)" : "rgba(100,116,139,0.15)", color: enablePush ? "#10B981" : "#94A3B8" }}>
                    Overrun Alerts: {enablePush ? "Active" : "Off"}
                  </span>
                  <span style={{ padding: "4px 8px", borderRadius: 8, background: enableSync ? "rgba(16,185,129,0.15)" : "rgba(100,116,139,0.15)", color: enableSync ? "#10B981" : "#94A3B8" }}>
                    Cloud Sync: {enableSync ? "Active" : "Off"}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <button
                type="button"
                onClick={() => goToStep(4)}
                style={secondaryBtnStyle(isLight)}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => goToStep(6, "review")}
                disabled={isSaving}
                style={primaryBtnStyle}
              >
                {isSaving ? "Saving..." : "Confirm & Complete Setup 🎉"}
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 6: COMPLETION CELEBRATION ────────────────────────────────── */}
        {currentStep === 6 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 18, padding: "20px 0" }}>
            <div style={{ fontSize: 56, animation: "bounce 1s infinite" }}>🎉</div>
            <h2 style={{ fontSize: 26, fontWeight: 900, margin: 0, color: TOKEN.amber }}>
              You&apos;re All Set, {displayName || fullName}!
            </h2>
            <p style={{ fontSize: 14, color: isLight ? "#64748B" : "#94A3B8", maxWidth: 440, lineHeight: 1.5, margin: 0 }}>
              Your personalized Kharcha workspace has been configured with your preferences and budget boundaries.
            </p>

            <div
              style={{
                width: "100%",
                maxWidth: 400,
                background: isLight ? "#F8FAFC" : "rgba(255,255,255,0.03)",
                border: `1px solid ${isLight ? "#E2E8F0" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 16,
                padding: "16px 20px",
                display: "flex",
                justifyContent: "space-around",
                marginTop: 6,
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: isLight ? "#64748B" : "#94A3B8" }}>Currency</div>
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{currency}</div>
              </div>
              <div style={{ width: 1, background: isLight ? "#E2E8F0" : "rgba(255,255,255,0.08)" }} />
              <div>
                <div style={{ fontSize: 11, color: isLight ? "#64748B" : "#94A3B8" }}>Monthly Target</div>
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{currency}{Number(monthlyBudget).toLocaleString()}</div>
              </div>
              <div style={{ width: 1, background: isLight ? "#E2E8F0" : "rgba(255,255,255,0.08)" }} />
              <div>
                <div style={{ fontSize: 11, color: isLight ? "#64748B" : "#94A3B8" }}>Reset Day</div>
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{monthlyResetDay}th</div>
              </div>
            </div>

            <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              <button
                type="button"
                onClick={handleFinishOnboarding}
                style={primaryBtnStyle}
              >
                Launch Financial Dashboard →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Inline Styles Helpers ──────────────────────────────────────────────────
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
  padding: "11px 14px",
  borderRadius: 12,
  border: `1px solid ${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)"}`,
  background: isLight ? "#F8FAFC" : "rgba(255,255,255,0.04)",
  color: isLight ? "#0F172A" : "#F8FAFC",
  fontSize: 13.5,
  outline: "none",
  boxSizing: "border-box",
  fontWeight: 500,
});

const featureBoxStyle = (isLight: boolean): React.CSSProperties => ({
  display: "flex",
  gap: 14,
  alignItems: "center",
  padding: "14px 16px",
  borderRadius: 16,
  background: isLight ? "#F8FAFC" : "rgba(255,255,255,0.03)",
  border: `1px solid ${isLight ? "#E2E8F0" : "rgba(255,255,255,0.06)"}`,
});

const primaryBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "12px 20px",
  borderRadius: 14,
  border: "none",
  background: "linear-gradient(135deg, #D97706 0%, #EA580C 100%)",
  color: "#FFFFFF",
  fontWeight: 800,
  fontSize: 13.5,
  cursor: "pointer",
  boxShadow: "0 6px 18px rgba(217, 119, 6, 0.28)",
  transition: "all 0.15s ease",
};

const secondaryBtnStyle = (isLight: boolean): React.CSSProperties => ({
  padding: "12px 18px",
  borderRadius: 14,
  border: `1px solid ${isLight ? "#CBD5E1" : "rgba(255,255,255,0.12)"}`,
  background: isLight ? "#FFFFFF" : "rgba(255,255,255,0.04)",
  color: isLight ? "#475569" : "#CBD5E1",
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  transition: "all 0.15s ease",
});
