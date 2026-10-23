import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const category = searchParams.get("category");
    const walletId = searchParams.get("walletId");
    const type = searchParams.get("type");
    const query = searchParams.get("q");

    if (!userId) {
      return NextResponse.json({ error: "userId parameter is required" }, { status: 400 });
    }

    const where: any = { userId };
    if (category) where.category = category;
    if (walletId) where.walletId = walletId;
    if (type) where.type = type;
    if (query) {
      where.OR = [
        { note: { contains: query } },
        { category: { contains: query } },
      ];
    }

    const expenses = await prisma.expense.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      expenses.map((e) => ({
        id: e.id,
        category: e.category,
        amount: e.amount,
        note: e.note,
        createdAt: e.createdAt,
        type: e.type as "expense" | "income",
        walletId: e.walletId || undefined,
        isRecurring: e.isRecurring,
        frequency: (e.frequency as any) || undefined,
      }))
    );
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, expense, expenses: batchExpenses } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Handle batch creation (e.g. from CSV import)
    if (Array.isArray(batchExpenses)) {
      const created = await prisma.$transaction(async (tx) => {
        const results = [];
        for (const exp of batchExpenses) {
          const item = await tx.expense.create({
            data: {
              id: exp.id || undefined,
              userId,
              category: exp.category,
              amount: Number(exp.amount),
              note: exp.note || "",
              createdAt: exp.createdAt || new Date().toISOString(),
              type: exp.type || "expense",
              walletId: exp.walletId || null,
              isRecurring: exp.isRecurring || false,
              frequency: exp.frequency || null,
            },
          });
          results.push(item);
        }

        await tx.auditLog.create({
          data: {
            userId,
            action: "BATCH_IMPORT_EXPENSES",
            entity: "Expense",
            details: JSON.stringify({ count: results.length }),
          },
        });

        return results;
      });

      return NextResponse.json({ success: true, count: created.length });
    }

    // Handle single creation
    if (!expense) {
      return NextResponse.json({ error: "expense data is required" }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.expense.create({
        data: {
          id: expense.id || undefined,
          userId,
          category: expense.category,
          amount: Number(expense.amount),
          note: expense.note || "",
          createdAt: expense.createdAt || new Date().toISOString(),
          type: expense.type || "expense",
          walletId: expense.walletId || null,
          isRecurring: expense.isRecurring || false,
          frequency: expense.frequency || null,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: "CREATE_EXPENSE",
          entity: "Expense",
          details: JSON.stringify({
            id: item.id,
            amount: item.amount,
            category: item.category,
            type: item.type,
          }),
        },
      });

      return item;
    });

    return NextResponse.json({
      success: true,
      expense: {
        id: created.id,
        category: created.category,
        amount: created.amount,
        note: created.note,
        createdAt: created.createdAt,
        type: created.type as "expense" | "income",
        walletId: created.walletId || undefined,
        isRecurring: created.isRecurring,
        frequency: (created.frequency as any) || undefined,
      },
    });
  } catch (error: any) {
    console.error("Create expense error:", error);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { userId, expense } = body;

    if (!userId || !expense || !expense.id) {
      return NextResponse.json({ error: "userId and expense with id are required" }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.expense.findFirst({
        where: { id: expense.id, userId },
      });
      if (!existing) {
        throw new Error("Unauthorized or expense record not found");
      }

      const item = await tx.expense.update({
        where: { id: expense.id },
        data: {
          category: expense.category,
          amount: Number(expense.amount),
          note: expense.note || "",
          createdAt: expense.createdAt,
          type: expense.type || "expense",
          walletId: expense.walletId || null,
          isRecurring: expense.isRecurring || false,
          frequency: expense.frequency || null,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: "UPDATE_EXPENSE",
          entity: "Expense",
          details: JSON.stringify({ id: item.id, amount: item.amount }),
        },
      });

      return item;
    });

    return NextResponse.json({ success: true, expense: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const id = searchParams.get("id");
    const clearAll = searchParams.get("clearAll") === "true";

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    if (clearAll) {
      const deleted = await prisma.$transaction(async (tx) => {
        const res = await tx.expense.deleteMany({
          where: { userId },
        });

        await tx.auditLog.create({
          data: {
            userId,
            action: "CLEAR_ALL_EXPENSES",
            entity: "Expense",
            details: JSON.stringify({ count: res.count }),
          },
        });

        return res;
      });

      return NextResponse.json({ success: true, count: deleted.count });
    }

    if (!id) {
      return NextResponse.json({ error: "id parameter is required" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.expense.findFirst({
        where: { id, userId },
      });
      if (!existing) {
        throw new Error("Unauthorized or expense record not found");
      }

      await tx.expense.delete({
        where: { id },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: "DELETE_EXPENSE",
          entity: "Expense",
          details: JSON.stringify({ id }),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
