import { Prisma, type ApprovalPolicy, type PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { approvalPolicySummary, resolveApproversForLeaveRequest, type LeaveRequestWithPolicy } from "@/lib/leave/approval-policy";
import { dateToDateOnly } from "@/lib/leave/calculate-business-days";
import { canLeadManageUser } from "@/lib/organization/permissions";
import { createNotificationOnce, dedupeRecipientUserIds } from "@/lib/notifications/notifications";
import { sanitizeSecurityValue } from "@/lib/security/sanitize";

type NotificationPrisma = PrismaClient | Prisma.TransactionClient;

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

export function buildLeaveNotificationMetadata(input: {
  deduplicationKey: string;
  leaveRequestId: string;
  requesterUserId?: string;
  targetUserId?: string;
  approvedByUserId?: string;
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

async function getApprovedLeaveRequest(leaveRequestId: string, prisma: NotificationPrisma) {
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
    await Promise.all(
      recipientIds.map((recipientId) =>
        createNotificationOnce({
          userId: recipientId,
          type: "LEAVE_REQUEST_CREATED",
          priority: "HIGH",
          title: "휴가 승인 요청이 도착했습니다.",
          message: "구성원이 휴가 승인을 요청했습니다. 내용을 확인해 주세요.",
          linkUrl: `/leaves/approvals/${leaveRequestId}`,
          metadata: buildLeaveNotificationMetadata({
            deduplicationKey: `leave-approval-needed:${leaveRequestId}:${recipientId}`,
            leaveRequestId,
            requesterUserId: leaveRequest.userId,
            targetUserId: leaveRequest.userId,
            teamId: leaveRequest.user.teamId,
            startDate: range.startDate,
            endDate: range.endDate,
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
  approvedByUserId,
  prisma = getPrisma(),
}: {
  leaveRequestId: string;
  approvedByUserId: string;
  prisma?: NotificationPrisma;
}) {
  try {
    const leaveRequest = await getApprovedLeaveRequest(leaveRequestId, prisma);

    if (!leaveRequest || leaveRequest.status !== "APPROVED" || leaveRequest.user.status !== "ACTIVE") {
      return { requesterCount: 0, managedLeadCount: 0 };
    }

    const range = dateRangeMetadata(leaveRequest);
    await createNotificationOnce({
      userId: leaveRequest.userId,
      type: "LEAVE_REQUEST_APPROVED",
      priority: "NORMAL",
      title: "휴가 요청이 승인되었습니다.",
      message: "요청한 휴가가 승인되었습니다. 내 휴가 현황에서 확인해 주세요.",
      linkUrl: `/leaves/me/requests/${leaveRequest.id}`,
      metadata: buildLeaveNotificationMetadata({
        deduplicationKey: `leave-approved-requester:${leaveRequest.id}:${leaveRequest.userId}`,
        leaveRequestId: leaveRequest.id,
        requesterUserId: leaveRequest.userId,
        targetUserId: leaveRequest.userId,
        approvedByUserId,
        teamId: leaveRequest.user.teamId,
        startDate: range.startDate,
        endDate: range.endDate,
        notificationPurpose: "LEAVE_REQUEST_APPROVED",
      }),
    });

    const leadRecipientIds = await getManagedOrganizationLeaveNotificationRecipients({
      leaveRequest,
      approvedByUserId,
      prisma,
    });

    await Promise.all(
      leadRecipientIds.map((recipientId) =>
        createNotificationOnce({
          userId: recipientId,
          type: "LEAVE_APPROVED",
          priority: "NORMAL",
          title: "담당 조직 구성원의 휴가가 승인되었습니다.",
          message: "담당 조직 구성원의 휴가가 승인되었습니다. 휴가 캘린더에서 일정을 확인해 주세요.",
          linkUrl: "/leaves/calendar?scope=TEAM",
          metadata: buildLeaveNotificationMetadata({
            deduplicationKey: `managed-leave-approved:${leaveRequest.id}:${recipientId}`,
            leaveRequestId: leaveRequest.id,
            requesterUserId: leaveRequest.userId,
            targetUserId: leaveRequest.userId,
            approvedByUserId,
            teamId: leaveRequest.user.teamId,
            startDate: range.startDate,
            endDate: range.endDate,
            notificationPurpose: "MANAGED_TEAM_LEAVE_APPROVED",
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
    const leaveRequest = await getApprovedLeaveRequest(leaveRequestId, prisma);

    if (!leaveRequest || leaveRequest.user.status !== "ACTIVE") {
      return { count: 0 };
    }

    const isRejected = action === "REJECTED";
    await createNotificationOnce({
      userId: leaveRequest.userId,
      type: isRejected ? "LEAVE_REQUEST_REJECTED" : "LEAVE_REQUEST_CANCELLED",
      priority: "NORMAL",
      title: isRejected ? "휴가 요청이 반려되었습니다." : "승인된 휴가가 취소되었습니다.",
      message: isRejected
        ? "요청한 휴가가 반려되었습니다. 시스템에서 상세 내용을 확인해 주세요."
        : "승인된 휴가가 취소되었습니다. 내 휴가 현황에서 확인해 주세요.",
      linkUrl: `/leaves/me/requests/${leaveRequest.id}`,
      metadata: buildLeaveNotificationMetadata({
        deduplicationKey: `leave-${action.toLowerCase()}:${leaveRequest.id}:${leaveRequest.userId}`,
        leaveRequestId: leaveRequest.id,
        requesterUserId: leaveRequest.userId,
        targetUserId: leaveRequest.userId,
        teamId: leaveRequest.user.teamId,
        ...dateRangeMetadata(leaveRequest),
        notificationPurpose: `LEAVE_REQUEST_${action}`,
      }),
    });

    return { count: 1 };
  } catch (error) {
    safeWarn(`${action.toLowerCase()}-failed`, error);
    return { count: 0 };
  }
}
