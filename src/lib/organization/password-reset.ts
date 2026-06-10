import { getPasswordPolicyResult, hashPassword } from "@/lib/auth/password";
import { maskEmail } from "@/lib/security/masking";
import type { Role } from "@/lib/rbac/roles";
import type { getPrisma } from "@/lib/db/prisma";

export const PASSWORD_RESET_AUDIT_EVENT = "USER_PASSWORD_RESET";
export const PASSWORD_RESET_AUDIT_ACTION = "SECURITY_SETTING_CHANGED";
export const PASSWORD_RESET_STEP_UP_PURPOSE = "SECURITY_ADMIN";

export type EmployeePasswordResetErrorCode =
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "PASSWORD_MISMATCH"
  | "PASSWORD_POLICY"
  | "STEP_UP_REQUIRED"
  | "TARGET_NOT_FOUND"
  | "TARGET_DELETED";

export class EmployeePasswordResetError extends Error {
  constructor(public readonly code: EmployeePasswordResetErrorCode) {
    super(code);
    this.name = "EmployeePasswordResetError";
  }
}

type PasswordResetPrisma = Pick<
  ReturnType<typeof getPrisma>,
  "$transaction" | "user" | "auditLog"
>;

type PasswordResetActor = {
  id: string;
  role: Role;
  status: string;
};

type AssertStepUpPassword = (params: {
  userId: string;
  purpose: typeof PASSWORD_RESET_STEP_UP_PURPOSE;
  password: string;
}) => Promise<unknown>;

export async function resetEmployeePasswordByOwner(params: {
  prisma: PasswordResetPrisma;
  actor: PasswordResetActor;
  targetUserId: string;
  temporaryPassword: string;
  confirmTemporaryPassword: string;
  stepUpPassword: string;
  assertStepUpPassword: AssertStepUpPassword;
}) {
  if (params.actor.role !== "OWNER" || params.actor.status !== "ACTIVE") {
    throw new EmployeePasswordResetError("FORBIDDEN");
  }

  if (!params.targetUserId || !params.temporaryPassword || !params.confirmTemporaryPassword) {
    throw new EmployeePasswordResetError("INVALID_INPUT");
  }

  if (params.temporaryPassword !== params.confirmTemporaryPassword) {
    throw new EmployeePasswordResetError("PASSWORD_MISMATCH");
  }

  if (!getPasswordPolicyResult(params.temporaryPassword).valid) {
    throw new EmployeePasswordResetError("PASSWORD_POLICY");
  }

  if (!params.stepUpPassword) {
    throw new EmployeePasswordResetError("STEP_UP_REQUIRED");
  }

  try {
    await params.assertStepUpPassword({
      userId: params.actor.id,
      purpose: PASSWORD_RESET_STEP_UP_PURPOSE,
      password: params.stepUpPassword,
    });
  } catch {
    throw new EmployeePasswordResetError("STEP_UP_REQUIRED");
  }

  const target = await params.prisma.user.findUnique({
    where: { id: params.targetUserId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
    },
  });

  if (!target) {
    throw new EmployeePasswordResetError("TARGET_NOT_FOUND");
  }

  if (target.status === "DELETED") {
    throw new EmployeePasswordResetError("TARGET_DELETED");
  }

  const passwordHash = await hashPassword(params.temporaryPassword);
  const targetEmailMasked = maskEmail(target.email);

  await params.prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.id },
      data: { passwordHash },
    });

    await tx.auditLog.create({
      data: {
        actorId: params.actor.id,
        actorUserId: params.actor.id,
        targetUserId: target.id,
        action: PASSWORD_RESET_AUDIT_ACTION,
        targetType: "USER",
        targetId: target.id,
        metadata: {
          event: PASSWORD_RESET_AUDIT_EVENT,
          actorUserId: params.actor.id,
          targetUserId: target.id,
          targetEmailMasked,
          targetRole: target.role,
          targetStatus: target.status,
          changedFields: ["passwordCredential"],
          resetMode: "OWNER_INPUT_TEMP_PASSWORD",
        },
      },
    });
  });

  return {
    targetUserId: target.id,
    targetEmailMasked,
  };
}
