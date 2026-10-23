import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, settings, categories, wallets, budgetGoals } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Update User root fields if present
      if (settings?.userName || settings?.userEmail || settings?.profileImage || settings?.pinCode) {
        await tx.user.update({
          where: { id: userId },
          data: {
            ...(settings.userName ? { name: settings.userName } : {}),
            ...(settings.userEmail !== undefined ? { email: settings.userEmail } : {}),
            ...(settings.profileImage !== undefined ? { avatar: settings.profileImage } : {}),
            ...(settings.pinCode ? { pinCode: settings.pinCode } : {}),
          },
        });
      }

      // 2. Upsert UserSettings
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

      // 3. Sync Wallets if provided
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

      // 4. Sync Custom Categories if provided
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

      // 5. Sync Budget Goals if provided
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

      // 6. Audit Log
      await tx.auditLog.create({
        data: {
          userId,
          action: "UPDATE_SETTINGS",
          entity: "UserSettings",
          details: JSON.stringify({
            theme: settings?.theme,
            currency: settings?.currency,
            dailyBudget: settings?.dailyBudget,
            monthlyBudget: settings?.monthlyBudget,
          }),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Settings update error:", error);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
