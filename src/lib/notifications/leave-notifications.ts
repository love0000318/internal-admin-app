import { Prisma, type ApprovalPolicy, type PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  approvalPolicySummary,
  resolveApproversForLeaveRequest,
  type LeaveRequestWithPolicy,
} from "@/lib/leave/approval-policy";
import { dateToDateOnly } from "@/lib/leave/calculate-business-days";
import {
  formatLeaveDays,
  LEAVE_TYPE_LABELS,
} from "@/lib/leave/labels";
import { canLeadManageUser } from "@/lib/organization/permissions";
import { createNotificationOnce, dedupeRecipientUserIds } from "@/lib/notifications/notifications";
import { sanitizeSecurityValue } from "@/lib/security/sanitize";

type NotificationPrisma = PrismaClient | Prisma.TransactionClient;
type LeaveApprovalNotificationSource = "MANUAL" | "AUTO_POLICY" | "AUTO_START_DATE";

type LeaveNotificationRequest = LeaveRequestWithPolicy & {
  user: LeaveRequestWithPolicy["user"] & {
    teamId: string | null;
  };
};

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function safeWarn(context: string, error: unknown) {
  console.warn(`[leave-notification:${context}]`, sanitizeSecurityValue(String(error)));
}

function dateRangeMetadata(leaveRequest: Pick<LeaveNotificationRequest, "startDate" | "endDate">) {
  return {
    startDate: dateToDateOnly(leaveRequest.startDate),
    endDate: dateToDateOnly(leaveRequest.endDate),
  };
}

function leaveTypeLabel(
  leaveRequest: Pick<LeaveNotificationRequest, "type"> & {
    customLeaveType?: { name: string } | null;
  },
) {
  return leaveRequest.customLeaveType?.name ?? LEAVE_TYPE_LABELS[leaveRequest.type];
}

function leaveDateRangeLabel(leaveRequest: Pick<LeaveNotificationRequest, "startDate" | "endDate">) {
  const range = dateRangeMetadata(leaveRequest);

  return range.startDate === range.endDate
    ? range.startDate
    : `${range.startDate} ~ ${range.endDate}`;
}

function formatKoreanDateTime(value: Date | null | undefined) {
  if (!value) {
    return "처리 시각 미확인";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export function buildLeaveNotificationMetadata(input: {
  deduplicationKey: string;
  leaveRequestId: string;
  requesterUserId?: string;
  targetUserId?: string;
  approvedByUserId?: string | null;
  processedByUserId?: string | null;
  processedAt?: string | null;
  approvalSource?: LeaveApprovalNotificationSource | null;
  leaveType?: string;
  leaveTypeName?: string;
  status?: string;
  dayCount?: number;
  teamId?: string | null;
  startDate?: string;
  endDate?: string;
  notificationPurpose: string;
}) {
  return toJsonValue({
    deduplicationKey: input.deduplicationKey,
    leaveRequestId: input.leaveRequestId,
    requesterUserId: input.requesterUserId,
    targetUserId: input.targetUserId,
    approvedByUserId: input.approvedByUserId,
    processedByUserId: input.processedByUserId,
    processedAt: input.processedAt,
    approvalSource: input.approvalSource,
    leaveType: input.leaveType,
    leaveTypeName: input.leaveTypeName,
    status: input.status,
    dayCount: input.dayCount,
    teamId: input.teamId,
    startDate: input.startDate,
    endDate: input.endDate,
    notificationPurpose: input.notificationPurpose,
  });
}

export async function getLeaveApprovalNotificationRecipients({
  leaveRequest,
  approvalPolicy,
  prisma = getPrisma(),
}: {
  leaveRequest: LeaveRequestWithPolicy;
  approvalPolicy: Pick<ApprovalPolicy, "approvalMode" | "approverRule" | "customApproverUserId">;
  prisma?: NotificationPrisma;
}) {
  const approvers = await resolveApproversForLeaveRequest({
    leaveRequest,
    policy: approvalPolicy,
    prisma: prisma as PrismaClient,
  });

  return dedupeRecipientUserIds(approvers.map((approver) => approver.id));
}

async function getReviewedLeaveRequest(leaveRequestId: string, prisma: NotificationPrisma) {
  return prisma.leaveRequest.findUnique({
    where: { id: leaveRequestId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          role: true,
          status: true,
          teamId: true,
        },
      },
      customLeaveType: {
        select: {
          code: true,
          name: true,
        },
      },
      reviewer: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

export async function getManagedOrganizationLeaveNotificationRecipients({
  leaveRequest,
  approvedByUserId,
  prisma = getPrisma(),
}: {
  leaveRequest: {
    id: string;
    userId: string;
    user: {
      id: string;
      teamId: string | null;
    };
  };
  approvedByUserId?: string | null;
  prisma?: NotificationPrisma;
}) {
  if (!leaveRequest.user.teamId) {
    return [];
  }

  const leads = await prisma.user.findMany({
    where: {
      role: "LEAD",
      status: "ACTIVE",
      id: {
        notIn: [leaveRequest.userId, approvedByUserId].filter(
          (value): value is string => typeof value === "string" && value.length > 0,
        ),
      },
    },
    select: { id: true },
  });
  const recipientIds: string[] = [];

  for (const lead of leads) {
    if (await canLeadManageUser(lead.id, leaveRequest.userId, prisma as ReturnType<typeof getPrisma>)) {
      recipientIds.push(lead.id);
    }
  }

  return dedupeRecipientUserIds(recipientIds);
}

export async function notifyLeaveApprovalNeeded({
  leaveRequest,
  approvalPolicy,
  leaveRequestId,
  leaveTypeName,
  prisma = getPrisma(),
}: {
  leaveRequest: LeaveNotificationRequest;
  approvalPolicy: Pick<
    ApprovalPolicy,
    "id" | "code" | "approvalMode" | "approverRule" | "customApproverUserId"
  >;
  leaveRequestId: string;
  leaveTypeName?: string;
  prisma?: NotificationPrisma;
}) {
  try {
    const recipientIds = await getLeaveApprovalNotificationRecipients({
      leaveRequest,
      approvalPolicy,
      prisma,
    });

    if (recipientIds.length === 0) {
      return { count: 0 };
    }

    await prisma.auditLog.create({
      data: {
        actorId: leaveRequest.userId,
        actorUserId: leaveRequest.userId,
        targetUserId: leaveRequest.userId,
        action: "LEAVE_REQUEST_APPROVER_RESOLVED",
        targetType: "LEAVE_REQUEST",
        targetId: leaveRequestId,
        metadata: toJsonValue({
          leaveRequestId,
          requesterId: leaveRequest.userId,
          resolvedApproverIds: recipientIds,
          approvalPolicy: approvalPolicySummary(approvalPolicy),
        }),
      },
    });

    const range = dateRangeMetadata(leaveRequest);
    const typeName = leaveTypeName ?? leaveTypeLabel(leaveRequest);
    const period = leaveDateRangeLabel(leaveRequest);
    const dayCount = Number(leaveRequest.dayCount);
    await Promise.all(
      recipientIds.map((recipientId) =>
        createNotificationOnce({
          prisma,
          userId: recipientId,
          type: "LEAVE_REQUEST_CREATED",
          priority: "HIGH",
          title: "휴가 승인 요청이 접수되었습니다.",
          message: `${leaveRequest.user.name}님이 ${typeName} ${formatLeaveDays(dayCount)}을 요청했습니다. 기간: ${period}.`,
          linkUrl: `/leaves/approvals/${leaveRequestId}`,
          metadata: buildLeaveNotificationMetadata({
            deduplicationKey: `leave-approval-needed:${leaveRequestId}:${recipientId}`,
            leaveRequestId,
            requesterUserId: leaveRequest.userId,
            targetUserId: leaveRequest.userId,
            teamId: leaveRequest.user.teamId,
            startDate: range.startDate,
            endDate: range.endDate,
            leaveType: leaveRequest.type,
            leaveTypeName: typeName,
            status: leaveRequest.status,
            dayCount,
            notificationPurpose: "LEAVE_APPROVAL_NEEDED",
          }),
        }),
      ),
    );

    return { count: recipientIds.length };
  } catch (error) {
    safeWarn("approval-needed-failed", error);
    return { count: 0 };
  }
}

export async function notifyLeaveRequestApproved({
  leaveRequestId,
  approvedByUserId = null,
  approvalSource = null,
  prisma = getPrisma(),
}: {
  leaveRequestId: string;
  approvedByUserId?: string | null;
  approvalSource?: LeaveApprovalNotificationSource | null;
  prisma?: NotificationPrisma;
}) {
  try {
    const leaveRequest = await getReviewedLeaveRequest(leaveRequestId, prisma);

    if (!leaveRequest || leaveRequest.status !== "APPROVED" || leaveRequest.user.status !== "ACTIVE") {
      return { requesterCount: 0, managedLeadCount: 0 };
    }

    const effectiveApprovalSource: LeaveApprovalNotificationSource =
      approvalSource ?? (leaveRequest.approvalSource === "AUTO_START_DATE" ? "AUTO_START_DATE" : "MANUAL");
    const isAutoConfirmed = effectiveApprovalSource === "AUTO_START_DATE";
    const isAutoApproved = effectiveApprovalSource === "AUTO_POLICY";
    const range = dateRangeMetadata(leaveRequest);
    const typeName = leaveTypeLabel(leaveRequest);
    const period = leaveDateRangeLabel(leaveRequest);
    const processedAt = leaveRequest.reviewedAt ?? new Date();
    const processedByUserId = approvedByUserId ?? leaveRequest.reviewerId;
    const processorName =
      isAutoConfirmed || isAutoApproved
        ? "자동 처리"
        : leaveRequest.reviewer?.name ?? "승인자";
    const dayCount = Number(leaveRequest.dayCount);
    const requesterNotificationType = isAutoConfirmed
      ? "LEAVE_REQUEST_AUTO_CONFIRMED"
      : "LEAVE_REQUEST_APPROVED";
    const requesterPurpose = isAutoConfirmed
      ? "LEAVE_REQUEST_AUTO_CONFIRMED"
      : "LEAVE_REQUEST_APPROVED";
    const requesterDeduplicationPrefix = isAutoConfirmed
      ? "leave-auto-confirmed-requester"
      : "leave-approved-requester";
    const requesterTitle = isAutoConfirmed
      ? `${typeName} 요청이 자동 확정되었습니다.`
      : isAutoApproved
        ? `${typeName} 요청이 자동 승인되었습니다.`
        : `${typeName} 요청이 승인되었습니다.`;
    const requesterMessage = isAutoConfirmed
      ? `${period} ${formatLeaveDays(dayCount)} 요청이 휴가 시작일 경과로 자동 확정되었습니다. 처리 시각: ${formatKoreanDateTime(processedAt)}.`
      : isAutoApproved
        ? `${period} ${formatLeaveDays(dayCount)} 요청이 승인 정책에 따라 자동 승인되었습니다. 처리 시각: ${formatKoreanDateTime(processedAt)}.`
        : `${period} ${formatLeaveDays(dayCount)} 요청이 승인되었습니다. 처리자: ${processorName}, 처리 시각: ${formatKoreanDateTime(processedAt)}.`;

    await createNotificationOnce({
      prisma,
      userId: leaveRequest.userId,
      type: requesterNotificationType,
      priority: "NORMAL",
      title: requesterTitle,
      message: requesterMessage,
      linkUrl: `/leaves/me/requests/${leaveRequest.id}`,
      metadata: buildLeaveNotificationMetadata({
        deduplicationKey: `${requesterDeduplicationPrefix}:${leaveRequest.id}:${leaveRequest.userId}`,
        leaveRequestId: leaveRequest.id,
        requesterUserId: leaveRequest.userId,
        targetUserId: leaveRequest.userId,
        approvedByUserId: processedByUserId,
        processedByUserId,
        processedAt: processedAt.toISOString(),
        approvalSource: effectiveApprovalSource,
        teamId: leaveRequest.user.teamId,
        startDate: range.startDate,
        endDate: range.endDate,
        leaveType: leaveRequest.type,
        leaveTypeName: typeName,
        status: leaveRequest.status,
        dayCount,
        notificationPurpose: requesterPurpose,
      }),
    });

    const leadRecipientIds = await getManagedOrganizationLeaveNotificationRecipients({
      leaveRequest,
      approvedByUserId: processedByUserId,
      prisma,
    });

    const managedNotificationType = isAutoConfirmed ? "LEAVE_AUTO_CONFIRMED" : "LEAVE_APPROVED";
    const managedPurpose = isAutoConfirmed
      ? "MANAGED_TEAM_LEAVE_AUTO_CONFIRMED"
      : "MANAGED_TEAM_LEAVE_APPROVED";
    const managedDeduplicationPrefix = isAutoConfirmed
      ? "managed-leave-auto-confirmed"
      : "managed-leave-approved";
    const managedTitle = isAutoConfirmed
      ? "담당 조직 구성원의 휴가가 자동 확정되었습니다."
      : "담당 조직 구성원의 휴가가 승인되었습니다.";
    const managedMessage = isAutoConfirmed
      ? `${leaveRequest.user.name}님의 ${typeName}이 휴가 시작일 경과로 자동 확정되었습니다. 기간: ${period}.`
      : `${leaveRequest.user.name}님의 ${typeName}이 승인되었습니다. 기간: ${period}.`;

    await Promise.all(
      leadRecipientIds.map((recipientId) =>
        createNotificationOnce({
          prisma,
          userId: recipientId,
          type: managedNotificationType,
          priority: "NORMAL",
          title: managedTitle,
          message: managedMessage,
          linkUrl: "/leaves/calendar?scope=ALL",
          metadata: buildLeaveNotificationMetadata({
            deduplicationKey: `${managedDeduplicationPrefix}:${leaveRequest.id}:${recipientId}`,
            leaveRequestId: leaveRequest.id,
            requesterUserId: leaveRequest.userId,
            targetUserId: leaveRequest.userId,
            approvedByUserId: processedByUserId,
            processedByUserId,
            processedAt: processedAt.toISOString(),
            approvalSource: effectiveApprovalSource,
            teamId: leaveRequest.user.teamId,
            startDate: range.startDate,
            endDate: range.endDate,
            leaveType: leaveRequest.type,
            leaveTypeName: typeName,
            status: leaveRequest.status,
            dayCount,
            notificationPurpose: managedPurpose,
          }),
        }),
      ),
    );

    return { requesterCount: 1, managedLeadCount: leadRecipientIds.length };
  } catch (error) {
    safeWarn("approved-failed", error);
    return { requesterCount: 0, managedLeadCount: 0 };
  }
}

export async function notifyLeaveRequestRejectedOrCancelled({
  leaveRequestId,
  action,
  prisma = getPrisma(),
}: {
  leaveRequestId: string;
  action: "REJECTED" | "CANCELLED";
  prisma?: NotificationPrisma;
}) {
  try {
    const leaveRequest = await getReviewedLeaveRequest(leaveRequestId, prisma);

    if (!leaveRequest || leaveRequest.user.status !== "ACTIVE") {
      return { count: 0 };
    }

    const isRejected = action === "REJECTED";
    const typeName = leaveTypeLabel(leaveRequest);
    const period = leaveDateRangeLabel(leaveRequest);
    const processedAt = leaveRequest.reviewedAt ?? leaveRequest.cancelledAt ?? new Date();
    const processorName = leaveRequest.reviewer?.name ?? "처리자";
    const dayCount = Number(leaveRequest.dayCount);
    await createNotificationOnce({
      prisma,
      userId: leaveRequest.userId,
      type: isRejected ? "LEAVE_REQUEST_REJECTED" : "LEAVE_REQUEST_CANCELLED",
      priority: "NORMAL",
      title: isRejected
        ? `${typeName} 요청이 반려되었습니다.`
        : `${typeName} 요청이 취소되었습니다.`,
      message: isRejected
        ? `${period} ${formatLeaveDays(dayCount)} 요청이 반려되었습니다. 처리자: ${processorName}, 처리 시각: ${formatKoreanDateTime(processedAt)}. 상세 사유는 요청 상세에서 확인해 주세요.`
        : `${period} ${formatLeaveDays(dayCount)} 승인 휴가가 취소되었습니다. 처리자: ${processorName}, 처리 시각: ${formatKoreanDateTime(processedAt)}.`,
      linkUrl: `/leaves/me/requests/${leaveRequest.id}`,
      metadata: buildLeaveNotificationMetadata({
        deduplicationKey: `leave-${action.toLowerCase()}:${leaveRequest.id}:${leaveRequest.userId}`,
        leaveRequestId: leaveRequest.id,
        requesterUserId: leaveRequest.userId,
        targetUserId: leaveRequest.userId,
        processedByUserId: leaveRequest.reviewerId,
        processedAt: processedAt.toISOString(),
        teamId: leaveRequest.user.teamId,
        ...dateRangeMetadata(leaveRequest),
        leaveType: leaveRequest.type,
        leaveTypeName: typeName,
        status: leaveRequest.status,
        dayCount,
        notificationPurpose: `LEAVE_REQUEST_${action}`,
      }),
    });

    return { count: 1 };
  } catch (error) {
    safeWarn(`${action.toLowerCase()}-failed`, error);
    return { count: 0 };
  }
}

export const resolveLeaveApprovers = getLeaveApprovalNotificationRecipients;
export const resolveManagedTeamLeads =
  getManagedOrganizationLeaveNotificationRecipients;
export const createLeaveRequestNotification = notifyLeaveApprovalNeeded;

export async function createLeaveDecisionNotification(params: {
  leaveRequestId: string;
  action: "APPROVED" | "REJECTED" | "CANCELLED";
  actorUserId: string;
  prisma?: NotificationPrisma;
}) {
  if (params.action === "APPROVED") {
    return notifyLeaveRequestApproved({
      leaveRequestId: params.leaveRequestId,
      approvedByUserId: params.actorUserId,
      prisma: params.prisma,
    });
  }

  return notifyLeaveRequestRejectedOrCancelled({
    leaveRequestId: params.leaveRequestId,
    action: params.action,
    prisma: params.prisma,
  });
}
