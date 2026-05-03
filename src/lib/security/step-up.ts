import type { StepUpPurpose } from "@/generated/prisma/client";
import { verifyPassword } from "@/lib/auth/password";
import { getPrisma } from "@/lib/db/prisma";
import { sanitizeAuditMetadata } from "@/lib/security/sanitize";

export const STEP_UP_TTL_MINUTES = 5;
export const STEP_UP_MAX_ATTEMPTS = 5;

function getPositiveIntegerEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getStepUpTtlMinutes() {
  return getPositiveIntegerEnv("STEP_UP_EXPIRES_IN_MINUTES", STEP_UP_TTL_MINUTES);
}

export function getStepUpMaxAttempts() {
  return getPositiveIntegerEnv("STEP_UP_MAX_ATTEMPTS", STEP_UP_MAX_ATTEMPTS);
}

function expiresAtFrom(now = new Date()) {
  return new Date(now.getTime() + getStepUpTtlMinutes() * 60 * 1000);
}

async function recordStepUpAudit(params: {
  userId: string;
  purpose: StepUpPurpose;
  success: boolean;
  reason?: string;
}) {
  await getPrisma().auditLog.create({
    data: {
      actorId: params.userId,
      actorUserId: params.userId,
      targetUserId: params.userId,
      action: params.success
        ? "STEP_UP_VERIFICATION_SUCCEEDED"
        : "STEP_UP_VERIFICATION_FAILED",
      targetType: "SESSION",
      metadata: sanitizeAuditMetadata({
        purpose: params.purpose,
        success: params.success,
        reason: params.reason,
      }),
    },
  });
}

export async function createStepUpVerification(params: {
  userId: string;
  purpose: StepUpPurpose;
  password: string;
}) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, passwordHash: true, status: true },
  });

  if (!user || user.status !== "ACTIVE" || !user.passwordHash) {
    await recordStepUpAudit({
      userId: params.userId,
      purpose: params.purpose,
      success: false,
      reason: "USER_NOT_ACTIVE_OR_PASSWORD_MISSING",
    });
    return null;
  }

  const verified = await verifyPassword(params.password, user.passwordHash);

  if (!verified) {
    await recordStepUpAudit({
      userId: params.userId,
      purpose: params.purpose,
      success: false,
      reason: "INVALID_PASSWORD",
    });
    return null;
  }

  const now = new Date();
  const stepUp = await prisma.stepUpVerification.create({
    data: {
      userId: params.userId,
      purpose: params.purpose,
      verifiedAt: now,
      expiresAt: expiresAtFrom(now),
    },
  });

  await recordStepUpAudit({
    userId: params.userId,
    purpose: params.purpose,
    success: true,
  });

  return stepUp;
}

export async function verifyPasswordForStepUp(params: {
  userId: string;
  purpose: StepUpPurpose;
  password: string;
}) {
  return createStepUpVerification(params);
}

export async function assertRecentStepUp(params: {
  actorUserId: string;
  purpose: StepUpPurpose;
  consume?: boolean;
}) {
  const prisma = getPrisma();
  const now = new Date();
  const stepUp = await prisma.stepUpVerification.findFirst({
    where: {
      userId: params.actorUserId,
      purpose: params.purpose,
      expiresAt: {
        gt: now,
      },
      consumedAt: null,
      revokedAt: null,
    },
    orderBy: {
      verifiedAt: "desc",
    },
  });

  if (!stepUp) {
    throw new Error("STEP_UP_REQUIRED");
  }

  if (params.consume) {
    await consumeStepUpVerification({
      stepUpVerificationId: stepUp.id,
      actorUserId: params.actorUserId,
      purpose: params.purpose,
    });
  }

  return stepUp;
}

export async function consumeStepUpVerification(params: {
  stepUpVerificationId: string;
  actorUserId: string;
  purpose: StepUpPurpose;
}) {
  const consumed = await getPrisma().stepUpVerification.updateMany({
    where: {
      id: params.stepUpVerificationId,
      userId: params.actorUserId,
      purpose: params.purpose,
      consumedAt: null,
      revokedAt: null,
    },
    data: {
      consumedAt: new Date(),
    },
  });

  if (consumed.count === 1) {
    await getPrisma().auditLog.create({
      data: {
        actorId: params.actorUserId,
        actorUserId: params.actorUserId,
        targetUserId: params.actorUserId,
        action: "STEP_UP_VERIFICATION_CONSUMED",
        targetType: "SESSION",
        targetId: params.stepUpVerificationId,
        metadata: sanitizeAuditMetadata({
          purpose: params.purpose,
        }),
      },
    });
  }
}

export async function revokeUserStepUps(params: {
  userId: string;
  purpose?: StepUpPurpose;
}) {
  await getPrisma().stepUpVerification.updateMany({
    where: {
      userId: params.userId,
      purpose: params.purpose,
      consumedAt: null,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export async function assertStepUpPassword(params: {
  userId: string;
  purpose: StepUpPurpose;
  password: string;
}) {
  const stepUp = await createStepUpVerification(params);

  if (!stepUp) {
    throw new Error("STEP_UP_REQUIRED");
  }

  return stepUp;
}

export function isHighRiskEmployeeChange(params: {
  beforeRole: string;
  nextRole: string;
  beforeStatus: string;
  nextStatus: string;
}) {
  return (
    params.beforeRole !== params.nextRole ||
    params.beforeStatus !== params.nextStatus ||
    params.nextRole === "OWNER" ||
    params.beforeRole === "OWNER" ||
    params.nextStatus === "DEACTIVATED"
  );
}

export function resolveEmployeeChangeStepUpPurpose(params: {
  beforeRole: string;
  nextRole: string;
  nextStatus: string;
}): StepUpPurpose {
  if (params.beforeRole === "OWNER" || params.nextRole === "OWNER") {
    return "OWNER_ROLE_CHANGE";
  }

  if (params.nextStatus === "DEACTIVATED") {
    return "EMPLOYEE_DEACTIVATION";
  }

  return "ROLE_CHANGE";
}

export function getStepUpPurposeForAction(action: string): StepUpPurpose {
  if (action === "REPORT_EXPORT") return "REPORT_EXPORT";
  if (action === "INVITATION_REISSUE") return "INVITATION_REISSUE";
  if (action === "SESSION_ADMIN") return "SESSION_ADMIN";
  if (action === "POLICY_CHANGE") return "POLICY_CHANGE";
  if (action === "SECURITY_ADMIN") return "SECURITY_ADMIN";
  return "ROLE_CHANGE";
}
