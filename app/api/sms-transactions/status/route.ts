import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    let targetUserId = userId;
    if (!targetUserId) {
      const defaultUser = await prisma.user.findFirst();
      if (!defaultUser) {
        return NextResponse.json({ success: true, connected: false, devices: [], totalAutoDetected: 0 });
      }
      targetUserId = defaultUser.id;
    }

    const devices = await prisma.smsDevicePairing.findMany({
      where: { userId: targetUserId, isActive: true },
      orderBy: { updatedAt: "desc" },
    });

    const totalAutoDetected = await prisma.expense.count({
      where: {
        userId: targetUserId,
        syncSource: "bank_sms",
      },
    });

    const recentAutoDetected = await prisma.expense.findMany({
      where: {
        userId: targetUserId,
        syncSource: "bank_sms",
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const connected = devices.length > 0;
    const lastSync = devices.length > 0 ? devices[0].lastSyncAt : null;

    return NextResponse.json({
      success: true,
      connected,
      devices,
      lastSyncAt: lastSync,
      totalAutoDetected,
      recentAutoDetected,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
