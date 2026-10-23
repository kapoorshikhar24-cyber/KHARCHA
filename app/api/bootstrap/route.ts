import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        createdAt: true,
        pinCode: true,
        biometricCredential: true,
        isEmailVerified: true,
      },
    });

    if (users.length === 0) {
      return NextResponse.json({
        isInitialized: false,
        users: [],
        activeUserId: null,
        activeData: null,
      });
    }

    // Get active user ID from AppState or fallback to first user
    const appState = await prisma.appState.findUnique({
      where: { key: "active_user_id" },
    });

    let activeUserId = appState?.value;
    if (!activeUserId || !users.some((u) => u.id === activeUserId)) {
      activeUserId = users[0].id;
      await prisma.appState.upsert({
        where: { key: "active_user_id" },
        update: { value: activeUserId },
        create: { key: "active_user_id", value: activeUserId },
      });
    }

    // Fetch active user complete profile
    const [settings, categories, wallets, budgetGoals, expenses] = await Promise.all([
      prisma.userSettings.findUnique({ where: { userId: activeUserId } }),
      prisma.customCategory.findMany({ where: { userId: activeUserId } }),
      prisma.wallet.findMany({ where: { userId: activeUserId } }),
      prisma.budgetGoal.findMany({ where: { userId: activeUserId } }),
      prisma.expense.findMany({
        where: { userId: activeUserId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const activeUser = users.find((u) => u.id === activeUserId);

    return NextResponse.json({
      isInitialized: true,
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email || undefined,
        avatar: u.avatar || undefined,
        isEmailVerified: u.isEmailVerified,
        createdAt: u.createdAt.toISOString(),
      })),
      activeUserId,
      activeData: {
        settings: settings
          ? {
              theme: settings.theme,
              accentColor: settings.accentColor || undefined,
              biometric: settings.biometric,
              pin: settings.pin,
              pinCode: activeUser?.pinCode || "1234",
              voice: settings.voice,
              haptic: settings.haptic,
              offline: settings.offline,
              dailyBudget: settings.dailyBudget,
              monthlyBudget: settings.monthlyBudget,
              layoutMode: settings.layoutMode as any,
              userName: activeUser?.name || "User",
              userEmail: activeUser?.email || "",
              profileImage: activeUser?.avatar || undefined,
              defaultWalletId: settings.defaultWalletId,
              currency: settings.currency as any,
            }
          : null,
        categories: categories.map((c) => ({
          id: c.categoryKey,
          label: c.label,
          icon: c.icon,
          color: c.color,
          bg: c.bg,
          defaultAmount: c.defaultAmount ?? undefined,
          type: c.type as "expense" | "income",
        })),
        wallets: wallets.map((w) => ({
          id: w.walletKey,
          label: w.label,
          icon: w.icon,
          color: w.color,
          initialBalance: w.initialBalance,
        })),
        budgetGoals: budgetGoals.map((b) => ({
          categoryId: b.categoryId,
          limit: b.limit,
        })),
        expenses: expenses.map((e) => ({
          id: e.id,
          category: e.category,
          amount: e.amount,
          note: e.note,
          createdAt: e.createdAt,
          type: e.type as "expense" | "income",
          walletId: e.walletId || undefined,
          isRecurring: e.isRecurring,
          frequency: (e.frequency as any) || undefined,
        })),
      },
      storageType: "enterprise_sqlite_prisma",
    });
  } catch (error: any) {
    console.error("Bootstrap error:", error);
    return NextResponse.json(
      { error: "Failed to bootstrap database", details: error?.message },
      { status: 500 }
    );
  }
}
