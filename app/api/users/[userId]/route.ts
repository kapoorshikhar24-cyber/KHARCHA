import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [settings, categories, wallets, budgetGoals, expenses] = await Promise.all([
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.customCategory.findMany({ where: { userId } }),
      prisma.wallet.findMany({ where: { userId } }),
      prisma.budgetGoal.findMany({ where: { userId } }),
      prisma.expense.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email || "",
        avatar: user.avatar || undefined,
        pinCode: user.pinCode || "1234",
        createdAt: user.createdAt.toISOString(),
      },
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
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const body = await req.json();
    const { name, avatar, email, pinCode, biometricCredential } = body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(avatar !== undefined ? { avatar } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(pinCode !== undefined ? { pinCode } : {}),
        ...(biometricCredential !== undefined ? { biometricCredential } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: "UPDATE_USER_PROFILE",
        entity: "User",
        details: JSON.stringify({ name: updatedUser.name }),
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        avatar: updatedUser.avatar || undefined,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          userId,
          action: "DELETE_USER",
          entity: "User",
          details: `User ${userId} deleted with cascade`,
        },
      });

      await tx.user.delete({
        where: { id: userId },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
