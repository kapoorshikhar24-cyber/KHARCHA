import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { users, activeUserId, userData } = body;

    // Check if database already has users
    const existingCount = await prisma.user.count();
    if (existingCount > 0) {
      return NextResponse.json({
        message: "Database already contains users. Migration skipped to prevent overwriting.",
        migrated: false,
      });
    }

    if (!users || !Array.isArray(users) || users.length === 0) {
      return NextResponse.json({ error: "No user profiles provided for migration" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      for (const u of users) {
        const uData = userData?.[u.id] || {};
        const uSettings = uData.settings || {};
        const uExpenses = uData.expenses || [];
        const uCategories = uSettings.customCategories || [];
        const uWallets = uSettings.wallets || [
          { id: "cash", label: "Cash", icon: "💵", color: "#1D9E75" },
          { id: "bank", label: "Bank", icon: "🏦", color: "#378ADD" },
          { id: "upi",  label: "UPI",  icon: "📱", color: "#7F77DD" },
        ];
        const uBudgetGoals = uSettings.budgetGoals || [];

        // 1. Create User
        await tx.user.create({
          data: {
            id: u.id,
            name: u.name || "User",
            email: uSettings.userEmail || "",
            avatar: u.avatar || uSettings.profileImage || null,
            pinCode: uSettings.pinCode || "1234",
            createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
          },
        });

        // 2. Create UserSettings
        await tx.userSettings.create({
          data: {
            userId: u.id,
            theme: uSettings.theme || "dark",
            accentColor: uSettings.accentColor || null,
            biometric: uSettings.biometric ?? true,
            pin: uSettings.pin ?? true,
            voice: uSettings.voice ?? true,
            haptic: uSettings.haptic ?? true,
            offline: uSettings.offline ?? true,
            dailyBudget: Number(uSettings.dailyBudget ?? 2000),
            monthlyBudget: Number(uSettings.monthlyBudget ?? 50000),
            layoutMode: uSettings.layoutMode || "mobile",
            currency: uSettings.currency || "₹",
            defaultWalletId: uSettings.defaultWalletId || "cash",
          },
        });

        // 3. Create Wallets
        for (const w of uWallets) {
          await tx.wallet.create({
            data: {
              userId: u.id,
              walletKey: w.id,
              label: w.label,
              icon: w.icon,
              color: w.color,
              initialBalance: Number(w.initialBalance || 0),
            },
          });
        }

        // 4. Create Categories
        for (const c of uCategories) {
          await tx.customCategory.create({
            data: {
              userId: u.id,
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

        // 5. Create Budget Goals
        for (const bg of uBudgetGoals) {
          await tx.budgetGoal.create({
            data: {
              userId: u.id,
              categoryId: bg.categoryId,
              limit: Number(bg.limit),
            },
          });
        }

        // 6. Create Expenses
        for (const exp of uExpenses) {
          await tx.expense.create({
            data: {
              id: exp.id || undefined,
              userId: u.id,
              category: exp.category,
              amount: Number(exp.amount),
              note: exp.note || "",
              createdAt: exp.createdAt || new Date().toISOString(),
              type: exp.type || "expense",
              walletId: exp.walletId || null,
              isRecurring: exp.isRecurring ?? false,
              frequency: exp.frequency || null,
            },
          });
        }
      }

      // Set active user
      const targetActiveId = activeUserId || users[0].id;
      await tx.appState.upsert({
        where: { key: "active_user_id" },
        update: { value: targetActiveId },
        create: { key: "active_user_id", value: targetActiveId },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          action: "LEGACY_DATA_MIGRATION",
          entity: "System",
          details: JSON.stringify({
            userCount: users.length,
            targetActiveId,
          }),
        },
      });
    });

    return NextResponse.json({
      success: true,
      migrated: true,
      userCount: users.length,
    });
  } catch (error: any) {
    console.error("Migration error:", error);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
