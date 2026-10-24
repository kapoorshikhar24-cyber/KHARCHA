import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { deviceToken, userId: requestedUserId, transactions } = body;

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ success: false, error: "No transactions provided" }, { status: 400 });
    }

    // 1. Identify User either via deviceToken or requestedUserId
    let resolvedUserId: string | null = null;
    let deviceRecordId: string | null = null;

    if (deviceToken) {
      const device = await prisma.smsDevicePairing.findUnique({
        where: { deviceToken },
      });
      if (device && device.isActive) {
        resolvedUserId = device.userId;
        deviceRecordId = device.id;
      }
    }

    if (!resolvedUserId && requestedUserId) {
      const user = await prisma.user.findUnique({
        where: { id: requestedUserId },
      });
      if (user) {
        resolvedUserId = user.id;
      }
    }

    // Fallback: If no device token and only 1 user exists in local DB
    if (!resolvedUserId) {
      const defaultUser = await prisma.user.findFirst();
      if (defaultUser) {
        resolvedUserId = defaultUser.id;
      }
    }

    if (!resolvedUserId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid device token or user identity" },
        { status: 401 }
      );
    }

    let addedCount = 0;
    let duplicateCount = 0;
    const addedTransactions = [];

    for (const tx of transactions) {
      const amount = parseFloat(tx.amount);
      if (isNaN(amount) || amount <= 0) continue;

      const refNumber = tx.refNumber ? String(tx.refNumber).trim() : null;
      const rawSmsHash = tx.fingerprint || null;

      // 2. Duplicate Detection
      // Check by refNumber (UTR / UPI Ref) if available
      if (refNumber) {
        const existingByRef = await prisma.expense.findFirst({
          where: {
            userId: resolvedUserId,
            refNumber: refNumber,
          },
        });
        if (existingByRef) {
          duplicateCount++;
          continue;
        }
      }

      // Check by rawSmsHash / fingerprint if available
      if (rawSmsHash) {
        const existingByHash = await prisma.expense.findFirst({
          where: {
            userId: resolvedUserId,
            rawSmsHash: rawSmsHash,
          },
        });
        if (existingByHash) {
          duplicateCount++;
          continue;
        }
      }

      // Check fuzzy match within 15-minute window for same amount & bank
      const txDate = tx.date ? new Date(tx.date) : new Date();
      const fifteenMinBefore = new Date(txDate.getTime() - 15 * 60 * 1000).toISOString();
      const fifteenMinAfter = new Date(txDate.getTime() + 15 * 60 * 1000).toISOString();

      const fuzzyDuplicate = await prisma.expense.findFirst({
        where: {
          userId: resolvedUserId,
          amount: amount,
          type: tx.type || "expense",
          createdAt: {
            gte: fifteenMinBefore,
            lte: fifteenMinAfter,
          },
        },
      });

      if (fuzzyDuplicate) {
        duplicateCount++;
        continue;
      }

      // 3. Create Validated Expense Record
      const noteParts = [];
      if (tx.merchantOrSender) noteParts.push(tx.merchantOrSender);
      if (tx.bank) noteParts.push(`(${tx.bank})`);
      if (refNumber) noteParts.push(`Ref: ${refNumber}`);

      const note = noteParts.join(" ") || "Auto-detected Bank Transaction";

      const created = await prisma.expense.create({
        data: {
          userId: resolvedUserId,
          amount: amount,
          category: tx.category || "food",
          note: note,
          createdAt: tx.date || new Date().toISOString(),
          type: tx.type || "expense",
          walletId: tx.walletId || (tx.paymentMethod === "UPI" ? "upi" : "bank"),
          bankName: tx.bank || null,
          paymentMethod: tx.paymentMethod || null,
          refNumber: refNumber,
          accountLast4: tx.accountLast4 ? String(tx.accountLast4) : null,
          merchant: tx.merchantOrSender || null,
          syncSource: "bank_sms",
          verifiedStatus: "auto_detected",
          rawSmsHash: rawSmsHash,
        },
      });

      addedCount++;
      addedTransactions.push(created);
    }

    // 4. Update Device Sync Telemetry
    if (deviceRecordId) {
      await prisma.smsDevicePairing.update({
        where: { id: deviceRecordId },
        data: {
          lastSyncAt: new Date(),
          syncCount: { increment: addedCount },
        },
      });
    }

    // 5. Audit Log
    if (addedCount > 0) {
      await prisma.auditLog.create({
        data: {
          userId: resolvedUserId,
          action: "SMS_TRANSACTION_SYNC",
          entity: "Expense",
          details: `Synchronized ${addedCount} transaction(s) from Bank SMS. Skipped ${duplicateCount} duplicate(s).`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      added: addedCount,
      duplicatesSkipped: duplicateCount,
      transactions: addedTransactions,
      syncedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error syncing SMS transactions:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to sync transactions" },
      { status: 500 }
    );
  }
}
