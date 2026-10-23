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
      },
    });
    return NextResponse.json(users);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, avatar, email, pinCode, settings, wallets, categories, budgetGoals } = body;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: name || "User",
          email: email || "",
          avatar: avatar || null,
          pinCode: pinCode || "1234",
        },
      });

      // Default wallets if not provided
      const initialWallets = wallets && wallets.length > 0 ? wallets : [
        { id: "cash", label: "Cash", icon: "💵", color: "#1D9E75", initialBalance: 0 },
        { id: "bank", label: "Bank", icon: "🏦", color: "#378ADD", initialBalance: 0 },
        { id: "upi",  label: "UPI",  icon: "📱", color: "#7F77DD", initialBalance: 0 },
      ];

      for (const w of initialWallets) {
        await tx.wallet.create({
          data: {
            userId: user.id,
            walletKey: w.id,
            label: w.label,
            icon: w.icon,
            color: w.color,
            initialBalance: Number(w.initialBalance || 0),
          },
        });
      }

      // Default categories if provided
      if (categories && Array.isArray(categories)) {
        for (const c of categories) {
          await tx.customCategory.create({
            data: {
              userId: user.id,
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

      // Settings
      await tx.userSettings.create({
        data: {
          userId: user.id,
          theme: settings?.theme || "dark",
          accentColor: settings?.accentColor || null,
          biometric: settings?.biometric ?? true,
          pin: settings?.pin ?? true,
          voice: settings?.voice ?? true,
          haptic: settings?.haptic ?? true,
          offline: settings?.offline ?? true,
          dailyBudget: Number(settings?.dailyBudget ?? 2000),
          monthlyBudget: Number(settings?.monthlyBudget ?? 50000),
          layoutMode: settings?.layoutMode || "mobile",
          currency: settings?.currency || "₹",
          defaultWalletId: settings?.defaultWalletId || "cash",
        },
      });

      // Budget goals if provided
      if (budgetGoals && Array.isArray(budgetGoals)) {
        for (const bg of budgetGoals) {
          await tx.budgetGoal.create({
            data: {
              userId: user.id,
              categoryId: bg.categoryId,
              limit: Number(bg.limit),
            },
          });
        }
      }

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "CREATE_USER",
          entity: "User",
          details: JSON.stringify({ userName: user.name }),
        },
      });

      return user;
    });

    return NextResponse.json({
      success: true,
      user: {
        id: result.id,
        name: result.name,
        avatar: result.avatar || undefined,
        createdAt: result.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Create user error:", error);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
