import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const [users, settings, wallets, categories, budgetGoals, expenses, auditLogs] =
      await Promise.all([
        prisma.user.findMany(),
        prisma.userSettings.findMany(),
        prisma.wallet.findMany(),
        prisma.customCategory.findMany(),
        prisma.budgetGoal.findMany(),
        prisma.expense.findMany(),
        prisma.auditLog.findMany({ take: 200, orderBy: { createdAt: "desc" } }),
      ]);

    const backup = {
      version: "2.0.0-enterprise",
      exportedAt: new Date().toISOString(),
      engine: "Prisma+SQLite",
      data: {
        users,
        settings,
        wallets,
        categories,
        budgetGoals,
        expenses,
        auditLogs,
      },
    };

    return NextResponse.json(backup);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const backup = await req.json();
    if (!backup?.data?.users) {
      return NextResponse.json({ error: "Invalid backup payload" }, { status: 400 });
    }

    const { users, settings, wallets, categories, budgetGoals, expenses } = backup.data;

    await prisma.$transaction(async (tx) => {
      // Clean slate for full restore
      await tx.auditLog.deleteMany();
      await tx.expense.deleteMany();
      await tx.budgetGoal.deleteMany();
      await tx.customCategory.deleteMany();
      await tx.wallet.deleteMany();
      await tx.userSettings.deleteMany();
      await tx.user.deleteMany();

      // Restore Users
      for (const u of users) {
        await tx.user.create({
          data: {
            id: u.id,
            name: u.name,
            email: u.email,
            avatar: u.avatar,
            pinCode: u.pinCode,
            biometricCredential: u.biometricCredential,
            createdAt: new Date(u.createdAt),
          },
        });
      }

      // Restore Settings
      if (Array.isArray(settings)) {
        for (const s of settings) {
          await tx.userSettings.create({
            data: {
              userId: s.userId,
              theme: s.theme,
              accentColor: s.accentColor,
              biometric: s.biometric,
              pin: s.pin,
              voice: s.voice,
              haptic: s.haptic,
              offline: s.offline,
              dailyBudget: s.dailyBudget,
              monthlyBudget: s.monthlyBudget,
              layoutMode: s.layoutMode,
              currency: s.currency,
              defaultWalletId: s.defaultWalletId,
            },
          });
        }
      }

      // Restore Wallets
      if (Array.isArray(wallets)) {
        for (const w of wallets) {
          await tx.wallet.create({
            data: {
              userId: w.userId,
              walletKey: w.walletKey,
              label: w.label,
              icon: w.icon,
              color: w.color,
              initialBalance: w.initialBalance,
            },
          });
        }
      }

      // Restore Categories
      if (Array.isArray(categories)) {
        for (const c of categories) {
          await tx.customCategory.create({
            data: {
              userId: c.userId,
              categoryKey: c.categoryKey,
              label: c.label,
              icon: c.icon,
              color: c.color,
              bg: c.bg,
              defaultAmount: c.defaultAmount,
              type: c.type,
            },
          });
        }
      }

      // Restore BudgetGoals
      if (Array.isArray(budgetGoals)) {
        for (const bg of budgetGoals) {
          await tx.budgetGoal.create({
            data: {
              userId: bg.userId,
              categoryId: bg.categoryId,
              limit: bg.limit,
            },
          });
        }
      }

      // Restore Expenses
      if (Array.isArray(expenses)) {
        for (const e of expenses) {
          await tx.expense.create({
            data: {
              id: e.id,
              userId: e.userId,
              category: e.category,
              amount: e.amount,
              note: e.note || "",
              createdAt: e.createdAt,
              type: e.type,
              walletId: e.walletId,
              isRecurring: e.isRecurring ?? false,
              frequency: e.frequency,
            },
          });
        }
      }

      // Log restoration audit
      await tx.auditLog.create({
        data: {
          action: "RESTORE_DATABASE_BACKUP",
          entity: "Database",
          details: JSON.stringify({
            usersCount: users.length,
            expensesCount: expenses?.length || 0,
          }),
        },
      });
    });

    return NextResponse.json({ success: true, message: "Database restored successfully" });
  } catch (error: any) {
    console.error("Restore error:", error);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
