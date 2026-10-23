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
}

export default function AuthScreen({
  initialMode = "login",
  onSuccess,
  onSwitchToProfiles,
  isDesktop = false,
}: AuthScreenProps) {
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
        background: "linear-gradient(160deg, #09090e 0%, #0f0f18 55%, #0b0b12 100%)",
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
          background: "rgba(22, 22, 34, 0.75)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderRadius: 28,
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(239, 159, 39, 0.05)",
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
            background: "radial-gradient(circle, rgba(239, 159, 39, 0.25) 0%, transparent 70%)",
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
              background: "linear-gradient(135deg, rgba(239, 159, 39, 0.25), rgba(216, 90, 48, 0.15))",
              border: "1.5px solid rgba(239, 159, 39, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              boxShadow: "0 8px 24px rgba(239, 159, 39, 0.2)",
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
              color: "#ffffff",
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
          <p style={{ fontSize: 13, color: "rgba(255, 255, 255, 0.45)", marginTop: 6, marginBottom: 0 }}>
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
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
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

            <button type="submit" disabled={isLoading} style={primaryButtonStyle}>
              {isLoading ? "Creating Account..." : "Create Account →"}
            </button>

            <div style={{ textAlign: "center", marginTop: 6 }}>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
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
                  color: "rgba(255,255,255,0.5)",
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
                  color: "rgba(255,255,255,0.5)",
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
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            textAlign: "center",
          }}
        >
          <button
            type="button"
            onClick={onSwitchToProfiles}
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              color: "rgba(255, 255, 255, 0.7)",
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
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
              e.currentTarget.style.borderColor = "rgba(239, 159, 39, 0.3)";
              e.currentTarget.style.color = TOKEN.amber;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
              e.currentTarget.style.color = "rgba(255, 255, 255, 0.7)";
            }}
          >
            <span>👥</span>
            <span>Switch to Profiles / PIN Unlock</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inline Style Helpers ───────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11.5,
  fontWeight: 600,
  color: "rgba(255, 255, 255, 0.65)",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const inputContainerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "rgba(0, 0, 0, 0.35)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: 14,
  padding: "10px 14px",
  transition: "border-color 0.2s, box-shadow 0.2s",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: "transparent",
  border: "none",
  outline: "none",
  color: "#ffffff",
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
  border: "1px solid rgba(239, 159, 39, 0.4)",
  background: "linear-gradient(135deg, #EF9F27 0%, #D85A30 100%)",
  color: "#1a0800",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: "0 6px 20px rgba(239, 159, 39, 0.28)",
  transition: "transform 0.15s, box-shadow 0.15s",
  marginTop: 4,
};

const pillStyle = (active: boolean): React.CSSProperties => ({
  fontSize: 10,
  fontWeight: 600,
  padding: "2px 7px",
  borderRadius: 6,
  background: active ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.05)",
  color: active ? "#86efac" : "rgba(255, 255, 255, 0.3)",
  border: `1px solid ${active ? "rgba(16, 185, 129, 0.3)" : "rgba(255, 255, 255, 0.06)"}`,
});
