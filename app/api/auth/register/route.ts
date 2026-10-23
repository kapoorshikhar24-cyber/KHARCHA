import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isValidEmail, validatePasswordStrength, hashPassword, generateSixDigitCode, checkRateLimit, getClientIp } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(`register:${clientIp}`, 5, 60 * 1000);
    if (!rateCheck.isAllowed) {
      return NextResponse.json(
        { error: `Too many registration attempts. Please wait ${rateCheck.retryAfterSec} seconds.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { name, email, password, confirmPassword } = body;

    // 1. Required field validations
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Full Name is required." },
        { status: 400 }
      );
    }

    if (!email || typeof email !== "string" || email.trim().length === 0) {
      return NextResponse.json(
        { error: "Email address is required." },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();

    // 2. Email format validation
    if (!isValidEmail(trimmedEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address (e.g. user@example.com)." },
        { status: 400 }
      );
    }

    // 3. Password match validation
    if (!password) {
      return NextResponse.json(
        { error: "Password is required." },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "Passwords do not match." },
        { status: 400 }
      );
    }

    // 4. Password strength validation
    const strength = validatePasswordStrength(password);
    if (!strength.isValid) {
      return NextResponse.json(
        {
          error: "Password does not meet security requirements.",
          details: strength.errors,
        },
        { status: 400 }
      );
    }

    // 5. Check if email is already registered
    const existingUser = await prisma.user.findFirst({
      where: {
        email: trimmedEmail,
      },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          error: "This email address is already registered. Please log in or reset your password.",
        },
        { status: 409 }
      );
    }

    // 6. Secure password hashing
    const { salt, hash } = hashPassword(password);

    // 7. Generate 6-digit email verification code with 15-minute expiry
    const verificationCode = generateSixDigitCode();
    const verificationExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    // 8. Create user and initial isolated environment in a single ACID transaction
    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: name.trim(),
          email: trimmedEmail,
          passwordHash: hash,
          passwordSalt: salt,
          isEmailVerified: false,
          verificationCode,
          verificationExpires,
          pinCode: "1234",
        },
      });

      // Default wallets
      const initialWallets = [
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
            initialBalance: w.initialBalance,
          },
        });
      }

      // Default user settings
      await tx.userSettings.create({
        data: {
          userId: user.id,
          theme: "dark",
          biometric: false,
          pin: false,
          voice: true,
          haptic: true,
          offline: true,
          dailyBudget: 2000,
          monthlyBudget: 50000,
          layoutMode: "mobile",
          currency: "₹",
          defaultWalletId: "cash",
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "USER_REGISTERED",
          entity: "User",
          details: JSON.stringify({
            name: user.name,
            email: user.email,
            isEmailVerified: false,
          }),
        },
      });

      return user;
    });

    return NextResponse.json({
      success: true,
      message: "Account created successfully! An email verification code has been dispatched.",
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        isEmailVerified: false,
      },
      // In local/development environment, include verification code for effortless testing
      devVerificationCode: process.env.NODE_ENV !== "production" ? verificationCode : undefined,
    });
  } catch (error: any) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error during registration", details: error?.message },
      { status: 500 }
    );
  }
}
