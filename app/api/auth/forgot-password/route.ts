import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isValidEmail, generateSixDigitCode, checkRateLimit, getClientIp } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(`forgot:${clientIp}`, 5, 60 * 1000);
    if (!rateCheck.isAllowed) {
      return NextResponse.json(
        { error: `Too many password reset requests. Please wait ${rateCheck.retryAfterSec} seconds.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email address is required." }, { status: 400 });
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidEmail(trimmedEmail)) {
      return NextResponse.json({ error: "Please enter a valid email format." }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { email: trimmedEmail },
    });

    // For privacy, we return a generic message even if user doesn't exist, but if user exists, generate reset code
    if (!user) {
      return NextResponse.json({
        success: true,
        message: "If an account with that email exists, a password reset code has been dispatched.",
      });
    }

    const resetCode = generateSixDigitCode();
    const resetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetCode,
        resetExpires,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "PASSWORD_RESET_REQUESTED",
        entity: "User",
        details: JSON.stringify({ email: user.email }),
      },
    });

    return NextResponse.json({
      success: true,
      message: "A 6-digit password reset code has been dispatched to your email address.",
      devResetCode: process.env.NODE_ENV !== "production" ? resetCode : undefined,
    });
  } catch (error: any) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Failed to process password reset request", details: error?.message },
      { status: 500 }
    );
  }
}
