import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const where: any = {};
    if (userId) where.userId = userId;

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 100),
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(
      logs.map((l) => ({
        id: l.id,
        userId: l.userId,
        userName: l.user?.name || "System",
        action: l.action,
        entity: l.entity,
        details: l.details,
        createdAt: l.createdAt.toISOString(),
      }))
    );
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, action, entity, details } = body;

    const log = await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action: action || "EVENT",
        entity: entity || "System",
        details: typeof details === "object" ? JSON.stringify(details) : details,
      },
    });

    return NextResponse.json({ success: true, id: log.id });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
