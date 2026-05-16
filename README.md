# 🪙 KHARCHA — Premium Expense Tracker

Kharcha is a high-performance, privacy-focused Progressive Web App (PWA) designed for seamless and secure expense tracking. It combines a premium biometric-first interface with intelligent logging capabilities.

---

## 🚀 Key Functionality

### 🔐 Secure Authentication
- **Biometric Unlock**: Integrated WebAuthn support for Fingerprint and FaceID.
- **PIN Protection**: 4-digit PIN fallback with a custom, secure entry interface.
- **Secure Vault**: End-to-end local data persistence with zero cloud tracking.
- **Session Summary**: Glancable activity summary (count & total) on the lock screen.

### 🎙️ Multi-Mode Logging
- **Voice Intelligence**: AI-powered voice logging that parses amount, category, and notes automatically.
- **Smart Keypad**: Custom numerical entry with rapid adjustment buttons (+/- 10, +/- 50) and common presets.
- **Note Integration**: Add context to every transaction for better tracking.

### 📊 Smart Dashboard & Analytics
- **Dynamic Filtering**: Switch views between **Today**, **Weekly**, and **Monthly** spending.
- **Visual Breakdown**: Interactive category bar charts showing where your money goes.
- **Budget Monitoring**: Real-time tracking of daily totals against your recent history.

### 📜 Expense Management
- **Searchable History**: Instant full-text search across all your records and categories.
- **Swipe-to-Delete**: Intuitive mobile-first gestures to manage and clean up records.
- **Category Filtering**: Drill down into specific spending areas like Food, Travel, or Bills.

### ⚙️ Personalization
- **Theme Engine**: Dynamic Light/Dark mode support via a system-wide CSS token system.
- **Custom Categories**: Manage and personalize the categories that matter to you.
- **Haptic Feedback**: High-quality tactile responses for every interaction (Success, Error, Light, Medium).

---

## 🛠️ Technology Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: Vanilla CSS with a custom **CSS Variable Token System** for premium aesthetics.
- **State Management**: React Hooks (useState, useCallback, useEffect) with LocalStorage persistence.
- **Biometrics**: Browser WebAuthn API.

---

## 📁 Project Structure

```text
/components/KharchaApp/
├── index.tsx          # Main entry & Screen Router
├── SubComponents.tsx  # Atomic UI Widgets & Icons
├── Styles.ts          # Central Design System & CSS Tokens
├── Types.ts           # Shared Data Models
├── Utils.ts           # Math, Formatting, & Auth Logic
└── Constants.ts       # App Defaults & Configurations
```

---

## 🛠️ Getting Started

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```

### Build
```bash
npm run build
```

---

## 🛡️ Privacy
Kharcha is designed with privacy as a core principle. All data is stored locally on your device's `localStorage` and never leaves your browser.
