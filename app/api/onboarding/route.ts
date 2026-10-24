import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkRateLimit, getClientIp } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId parameter is required." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        settings: true,
        onboardingState: true,
        integrations: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // If onboardingState does not exist yet (e.g. legacy user or first access), create one
    let onboarding = user.onboardingState;
    if (!onboarding) {
      onboarding = await prisma.onboardingState.create({
        data: {
          userId: user.id,
          status: user.isProfileCompleted ? "completed" : "in_progress",
          currentStep: user.isProfileCompleted ? 6 : 1,
          completedSteps: user.isProfileCompleted ? JSON.stringify(["welcome", "profile", "preferences", "integrations", "review"]) : "[]",
          skippedOptionalSteps: "[]",
          startedAt: new Date(),
          completedAt: user.isProfileCompleted ? new Date() : null,
        },
      });
    }

    let parsedCompletedSteps: string[] = [];
    let parsedSkippedSteps: string[] = [];
    try {
      parsedCompletedSteps = JSON.parse(onboarding.completedSteps || "[]");
    } catch {
      parsedCompletedSteps = [];
    }
    try {
      parsedSkippedSteps = JSON.parse(onboarding.skippedOptionalSteps || "[]");
    } catch {
      parsedSkippedSteps = [];
    }

    return NextResponse.json({
      success: true,
      onboarding: {
        id: onboarding.id,
        status: onboarding.status,
        currentStep: onboarding.currentStep,
        completedSteps: parsedCompletedSteps,
        skippedOptionalSteps: parsedSkippedSteps,
        startedAt: onboarding.startedAt,
        completedAt: onboarding.completedAt,
      },
      user: {
        id: user.id,
        name: user.name,
        displayName: user.displayName || user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        country: user.country || "IN",
        timezone: user.timezone || "Asia/Kolkata",
        preferredLanguage: user.preferredLanguage || "en",
        avatar: user.avatar,
        isEmailVerified: user.isEmailVerified,
        isProfileCompleted: user.isProfileCompleted,
      },
      settings: user.settings,
      integrations: user.integrations,
    });
  } catch (error: any) {
    console.error("GET Onboarding error:", error);
    return NextResponse.json(
      { error: "Failed to fetch onboarding state", details: error?.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(`onboard:${clientIp}`, 30, 60 * 1000);
    if (!rateCheck.isAllowed) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const {
      userId,
      step,
      stepKey,
      isCompleted = true,
      isSkipped = false,
      isFinalStep = false,
      profileData,
      preferencesData,
      integrationsData,
    } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required." }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { onboardingState: true, settings: true },
    });

    if (!existingUser) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update Profile if provided in this step
      if (profileData) {
        await tx.user.update({
          where: { id: userId },
          data: {
            ...(profileData.name ? { name: profileData.name.trim() } : {}),
            ...(profileData.displayName !== undefined ? { displayName: profileData.displayName?.trim() || null } : {}),
            ...(profileData.phoneNumber !== undefined ? { phoneNumber: profileData.phoneNumber?.trim() || null } : {}),
            ...(profileData.country ? { country: profileData.country } : {}),
            ...(profileData.timezone ? { timezone: profileData.timezone } : {}),
            ...(profileData.preferredLanguage ? { preferredLanguage: profileData.preferredLanguage } : {}),
            ...(profileData.avatar !== undefined ? { avatar: profileData.avatar || null } : {}),
          },
        });
      }

      // 2. Update Preferences if provided in this step
      if (preferencesData) {
        await tx.userSettings.upsert({
          where: { userId },
          update: {
            ...(preferencesData.currency ? { currency: preferencesData.currency } : {}),
            ...(preferencesData.monthlyBudget !== undefined ? { monthlyBudget: Number(preferencesData.monthlyBudget) } : {}),
            ...(preferencesData.dailyBudget !== undefined ? { dailyBudget: Number(preferencesData.dailyBudget) } : {}),
            ...(preferencesData.monthlyResetDay !== undefined ? { monthlyResetDay: Number(preferencesData.monthlyResetDay) } : {}),
            ...(preferencesData.notificationPreferences ? {
              notificationPreferences: typeof preferencesData.notificationPreferences === "string"
                ? preferencesData.notificationPreferences
                : JSON.stringify(preferencesData.notificationPreferences)
            } : {}),
            ...(preferencesData.dashboardPreferences ? {
              dashboardPreferences: typeof preferencesData.dashboardPreferences === "string"
                ? preferencesData.dashboardPreferences
                : JSON.stringify(preferencesData.dashboardPreferences)
            } : {}),
          },
          create: {
            userId,
            currency: preferencesData.currency || "₹",
            monthlyBudget: Number(preferencesData.monthlyBudget ?? 50000),
            dailyBudget: Number(preferencesData.dailyBudget ?? 2000),
            monthlyResetDay: Number(preferencesData.monthlyResetDay ?? 1),
            notificationPreferences: typeof preferencesData.notificationPreferences === "string"
              ? preferencesData.notificationPreferences
              : JSON.stringify(preferencesData.notificationPreferences || { smsAlerts: true, budgetThresholdAlerts: true }),
            dashboardPreferences: typeof preferencesData.dashboardPreferences === "string"
              ? preferencesData.dashboardPreferences
              : JSON.stringify(preferencesData.dashboardPreferences || { defaultPeriod: "month", showQuickAdd: true }),
          },
        });
      }

      // 3. Update Integrations if provided in this step
      if (Array.isArray(integrationsData)) {
        for (const item of integrationsData) {
          if (item.integrationType) {
            await tx.userIntegration.upsert({
              where: {
                userId_integrationType: {
                  userId,
                  integrationType: item.integrationType,
                },
              },
              update: {
                connectionStatus: item.connectionStatus || "disconnected",
                consentStatus: item.consentStatus || "pending",
                connectedAt: item.connectionStatus === "connected" ? new Date() : null,
                lastSyncAt: item.lastSyncAt ? new Date(item.lastSyncAt) : null,
                metadata: item.metadata ? JSON.stringify(item.metadata) : null,
              },
              create: {
                userId,
                integrationType: item.integrationType,
                connectionStatus: item.connectionStatus || "disconnected",
                consentStatus: item.consentStatus || "pending",
                connectedAt: item.connectionStatus === "connected" ? new Date() : null,
                metadata: item.metadata ? JSON.stringify(item.metadata) : null,
              },
            });
          }
        }
      }

      // 4. Update OnboardingState
      let currentCompleted: string[] = [];
      let currentSkipped: string[] = [];

      if (existingUser.onboardingState) {
        try {
          currentCompleted = JSON.parse(existingUser.onboardingState.completedSteps || "[]");
        } catch {
          currentCompleted = [];
        }
        try {
          currentSkipped = JSON.parse(existingUser.onboardingState.skippedOptionalSteps || "[]");
        } catch {
          currentSkipped = [];
        }
      }

      if (stepKey) {
        if (isCompleted && !currentCompleted.includes(stepKey)) {
          currentCompleted.push(stepKey);
        }
        if (isSkipped && !currentSkipped.includes(stepKey)) {
          currentSkipped.push(stepKey);
        }
      }

      const nextStatus = isFinalStep ? "completed" : "in_progress";
      const nextStepNumber = typeof step === "number" ? Math.max(step, 1) : 1;

      const updatedOnboarding = await tx.onboardingState.upsert({
        where: { userId },
        update: {
          status: nextStatus,
          currentStep: nextStepNumber,
          completedSteps: JSON.stringify(currentCompleted),
          skippedOptionalSteps: JSON.stringify(currentSkipped),
          ...(isFinalStep ? { completedAt: new Date() } : {}),
        },
        create: {
          userId,
          status: nextStatus,
          currentStep: nextStepNumber,
          completedSteps: JSON.stringify(currentCompleted),
          skippedOptionalSteps: JSON.stringify(currentSkipped),
          startedAt: new Date(),
          completedAt: isFinalStep ? new Date() : null,
        },
      });

      // If final step, mark user's profile as completed
      if (isFinalStep) {
        await tx.user.update({
          where: { id: userId },
          data: { isProfileCompleted: true },
        });

        await tx.auditLog.create({
          data: {
            userId,
            action: "ONBOARDING_COMPLETED",
            entity: "User",
            details: JSON.stringify({ completedAt: new Date().toISOString() }),
          },
        });
      } else {
        await tx.auditLog.create({
          data: {
            userId,
            action: `ONBOARDING_STEP_${step || 1}`,
            entity: "OnboardingState",
            details: JSON.stringify({ stepKey, isCompleted, isSkipped }),
          },
        });
      }

      return updatedOnboarding;
    });

    return NextResponse.json({
      success: true,
      message: isFinalStep ? "Onboarding completed successfully!" : "Progress saved.",
      onboarding: {
        status: result.status,
        currentStep: result.currentStep,
        isCompleted: result.status === "completed",
      },
    });
  } catch (error: any) {
    console.error("POST Onboarding error:", error);
    return NextResponse.json(
      { error: "Failed to save onboarding progress", details: error?.message },
      { status: 500 }
    );
  }
}
