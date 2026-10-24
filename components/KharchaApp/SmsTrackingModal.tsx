"use client";

import React, { useState, useEffect } from "react";
import { TOKEN } from "./Styles";
import { parseBankSms, ParsedBankTransaction } from "@/lib/bankSmsParser";
import { fmt, triggerHaptic } from "./Utils";
import { Expense } from "./Types";

interface SmsTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
  onAddTransaction: (expense: Omit<Expense, "id">) => void;
  isLight?: boolean;
}

export default function SmsTrackingModal({
  isOpen,
  onClose,
  userId,
  onAddTransaction,
  isLight = false,
}: SmsTrackingModalProps) {
  const [pairingCode, setPairingCode] = useState<string>("Loading...");
  const [deviceToken, setDeviceToken] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [autoDetectedCount, setAutoDetectedCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // SMS Simulator State
  const [simulatorSms, setSimulatorSms] = useState<string>("");
  const [senderAddress, setSenderAddress] = useState<string>("VM-HDFCBK");
  const [parsedResult, setParsedResult] = useState<ParsedBankTransaction | null>(null);
  const [simMessage, setSimMessage] = useState<string | null>(null);

  // Load Pairing & Status
  useEffect(() => {
    if (!isOpen) return;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/sms-transactions/pair?userId=${userId || ""}`);
        const data = await res.json();
        if (data.success) {
          setPairingCode(data.pairingCode || "718572");
          setDeviceToken(data.deviceToken || "");
          setIsConnected(Boolean(data.deviceToken));
          setLastSyncAt(data.lastSyncAt);
          setAutoDetectedCount(data.syncCount || 0);
        }
      } catch (e) {
        console.error("Failed to load SMS pairing status:", e);
      }
    };

    fetchStatus();
  }, [isOpen, userId]);

  if (!isOpen) return null;

  // Preset synthetic bank SMS messages for 1-click testing
  const PRESET_MESSAGES = [
    {
      label: "HDFC UPI Debit",
      sender: "VM-HDFCBK",
      body: "Dear Customer, INR 350.00 debited from A/c **4321 on 24-OCT-26 to SWIGGY via UPI. Ref: 489201938201. Avl Bal: INR 12,450.00",
    },
    {
      label: "SBI Salary Credit",
      sender: "VK-SBIINB",
      body: "Your A/c 5678 is credited with INR 65,000.00 on 24-OCT-26 by Salary/TRANSFER from GOOGLE. Avl Bal Rs 85,000. Ref no 928301928301.",
    },
    {
      label: "ICICI Tea Stall UPI",
      sender: "AD-ICICIB",
      body: "UPI payment of Rs. 40.00 made successfully to tea.stall@okaxis on 24-10-2026. Ref: 394820193820.",
    },
    {
      label: "Axis Fuel Card",
      sender: "AX-AXISBK",
      body: "INR 1,200.00 spent on Axis Bank Card ending 9876 at HPCL FUEL PUMP on 24-Oct-26. Avl Limit: INR 45,000.",
    },
  ];

  const handleTestParse = () => {
    if (!simulatorSms.trim()) {
      setSimMessage("Please enter or select a bank SMS to test.");
      return;
    }
    const result = parseBankSms(simulatorSms, senderAddress);
    if (!result) {
      setParsedResult(null);
      setSimMessage("⚠️ The entered SMS was not identified as a completed financial transaction alert.");
    } else {
      setParsedResult(result);
      setSimMessage(null);
      triggerHaptic("light");
    }
  };

  const handleSaveToLedger = async () => {
    if (!parsedResult) return;

    onAddTransaction({
      amount: parsedResult.amount,
      category: parsedResult.category,
      note: `${parsedResult.merchantOrSender || "Bank Transaction"} (${parsedResult.bank})`,
      createdAt: parsedResult.date,
      type: parsedResult.type,
      walletId: parsedResult.paymentMethod === "UPI" ? "upi" : "bank",
      bankName: parsedResult.bank,
      paymentMethod: parsedResult.paymentMethod,
      refNumber: parsedResult.refNumber || undefined,
      accountLast4: parsedResult.accountLast4 || undefined,
      merchant: parsedResult.merchantOrSender || undefined,
      syncSource: "bank_sms",
      verifiedStatus: "auto_detected",
      rawSmsHash: parsedResult.fingerprint,
    });

    triggerHaptic("success");
    setSimMessage("✅ Transaction successfully logged into your KHARCHA ledger!");
    setParsedResult(null);
    setSimulatorSms("");
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(12px)",
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
          width: "100%",
          maxWidth: 620,
          maxHeight: "90vh",
          overflowY: "auto",
          background: isLight ? "#FFFFFF" : "#13131F",
          border: `1px solid ${TOKEN.border}`,
          borderRadius: 20,
          padding: 24,
          color: TOKEN.text,
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.4)",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>📱</span>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Automatic Bank SMS Tracking</h2>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: TOKEN.muted }}>
              Auto-detect UPI & bank debit/credit alerts with zero manual entry
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: TOKEN.muted,
              fontSize: 18,
              cursor: "pointer",
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* Status & Pairing Banner */}
        <div
          style={{
            background: isLight ? "rgba(245, 158, 11, 0.08)" : "rgba(239, 159, 39, 0.1)",
            border: `1px solid rgba(239, 159, 39, 0.3)`,
            borderRadius: 14,
            padding: 16,
            marginBottom: 20,
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 16,
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: isConnected ? "#10b981" : "#f59e0b",
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 700, color: isConnected ? "#10b981" : TOKEN.amber }}>
                {isConnected ? "Android Phone Linked & Synchronizing" : "Ready to Pair Android Device"}
              </span>
            </div>
            <div style={{ fontSize: 11, color: TOKEN.muted }}>
              {isConnected
                ? `Last synced: ${lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : "Just now"} • ${autoDetectedCount} auto-detected transactions`
                : "Enter this 6-digit pairing code in the KHARCHA Android companion app:"}
            </div>
          </div>

          <div
            style={{
              background: isLight ? "#FFFFFF" : "#1C1C2D",
              border: `1.5px dashed ${TOKEN.amber}`,
              borderRadius: 10,
              padding: "6px 14px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 9.5, color: TOKEN.muted, textTransform: "uppercase", fontWeight: 700 }}>
              Pairing Code
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: TOKEN.amber, letterSpacing: 3 }}>
              {pairingCode}
            </div>
          </div>
        </div>

        {/* Live Bank SMS Simulator */}
        <div
          style={{
            background: isLight ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${TOKEN.borderSub}`,
            borderRadius: 14,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: TOKEN.text }}>
              🧪 Live Bank SMS Test Simulator
            </span>
            <span style={{ fontSize: 10.5, color: TOKEN.muted }}>Instant on-device test</span>
          </div>

          {/* Preset Buttons */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {PRESET_MESSAGES.map((msg, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setSimulatorSms(msg.body);
                  setSenderAddress(msg.sender);
                  setParsedResult(null);
                  setSimMessage(null);
                }}
                style={{
                  padding: "4px 10px",
                  borderRadius: 8,
                  border: `1px solid ${TOKEN.borderSub}`,
                  background: isLight ? "#FFFFFF" : "rgba(255,255,255,0.06)",
                  color: TOKEN.text,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {msg.label}
              </button>
            ))}
          </div>

          {/* SMS Body Input */}
          <textarea
            rows={3}
            placeholder="Paste your real or test Bank SMS text here (e.g. 'INR 250 debited for SWIGGY via UPI...')"
            value={simulatorSms}
            onChange={(e) => {
              setSimulatorSms(e.target.value);
              setParsedResult(null);
              setSimMessage(null);
            }}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: 10,
              background: TOKEN.surfaceElevated,
              border: `1px solid ${TOKEN.border}`,
              color: TOKEN.text,
              fontSize: 12,
              fontFamily: "monospace",
              resize: "none",
              boxSizing: "border-box",
              marginBottom: 10,
            }}
          />

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={handleTestParse}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background: TOKEN.amber,
                color: "#180a00",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Parse Transaction
            </button>
          </div>

          {/* Parsed Result Display */}
          {parsedResult && (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 10,
                background: isLight ? "#FFFFFF" : "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#10b981" }}>
                  ✅ Valid Transaction Detected
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 900,
                    color: parsedResult.type === "income" ? "#10b981" : "#ef4444",
                  }}
                >
                  {parsedResult.type === "income" ? "+" : "-"}
                  {fmt(parsedResult.amount)}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
                <div>
                  <span style={{ color: TOKEN.muted }}>Bank:</span> <strong>{parsedResult.bank}</strong>
                </div>
                <div>
                  <span style={{ color: TOKEN.muted }}>Rail:</span> <strong>{parsedResult.paymentMethod}</strong>
                </div>
                <div>
                  <span style={{ color: TOKEN.muted }}>Merchant:</span> <strong>{parsedResult.merchantOrSender || "—"}</strong>
                </div>
                <div>
                  <span style={{ color: TOKEN.muted }}>Category:</span> <strong>{parsedResult.category}</strong>
                </div>
                {parsedResult.refNumber && (
                  <div style={{ gridColumn: "span 2" }}>
                    <span style={{ color: TOKEN.muted }}>Ref / UTR:</span>{" "}
                    <code style={{ fontSize: 10.5 }}>{parsedResult.refNumber}</code>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleSaveToLedger}
                style={{
                  marginTop: 12,
                  width: "100%",
                  padding: "9px 0",
                  borderRadius: 8,
                  border: "none",
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  color: "#FFFFFF",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                + Record Directly to Ledger
              </button>
            </div>
          )}

          {simMessage && (
            <div
              style={{
                marginTop: 10,
                fontSize: 11.5,
                color: simMessage.startsWith("✅") ? "#10b981" : "#ef4444",
                fontWeight: 600,
              }}
            >
              {simMessage}
            </div>
          )}
        </div>

        {/* Security & Privacy Commitment */}
        <div style={{ fontSize: 11, color: TOKEN.muted, lineHeight: 1.5 }}>
          🔒 <strong>Privacy Assurance:</strong> Zero personal chats or OTPs are collected. The companion app filters and parses Indian bank transaction alerts locally on your device. Only structured financial details are transmitted via encrypted HTTPS.
        </div>
      </div>
    </div>
  );
}
