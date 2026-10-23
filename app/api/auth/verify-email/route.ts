import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateSixDigitCode, checkRateLimit, getClientIp } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(`verify:${clientIp}`, 10, 60 * 1000);
    if (!rateCheck.isAllowed) {
      return NextResponse.json(
        { error: `Too many verification attempts. Please wait ${rateCheck.retryAfterSec} seconds.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { email, code, resend } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email address is required." }, { status: 400 });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: { email: trimmedEmail },
    });

    if (!user) {
      return NextResponse.json({ error: "User account not found." }, { status: 404 });
    }

    // Handle resending verification code
    if (resend) {
      const newCode = generateSixDigitCode();
      const newExpiry = new Date(Date.now() + 15 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          verificationCode: newCode,
          verificationExpires: newExpiry,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "RESEND_VERIFICATION_CODE",
          entity: "User",
          details: JSON.stringify({ email: user.email }),
        },
      });

      return NextResponse.json({
        success: true,
        message: "A new 6-digit verification code has been dispatched to your email.",
        devVerificationCode: process.env.NODE_ENV !== "production" ? newCode : undefined,
      });
    }

    // Verify submitted code
    if (!code || typeof code !== "string" || code.trim().length !== 6) {
      return NextResponse.json(
        { error: "Please enter a valid 6-digit verification code." },
        { status: 400 }
      );
    }

    if (!user.verificationCode || user.verificationCode !== code.trim()) {
      return NextResponse.json(
        { error: "Incorrect verification code. Please check and try again." },
        { status: 400 }
      );
    }

    if (user.verificationExpires && new Date() > user.verificationExpires) {
      return NextResponse.json(
        { error: "This verification code has expired. Please request a new code." },
        { status: 400 }
      );
    }

    // Mark as verified & set active user
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        verificationCode: null,
        verificationExpires: null,
      },
    });

    await prisma.appState.upsert({
      where: { key: "active_user_id" },
      update: { value: user.id },
      create: { key: "active_user_id", value: user.id },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "EMAIL_VERIFIED",
        entity: "User",
        details: JSON.stringify({ email: user.email }),
      },
    });

    // Fetch user initial settings
    const settings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json({
      success: true,
      message: "Email verified successfully! You are now logged in.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isEmailVerified: true,
        createdAt: user.createdAt.toISOString(),
      },
      settings,
    });
  } catch (error: any) {
    console.error("Verification error:", error);
    return NextResponse.json(
      { error: "Failed to verify email code", details: error?.message },
      { status: 500 }
    );
  }
}
