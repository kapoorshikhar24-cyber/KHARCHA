import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const appState = await prisma.appState.findUnique({
      where: { key: "active_user_id" },
    });
    return NextResponse.json({ activeUserId: appState?.value || null });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    await prisma.appState.upsert({
      where: { key: "active_user_id" },
      update: { value: userId },
      create: { key: "active_user_id", value: userId },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: "SWITCH_ACTIVE_USER",
        entity: "AppState",
        details: JSON.stringify({ activeUserId: userId }),
      },
    });

    return NextResponse.json({ success: true, activeUserId: userId });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
