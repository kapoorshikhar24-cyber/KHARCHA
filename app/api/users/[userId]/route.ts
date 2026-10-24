import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const url = new URL(req.url);
    const isExport = url.searchParams.get("export") === "true";

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        onboardingState: true,
        integrations: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [settings, categories, wallets, budgetGoals, expenses, auditLogs] = await Promise.all([
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.customCategory.findMany({ where: { userId } }),
      prisma.wallet.findMany({ where: { userId } }),
      prisma.budgetGoal.findMany({ where: { userId } }),
      prisma.expense.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    // Handle full GDPR/Personal Data Export
    if (isExport) {
      const exportData = {
        exportDate: new Date().toISOString(),
        version: "2.0-secure",
        userProfile: {
          id: user.id,
          name: user.name,
          displayName: user.displayName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          country: user.country,
          timezone: user.timezone,
          preferredLanguage: user.preferredLanguage,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        settings,
        wallets,
        categories,
        budgetGoals,
        expenses,
        integrations: user.integrations,
        auditLogs,
      };

      await prisma.auditLog.create({
        data: {
          userId,
          action: "EXPORT_USER_DATA",
          entity: "User",
          details: JSON.stringify({ exportDate: new Date().toISOString() }),
        },
      });

      return new NextResponse(JSON.stringify(exportData, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="kharcha-data-${user.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.json"`,
        },
      });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        displayName: user.displayName || user.name,
        email: user.email || "",
        phoneNumber: user.phoneNumber || undefined,
        country: user.country || "IN",
        timezone: user.timezone || "Asia/Kolkata",
        preferredLanguage: user.preferredLanguage || "en",
        isEmailVerified: user.isEmailVerified,
        isProfileCompleted: user.isProfileCompleted,
        onboardingStatus: user.onboardingState?.status || "completed",
        createdAt: user.createdAt.toISOString(),
      },
      settings: settings
        ? {
            theme: settings.theme,
            accentColor: settings.accentColor || undefined,
            biometric: settings.biometric,
            pin: settings.pin,
            pinCode: settings.pin ? "••••" : "",
            voice: settings.voice,
            haptic: settings.haptic,
            offline: settings.offline,
            dailyBudget: settings.dailyBudget,
            monthlyBudget: settings.monthlyBudget,
            monthlyResetDay: settings.monthlyResetDay || 1,
            layoutMode: settings.layoutMode as "mobile" | "desktop" | "windows" | "phone" | "responsive" | "web",
            userName: user.name,
            userEmail: user.email || "",
            profileImage: user.avatar || undefined,
            defaultWalletId: settings.defaultWalletId,
            currency: settings.currency as "₹" | "$" | "€" | "£",
            notificationPreferences: settings.notificationPreferences,
            dashboardPreferences: settings.dashboardPreferences,
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
        frequency: (e.frequency as "daily" | "weekly" | "monthly" | "yearly") || undefined,
      })),
      integrations: user.integrations.map((i) => ({
        type: i.integrationType,
        status: i.connectionStatus,
        consent: i.consentStatus,
        connectedAt: i.connectedAt,
      })),
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const body = await req.json();
    const {
      name,
      displayName,
      avatar,
      email,
      phoneNumber,
      country,
      timezone,
      preferredLanguage,
      pinCode,
      biometricCredential,
      isProfileCompleted,
    } = body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(displayName !== undefined ? { displayName: displayName?.trim() || null } : {}),
        ...(avatar !== undefined ? { avatar } : {}),
        ...(email !== undefined ? { email: email.trim().toLowerCase() } : {}),
        ...(phoneNumber !== undefined ? { phoneNumber: phoneNumber?.trim() || null } : {}),
        ...(country !== undefined ? { country } : {}),
        ...(timezone !== undefined ? { timezone } : {}),
        ...(preferredLanguage !== undefined ? { preferredLanguage } : {}),
        ...(pinCode !== undefined ? { pinCode } : {}),
        ...(biometricCredential !== undefined ? { biometricCredential } : {}),
        ...(isProfileCompleted !== undefined ? { isProfileCompleted } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: "UPDATE_USER_PROFILE",
        entity: "User",
        details: JSON.stringify({
          name: updatedUser.name,
          displayName: updatedUser.displayName,
          email: updatedUser.email,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        displayName: updatedUser.displayName,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber,
        country: updatedUser.country,
        timezone: updatedUser.timezone,
        preferredLanguage: updatedUser.preferredLanguage,
        avatar: updatedUser.avatar || undefined,
        isProfileCompleted: updatedUser.isProfileCompleted,
      },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!existingUser) {
      return NextResponse.json({ error: "User account not found." }, { status: 404 });
    }

    try {
      const body = await req.json();
      if (body?.confirmEmail) {
        if (!existingUser.email || body.confirmEmail.toLowerCase().trim() !== existingUser.email.toLowerCase().trim()) {
          return NextResponse.json({ error: "Confirmation email does not match user account." }, { status: 400 });
        }
      }
    } catch {
      // Body empty or non-JSON
    }

    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          userId,
          action: "DELETE_USER",
          entity: "User",
          details: `User ${userId} requested full account deletion`,
        },
      });

      // Delete cascades to UserSettings, Wallets, CustomCategories, BudgetGoals, Expenses, OnboardingState, UserIntegrations
      await tx.user.delete({
        where: { id: userId },
      });

      // If this was active_user_id, reset to another user or null
      const activeState = await tx.appState.findUnique({
        where: { key: "active_user_id" },
      });

      if (activeState?.value === userId) {
        const remainingUser = await tx.user.findFirst();
        if (remainingUser) {
          await tx.appState.update({
            where: { key: "active_user_id" },
            data: { value: remainingUser.id },
          });
        } else {
          await tx.appState.delete({
            where: { key: "active_user_id" },
          });
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: "Account and associated data permanently deleted.",
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
