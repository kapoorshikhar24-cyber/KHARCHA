import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";

// GET: Retrieve existing pairing info or generate a fresh 6-digit pairing code
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    let targetUserId = userId;
    if (!targetUserId) {
      let defaultUser = await prisma.user.findFirst();
      if (!defaultUser) {
        defaultUser = await prisma.user.create({
          data: {
            name: "Primary User",
            email: "user@kharcha.local",
            pinCode: "1234",
            isEmailVerified: true,
          },
        });
      }
      targetUserId = defaultUser.id;
    }

    // Check for existing active device or pairing session
    let device = await prisma.smsDevicePairing.findFirst({
      where: { userId: targetUserId, isActive: true },
      orderBy: { updatedAt: "desc" },
    });

    if (!device) {
      // Generate a new 6-digit code and token
      const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
      const deviceToken = "kharcha_dev_" + crypto.randomBytes(16).toString("hex");

      device = await prisma.smsDevicePairing.create({
        data: {
          userId: targetUserId,
          deviceName: "Android Companion App",
          deviceToken,
          pairingCode,
          isActive: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      userId: targetUserId,
      pairingCode: device.pairingCode,
      deviceToken: device.deviceToken,
      deviceName: device.deviceName,
      lastSyncAt: device.lastSyncAt,
      syncCount: device.syncCount,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: Android phone submits pairing code to complete link
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { pairingCode, deviceName } = body;

    if (!pairingCode) {
      return NextResponse.json({ success: false, error: "Pairing code required" }, { status: 400 });
    }

    const device = await prisma.smsDevicePairing.findFirst({
      where: { pairingCode: String(pairingCode).trim(), isActive: true },
    });

    if (!device) {
      return NextResponse.json({ success: false, error: "Invalid or expired pairing code" }, { status: 404 });
    }

    // Update device name if provided
    const updated = await prisma.smsDevicePairing.update({
      where: { id: device.id },
      data: {
        deviceName: deviceName || device.deviceName,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Device paired successfully with KHARCHA",
      deviceToken: updated.deviceToken,
      userId: updated.userId,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
