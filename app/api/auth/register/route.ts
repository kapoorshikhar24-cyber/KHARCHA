import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  isValidEmail,
  validatePasswordStrength,
  hashPassword,
  generateSixDigitCode,
  checkRateLimit,
  getClientIp,
  isValidPhoneNumber,
  normalizePhoneNumber,
} from "@/lib/auth";

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
    const { name, email, password, confirmPassword, phoneNumber, countryCode = "+91", agreedToTerms } = body;

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

    // 3. Optional Phone number validation
    let normalizedPhone: string | null = null;
    if (phoneNumber && typeof phoneNumber === "string" && phoneNumber.trim().length > 0) {
      if (!isValidPhoneNumber(phoneNumber.trim())) {
        return NextResponse.json(
          { error: "Please enter a valid mobile number with country code." },
          { status: 400 }
        );
      }
      normalizedPhone = normalizePhoneNumber(phoneNumber.trim(), countryCode || "+91");
    }

    // 4. Terms of Service & Privacy agreement validation
    if (!agreedToTerms) {
      return NextResponse.json(
        { error: "You must accept the Terms of Service and Privacy Policy to continue." },
        { status: 400 }
      );
    }

    // 5. Password match validation
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

    // 6. Password strength validation
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

    // 7. Check if email is already registered
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

    // 8. Secure password hashing
    const { salt, hash } = hashPassword(password);

    // 9. Generate 6-digit email verification code with 15-minute expiry
    const verificationCode = generateSixDigitCode();
    const verificationExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    // 10. Create user, settings, wallets, and onboarding state in a single ACID transaction
    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: name.trim(),
          displayName: name.trim().split(" ")[0],
          email: trimmedEmail,
          phoneNumber: normalizedPhone,
          country: countryCode ? countryCode.replace("+", "") : "IN",
          passwordHash: hash,
          passwordSalt: salt,
          isEmailVerified: false,
          isProfileCompleted: false,
          agreedToTerms: true,
          agreedToTermsAt: new Date(),
          verificationCode,
          verificationExpires,
          pinCode: "1234",
        },
      });

      // Initialize Onboarding State at Step 1
      await tx.onboardingState.create({
        data: {
          userId: user.id,
          status: "in_progress",
          currentStep: 1,
          completedSteps: "[]",
          skippedOptionalSteps: "[]",
          startedAt: new Date(),
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
          monthlyResetDay: 1,
          layoutMode: "mobile",
          currency: "₹",
          defaultWalletId: "cash",
          notificationPreferences: JSON.stringify({ smsAlerts: true, emailReports: false, budgetThresholdAlerts: true }),
          dashboardPreferences: JSON.stringify({ defaultPeriod: "month", showQuickAdd: true }),
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
            phoneNumber: user.phoneNumber,
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
        displayName: newUser.displayName,
        email: newUser.email,
        phoneNumber: newUser.phoneNumber,
        isEmailVerified: false,
        isProfileCompleted: false,
        onboardingStatus: "in_progress",
      },
      // In local/development environment, include verification code for testing convenience
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
