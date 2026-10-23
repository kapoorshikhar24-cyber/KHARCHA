import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isValidEmail, verifyPassword, checkRateLimit, getClientIp } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(`login:${clientIp}`, 10, 60 * 1000);
    if (!rateCheck.isAllowed) {
      return NextResponse.json(
        { error: `Too many login attempts. Please wait ${rateCheck.retryAfterSec} seconds before trying again.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { email, password } = body;

    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Email address and password are required." },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidEmail(trimmedEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address format." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({
      where: { email: trimmedEmail },
    });

    if (!user || !user.passwordHash || !user.passwordSalt) {
      return NextResponse.json(
        { error: "Invalid email or password. Please verify your credentials." },
        { status: 401 }
      );
    }

    // Verify password
    const passwordValid = verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!passwordValid) {
      return NextResponse.json(
        { error: "Invalid email or password. Please verify your credentials." },
        { status: 401 }
      );
    }

    // Check email verification status
    if (!user.isEmailVerified) {
      return NextResponse.json({
        requiresVerification: true,
        email: user.email,
        message: "Your email address has not been verified yet. Please enter the verification code sent to your email.",
      });
    }

    // Set as active user in AppState
    await prisma.appState.upsert({
      where: { key: "active_user_id" },
      update: { value: user.id },
      create: { key: "active_user_id", value: user.id },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "USER_LOGIN",
        entity: "User",
        details: JSON.stringify({ email: user.email }),
      },
    });

    // Fetch user complete partition data
    const [settings, categories, wallets, budgetGoals, expenses] = await Promise.all([
      prisma.userSettings.findUnique({ where: { userId: user.id } }),
      prisma.customCategory.findMany({ where: { userId: user.id } }),
      prisma.wallet.findMany({ where: { userId: user.id } }),
      prisma.budgetGoal.findMany({ where: { userId: user.id } }),
      prisma.expense.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: `Welcome back, ${user.name}!`,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || undefined,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt.toISOString(),
      },
      activeData: {
        settings: settings
          ? {
              theme: settings.theme,
              accentColor: settings.accentColor || undefined,
              biometric: settings.biometric,
              pin: settings.pin,
              pinCode: user.pinCode || "1234",
              voice: settings.voice,
              haptic: settings.haptic,
              offline: settings.offline,
              dailyBudget: settings.dailyBudget,
              monthlyBudget: settings.monthlyBudget,
              layoutMode: settings.layoutMode as any,
              userName: user.name,
              userEmail: user.email || "",
              profileImage: user.avatar || undefined,
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
    });
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Authentication service error", details: error?.message },
      { status: 500 }
    );
  }
}
