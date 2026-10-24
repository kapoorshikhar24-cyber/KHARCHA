"use client";

import React, { useState } from "react";
import { TOKEN } from "./Styles";
import enterpriseStorage from "./EnterpriseStorage";
import { UserProfile, Settings, Expense, Category, Wallet, BudgetGoal } from "./Types";
import { triggerHaptic } from "./Utils";

export type AuthMode = "login" | "register" | "verify" | "forgot" | "reset";

interface AuthScreenProps {
  initialMode?: AuthMode;
  onSuccess: (userData: {
    user: UserProfile;
    activeData?: {
      settings: Settings | null;
      expenses: Expense[];
      categories: Category[];
      wallets: Wallet[];
      budgetGoals: BudgetGoal[];
    };
  }) => void;
  onSwitchToProfiles: () => void;
  isDesktop?: boolean;
  theme?: "dark" | "light";
}

export default function AuthScreen({
  initialMode = "login",
  onSuccess,
  onSwitchToProfiles,
  isDesktop = false,
  theme = "dark",
}: AuthScreenProps) {
  const isLight = theme === "light";
  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Form Fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState<"terms" | "privacy" | null>(null);

  // UI State
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [devHelperCode, setDevHelperCode] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Password Strength calculation
  const calculateStrength = (pass: string) => {
    let score = 0;
    const checks = {
      length: pass.length >= 8,
      lower: /[a-z]/.test(pass),
      upper: /[A-Z]/.test(pass),
      number: /[0-9]/.test(pass),
      special: /[^A-Za-z0-9]/.test(pass),
    };

    if (checks.length) score++;
    if (checks.lower && checks.upper) score++;
    if (checks.number) score++;
    if (checks.special) score++;

    let label = "Too Weak";
    let color = "#ef4444";
    if (score === 1) { label = "Weak"; color = "#f97316"; }
    else if (score === 2) { label = "Fair"; color = "#eab308"; }
    else if (score === 3) { label = "Good"; color = "#3b82f6"; }
    else if (score >= 4) { label = "Strong"; color = "#10b981"; }

    return { score, label, color, checks };
  };

  const regStrength = calculateStrength(password);
  const resetStrength = calculateStrength(newPassword);

  const clearAlerts = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // ─── Registration Handler ──────────────────────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();

    if (!name.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    if (phoneNumber.trim()) {
      const cleanPhone = phoneNumber.replace(/[\s\-().]/g, "");
      if (cleanPhone.length < 7 || cleanPhone.length > 15 || !/^[0-9]+$/.test(cleanPhone)) {
        setErrorMessage("Please enter a valid mobile number (e.g. 9876543210).");
        return;
      }
    }
    if (!agreedToTerms) {
      setErrorMessage("Please agree to the Terms of Service & Privacy Policy to continue.");
      return;
    }
    if (!regStrength.checks.length) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }
    if (!regStrength.checks.lower || !regStrength.checks.upper || !regStrength.checks.number) {
      setErrorMessage("Password must contain uppercase letters, lowercase letters, and at least one number.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    triggerHaptic("light");

    const res = await enterpriseStorage.registerUser({
      name: name.trim(),
      email: email.trim(),
      password,
      confirmPassword,
      phoneNumber: phoneNumber.trim() ? `${countryCode}${phoneNumber.trim().replace(/^0+/, "")}` : undefined,
      countryCode,
      agreedToTerms,
    });

    setIsLoading(false);

    if (!res.success) {
      triggerHaptic("error");
      setErrorMessage(res.error || "Failed to register account.");
    } else {
      triggerHaptic("success");
      setSuccessMessage(res.message || "Account created! Verification code sent.");
      if (res.devVerificationCode) {
        setDevHelperCode(res.devVerificationCode);
      }
      setMode("verify");
    }
  };

  // ─── Email Verification Handler ────────────────────────────────────────────
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();

    if (!verificationCode.trim() || verificationCode.trim().length !== 6) {
      setErrorMessage("Please enter the 6-digit verification code.");
      return;
    }

    setIsLoading(true);
    triggerHaptic("light");

    const res = await enterpriseStorage.verifyEmail(email.trim(), verificationCode.trim());
    setIsLoading(false);

    if (!res.success) {
      triggerHaptic("error");
      setErrorMessage(res.error || "Verification failed. Please check the code.");
    } else {
      triggerHaptic("success");
      setSuccessMessage("Email verified! Redirecting to dashboard...");
      setTimeout(() => {
        onSuccess({
          user: res.user,
          activeData: {
            settings: res.settings,
            expenses: [],
            categories: [],
            wallets: [],
            budgetGoals: [],
          },
        });
      }, 700);
    }
  };

  // ─── Resend Verification Code ──────────────────────────────────────────────
  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    clearAlerts();
    setIsLoading(true);

    const res = await enterpriseStorage.resendVerificationCode(email.trim());
    setIsLoading(false);

    if (res.success) {
      setSuccessMessage(res.message || "A fresh code was sent to your email.");
      if (res.devVerificationCode) {
        setDevHelperCode(res.devVerificationCode);
      }
      setResendCooldown(30);
      const timer = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setErrorMessage(res.error || "Failed to resend code.");
    }
  };

  // ─── Login Handler ─────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();

    if (!email.trim()) {
      setErrorMessage("Please enter your email address.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setIsLoading(true);
    triggerHaptic("light");

    const res = await enterpriseStorage.loginUser({
      email: email.trim(),
      password,
    });

    setIsLoading(false);

    if (res.requiresVerification) {
      triggerHaptic("medium");
      setErrorMessage(res.message || "Please verify your email to log in.");
      setMode("verify");
      return;
    }

    if (!res.success) {
      triggerHaptic("error");
      setErrorMessage(res.error || "Invalid email or password.");
    } else {
      triggerHaptic("success");
      setSuccessMessage(res.message || "Login successful! Launching dashboard...");
      setTimeout(() => {
        onSuccess({
          user: res.user,
          activeData: res.activeData,
        });
      }, 600);
    }
  };

  // ─── Forgot Password Request ───────────────────────────────────────────────
  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setIsLoading(true);
    triggerHaptic("light");

    const res = await enterpriseStorage.forgotPassword(email.trim());
    setIsLoading(false);

    if (!res.success) {
      triggerHaptic("error");
      setErrorMessage(res.error || "Failed to request password reset.");
    } else {
      triggerHaptic("success");
      setSuccessMessage(res.message || "Reset code dispatched.");
      if (res.devResetCode) {
        setDevHelperCode(res.devResetCode);
      }
      setMode("reset");
    }
  };

  // ─── Reset Password Handler ────────────────────────────────────────────────
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();

    if (!resetCode.trim() || resetCode.trim().length !== 6) {
      setErrorMessage("Please enter the 6-digit reset code.");
      return;
    }
    if (!resetStrength.checks.length) {
      setErrorMessage("New password must be at least 8 characters long.");
      return;
    }
    if (!resetStrength.checks.lower || !resetStrength.checks.upper || !resetStrength.checks.number) {
      setErrorMessage("New password must contain uppercase, lowercase, and numbers.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMessage("New passwords do not match.");
      return;
    }

    setIsLoading(true);
    triggerHaptic("light");

    const res = await enterpriseStorage.resetPassword({
      email: email.trim(),
      code: resetCode.trim(),
      newPassword,
      confirmPassword: confirmNewPassword,
    });

    setIsLoading(false);

    if (!res.success) {
      triggerHaptic("error");
      setErrorMessage(res.error || "Failed to reset password.");
    } else {
      triggerHaptic("success");
      setSuccessMessage("Password reset successfully! Please sign in with your new password.");
      setPassword("");
      setMode("login");
    }
  };

  return (
    <div
      style={{
        minHeight: "100%",
        width: "100%",
        background: isLight 
          ? "linear-gradient(160deg, #F8F9FD 0%, #FFFFFF 50%, #F4F5FA 100%)" 
          : "linear-gradient(160deg, #09090e 0%, #0f0f18 55%, #0b0b12 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: isDesktop ? "48px 32px" : "32px 18px",
        boxSizing: "border-box",
      }}
      className="screen-enter"
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: isLight ? "#FFFFFF" : "rgba(22, 22, 34, 0.75)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderRadius: 28,
          border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: isLight 
            ? "0 24px 60px rgba(0, 0, 0, 0.07), 0 2px 8px rgba(0, 0, 0, 0.04)" 
            : "0 24px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(239, 159, 39, 0.05)",
          padding: isDesktop ? "36px 32px" : "28px 22px",
          boxSizing: "border-box",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle Decorative Ambient Glow */}
        <div
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            width: 140,
            height: 140,
            borderRadius: "50%",
            background: isLight
              ? "radial-gradient(circle, rgba(217, 119, 6, 0.12) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(239, 159, 39, 0.25) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        {/* Brand Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              margin: "0 auto 12px",
              background: isLight
                ? "linear-gradient(135deg, rgba(217, 119, 6, 0.15), rgba(234, 88, 12, 0.1))"
                : "linear-gradient(135deg, rgba(239, 159, 39, 0.25), rgba(216, 90, 48, 0.15))",
              border: `1.5px solid ${isLight ? "rgba(217, 119, 6, 0.3)" : "rgba(239, 159, 39, 0.35)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              boxShadow: isLight
                ? "0 8px 20px rgba(217, 119, 6, 0.15)"
                : "0 8px 24px rgba(239, 159, 39, 0.2)",
            }}
          >
            🪙
          </div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              fontWeight: 800,
              color: TOKEN.amber,
              marginBottom: 4,
            }}
          >
            KHARCHA ENTERPRISE
          </div>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: isLight ? "#111827" : "#ffffff",
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            {mode === "login" && "Sign In to Account"}
            {mode === "register" && "Create Your Account"}
            {mode === "verify" && "Verify Your Email"}
            {mode === "forgot" && "Reset Password"}
            {mode === "reset" && "Set New Password"}
          </h2>
          <p style={{ fontSize: 13, color: isLight ? "#4B5563" : "rgba(255, 255, 255, 0.45)", marginTop: 6, marginBottom: 0 }}>
            {mode === "login" && "Enter your registered email and password"}
            {mode === "register" && "Register as a new user to track your finances"}
            {mode === "verify" && `Enter the 6-digit code sent to ${email}`}
            {mode === "forgot" && "We'll send a 6-digit recovery code to your email"}
            {mode === "reset" && "Create a secure new password for your account"}
          </p>
        </div>

        {/* Dynamic Alerts */}
        {errorMessage && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 14,
              padding: "12px 14px",
              marginBottom: 18,
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              animation: "shake 0.3s ease-in-out",
            }}
          >
            <span style={{ fontSize: 16 }}>⚠️</span>
            <div style={{ fontSize: 12.5, color: "#fca5a5", lineHeight: 1.4, flex: 1 }}>{errorMessage}</div>
          </div>
        )}

        {successMessage && (
          <div
            style={{
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: 14,
              padding: "12px 14px",
              marginBottom: 18,
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 16 }}>✅</span>
            <div style={{ fontSize: 12.5, color: "#86efac", lineHeight: 1.4, flex: 1 }}>{successMessage}</div>
          </div>
        )}

        {/* Development Helper Badge for instant verification */}
        {devHelperCode && (
          <div
            style={{
              background: "rgba(239, 159, 39, 0.12)",
              border: "1px dashed rgba(239, 159, 39, 0.4)",
              borderRadius: 12,
              padding: "10px 14px",
              marginBottom: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 12, color: TOKEN.amber }}>
              🔑 Simulated Email Code: <strong>{devHelperCode}</strong>
            </span>
            <button
              type="button"
              onClick={() => {
                if (mode === "verify") setVerificationCode(devHelperCode);
                if (mode === "reset") setResetCode(devHelperCode);
              }}
              style={{
                background: "rgba(239, 159, 39, 0.2)",
                border: "1px solid rgba(239, 159, 39, 0.4)",
                color: TOKEN.amber,
                borderRadius: 8,
                padding: "3px 8px",
                fontSize: 11,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Fill Code
            </button>
          </div>
        )}

        {/* ─── 1. LOGIN FORM ──────────────────────────────────────────────── */}
        {mode === "login" && (
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>Email Address</label>
              <div style={inputContainerStyle}>
                <span style={{ fontSize: 15, opacity: 0.5 }}>✉️</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  style={inputStyle}
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={labelStyle}>Password</label>
                <button
                  type="button"
                  onClick={() => { clearAlerts(); setMode("forgot"); }}
                  style={{
                    background: "none",
                    border: "none",
                    color: TOKEN.amber,
                    fontSize: 12,
                    cursor: "pointer",
                    padding: 0,
                    marginBottom: 6,
                  }}
                >
                  Forgot Password?
                </button>
              </div>
              <div style={inputContainerStyle}>
                <span style={{ fontSize: 15, opacity: 0.5 }}>🔒</span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  style={inputStyle}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={eyeButtonStyle}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? "👁️" : "👁️‍🗨️"}
                </button>
              </div>
            </div>

            <button type="submit" disabled={isLoading} style={primaryButtonStyle}>
              {isLoading ? "Signing in..." : "Sign In →"}
            </button>

            <div style={{ textAlign: "center", marginTop: 8 }}>
              <span style={{ fontSize: 13, color: isLight ? "#4B5563" : "rgba(255,255,255,0.45)" }}>
                Don't have an account?{" "}
              </span>
              <button
                type="button"
                onClick={() => { clearAlerts(); setMode("register"); }}
                style={{
                  background: "none",
                  border: "none",
                  color: TOKEN.amber,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Sign Up
              </button>
            </div>
          </form>
        )}

        {/* ─── 2. REGISTRATION FORM ───────────────────────────────────────── */}
        {mode === "register" && (
          <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={labelStyle}>Full Name</label>
              <div style={inputContainerStyle}>
                <span style={{ fontSize: 15, opacity: 0.5 }}>👤</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Mercer"
                  required
                  style={inputStyle}
                  autoComplete="name"
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Email Address</label>
              <div style={inputContainerStyle}>
                <span style={{ fontSize: 15, opacity: 0.5 }}>✉️</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  style={inputStyle}
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>
                Mobile Number <span style={{ opacity: 0.5, fontWeight: 400 }}>(Optional for SMS Sync)</span>
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  style={{
                    ...inputStyle,
                    width: 105,
                    padding: "10px 8px",
                    background: isLight ? "#F3F4F6" : "rgba(255,255,255,0.06)",
                    cursor: "pointer",
                    fontWeight: 700,
                    borderRadius: 14,
                    border: "1px solid var(--token-border, rgba(0, 0, 0, 0.1))",
                  }}
                >
                  <option value="+91">🇮🇳 +91</option>
                  <option value="+1">🇺🇸 +1</option>
                  <option value="+44">🇬🇧 +44</option>
                  <option value="+971">🇦🇪 +971</option>
                  <option value="+65">🇸🇬 +65</option>
                  <option value="+61">🇦🇺 +61</option>
                  <option value="+49">🇩🇪 +49</option>
                </select>
                <div style={{ ...inputContainerStyle, flex: 1 }}>
                  <span style={{ fontSize: 15, opacity: 0.5 }}>📱</span>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9\s\-]/g, ""))}
                    placeholder="98765 43210"
                    style={inputStyle}
                    autoComplete="tel"
                  />
                </div>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Password</label>
              <div style={inputContainerStyle}>
                <span style={{ fontSize: 15, opacity: 0.5 }}>🔒</span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                  style={inputStyle}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={eyeButtonStyle}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? "👁️" : "👁️‍🗨️"}
                </button>
              </div>

              {/* Password Strength Indicator */}
              {password.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Strength</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: regStrength.color }}>
                      {regStrength.label}
                    </span>
                  </div>
                  <div style={{ height: 4, width: "100%", background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${(regStrength.score / 4) * 100}%`,
                        background: regStrength.color,
                        transition: "all 0.3s ease",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    <span style={pillStyle(regStrength.checks.length)}>8+ chars</span>
                    <span style={pillStyle(regStrength.checks.upper && regStrength.checks.lower)}>Aa / aA</span>
                    <span style={pillStyle(regStrength.checks.number)}>0-9 number</span>
                    <span style={pillStyle(regStrength.checks.special)}>Special symbol</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>Confirm Password</label>
              <div style={inputContainerStyle}>
                <span style={{ fontSize: 15, opacity: 0.5 }}>🛡️</span>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                  style={inputStyle}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={eyeButtonStyle}
                  aria-label="Toggle confirm password visibility"
                >
                  {showConfirmPassword ? "👁️" : "👁️‍🗨️"}
                </button>
              </div>
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>
                  Passwords do not match
                </div>
              )}
            </div>

            {/* Terms and Privacy Checkbox */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 4 }}>
              <input
                type="checkbox"
                id="terms_agree"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                style={{
                  width: 18,
                  height: 18,
                  accentColor: TOKEN.amber,
                  cursor: "pointer",
                  marginTop: 2,
                }}
              />
              <label htmlFor="terms_agree" style={{ fontSize: 12, lineHeight: 1.4, color: isLight ? "#4B5563" : "rgba(255,255,255,0.7)", cursor: "pointer" }}>
                I agree to the{" "}
                <button
                  type="button"
                  onClick={() => setShowTermsModal("terms")}
                  style={{ background: "none", border: "none", color: TOKEN.amber, fontWeight: 700, padding: 0, cursor: "pointer", textDecoration: "underline" }}
                >
                  Terms of Service
                </button>{" "}
                and{" "}
                <button
                  type="button"
                  onClick={() => setShowTermsModal("privacy")}
                  style={{ background: "none", border: "none", color: TOKEN.amber, fontWeight: 700, padding: 0, cursor: "pointer", textDecoration: "underline" }}
                >
                  Privacy Policy
                </button>.
              </label>
            </div>

            <button type="submit" disabled={isLoading} style={primaryButtonStyle}>
              {isLoading ? "Creating Account..." : "Create Account →"}
            </button>

            <div style={{ textAlign: "center", marginTop: 6 }}>
              <span style={{ fontSize: 13, color: isLight ? "#4B5563" : "rgba(255,255,255,0.45)" }}>
                Already registered?{" "}
              </span>
              <button
                type="button"
                onClick={() => { clearAlerts(); setMode("login"); }}
                style={{
                  background: "none",
                  border: "none",
                  color: TOKEN.amber,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Log In
              </button>
            </div>
          </form>
        )}

        {/* ─── 3. EMAIL VERIFICATION FORM ─────────────────────────────────── */}
        {mode === "verify" && (
          <form onSubmit={handleVerify} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label style={labelStyle}>6-Digit Verification Code</label>
              <div style={inputContainerStyle}>
                <span style={{ fontSize: 15, opacity: 0.5 }}>🔢</span>
                <input
                  type="text"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="123456"
                  required
                  style={{ ...inputStyle, letterSpacing: "0.4em", fontSize: 18, fontWeight: 700 }}
                  autoFocus
                />
              </div>
            </div>

            <button type="submit" disabled={isLoading} style={primaryButtonStyle}>
              {isLoading ? "Verifying..." : "Verify & Launch Dashboard →"}
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || isLoading}
                style={{
                  background: "none",
                  border: "none",
                  color: resendCooldown > 0 ? "rgba(255,255,255,0.3)" : TOKEN.amber,
                  fontSize: 12,
                  cursor: resendCooldown > 0 ? "default" : "pointer",
                  padding: 0,
                }}
              >
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend Code"}
              </button>

              <button
                type="button"
                onClick={() => { clearAlerts(); setMode("login"); }}
                style={{
                  background: "none",
                  border: "none",
                  color: isLight ? "#4B5563" : "rgba(255,255,255,0.5)",
                  fontSize: 12,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {/* ─── 4. FORGOT PASSWORD REQUEST ─────────────────────────────────── */}
        {mode === "forgot" && (
          <form onSubmit={handleForgotRequest} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>Your Registered Email</label>
              <div style={inputContainerStyle}>
                <span style={{ fontSize: 15, opacity: 0.5 }}>✉️</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  style={inputStyle}
                  autoFocus
                />
              </div>
            </div>

            <button type="submit" disabled={isLoading} style={primaryButtonStyle}>
              {isLoading ? "Sending Code..." : "Send Reset Code →"}
            </button>

            <div style={{ textAlign: "center", marginTop: 6 }}>
              <button
                type="button"
                onClick={() => { clearAlerts(); setMode("login"); }}
                style={{
                  background: "none",
                  border: "none",
                  color: isLight ? "#4B5563" : "rgba(255,255,255,0.5)",
                  fontSize: 12.5,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                ← Back to Login
              </button>
            </div>
          </form>
        )}

        {/* ─── 5. RESET PASSWORD FORM ─────────────────────────────────────── */}
        {mode === "reset" && (
          <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={labelStyle}>6-Digit Reset Code</label>
              <div style={inputContainerStyle}>
                <span style={{ fontSize: 15, opacity: 0.5 }}>🔢</span>
                <input
                  type="text"
                  maxLength={6}
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="123456"
                  required
                  style={{ ...inputStyle, letterSpacing: "0.3em", fontSize: 16, fontWeight: 700 }}
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>New Password</label>
              <div style={inputContainerStyle}>
                <span style={{ fontSize: 15, opacity: 0.5 }}>🔒</span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  required
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={eyeButtonStyle}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? "👁️" : "👁️‍🗨️"}
                </button>
              </div>

              {newPassword.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ height: 3, width: "100%", background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${(resetStrength.score / 4) * 100}%`,
                        background: resetStrength.color,
                        transition: "all 0.3s ease",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label style={labelStyle}>Confirm New Password</label>
              <div style={inputContainerStyle}>
                <span style={{ fontSize: 15, opacity: 0.5 }}>🛡️</span>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  style={inputStyle}
                />
              </div>
            </div>

            <button type="submit" disabled={isLoading} style={primaryButtonStyle}>
              {isLoading ? "Updating Password..." : "Update Password & Log In →"}
            </button>

            <div style={{ textAlign: "center", marginTop: 4 }}>
              <button
                type="button"
                onClick={() => { clearAlerts(); setMode("login"); }}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 12,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                ← Back to Sign In
              </button>
            </div>
          </form>
        )}

        {/* Existing Profile Fast Switch Divider */}
        <div
          style={{
            marginTop: 24,
            paddingTop: 18,
            borderTop: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)",
            textAlign: "center",
          }}
        >
          <button
            type="button"
            onClick={onSwitchToProfiles}
            style={{
              background: isLight ? "#F3F4F6" : "rgba(255, 255, 255, 0.04)",
              border: isLight ? "1px solid rgba(0, 0, 0, 0.08)" : "1px solid rgba(255, 255, 255, 0.08)",
              color: isLight ? "#374151" : "rgba(255, 255, 255, 0.7)",
              borderRadius: 12,
              padding: "10px 16px",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isLight ? "#E5E7EB" : "rgba(255, 255, 255, 0.08)";
              e.currentTarget.style.borderColor = TOKEN.amber;
              e.currentTarget.style.color = TOKEN.amber;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isLight ? "#F3F4F6" : "rgba(255, 255, 255, 0.04)";
              e.currentTarget.style.borderColor = isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)";
              e.currentTarget.style.color = isLight ? "#374151" : "rgba(255, 255, 255, 0.7)";
            }}
          >
            <span>👥</span>
            <span>Switch to Profiles / PIN Unlock</span>
          </button>
        </div>
      </div>

      {/* Terms of Service & Privacy Policy Modal */}
      {showTermsModal && (
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
            padding: 20,
          }}
          onClick={() => setShowTermsModal(null)}
        >
          <div
            style={{
              background: isLight ? "#FFFFFF" : "#18181B",
              color: isLight ? "#111827" : "#F3F4F6",
              borderRadius: 20,
              padding: 24,
              maxWidth: 520,
              width: "100%",
              maxHeight: "80vh",
              overflowY: "auto",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
              border: `1px solid ${isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)"}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                {showTermsModal === "terms" ? "📜 Terms of Service" : "🛡️ Privacy Policy"}
              </h3>
              <button
                type="button"
                onClick={() => setShowTermsModal(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 18,
                  cursor: "pointer",
                  color: isLight ? "#6B7280" : "#9CA3AF",
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: isLight ? "#4B5563" : "#D1D5DB" }}>
              {showTermsModal === "terms" ? (
                <>
                  <p><strong>1. Introduction</strong>: Welcome to KHARCHA. By creating an account or using our application, you agree to these Terms.</p>
                  <p><strong>2. Account & Security</strong>: You are responsible for safeguarding your credentials and PIN. We use industry-standard scrypt cryptographic hashing.</p>
                  <p><strong>3. Expense Tracking & Financial Privacy</strong>: KHARCHA is designed for personal expense tracking. We do not require or store your net banking passwords, UPI PINs, or debit card numbers.</p>
                  <p><strong>4. Local & Offline Operation</strong>: Your data is isolated per account. You retain full ownership and rights to your data.</p>
                  <p><strong>5. Data Deletion</strong>: You may delete your account at any time, which permanently purges all transactions and records.</p>
                </>
              ) : (
                <>
                  <p><strong>1. Zero Banking Credential Policy</strong>: We NEVER ask for or store your bank passwords, UPI PINs, OTPs, or CVVs.</p>
                  <p><strong>2. Transparent SMS Parsing</strong>: Automatic transaction tracking is performed locally on supported devices with explicit user consent to detect transactional debit alerts.</p>
                  <p><strong>3. Data Isolation</strong>: Every user's transactions, categories, and settings are strictly partitioned in our ACID-compliant enterprise database.</p>
                  <p><strong>4. Portability & Export</strong>: You can export your full transaction ledger anytime as standard JSON.</p>
                </>
              )}
            </div>
            <div style={{ marginTop: 20, textAlign: "right" }}>
              <button
                type="button"
                onClick={() => {
                  setAgreedToTerms(true);
                  setShowTermsModal(null);
                }}
                style={{
                  padding: "10px 18px",
                  borderRadius: 12,
                  border: "none",
                  background: TOKEN.amber,
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                I Understand & Agree
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inline Style Helpers ───────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--token-textFaint, #4B5563)",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const inputContainerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "var(--token-surfaceHighlight, #F9FAFB)",
  border: "1px solid var(--token-border, rgba(0, 0, 0, 0.1))",
  borderRadius: 14,
  padding: "10px 14px",
  transition: "border-color 0.2s, box-shadow 0.2s",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: "transparent",
  border: "none",
  outline: "none",
  color: "var(--token-text, #111827)",
  fontSize: 14,
  fontFamily: "inherit",
};

const eyeButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
  fontSize: 14,
  opacity: 0.6,
  display: "flex",
  alignItems: "center",
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px 18px",
  borderRadius: 14,
  border: "none",
  background: "linear-gradient(135deg, #D97706 0%, #EA580C 100%)",
  color: "#ffffff",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: "0 6px 20px rgba(217, 119, 6, 0.28)",
  transition: "transform 0.15s, box-shadow 0.15s",
  marginTop: 4,
};

const pillStyle = (active: boolean): React.CSSProperties => ({
  fontSize: 10,
  fontWeight: 600,
  padding: "2px 7px",
  borderRadius: 6,
  background: active ? "rgba(16, 185, 129, 0.15)" : "var(--token-surfaceHighlight, rgba(0,0,0,0.05))",
  color: active ? "#059669" : "var(--token-muted, #6B7280)",
  border: `1px solid ${active ? "rgba(16, 185, 129, 0.3)" : "var(--token-border, rgba(0,0,0,0.06))"}`,
});
