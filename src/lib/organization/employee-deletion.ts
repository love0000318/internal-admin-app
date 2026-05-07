import { randomUUID } from "node:crypto";

import { Prisma, type Role, type User, type UserStatus } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { sanitizeAuditMetadata } from "@/lib/security/sanitize";
import { assertRecentStepUp } from "@/lib/security/step-up";

export type EmployeeDeletionImpact = {
  canHardDelete: boolean;
  shouldAnonymize: boolean;
  counts: {
    leaveRequests: number;
    leaveLedgers: number;
    leaveGrants: number;
    attendanceRecords: number;
    attendanceChangeRequests: number;
    auditLogsAsActor: number;
    auditLogsAsTarget: number;
    notifications: number;
    sessions: number;
    invitations: number;
    hrProfiles: number;
    businessRecords: number;
  };
  warnings: string[];
};

type Actor = {
  id: string;
  role: Role;
  status: UserStatus;
};

const DELETED_EMPLOYEE_NAME = "삭제된 직원";

export function buildDeletedEmployeeEmail(userId: string) {
  return `deleted-${userId}@deleted.internal`;
}

function unusablePasswordHash(userId: string) {
  return `deleted:${userId}:${randomUUID()}`;
}

export function getDeletedEmployeeDisplayName(user: Pick<User, "id" | "name" | "status">) {
  return user.status === "DELETED" ? `${DELETED_EMPLOYEE_NAME} #${user.id.slice(-6)}` : user.name;
}

export async function analyzeEmployeeDeletionImpact(
  userId: string,
): Promise<EmployeeDeletionImpact> {
  const prisma = getPrisma();
  const [
    leaveRequests,
    leaveLedgers,
    leaveGrants,
    attendanceRecords,
    attendanceChangeRequests,
    auditLogsAsActor,
    auditLogsAsTarget,
    notifications,
    sessions,
    invitations,
    profile,
    sensitiveProfile,
    employmentProfile,
    employmentContracts,
    compensationProfiles,
    familyMembers,
    careerRecords,
    educationRecords,
    languageSkills,
    certificateRecords,
    projectSkillRecords,
    trainingRecords,
    profileChangeRequests,
    leaveBalances,
    leaveAdjustments,
    createdLeaveAdjustments,
    reviewedLeaveRequests,
    annualLeaveUsePlans,
    annualLeavePromotionNotices,
    leaveAttachments,
    reviewedLeaveAttachments,
    calendarSubscriptionTokens,
    jobRunsTriggered,
  ] = await Promise.all([
    prisma.leaveRequest.count({ where: { userId } }),
    prisma.leaveLedger.count({ where: { userId } }),
    prisma.leaveGrant.count({ where: { userId } }),
    prisma.attendanceRecord.count({ where: { userId } }),
    prisma.attendanceChangeRequest.count({ where: { userId } }),
    prisma.auditLog.count({ where: { OR: [{ actorId: userId }, { actorUserId: userId }] } }),
    prisma.auditLog.count({ where: { targetUserId: userId } }),
    prisma.notification.count({ where: { userId } }),
    prisma.session.count({ where: { userId } }),
    prisma.invitation.count({
      where: {
        OR: [
          { acceptedUserId: userId },
          { acceptedByUserId: userId },
          { invitedByUserId: userId },
          { createdById: userId },
        ],
      },
    }),
    prisma.employeeProfile.count({ where: { userId } }),
    prisma.employeeSensitiveProfile.count({ where: { userId } }),
    prisma.employmentProfile.count({ where: { userId } }),
    prisma.employmentContractProfile.count({ where: { userId } }),
    prisma.compensationProfile.count({ where: { userId } }),
    prisma.familyMember.count({ where: { userId } }),
    prisma.careerRecord.count({ where: { userId } }),
    prisma.educationRecord.count({ where: { userId } }),
    prisma.languageSkill.count({ where: { userId } }),
    prisma.certificateRecord.count({ where: { userId } }),
    prisma.projectSkillRecord.count({ where: { userId } }),
    prisma.trainingRecord.count({ where: { userId } }),
    prisma.employeeProfileChangeRequest.count({ where: { userId } }),
    prisma.leaveBalance.count({ where: { userId } }),
    prisma.leaveAdjustment.count({ where: { userId } }),
    prisma.leaveAdjustment.count({ where: { createdById: userId } }),
    prisma.leaveRequest.count({ where: { reviewerId: userId } }),
    prisma.annualLeaveUsePlan.count({ where: { userId } }),
    prisma.annualLeavePromotionNotice.count({ where: { userId } }),
    prisma.leaveAttachment.count({
      where: {
        OR: [
          { uploadedByUserId: userId },
          { reviewedByUserId: userId },
          { deletedByUserId: userId },
        ],
      },
    }),
    prisma.leaveAttachment.count({ where: { reviewedByUserId: userId } }),
    prisma.calendarSubscriptionToken.count({ where: { userId } }),
    prisma.jobRun.count({ where: { triggeredByUserId: userId } }),
  ]);
  const hrProfiles =
    profile +
    sensitiveProfile +
    employmentProfile +
    employmentContracts +
    compensationProfiles +
    familyMembers +
    careerRecords +
    educationRecords +
    languageSkills +
    certificateRecords +
    projectSkillRecords +
    trainingRecords +
    profileChangeRequests;
  const businessRecords =
    leaveBalances +
    leaveAdjustments +
    createdLeaveAdjustments +
    reviewedLeaveRequests +
    annualLeaveUsePlans +
    annualLeavePromotionNotices +
    leaveAttachments +
    reviewedLeaveAttachments +
    calendarSubscriptionTokens +
    jobRunsTriggered;
  const counts = {
    leaveRequests,
    leaveLedgers,
    leaveGrants,
    attendanceRecords,
    attendanceChangeRequests,
    auditLogsAsActor,
    auditLogsAsTarget,
    notifications,
    sessions,
    invitations,
    hrProfiles,
    businessRecords,
  };
  const canHardDelete = false;
  const warnings = [
    ...(leaveRequests || leaveLedgers || leaveGrants
      ? ["휴가/장부 기록이 있어 익명화 삭제가 필요합니다."]
      : []),
    ...(attendanceRecords || attendanceChangeRequests
      ? ["근태 기록이 있어 업무 기록을 보존하고 User row를 익명화합니다."]
      : []),
    ...(businessRecords
      ? ["휴가 보유/조정/사용계획/첨부/캘린더/Job 기록이 있어 User row를 보존하고 익명화합니다."]
      : []),
    ...(auditLogsAsActor || auditLogsAsTarget
      ? ["AuditLog 참조가 있어 User row를 보존하고 개인정보를 익명화합니다."]
      : []),
    ...(hrProfiles ? ["HR 관련 개인정보는 삭제 또는 null 처리됩니다."] : []),
    "기본 정책은 안전 삭제입니다. 업무 기록이 없어도 User row는 DELETED 상태로 보존하고 개인정보만 익명화합니다.",
    "증명자료 파일의 물리 삭제 정책은 별도 보존/파기 정책에 따라 처리해야 합니다.",
  ];

  return {
    canHardDelete,
    shouldAnonymize: !canHardDelete,
    counts,
    warnings,
  };
}

export async function assertCanDeleteEmployee(params: {
  actor: Actor;
  targetUserId: string;
}) {
  const prisma = getPrisma();
  const target = await prisma.user.findUnique({ where: { id: params.targetUserId } });

  if (!target) {
    throw new Error("EMPLOYEE_NOT_FOUND");
  }

  if (params.actor.role !== "OWNER" || params.actor.status !== "ACTIVE") {
    await recordDeleteBlocked(params.actor.id, target.id, "OWNER_REQUIRED");
    throw new Error("OWNER_REQUIRED");
  }

  if (target.id === params.actor.id) {
    await recordDeleteBlocked(params.actor.id, target.id, "SELF_DELETE_BLOCKED");
    throw new Error("SELF_DELETE_BLOCKED");
  }

  if (target.status === "DELETED" || target.deletedAt) {
    await recordDeleteBlocked(params.actor.id, target.id, "ALREADY_DELETED");
    throw new Error("ALREADY_DELETED");
  }

  if (target.status !== "DEACTIVATED") {
    await recordDeleteBlocked(params.actor.id, target.id, "TARGET_NOT_DEACTIVATED");
    throw new Error("TARGET_NOT_DEACTIVATED");
  }

  if (target.role === "OWNER") {
    const activeOwnerCount = await prisma.user.count({
      where: { role: "OWNER", status: "ACTIVE" },
    });

    if (activeOwnerCount <= 1) {
      await recordDeleteBlocked(params.actor.id, target.id, "LAST_OWNER_PROTECTION");
      throw new Error("LAST_OWNER_PROTECTION");
    }
  }

  return target;
}

export async function deleteDeactivatedEmployeePermanently(params: {
  actor: Actor;
  targetUserId: string;
  reason?: string | null;
}) {
  const target = await assertCanDeleteEmployee({
    actor: params.actor,
    targetUserId: params.targetUserId,
  });

  await assertRecentStepUp({
    actorUserId: params.actor.id,
    purpose: "EMPLOYEE_PERMANENT_DELETE",
  });

  const impact = await analyzeEmployeeDeletionImpact(target.id);

  await getPrisma().auditLog.create({
    data: {
      actorId: params.actor.id,
      actorUserId: params.actor.id,
      targetUserId: target.id,
      action: "EMPLOYEE_DELETE_IMPACT_ANALYZED",
      targetType: "USER",
      targetId: target.id,
      metadata: sanitizeAuditMetadata({
        targetUserId: target.id,
        impactCounts: impact.counts,
        canHardDelete: impact.canHardDelete,
        shouldAnonymize: impact.shouldAnonymize,
      }),
    },
  });

  await getPrisma().auditLog.create({
    data: {
      actorId: params.actor.id,
      actorUserId: params.actor.id,
      targetUserId: target.id,
      action: "EMPLOYEE_PERMANENT_DELETE_REQUESTED",
      targetType: "USER",
      targetId: target.id,
      metadata: sanitizeAuditMetadata({
        targetUserId: target.id,
        deletionMode: "SAFE_DELETE",
        reason: params.reason ?? null,
        impactCounts: impact.counts,
      }),
    },
  });

  return anonymizeDeletedEmployee({
    actorUserId: params.actor.id,
    targetUserId: target.id,
    reason: params.reason,
    impact,
  });
}

export async function anonymizeDeletedEmployee(params: {
  actorUserId: string;
  targetUserId: string;
  reason?: string | null;
  impact?: EmployeeDeletionImpact;
}) {
  const prisma = getPrisma();
  const now = new Date();
  const impact = params.impact ?? (await analyzeEmployeeDeletionImpact(params.targetUserId));
  const before = await prisma.user.findUnique({
    where: { id: params.targetUserId },
    select: { status: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: { userId: params.targetUserId, revokedAt: null },
      data: { revokedAt: now, revokedReason: "EMPLOYEE_PERMANENT_DELETE" },
    });
    await tx.invitation.updateMany({
      where: {
        status: "PENDING",
        OR: [
          { acceptedUserId: params.targetUserId },
          { acceptedByUserId: params.targetUserId },
          { invitedByUserId: params.targetUserId },
          { createdById: params.targetUserId },
        ],
      },
      data: {
        status: "REVOKED",
        verificationCodeRevokedAt: now,
        shortTokenRevokedAt: now,
      },
    });
    await tx.notification.updateMany({
      where: { userId: params.targetUserId, readAt: null },
      data: { readAt: now },
    });
    await tx.calendarSubscriptionToken.updateMany({
      where: { userId: params.targetUserId, revokedAt: null },
      data: { isEnabled: false, revokedAt: now },
    });
    await tx.identityVerification.deleteMany({ where: { userId: params.targetUserId } });
    await tx.employeeSensitiveProfile.deleteMany({ where: { userId: params.targetUserId } });
    await tx.familyMember.deleteMany({ where: { userId: params.targetUserId } });
    await tx.compensationProfile.deleteMany({ where: { userId: params.targetUserId } });
    await tx.employmentContractProfile.deleteMany({ where: { userId: params.targetUserId } });
    await tx.careerRecord.deleteMany({ where: { userId: params.targetUserId } });
    await tx.educationRecord.deleteMany({ where: { userId: params.targetUserId } });
    await tx.languageSkill.deleteMany({ where: { userId: params.targetUserId } });
    await tx.certificateRecord.deleteMany({ where: { userId: params.targetUserId } });
    await tx.projectSkillRecord.deleteMany({ where: { userId: params.targetUserId } });
    await tx.trainingRecord.deleteMany({ where: { userId: params.targetUserId } });
    await tx.employeeProfileChangeRequest.updateMany({
      where: { userId: params.targetUserId },
      data: {
        requestedChanges: Prisma.JsonNull,
        beforeSnapshot: Prisma.JsonNull,
        reviewComment: null,
      },
    });
    await tx.employeeProfileChangeRequest.updateMany({
      where: { userId: params.targetUserId, status: "PENDING" },
      data: {
        status: "CANCELLED",
        reviewedAt: now,
        reviewedByUserId: params.actorUserId,
      },
    });
    await tx.employeeProfile.updateMany({
      where: { userId: params.targetUserId },
      data: {
        employeeNumber: null,
        legalName: null,
        displayName: DELETED_EMPLOYEE_NAME,
        englishName: null,
        birthDate: null,
        birthday: null,
        legalGender: null,
        personalEmail: null,
        phoneCountryCode: null,
        phoneNumber: null,
        nationalityCode: null,
        residenceCountry: null,
        visaStatus: null,
        address: null,
        postalCode: null,
        deactivatedAt: now,
      },
    });
    await tx.employmentProfile.updateMany({
      where: { userId: params.targetUserId },
      data: {
        primaryJob: null,
        additionalJob: null,
        organizationName: null,
        organizationCode: null,
        jobTitle: null,
        position: null,
        jobGrade: null,
        employmentInsuranceLossReason: null,
      },
    });
    await tx.user.update({
      where: { id: params.targetUserId },
      data: {
        email: buildDeletedEmployeeEmail(params.targetUserId),
        phone: null,
        name: DELETED_EMPLOYEE_NAME,
        title: null,
        teamId: null,
        hireDate: null,
        birthDate: null,
        status: "DELETED",
        passwordHash: unusablePasswordHash(params.targetUserId),
        lastLoginAt: null,
        deactivatedAt: now,
        deletedAt: now,
        deletedByUserId: params.actorUserId,
        deletionReason: params.reason ?? null,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: params.actorUserId,
        actorUserId: params.actorUserId,
        targetUserId: params.targetUserId,
        action: "EMPLOYEE_ANONYMIZED",
        targetType: "USER",
        targetId: params.targetUserId,
        metadata: sanitizeAuditMetadata({
          targetUserId: params.targetUserId,
          deletionMode: "SAFE_DELETE",
          previousStatus: before?.status ?? null,
          newStatus: "DELETED",
          retainedRecordsSummary: {
            leaveRequests: impact.counts.leaveRequests,
            leaveLedgers: impact.counts.leaveLedgers,
            leaveGrants: impact.counts.leaveGrants,
            attendanceRecords: impact.counts.attendanceRecords,
            attendanceChangeRequests: impact.counts.attendanceChangeRequests,
            auditLogsAsActor: impact.counts.auditLogsAsActor,
            auditLogsAsTarget: impact.counts.auditLogsAsTarget,
          },
          anonymizedFields: [
            "name",
            "email",
            "phone",
            "title",
            "teamId",
            "hireDate",
            "birthDate",
            "passwordHash",
            "employeeProfile",
            "employeeSensitiveProfile",
            "hrProfiles",
          ],
          deletedAt: now.toISOString(),
        }),
      },
    });
    await tx.notification.createMany({
      data: [
        {
          userId: params.actorUserId,
          type: "SYSTEM",
          priority: "NORMAL",
          title: "비활성 직원 계정이 삭제 처리되었습니다.",
          message: "개인정보는 익명화되었고 휴가, 근태, 감사 로그 등 업무 기록은 보존되었습니다.",
          linkUrl: "/organization/employees?status=DELETED",
          metadata: {
            targetUserId: params.targetUserId,
            deletionMode: "SAFE_DELETE",
          },
        },
      ],
    });
  });

  return { mode: "SAFE_DELETE" as const, impact };
}

export async function hardDeleteEmployeeIfSafe(params: {
  actorUserId: string;
  targetUserId: string;
  reason?: string | null;
  impact?: EmployeeDeletionImpact;
}) {
  return anonymizeDeletedEmployee(params);
}

async function recordDeleteBlocked(actorUserId: string, targetUserId: string, reasonCode: string) {
  await getPrisma().auditLog.create({
    data: {
      actorId: actorUserId,
      actorUserId,
      targetUserId,
      action: "EMPLOYEE_DELETE_BLOCKED",
      targetType: "USER",
      targetId: targetUserId,
      metadata: sanitizeAuditMetadata({
        actorUserId,
        targetUserId,
        reasonCode,
      }),
    },
  });
}
