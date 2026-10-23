<!-- BEGIN:nextjs-agent-rules -->
# ⚠️ Next.js Rules & Developer Conventions
This version of Next.js has breaking changes — APIs, conventions, and file structure may differ from standard training data.
- Read the relevant guides in `node_modules/next/dist/docs/` before modifying routing or server components.
- Heed deprecation notices and adhere strictly to TypeScript 5 and React 19 conventions.
- Use centralized design tokens from `components/KharchaApp/Styles.ts` and maintain dark glassmorphic styling.
<!-- END:nextjs-agent-rules -->

---

# 🪙 KHARCHA — Premium Multi-User Expense Tracker & Financial Intelligence

**Kharcha** is a high-performance, privacy-focused Progressive Web App (PWA) designed for seamless personal finance management, independent user registration, and enterprise-grade data isolation. It features a biometric-first interface, intelligent AI voice logging, multi-wallet tracking, and an ACID-compliant relational database.

---

## 🚀 Key Functionality

### 👤 Independent User Registration & Authentication
- **Self-Service Sign Up**: New users can create independent accounts with Full Name, Email, and Password without administrator intervention.
- **Form & Email Validation**: Real-time client and server validation ensuring proper email formatting and required field verification.
- **Duplicate Prevention**: Immediate verification ensuring email addresses are uniquely registered.
- **Password Strength Meter**: Strict security requirements (minimum 8 characters, uppercase and lowercase letters, numbers, and symbols) with an interactive visual score indicator.
- **Cryptographic Protection**: Passwords are securely hashed with individual 16-byte random salts using `crypto.scrypt` and evaluated with constant-time verification (`crypto.timingSafeEqual`).
- **Email Verification**: 6-digit confirmation codes with 15-minute expiration and resend cooldowns.
- **Self-Service Password Reset**: Secure "Forgot Password" workflow allowing password recovery via verified email reset codes.
- **Multi-Tenant Data Isolation**: Every account's financial records, wallets, categories, and settings are strictly scoped to their `userId`.

### 🔐 Multi-Profile & Biometric Security
- **WebAuthn Biometrics**: Fingerprint and FaceID authentication via browser platform authenticators.
- **PIN Protection**: 4-digit numeric PIN protection per user profile with tactile feedback.
- **Fast Profile Switching**: Seamless multi-user switching directly from the login lock screen or desktop workspace.
- **Legacy Compatibility**: Instant access for existing offline profiles with seamless database migration.

### 🎙️ Multi-Mode Logging & Voice Intelligence
- **Voice Intelligence**: AI-powered natural language transaction logging that parses amount, category, and context notes.
- **Smart Keypad**: Rapid denomination adjustments (+/- 10, +/- 50, presets) and quick numeric input.
- **Multi-Wallet Attribution**: Route transactions across Cash, Bank, UPI, Credit Cards, or custom accounts.
- **Recurring Transactions**: Track subscriptions and recurring bills (daily, weekly, monthly, yearly).

### 📊 Financial Dashboard, Analytics & Matrix
- **Flexible Time Periods**: Real-time spending views across **Today**, **Weekly**, and **Monthly** timeframes.
- **Visual Distribution**: Interactive charts powered by Recharts showing category expense ratios and budget limits.
- **Day-by-Day Ledger Matrix**: Deep calendar matrix and ledger view of monthly cash flow.
- **Budget Goal Alerts**: Set category spending caps with dynamic progress indicators and visual threshold warnings.

### 📋 Transaction Registry & Audit Ledger
- **Transaction Registry**: Advanced multi-parameter search, date range filters, category/wallet sorting, and bulk deletions.
- **Export Capabilities**: Generate polished PDF reports, Excel spreadsheets (XLSX), and CSV snapshots.
- **Audit Logging**: Immutable enterprise audit ledger tracking login events, profile changes, and transaction modifications.

## 🖥️ Dual-Platform UI Architecture

KHARCHA provides two tailored interface experiences engineered from the ground up for their respective platforms, sharing the same business logic, SQLite Prisma backend, and design token system:

### 🌐 1. KHARCHA Web App & Mobile PWA
- **SaaS Overview Dashboard**: High-density financial metrics (Today, Week, Month, Remaining Budget, Capital balances) with interactive Recharts visualizations (spending distribution donut chart and daily trend bar chart).
- **Collapsible Navigation**: Responsive collapsible sidebar on wide screens with quick-access tabs (`Overview`, `Transactions`, `Wallets`, `Budgets`, `Subscriptions`, `Reports`, `Audit`, `Settings`).
- **Mobile-First PWA Bar**: Compact, touch-friendly navigation bar on viewports under 768px with full gesture support and haptics.
- **Transaction Ledger**: Search by description/notes, filter by category/wallet/date, sorting by amount/date, pagination, and bulk deletion.
- **Voice Intelligence Review**: Natural language parsing modal with preview confirmation before committing transactions to the ledger.
- **Export Capabilities**: Direct export to CSV, XLSX, and formatted PDF reports.

### 🪟 2. KHARCHA Windows Desktop Application
- **Native-Feeling Chrome**: Custom Windows titlebar with application icon, window state controls (Minimize, Maximize/Restore, Close), and live SQLite ACID synchronization indicator.
- **Persistent Desktop Sidebar**: Desktop-density navigation with keyboard shortcut hints.
- **Multi-Column Workspace**:
  - Top financial KPI summary cards.
  - Large 14-day cash-flow area chart.
  - Category breakdown donut with quick ledger.
  - Docked Quick-Add panel with denomination pills (`+50`, `+100`, `+500`, `+1,000`, `+2,000`, `+5,000`).
  - Dense, sortable Windows transaction table with multi-row selection and bulk actions.
  - Live bottom status bar with backend connection status, sync timestamp, and active user indicator.
- **Windows Keyboard Shortcuts**:
  - `Ctrl + N`: Focus Quick Add expense panel
  - `Ctrl + K`: Open search / filter input
  - `Ctrl + 1`: Navigate to Overview dashboard
  - `Ctrl + 2`: Navigate to Transactions ledger
  - `Ctrl + 3`: Navigate to Wallets & Budgets
  - `Ctrl + 4`: Navigate to Financial Reports
  - `Ctrl + ,`: Open Application Preferences
  - `Esc`: Close active modal or cancel selection
- **Windows-Specific Capabilities**:
  - Native Windows desktop notifications via Electron Notification API.
  - System Tray integration with quick tray context menu (Open, Quick Add, Quit).
  - Configurable Windows launch-on-startup (Auto-launch).
  - Context-isolated, sandboxed IPC bridge (`electron/preload.js`).

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router + Turbopack) |
| **Desktop Runtime** | [Electron 45](https://www.electronjs.org/) (Custom frameless window, Context Isolation, IPC) |
| **Desktop Packaging** | [electron-builder](https://www.electron.build/) (NSIS Windows Installer & Portable EXE) |
| **Runtime & UI** | [React 19](https://react.dev/), [TypeScript 5](https://www.typescriptlang.org/) |
| **Database & ORM** | [Prisma ORM 6](https://www.prisma.io/) with SQLite relational storage |
| **Authentication** | Native Web Crypto API (`scrypt` password hashing), WebAuthn API |
| **Data Visualization** | [Recharts](https://recharts.org/) |
| **Document Generation** | [jsPDF](https://github.com/parallax/jsPDF), [html2canvas](https://html2canvas.hertzen.com/), [SheetJS (xlsx)](https://sheetjs.com/) |
| **Styling** | Vanilla CSS Token System with Obsidian glassmorphic variables |

---

## 📁 Project Structure

```text
KHARCHA-main/
├── electron/
│   ├── main.js                # Frameless window, System Tray, IPC & shortcuts
│   └── preload.js             # Context-isolated secure Electron bridge
├── components/
│   └── KharchaApp/
│       ├── web/
│       │   └── WebShell.tsx   # SaaS Web Dashboard & Mobile PWA interface
│       ├── desktop/
│       │   └── WindowsDesktopShell.tsx # Standalone Windows Desktop interface
│       ├── types/
│       │   └── Platform.ts    # Dual-platform contracts & electronAPI types
│       ├── AuthScreen.tsx     # Modern Register, Login, Verify & Reset UI
│       ├── index.tsx          # Master screen router & state coordinator
│       ├── SubComponents.tsx  # Modular widgets, keypads, modals & navbars
│       ├── EnterpriseStorage.ts # Unified client API service & DB sync
│       ├── ReportsScreen.tsx  # Analytics charts & export generators
│       ├── Styles.ts          # Central CSS design tokens & layouts
│       ├── Types.ts           # TypeScript interfaces & domain models
│       ├── Utils.ts           # Math, date formatting, and audio/haptics
│       └── Constants.ts       # Preset categories, wallets & defaults
├── app/
│   ├── api/                   # RESTful API endpoints for auth, expenses, sync
│   ├── layout.tsx             # Root Next.js layout
│   └── page.tsx               # App entry point
├── lib/
│   ├── auth.ts                # Password hashing, validation, & code generator
│   └── prisma.ts              # Global Prisma Client instance
├── prisma/
│   ├── schema.prisma          # Database schema (User, Expense, Wallet, etc.)
│   └── kharcha_enterprise.db  # Relational SQLite database
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.17+ or v20+ (tested on Node v24)
- **npm** or **yarn**

### 1. Installation
```bash
npm install
```

### 2. Database Synchronization
Apply the Prisma schema to the local SQLite database:
```bash
npx prisma db push
```

### 3. Running KHARCHA

#### A. Web / Mobile PWA Mode
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

#### B. Standalone Windows Desktop Application (Development)
```bash
npm run desktop:dev
```
This concurrently spins up the local Next.js server and launches the standalone Windows Electron desktop window with custom title bar and system tray.

If the Next.js server is already running, you can launch the desktop app directly:
```bash
npm run desktop:start
```

---

## 📦 Building the Windows Desktop Installer

To build the standalone Windows application:

- **Unpacked Directory Build**:
  ```bash
  npm run desktop:build
  ```
- **Distributable Installer (NSIS Setup .exe + Portable .exe)**:
  ```bash
  npm run desktop:dist
  ```
The installer output is generated in `dist-desktop/`.

---

## 🛡️ Privacy & Security

- **Local-First & Cloud-Optional**: Financial records remain within your database instance without external data brokers.
- **Tenant Isolation**: Queries and mutations enforce user-level scoping through relational database foreign keys (`userId`).
- **Cryptographic Security**: Passwords and reset tokens are salted and hashed with NIST-approved cryptographic standards.
- **Sandboxed Electron Execution**: `nodeIntegration: false`, `contextIsolation: true`, sandboxed renderer processes with minimal whitelisted API bridge.
