import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, expenses, settings, categories, wallets, budgetGoals } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Sync UserSettings
      if (settings) {
        await tx.userSettings.upsert({
          where: { userId },
          update: {
            theme: settings.theme || "dark",
            accentColor: settings.accentColor || null,
            biometric: settings.biometric ?? true,
            pin: settings.pin ?? true,
            voice: settings.voice ?? true,
            haptic: settings.haptic ?? true,
            offline: settings.offline ?? true,
            dailyBudget: Number(settings.dailyBudget ?? 2000),
            monthlyBudget: Number(settings.monthlyBudget ?? 50000),
            layoutMode: settings.layoutMode || "mobile",
            currency: settings.currency || "₹",
            defaultWalletId: settings.defaultWalletId || "cash",
          },
          create: {
            userId,
            theme: settings.theme || "dark",
            accentColor: settings.accentColor || null,
            biometric: settings.biometric ?? true,
            pin: settings.pin ?? true,
            voice: settings.voice ?? true,
            haptic: settings.haptic ?? true,
            offline: settings.offline ?? true,
            dailyBudget: Number(settings.dailyBudget ?? 2000),
            monthlyBudget: Number(settings.monthlyBudget ?? 50000),
            layoutMode: settings.layoutMode || "mobile",
            currency: settings.currency || "₹",
            defaultWalletId: settings.defaultWalletId || "cash",
          },
        });
      }

      // 2. Sync Wallets if provided
      if (Array.isArray(wallets)) {
        await tx.wallet.deleteMany({ where: { userId } });
        for (const w of wallets) {
          await tx.wallet.create({
            data: {
              userId,
              walletKey: w.id,
              label: w.label,
              icon: w.icon,
              color: w.color,
              initialBalance: Number(w.initialBalance || 0),
            },
          });
        }
      }

      // 3. Sync Categories if provided
      if (Array.isArray(categories)) {
        await tx.customCategory.deleteMany({ where: { userId } });
        for (const c of categories) {
          await tx.customCategory.create({
            data: {
              userId,
              categoryKey: c.id,
              label: c.label,
              icon: c.icon,
              color: c.color,
              bg: c.bg || "var(--token-surfaceElevated)",
              defaultAmount: c.defaultAmount ? Number(c.defaultAmount) : null,
              type: c.type || "expense",
            },
          });
        }
      }

      // 4. Sync Budget Goals if provided
      if (Array.isArray(budgetGoals)) {
        await tx.budgetGoal.deleteMany({ where: { userId } });
        for (const bg of budgetGoals) {
          await tx.budgetGoal.create({
            data: {
              userId,
              categoryId: bg.categoryId,
              limit: Number(bg.limit),
            },
          });
        }
      }

      // 5. Reconcile Expenses (Incremental Upsert to prevent wiping bank SMS or concurrent data)
      if (Array.isArray(expenses)) {
        for (const exp of expenses) {
          if (!exp) continue;
          const expData = {
            userId,
            category: exp.category || "other",
            amount: Number(exp.amount) || 0,
            note: exp.note || "",
            createdAt: exp.createdAt || new Date().toISOString(),
            type: exp.type || "expense",
            walletId: exp.walletId || null,
            isRecurring: exp.isRecurring ?? false,
            frequency: exp.frequency || null,
            bankName: exp.bankName || null,
            paymentMethod: exp.paymentMethod || null,
            refNumber: exp.refNumber || null,
            accountLast4: exp.accountLast4 || null,
            merchant: exp.merchant || null,
            syncSource: exp.syncSource || "manual",
            verifiedStatus: exp.verifiedStatus || "verified",
            rawSmsHash: exp.rawSmsHash || null,
          };

          if (exp.id) {
            await tx.expense.upsert({
              where: { id: exp.id },
              update: expData,
              create: {
                id: exp.id,
                ...expData,
              },
            });
          } else {
            await tx.expense.create({
              data: expData,
            });
          }
        }
      }
    });

    return NextResponse.json({ success: true, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error("Sync user data error:", error);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
