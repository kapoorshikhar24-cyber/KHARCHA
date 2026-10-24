# KHARCHA Android Companion Application

Native Android module for automatic detection of Indian bank transaction SMS messages (UPI, Debit Card, NetBanking, ATM withdrawals, and Salary/Direct Credits).

---

## 1. Architecture Overview
- **Local SMS Interception:** `SmsReceiver` listens for incoming SMS messages from authorized Indian bank sender codes (e.g. `HDFC`, `SBI`, `ICICI`, `AXIS`, `KOTAK`, `PNB`, `BOB`, `INDUS`, `IDFC`, `PAYTM`).
- **On-Device Parsing:** `BankSmsParser.kt` extracts transaction amount, type (expense vs income), bank, payment rail, merchant/counterparty, reference number/UTR, and assigns category *locally on the device*.
- **Privacy & Sandboxing:** Personal SMS messages, OTPs, password reset codes, and promotional marketing messages are **discarded immediately** and **never** stored or uploaded.
- **Offline Resilient Sync:** `LocalTransactionStore` queues parsed records in encrypted local storage. `TransactionSyncWorker` synchronizes records over HTTPS with exponential backoff when network connectivity is available.
- **Deduplication:** Server-side fingerprinting (`hash(bank + refNumber)`) prevents duplicate records even if bank messages are re-sent or re-synced.

---

## 2. Prerequisites
- Android Studio Hedgehog (2023.1.1) or higher, or Android SDK with Gradle 8.0+.
- Android device running Android 7.0 (API level 24) or higher.

---

## 3. How to Build & Install

### Step 1: Open in Android Studio
1. Launch Android Studio.
2. Select **Open** and choose the `android/` directory in this repository.
3. Allow Gradle to sync dependencies.

### Step 2: Build the APK
To build a debug APK via command line:
```bash
cd android
./gradlew assembleDebug
```
The APK will be generated at:
`android/app/build/outputs/apk/debug/app-debug.apk`

### Step 3: Sideload onto Android Phone
Connect your Android phone with USB Debugging enabled, or transfer the `.apk` file directly to your phone:
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 4. Pairing with KHARCHA Dashboard

1. Open your **KHARCHA Web Application** or **Windows Desktop App**.
2. Go to **Settings** > **Automatic Bank SMS Tracking** (or click the **📱 SMS Sync** badge in the header).
3. Copy the **6-digit Pairing Code** and your application URL (e.g. `https://your-app.vercel.app`).
4. Open the **KHARCHA SMS Tracker** app on your phone.
5. Grant the requested SMS permissions (`RECEIVE_SMS` and `READ_SMS`).
6. Enter the Backend URL and 6-digit Pairing Code, then tap **Link with Web Dashboard**.
7. Once paired, the status turns **🟢 Connected**.

---

## 5. Testing Without Real Bank SMS
Inside the companion app, tap **"Simulate Bank SMS (Test)"**. 
It will generate a synthetic bank SMS:
`INR 250.00 debited from A/c **9988 on 24-OCT-26 to STARBUCKS via UPI. Ref: 982019283019.`
This transaction will immediately sync to your KHARCHA ledger under the **Food & Dining** category.
