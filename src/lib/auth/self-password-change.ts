import {
  getPasswordPolicyResult,
  hashPassword,
  verifyPassword,
} from "@/lib/auth/password";
import type { getPrisma } from "@/lib/db/prisma";
import type { Role } from "@/lib/rbac/roles";

export const SELF_PASSWORD_CHANGE_AUDIT_EVENT = "SELF_PASSWORD_CHANGED";
export const SELF_PASSWORD_CHANGE_AUDIT_ACTION = "SECURITY_SETTING_CHANGED";

export type SelfPasswordChangeErrorCode =
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "CURRENT_PASSWORD_INVALID"
  | "PASSWORD_MISMATCH"
  | "PASSWORD_POLICY";

export class SelfPasswordChangeError extends Error {
  constructor(public readonly code: SelfPasswordChangeErrorCode) {
    super(code);
    this.name = "SelfPasswordChangeError";
  }
}

type SelfPasswordChangePrisma = Pick<
  ReturnType<typeof getPrisma>,
  "$transaction" | "user" | "auditLog"
>;

type SelfPasswordChangeActor = {
  id: string;
  role: Role;
  status: string;
};

type AuditRequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

function normalizeOptionalTargetUserId(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export async function changeOwnPassword(params: {
  prisma: SelfPasswordChangePrisma;
  actor: SelfPasswordChangeActor;
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
  targetUserIdFromClient?: string | null;
  requestContext?: AuditRequestContext;
}) {
  if (params.actor.status !== "ACTIVE") {
    throw new SelfPasswordChangeError("FORBIDDEN");
  }

  const requestedTargetUserId = normalizeOptionalTargetUserId(
    params.targetUserIdFromClient,
  );

  if (requestedTargetUserId && requestedTargetUserId !== params.actor.id) {
    throw new SelfPasswordChangeError("FORBIDDEN");
  }

  if (
    !params.currentPassword ||
    !params.newPassword ||
    !params.confirmNewPassword
  ) {
    throw new SelfPasswordChangeError("INVALID_INPUT");
  }

  if (params.newPassword !== params.confirmNewPassword) {
    throw new SelfPasswordChangeError("PASSWORD_MISMATCH");
  }

  if (!getPasswordPolicyResult(params.newPassword).valid) {
    throw new SelfPasswordChangeError("PASSWORD_POLICY");
  }

  const user = await params.prisma.user.findUnique({
    where: { id: params.actor.id },
    select: {
      id: true,
      role: true,
      status: true,
      passwordHash: true,
    },
  });

  if (!user || user.status !== "ACTIVE" || !user.passwordHash) {
    throw new SelfPasswordChangeError("CURRENT_PASSWORD_INVALID");
  }

  const currentPasswordVerified = await verifyPassword(
    params.currentPassword,
    user.passwordHash,
  );

  if (!currentPasswordVerified) {
    throw new SelfPasswordChangeError("CURRENT_PASSWORD_INVALID");
  }

  const nextPasswordHash = await hashPassword(params.newPassword);

  await params.prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: params.actor.id },
      data: { passwordHash: nextPasswordHash },
    });

    await tx.auditLog.create({
      data: {
        actorId: params.actor.id,
        actorUserId: params.actor.id,
        targetUserId: params.actor.id,
        action: SELF_PASSWORD_CHANGE_AUDIT_ACTION,
        targetType: "USER",
        targetId: params.actor.id,
        ipAddress: params.requestContext?.ipAddress ?? null,
        userAgent: params.requestContext?.userAgent ?? null,
        metadata: {
          event: SELF_PASSWORD_CHANGE_AUDIT_EVENT,
          actorUserId: params.actor.id,
          targetUserId: params.actor.id,
          actorRole: user.role,
          changedFields: ["passwordCredential"],
          changeMode: "SELF_SERVICE_CURRENT_PASSWORD",
        },
      },
    });
  });

  return {
    userId: params.actor.id,
  };
}
