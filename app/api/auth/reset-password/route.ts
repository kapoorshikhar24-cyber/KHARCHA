import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isValidEmail, validatePasswordStrength, hashPassword, checkRateLimit, getClientIp } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(`reset:${clientIp}`, 5, 60 * 1000);
    if (!rateCheck.isAllowed) {
      return NextResponse.json(
        { error: `Too many password reset attempts. Please wait ${rateCheck.retryAfterSec} seconds.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { email, code, newPassword, confirmPassword } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email address is required." }, { status: 400 });
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidEmail(trimmedEmail)) {
      return NextResponse.json({ error: "Please enter a valid email format." }, { status: 400 });
    }

    if (!code || typeof code !== "string" || code.trim().length !== 6) {
      return NextResponse.json({ error: "Please enter the 6-digit reset code." }, { status: 400 });
    }

    if (!newPassword || typeof newPassword !== "string") {
      return NextResponse.json({ error: "New password is required." }, { status: 400 });
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
    }

    // Password strength verification
    const strength = validatePasswordStrength(newPassword);
    if (!strength.isValid) {
      return NextResponse.json(
        {
          error: "New password does not meet security requirements.",
          details: strength.errors,
        },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({
      where: { email: trimmedEmail },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid password reset request." }, { status: 400 });
    }

    if (!user.resetCode || user.resetCode !== code.trim()) {
      return NextResponse.json(
        { error: "Invalid or expired reset code. Please check and try again." },
        { status: 400 }
      );
    }

    if (user.resetExpires && new Date() > user.resetExpires) {
      return NextResponse.json(
        { error: "This reset code has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // Hash new password
    const { salt, hash } = hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        passwordSalt: salt,
        resetCode: null,
        resetExpires: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "PASSWORD_RESET_COMPLETED",
        entity: "User",
        details: JSON.stringify({ email: user.email }),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Password reset successfully! You can now log in with your new password.",
    });
  } catch (error: any) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "Failed to reset password", details: error?.message },
      { status: 500 }
    );
  }
}
