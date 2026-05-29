import {
  Prisma,
  type LeaveGrant,
  type LeaveTypeDefinition,
  type NotificationType,
  type PrismaClient,
} from "@/generated/prisma/client";
import {
  approvalPolicySummary,
  assertAttachmentRequirementForApproval,
  resolveApprovalPolicyForLeaveRequest,
  shouldAutoApproveLeaveRequest,
  type LeaveRequestWithPolicy,
} from "@/lib/leave/approval-policy";
import { assertEnoughLeaveBalance, policyDeductsAnnual, toNumber } from "@/lib/leave/balance";
import {
  dateToDateOnly,
  todayInSeoul,
} from "@/lib/leave/calculate-business-days";
import {
  convertLeaveGrantPendingToUsed,
  CustomLeaveRequestError,
  isBirthdayHalfDayGrant,
  isLeaveGrantUsableOnDate,
  isRequestableLeaveGrantType,
} from "@/lib/leave/custom-grant-requests";
import {
  runBirthdayAnnualDeductionRecovery,
  type BirthdayAnnualDeductionRecoveryCandidate,
} from "@/lib/leave/birthday-half-day-recovery";
import { formatLeaveDays, LEAVE_TYPE_LABELS } from "@/lib/leave/labels";
import {
  recordLeaveRequestApprovedLedger,
  recordLeaveRequestPendingLedger,
} from "@/lib/leave/ledger";
import { assertNoOverlappingLeaveRequest } from "@/lib/leave/overlap";
import { getLeavePolicyMap, getUserLeaveBalance } from "@/lib/leave/queries";
import type { DateOnly, LeaveOverlapCandidate } from "@/lib/leave/types";
import {
  buildLeaveNotificationMetadata,
  getLeaveApprovalNotificationRecipients,
  notifyLeaveRequestApproved,
} from "@/lib/notifications/leave-notifications";
import { createInAppNotificationOnce } from "@/lib/notifications/notifications";

type RecoveryPrisma = PrismaClient;

type RecoveryLeaveRequest = LeaveRequestWithPolicy & {
  reason?: string | null;
  attachmentRequired?: boolean;
  attachmentUrl?: string | null;
  reviewerId?: string | null;
  reviewedAt?: Date | null;
  reviewComment?: string | null;
  rejectReason?: string | null;
  cancelReason?: string | null;
  withdrawnAt?: Date | null;
  cancelledAt?: Date | null;
  approvalSource?: "MANUAL" | "AUTO_START_DATE" | null;
  createdAt?: Date;
  updatedAt?: Date;
  grantUsages: Array<{
    leaveGrantId: string;
    amount: number;
    unit: string;
    leaveGrant?: {
      source?: string | null;
      leaveType?: {
        code?: string | null;
      } | null;
    } | null;
  }>;
};

type ExpectedApprovalNotification = {
  leaveRequestId: string;
  recipientUserId: string;
  deduplicationKey: string;
};

type ExpectedRequesterNotification = {
  leaveRequestId: string;
  requesterUserId: string;
  type: NotificationType;
  deduplicationKey: string;
  approvalSource: "MANUAL" | "AUTO_POLICY" | "AUTO_START_DATE";
};

type KoreanNotificationRepair = {
  notificationId: string;
  leaveRequestId: string;
  title: string;
  message: string;
};

type NotificationLinkRepair = {
  notificationId: string;
  leaveRequestId: string;
  recipientUserId: string;
  currentLinkUrl: string | null;
  expectedLinkUrl: string;
  reason: string;
};

type AutoApprovalCandidate = {
  leaveRequestId: string;
  policyCode: string;
};

type RequestableGrantOptionIssue = {
  userId: string;
  leaveGrantId: string;
  leaveTypeId: string;
  leaveTypeCode: string;
  reason: string;
  isBirthdayHalfDay: boolean;
};

type CalendarVisibilityIssue = {
  leaveRequestId: string;
  requesterUserId: string;
  reason: string;
};

type RecoveryGrantOption = Pick<
  LeaveGrant,
  | "id"
  | "userId"
  | "leaveTypeId"
  | "source"
  | "status"
  | "remainingAmount"
  | "effectiveFrom"
  | "expiresAt"
> & {
  leaveType: Pick<LeaveTypeDefinition, "id" | "category" | "code" | "isEnabled">;
};

type ResolvedApprovalPolicy = Awaited<ReturnType<typeof resolveApprovalPolicyForLeaveRequest>>;

export type LeaveOperationalRecoveryReport = {
  dryRun: boolean;
  window: {
    fromDate: DateOnly | null;
    toDate: DateOnly | null;
  };
  checked: {
    pendingLeaveRequests: number;
    approvedLeaveRequests: number;
    leaveNotifications: number;
    activeLeaveGrants: number;
    approvedCalendarLeaveRequests: number;
  };
  missingApprovalNotifications: ExpectedApprovalNotification[];
  missingRequesterNotifications: ExpectedRequesterNotification[];
  notificationLinkRepairs: NotificationLinkRepair[];
  autoApprovalCandidates: AutoApprovalCandidate[];
  calendarEligibleApprovedLeaveRequestIds: string[];
  calendarVisibilityIssues: CalendarVisibilityIssue[];
  requestableGrantOptionIssues: RequestableGrantOptionIssue[];
  birthdayGrantOptionIssues: RequestableGrantOptionIssue[];
  birthdayAnnualDeductionRepairs: BirthdayAnnualDeductionRecoveryCandidate[];
  koreanNotificationRepairs: KoreanNotificationRepair[];
  applied: {
    approvalNotificationsCreated: number;
    requesterNotificationsCreated: number;
    notificationLinksUpdated: number;
    autoApprovedRequests: number;
    koreanNotificationsUpdated: number;
    birthdayAnnualDeductionLedgersReclassified: number;
    birthdayAnnualLeaveBalancesUpdated: number;
  };
  skipped: {
    autoApprovalRequestIds: string[];
    birthdayAnnualDeductionAlreadyRecovered: number;
    birthdayAnnualDeductionNotRepairable: number;
  };
};

const leaveRequestRecoveryInclude = {
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
    include: {
      approvalPolicy: {
        include: { customApprover: true },
      },
    },
  },
  grantUsages: {
    include: {
      leaveGrant: {
        include: {
          leaveType: true,
        },
      },
    },
  },
} satisfies Prisma.LeaveRequestInclude;

const LEAVE_NOTIFICATION_TYPES = [
  "LEAVE_REQUEST_CREATED",
  "LEAVE_APPROVED",
  "LEAVE_REQUEST_APPROVED",
  "LEAVE_AUTO_CONFIRMED",
  "LEAVE_REQUEST_AUTO_CONFIRMED",
  "LEAVE_REQUEST_REJECTED",
  "LEAVE_REQUEST_CANCELLED",
] as const satisfies NotificationType[];

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
}

function metadataString(metadata: unknown, key: string) {
  const value = metadataRecord(metadata)[key];

  return typeof value === "string" ? value : null;
}

function assertDateOnly(value: string): asserts value is DateOnly {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Invalid date. Use YYYY-MM-DD.");
  }
}

function addDateOnlyDays(value: DateOnly, days: number): DateOnly {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10) as DateOnly;
}

function seoulDateOnlyStartInstant(value: DateOnly) {
  return new Date(`${value}T00:00:00.000+09:00`);
}

function createdAtWindowWhere({
  fromDate,
  toDate,
}: {
  fromDate?: DateOnly;
  toDate?: DateOnly;
}): Prisma.DateTimeFilter | undefined {
  if (!fromDate && !toDate) {
    return undefined;
  }

  return {
    ...(fromDate ? { gte: seoulDateOnlyStartInstant(fromDate) } : {}),
    ...(toDate ? { lt: seoulDateOnlyStartInstant(addDateOnlyDays(toDate, 1)) } : {}),
  };
}

export function normalizeLeaveOperationalRecoveryDateWindow({
  fromDate,
  toDate,
}: {
  fromDate?: string | null;
  toDate?: string | null;
}) {
  if (fromDate) {
    assertDateOnly(fromDate);
  }

  if (toDate) {
    assertDateOnly(toDate);
  }

  if (fromDate && toDate && fromDate > toDate) {
    throw new Error("Invalid date range. --from-date must be on or before --to-date.");
  }

  return {
    fromDate: (fromDate ?? null) as DateOnly | null,
    toDate: (toDate ?? null) as DateOnly | null,
  };
}

export function containsLegacyKoreanMojibake(value: string) {
  return /�|[占筌獄]|[利泥湲諛痍]/.test(value) || /\?[가-힣]/.test(value) || /\?{2,}/.test(value);
}

function leaveTypeLabel(
  leaveRequest: Pick<RecoveryLeaveRequest, "type" | "customLeaveType">,
) {
  return leaveRequest.customLeaveType?.name ?? LEAVE_TYPE_LABELS[leaveRequest.type];
}

function leaveDateRangeLabel(leaveRequest: Pick<RecoveryLeaveRequest, "startDate" | "endDate">) {
  const startDate = dateToDateOnly(leaveRequest.startDate);
  const endDate = dateToDateOnly(leaveRequest.endDate);

  return startDate === endDate ? startDate : `${startDate} ~ ${endDate}`;
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

function buildApprovalNeededContent(leaveRequest: RecoveryLeaveRequest) {
  const typeName = leaveTypeLabel(leaveRequest);
  const period = leaveDateRangeLabel(leaveRequest);
  const dayCount = toNumber(leaveRequest.dayCount);

  return {
    title: "휴가 승인 요청이 접수되었습니다.",
    message: `${leaveRequest.user.name}님이 ${typeName} ${formatLeaveDays(
      dayCount,
    )}을 요청했습니다. 기간: ${period}.`,
  };
}

function buildApprovedRequesterContent(
  leaveRequest: RecoveryLeaveRequest,
  approvalSource: ExpectedRequesterNotification["approvalSource"],
) {
  const typeName = leaveTypeLabel(leaveRequest);
  const period = leaveDateRangeLabel(leaveRequest);
  const dayCount = toNumber(leaveRequest.dayCount);
  const processedAt = leaveRequest.reviewedAt ?? new Date();

  if (approvalSource === "AUTO_START_DATE") {
    return {
      title: `${typeName} 요청이 자동 확정되었습니다.`,
      message: `${period} ${formatLeaveDays(
        dayCount,
      )} 요청이 휴가 시작일 경과로 자동 확정되었습니다. 처리 시각: ${formatKoreanDateTime(
        processedAt,
      )}.`,
    };
  }

  if (approvalSource === "AUTO_POLICY") {
    return {
      title: `${typeName} 요청이 자동 승인되었습니다.`,
      message: `${period} ${formatLeaveDays(
        dayCount,
      )} 요청이 승인 정책에 따라 자동 승인되었습니다. 처리 시각: ${formatKoreanDateTime(
        processedAt,
      )}.`,
    };
  }

  return {
    title: `${typeName} 요청이 승인되었습니다.`,
    message: `${period} ${formatLeaveDays(dayCount)} 요청이 승인되었습니다. 처리 시각: ${formatKoreanDateTime(
      processedAt,
    )}.`,
  };
}

function buildManagedApprovedContent(
  leaveRequest: RecoveryLeaveRequest,
  approvalSource: ExpectedRequesterNotification["approvalSource"],
) {
  const typeName = leaveTypeLabel(leaveRequest);
  const period = leaveDateRangeLabel(leaveRequest);

  if (approvalSource === "AUTO_START_DATE") {
    return {
      title: "담당 조직 구성원의 휴가가 자동 확정되었습니다.",
      message: `${leaveRequest.user.name}님의 ${typeName} 휴가가 시작일 경과로 자동 확정되었습니다. 기간: ${period}.`,
    };
  }

  return {
    title: "담당 조직 구성원의 휴가가 승인되었습니다.",
    message: `${leaveRequest.user.name}님의 ${typeName} 휴가가 승인되었습니다. 기간: ${period}.`,
  };
}

function buildRejectedOrCancelledContent(
  leaveRequest: RecoveryLeaveRequest,
  action: "REJECTED" | "CANCELLED",
) {
  const typeName = leaveTypeLabel(leaveRequest);
  const period = leaveDateRangeLabel(leaveRequest);
  const dayCount = toNumber(leaveRequest.dayCount);
  const processedAt = leaveRequest.reviewedAt ?? leaveRequest.cancelledAt ?? new Date();

  if (action === "REJECTED") {
    return {
      title: `${typeName} 요청이 반려되었습니다.`,
      message: `${period} ${formatLeaveDays(
        dayCount,
      )} 요청이 반려되었습니다. 처리 시각: ${formatKoreanDateTime(processedAt)}.`,
    };
  }

  return {
    title: `${typeName} 요청이 취소되었습니다.`,
    message: `${period} ${formatLeaveDays(
      dayCount,
    )} 승인 휴가가 취소되었습니다. 처리 시각: ${formatKoreanDateTime(processedAt)}.`,
  };
}

export function buildRecoveredLeaveNotificationContent({
  notification,
  leaveRequest,
}: {
  notification: {
    type: NotificationType;
    metadata: unknown;
  };
  leaveRequest: RecoveryLeaveRequest;
}) {
  const purpose = metadataString(notification.metadata, "notificationPurpose");
  const approvalSource =
    metadataString(notification.metadata, "approvalSource") ??
    (leaveRequest.approvalSource === "AUTO_START_DATE" ? "AUTO_START_DATE" : "MANUAL");

  if (purpose === "LEAVE_APPROVAL_NEEDED" || notification.type === "LEAVE_REQUEST_CREATED") {
    return buildApprovalNeededContent(leaveRequest);
  }

  if (
    purpose === "MANAGED_TEAM_LEAVE_APPROVED" ||
    purpose === "MANAGED_TEAM_LEAVE_AUTO_CONFIRMED" ||
    notification.type === "LEAVE_APPROVED" ||
    notification.type === "LEAVE_AUTO_CONFIRMED"
  ) {
    return buildManagedApprovedContent(
      leaveRequest,
      approvalSource === "AUTO_START_DATE" ? "AUTO_START_DATE" : "MANUAL",
    );
  }

  if (
    purpose === "LEAVE_REQUEST_APPROVED" ||
    purpose === "LEAVE_REQUEST_AUTO_CONFIRMED" ||
    notification.type === "LEAVE_REQUEST_APPROVED" ||
    notification.type === "LEAVE_REQUEST_AUTO_CONFIRMED"
  ) {
    return buildApprovedRequesterContent(
      leaveRequest,
      approvalSource === "AUTO_START_DATE"
        ? "AUTO_START_DATE"
        : approvalSource === "AUTO_POLICY"
          ? "AUTO_POLICY"
          : "MANUAL",
    );
  }

  if (purpose === "LEAVE_REQUEST_REJECTED" || notification.type === "LEAVE_REQUEST_REJECTED") {
    return buildRejectedOrCancelledContent(leaveRequest, "REJECTED");
  }

  if (purpose === "LEAVE_REQUEST_CANCELLED" || notification.type === "LEAVE_REQUEST_CANCELLED") {
    return buildRejectedOrCancelledContent(leaveRequest, "CANCELLED");
  }

  return null;
}

async function findNotificationByDeduplicationKey({
  prisma,
  userId,
  type,
  deduplicationKey,
}: {
  prisma: RecoveryPrisma;
  userId: string;
  type: NotificationType;
  deduplicationKey: string;
}) {
  return prisma.notification.findFirst({
    where: {
      userId,
      type,
      metadata: {
        path: ["deduplicationKey"],
        equals: deduplicationKey,
      },
    },
    select: {
      id: true,
      linkUrl: true,
    },
  });
}

async function listPendingRequests(
  prisma: RecoveryPrisma,
  window: { fromDate?: DateOnly; toDate?: DateOnly; leaveRequestId?: string | null },
) {
  const createdAt = createdAtWindowWhere(window);

  return prisma.leaveRequest.findMany({
    where: {
      ...(window.leaveRequestId ? { id: window.leaveRequestId } : {}),
      status: "PENDING",
      ...(createdAt ? { createdAt } : {}),
      user: {
        status: "ACTIVE",
        role: { not: "EXTERNAL_PARTNER" },
      },
    },
    include: leaveRequestRecoveryInclude,
    orderBy: [{ createdAt: "asc" }],
  }) as Promise<RecoveryLeaveRequest[]>;
}

async function listApprovedRequests(
  prisma: RecoveryPrisma,
  window: { fromDate?: DateOnly; toDate?: DateOnly; leaveRequestId?: string | null },
) {
  const createdAt = createdAtWindowWhere(window);

  return prisma.leaveRequest.findMany({
    where: {
      ...(window.leaveRequestId ? { id: window.leaveRequestId } : {}),
      status: "APPROVED",
      ...(createdAt ? { createdAt } : {}),
      user: {
        status: "ACTIVE",
        role: { in: ["OWNER", "LEAD", "MANAGER"] },
      },
    },
    include: leaveRequestRecoveryInclude,
    orderBy: [{ reviewedAt: "asc" }, { createdAt: "asc" }],
  }) as Promise<RecoveryLeaveRequest[]>;
}

function requestableGrantIssueReason(grant: RecoveryGrantOption, date: DateOnly) {
  if (grant.status !== "ACTIVE") {
    return "GRANT_NOT_ACTIVE";
  }

  if (grant.remainingAmount <= 0) {
    return "NO_REMAINING_AMOUNT";
  }

  if (dateToDateOnly(grant.effectiveFrom) > date) {
    return "NOT_YET_EFFECTIVE";
  }

  if (grant.expiresAt && dateToDateOnly(grant.expiresAt) < date) {
    return "EXPIRED";
  }

  if (!grant.leaveType.isEnabled) {
    return "LEAVE_TYPE_DISABLED";
  }

  if (!isRequestableLeaveGrantType(grant)) {
    return "LEAVE_TYPE_NOT_REQUESTABLE";
  }

  return "UNKNOWN";
}

async function findRequestableGrantOptionIssues({
  prisma,
  date,
}: {
  prisma: RecoveryPrisma;
  date: DateOnly;
}) {
  const grants = await prisma.leaveGrant.findMany({
    where: {
      status: "ACTIVE",
      remainingAmount: { gt: 0 },
      user: {
        status: "ACTIVE",
        role: { not: "EXTERNAL_PARTNER" },
      },
    },
    include: {
      leaveType: {
        select: {
          id: true,
          code: true,
          category: true,
          isEnabled: true,
        },
      },
    },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
  });
  const issues: RequestableGrantOptionIssue[] = [];

  for (const grant of grants) {
    if (isLeaveGrantUsableOnDate(grant, date)) {
      continue;
    }

    issues.push({
      userId: grant.userId,
      leaveGrantId: grant.id,
      leaveTypeId: grant.leaveTypeId,
      leaveTypeCode: grant.leaveType.code,
      reason: requestableGrantIssueReason(grant, date),
      isBirthdayHalfDay: isBirthdayHalfDayGrant(grant),
    });
  }

  return { checkedCount: grants.length, issues };
}

async function findCalendarVisibilityIssues({
  prisma,
  window,
}: {
  prisma: RecoveryPrisma;
  window: { fromDate?: DateOnly; toDate?: DateOnly; leaveRequestId?: string | null };
}) {
  const createdAt = createdAtWindowWhere(window);
  const requests = await prisma.leaveRequest.findMany({
    where: {
      ...(window.leaveRequestId ? { id: window.leaveRequestId } : {}),
      status: "APPROVED",
      ...(createdAt ? { createdAt } : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          status: true,
        },
      },
      customLeaveType: {
        select: {
          id: true,
        },
      },
    },
    orderBy: [{ reviewedAt: "asc" }, { createdAt: "asc" }],
  });
  const issues: CalendarVisibilityIssue[] = [];

  for (const request of requests) {
    const issue = (() => {
      if (request.user.status !== "ACTIVE") {
        return "REQUESTER_NOT_ACTIVE";
      }

      if (!["OWNER", "LEAD", "MANAGER"].includes(request.user.role)) {
        return "REQUESTER_NOT_INTERNAL_CALENDAR_ROLE";
      }

      if (request.startDate.getTime() > request.endDate.getTime()) {
        return "INVALID_DATE_RANGE";
      }

      if (request.requestKind === "CUSTOM_GRANT" && request.leaveTypeId && !request.customLeaveType) {
        return "CUSTOM_LEAVE_TYPE_MISSING";
      }

      return null;
    })();

    if (issue) {
      issues.push({
        leaveRequestId: request.id,
        requesterUserId: request.userId,
        reason: issue,
      });
    }
  }

  return { checkedCount: requests.length, issues };
}

async function hasAutoApprovedAudit(prisma: RecoveryPrisma, leaveRequestId: string) {
  const auditLog = await prisma.auditLog.findFirst({
    where: {
      action: "LEAVE_REQUEST_AUTO_APPROVED",
      targetType: "LEAVE_REQUEST",
      targetId: leaveRequestId,
    },
    select: { id: true },
  });

  return Boolean(auditLog);
}

async function findMissingApprovalNotifications({
  prisma,
  pendingRequests,
}: {
  prisma: RecoveryPrisma;
  pendingRequests: RecoveryLeaveRequest[];
}) {
  const missing: ExpectedApprovalNotification[] = [];
  const linkRepairs: NotificationLinkRepair[] = [];

  for (const leaveRequest of pendingRequests) {
    const approvalPolicy = await resolveApprovalPolicyForLeaveRequest({
      leaveRequest,
      prisma,
    });
    const recipientIds = await getLeaveApprovalNotificationRecipients({
      leaveRequest,
      approvalPolicy,
      prisma,
    });

    for (const recipientUserId of recipientIds) {
      const deduplicationKey = `leave-approval-needed:${leaveRequest.id}:${recipientUserId}`;
      const expectedLinkUrl = `/leaves/approvals/${leaveRequest.id}`;
      const existing = await findNotificationByDeduplicationKey({
        prisma,
        userId: recipientUserId,
        type: "LEAVE_REQUEST_CREATED",
        deduplicationKey,
      });

      if (!existing) {
        missing.push({
          leaveRequestId: leaveRequest.id,
          recipientUserId,
          deduplicationKey,
        });
        continue;
      }

      if (existing.linkUrl !== expectedLinkUrl) {
        linkRepairs.push({
          notificationId: existing.id,
          leaveRequestId: leaveRequest.id,
          recipientUserId,
          currentLinkUrl: existing.linkUrl,
          expectedLinkUrl,
          reason: "APPROVAL_DETAIL_LINK",
        });
      }
    }
  }

  return { missing, linkRepairs };
}

async function findMissingRequesterNotifications({
  prisma,
  approvedRequests,
}: {
  prisma: RecoveryPrisma;
  approvedRequests: RecoveryLeaveRequest[];
}) {
  const missing: ExpectedRequesterNotification[] = [];
  const linkRepairs: NotificationLinkRepair[] = [];

  for (const leaveRequest of approvedRequests) {
    const approvalSource =
      leaveRequest.approvalSource === "AUTO_START_DATE"
        ? "AUTO_START_DATE"
        : (await hasAutoApprovedAudit(prisma, leaveRequest.id))
          ? "AUTO_POLICY"
          : "MANUAL";
    const type =
      approvalSource === "AUTO_START_DATE"
        ? "LEAVE_REQUEST_AUTO_CONFIRMED"
        : "LEAVE_REQUEST_APPROVED";
    const deduplicationKey =
      approvalSource === "AUTO_START_DATE"
        ? `leave-auto-confirmed-requester:${leaveRequest.id}:${leaveRequest.userId}`
        : `leave-approved-requester:${leaveRequest.id}:${leaveRequest.userId}`;
    const expectedLinkUrl = `/leaves/me/requests/${leaveRequest.id}`;
    const existing = await findNotificationByDeduplicationKey({
      prisma,
      userId: leaveRequest.userId,
      type,
      deduplicationKey,
    });

    if (!existing) {
      missing.push({
        leaveRequestId: leaveRequest.id,
        requesterUserId: leaveRequest.userId,
        type,
        deduplicationKey,
        approvalSource,
      });
      continue;
    }

    if (existing.linkUrl !== expectedLinkUrl) {
      linkRepairs.push({
        notificationId: existing.id,
        leaveRequestId: leaveRequest.id,
        recipientUserId: leaveRequest.userId,
        currentLinkUrl: existing.linkUrl,
        expectedLinkUrl,
        reason: "REQUESTER_DETAIL_LINK",
      });
    }
  }

  return { missing, linkRepairs };
}

async function findAutoApprovalCandidates({
  prisma,
  pendingRequests,
}: {
  prisma: RecoveryPrisma;
  pendingRequests: RecoveryLeaveRequest[];
}) {
  const candidates: AutoApprovalCandidate[] = [];

  for (const leaveRequest of pendingRequests) {
    const approvalPolicy = await resolveApprovalPolicyForLeaveRequest({
      leaveRequest,
      prisma,
    });
    const autoApprove = await shouldAutoApproveLeaveRequest({
      leaveRequest,
      policy: approvalPolicy,
      prisma,
    });

    if (autoApprove) {
      candidates.push({
        leaveRequestId: leaveRequest.id,
        policyCode: approvalPolicy.code,
      });
    }
  }

  return candidates;
}

async function assertAutoApprovalStillValid({
  tx,
  leaveRequest,
}: {
  tx: Prisma.TransactionClient;
  leaveRequest: RecoveryLeaveRequest;
}) {
  const existingApprovedLedger = await tx.leaveLedger.findUnique({
    where: { idempotencyKey: `request-approved:${leaveRequest.id}` },
  });

  if (existingApprovedLedger) {
    throw new Error("ALREADY_HAS_APPROVED_LEDGER");
  }

  const policies = await getLeavePolicyMap(tx as unknown as PrismaClient);
  const leavePolicy = policies[leaveRequest.type];

  if (leaveRequest.requestKind !== "CUSTOM_GRANT") {
    if (!leavePolicy?.isEnabled) {
      throw new Error("LEAVE_TYPE_DISABLED");
    }

    if (policyDeductsAnnual(leavePolicy)) {
      const balance = await getUserLeaveBalance({
        userId: leaveRequest.userId,
        year: Number(dateToDateOnly(leaveRequest.startDate).slice(0, 4)),
        prisma: tx as unknown as PrismaClient,
      });

      assertEnoughLeaveBalance({ requestedDays: 0, balance });
    }
  }

  const approvedOverlaps = await tx.leaveRequest.findMany({
    where: {
      id: { not: leaveRequest.id },
      userId: leaveRequest.userId,
      status: "APPROVED",
      startDate: { lte: leaveRequest.endDate },
      endDate: { gte: leaveRequest.startDate },
    },
  });

  assertNoOverlappingLeaveRequest({
    candidate: {
      id: leaveRequest.id,
      type: leaveRequest.type,
      status: leaveRequest.status,
      startDate: dateToDateOnly(leaveRequest.startDate),
      endDate: dateToDateOnly(leaveRequest.endDate),
      halfDayPeriod: leaveRequest.halfDayPeriod,
    },
    existingRequests: approvedOverlaps.map(
      (request): LeaveOverlapCandidate => ({
        id: request.id,
        type: request.type,
        status: request.status,
        startDate: dateToDateOnly(request.startDate),
        endDate: dateToDateOnly(request.endDate),
        halfDayPeriod: request.halfDayPeriod,
      }),
    ),
  });
}

async function autoApprovePendingRequestByPolicy({
  prisma,
  leaveRequestId,
}: {
  prisma: RecoveryPrisma;
  leaveRequestId: string;
}) {
  let approved = false;

  try {
    approved = await prisma.$transaction(
      async (tx) => {
        const leaveRequest = (await tx.leaveRequest.findUnique({
          where: { id: leaveRequestId },
          include: leaveRequestRecoveryInclude,
        })) as RecoveryLeaveRequest | null;

        if (!leaveRequest || leaveRequest.status !== "PENDING") {
          return false;
        }

        const approvalPolicy = await resolveApprovalPolicyForLeaveRequest({
          leaveRequest,
          prisma: tx,
        });
        const autoApprove = await shouldAutoApproveLeaveRequest({
          leaveRequest,
          policy: approvalPolicy,
          prisma: tx as unknown as PrismaClient,
        });

        if (!autoApprove) {
          return false;
        }

        assertAttachmentRequirementForApproval(leaveRequest, approvalPolicy);
        await assertAutoApprovalStillValid({ tx, leaveRequest });
        await recordLeaveRequestPendingLedger({ tx, leaveRequest });

        const reviewedAt = new Date();
        const updateResult = await tx.leaveRequest.updateMany({
          where: { id: leaveRequest.id, status: "PENDING" },
          data: {
            status: "APPROVED",
            reviewerId: null,
            reviewedAt,
            reviewComment: "승인 정책에 따라 자동 승인되었습니다.",
            rejectReason: null,
            cancelReason: null,
            cancelledAt: null,
          },
        });

        if (updateResult.count !== 1) {
          return false;
        }

        if (leaveRequest.requestKind === "CUSTOM_GRANT") {
          try {
            for (const usage of leaveRequest.grantUsages) {
              await convertLeaveGrantPendingToUsed({
                tx,
                leaveGrantId: usage.leaveGrantId,
                amount: usage.amount,
              });
            }
          } catch (error) {
            if (error instanceof CustomLeaveRequestError) {
              throw new Error("GRANT_STATE");
            }

            throw error;
          }
        }

        await tx.auditLog.create({
          data: {
            actorId: null,
            actorUserId: null,
            targetUserId: leaveRequest.userId,
            action: "LEAVE_REQUEST_AUTO_APPROVED",
            targetType: "LEAVE_REQUEST",
            targetId: leaveRequest.id,
            metadata: toJsonValue({
              leaveRequestId: leaveRequest.id,
              requesterId: leaveRequest.userId,
              leaveType: leaveRequest.type,
              requestedDays: toNumber(leaveRequest.dayCount),
              startDate: dateToDateOnly(leaveRequest.startDate),
              endDate: dateToDateOnly(leaveRequest.endDate),
              recovery: true,
              approvalPolicy: approvalPolicySummary(approvalPolicy),
            }),
          },
        });

        await recordLeaveRequestApprovedLedger({
          tx,
          leaveRequest,
          actorId: null,
        });

        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch {
    return false;
  }

  if (approved) {
    await notifyLeaveRequestApproved({
      prisma,
      leaveRequestId,
      approvedByUserId: null,
      approvalSource: "AUTO_POLICY",
    });
  }

  return approved;
}

async function findKoreanNotificationRepairs({
  prisma,
  notificationScanLimit,
  window,
}: {
  prisma: RecoveryPrisma;
  notificationScanLimit: number;
  window: { fromDate?: DateOnly; toDate?: DateOnly; leaveRequestId?: string | null };
}) {
  const createdAt = createdAtWindowWhere(window);
  const notifications = await prisma.notification.findMany({
    where: {
      type: { in: [...LEAVE_NOTIFICATION_TYPES] },
      ...(createdAt ? { createdAt } : {}),
      ...(window.leaveRequestId
        ? { metadata: { path: ["leaveRequestId"], equals: window.leaveRequestId } }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    take: notificationScanLimit,
  });
  const leaveRequestIds = [
    ...new Set(
      notifications
        .map((notification) => metadataString(notification.metadata, "leaveRequestId"))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const leaveRequests = leaveRequestIds.length
    ? ((await prisma.leaveRequest.findMany({
        where: { id: { in: leaveRequestIds } },
        include: leaveRequestRecoveryInclude,
      })) as RecoveryLeaveRequest[])
    : [];
  const leaveRequestById = new Map(leaveRequests.map((request) => [request.id, request]));
  const repairs: KoreanNotificationRepair[] = [];

  for (const notification of notifications) {
    if (
      !containsLegacyKoreanMojibake(notification.title) &&
      !containsLegacyKoreanMojibake(notification.message)
    ) {
      continue;
    }

    const leaveRequestId = metadataString(notification.metadata, "leaveRequestId");
    const leaveRequest = leaveRequestId ? leaveRequestById.get(leaveRequestId) : null;

    if (!leaveRequest) {
      continue;
    }

    const content = buildRecoveredLeaveNotificationContent({
      notification,
      leaveRequest,
    });

    if (!content) {
      continue;
    }

    repairs.push({
      notificationId: notification.id,
      leaveRequestId: leaveRequest.id,
      title: content.title,
      message: content.message,
    });
  }

  return { repairs, checkedCount: notifications.length };
}

async function applyApprovalNotificationRepairs({
  prisma,
  missing,
  requestsById,
  policiesByRequestId,
}: {
  prisma: RecoveryPrisma;
  missing: ExpectedApprovalNotification[];
  requestsById: Map<string, RecoveryLeaveRequest>;
  policiesByRequestId: Map<string, ResolvedApprovalPolicy>;
}) {
  const requestIds = [...new Set(missing.map((item) => item.leaveRequestId))];
  let created = 0;

  for (const leaveRequestId of requestIds) {
    const leaveRequest = requestsById.get(leaveRequestId);
    const approvalPolicy = policiesByRequestId.get(leaveRequestId);

    if (!leaveRequest || !approvalPolicy) {
      continue;
    }

    const requestMissing = missing.filter((item) => item.leaveRequestId === leaveRequestId);
    const content = buildApprovalNeededContent(leaveRequest);
    const range = {
      startDate: dateToDateOnly(leaveRequest.startDate),
      endDate: dateToDateOnly(leaveRequest.endDate),
    };
    const typeName = leaveTypeLabel(leaveRequest);
    const dayCount = toNumber(leaveRequest.dayCount);

    for (const item of requestMissing) {
      await createInAppNotificationOnce({
        prisma,
        userId: item.recipientUserId,
        type: "LEAVE_REQUEST_CREATED",
        priority: "HIGH",
        title: content.title,
        message: content.message,
        linkUrl: `/leaves/approvals/${leaveRequestId}`,
        metadata: buildLeaveNotificationMetadata({
          deduplicationKey: item.deduplicationKey,
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
      });
      created += 1;
    }

    await prisma.auditLog.create({
      data: {
        actorId: null,
        actorUserId: null,
        targetUserId: leaveRequest.userId,
        action: "LEAVE_REQUEST_APPROVER_RESOLVED",
        targetType: "LEAVE_REQUEST",
        targetId: leaveRequestId,
        metadata: toJsonValue({
          leaveRequestId,
          requesterId: leaveRequest.userId,
          resolvedApproverIds: requestMissing.map((item) => item.recipientUserId),
          approvalPolicy: approvalPolicySummary(approvalPolicy),
          recovery: true,
        }),
      },
    });
  }

  return created;
}

async function applyRequesterNotificationRepairs({
  prisma,
  missing,
}: {
  prisma: RecoveryPrisma;
  missing: ExpectedRequesterNotification[];
}) {
  let created = 0;

  for (const item of missing) {
    const result = await notifyLeaveRequestApproved({
      prisma,
      leaveRequestId: item.leaveRequestId,
      approvedByUserId: null,
      approvalSource: item.approvalSource,
    });

    created += result.requesterCount;
  }

  return created;
}

async function applyNotificationLinkRepairs({
  prisma,
  repairs,
}: {
  prisma: RecoveryPrisma;
  repairs: NotificationLinkRepair[];
}) {
  let updated = 0;

  for (const repair of repairs) {
    const result = await prisma.notification.updateMany({
      where: { id: repair.notificationId },
      data: { linkUrl: repair.expectedLinkUrl },
    });

    if (result.count > 0) {
      updated += result.count;
      await prisma.auditLog.create({
        data: {
          actorId: null,
          actorUserId: null,
          targetUserId: repair.recipientUserId,
          action: "LEAVE_REQUEST_APPROVER_RESOLVED",
          targetType: "LEAVE_REQUEST",
          targetId: repair.leaveRequestId,
          metadata: toJsonValue({
            notificationId: repair.notificationId,
            leaveRequestId: repair.leaveRequestId,
            recovery: true,
            repairedFields: ["linkUrl"],
            expectedLinkUrl: repair.expectedLinkUrl,
            reason: repair.reason,
          }),
        },
      });
    }
  }

  return updated;
}

async function applyKoreanNotificationRepairs({
  prisma,
  repairs,
}: {
  prisma: RecoveryPrisma;
  repairs: KoreanNotificationRepair[];
}) {
  let updated = 0;

  for (const repair of repairs) {
    const result = await prisma.notification.updateMany({
      where: { id: repair.notificationId },
      data: {
        title: repair.title,
        message: repair.message,
      },
    });

    if (result.count > 0) {
      updated += result.count;
      await prisma.auditLog.create({
        data: {
          actorId: null,
          actorUserId: null,
          action: "LEAVE_REQUEST_APPROVER_RESOLVED",
          targetType: "LEAVE_REQUEST",
          targetId: repair.leaveRequestId,
          metadata: toJsonValue({
            notificationId: repair.notificationId,
            leaveRequestId: repair.leaveRequestId,
            recovery: true,
            repairedFields: ["title", "message"],
          }),
        },
      });
    }
  }

  return updated;
}

export async function runLeaveOperationalRecovery({
  prisma,
  dryRun = true,
  notificationScanLimit = 1000,
  fromDate,
  toDate,
  leaveRequestId = null,
}: {
  prisma: RecoveryPrisma;
  dryRun?: boolean;
  notificationScanLimit?: number;
  fromDate?: DateOnly | null;
  toDate?: DateOnly | null;
  leaveRequestId?: string | null;
}): Promise<LeaveOperationalRecoveryReport> {
  const window = normalizeLeaveOperationalRecoveryDateWindow({ fromDate, toDate });
  const windowFilter = {
    fromDate: window.fromDate ?? undefined,
    toDate: window.toDate ?? undefined,
    leaveRequestId,
  };
  const requestableGrantScanDate = todayInSeoul();
  const [pendingRequests, approvedRequests] = await Promise.all([
    listPendingRequests(prisma, windowFilter),
    listApprovedRequests(prisma, windowFilter),
  ]);
  const policiesByRequestId = new Map<string, ResolvedApprovalPolicy>();

  for (const leaveRequest of pendingRequests) {
    policiesByRequestId.set(
      leaveRequest.id,
      await resolveApprovalPolicyForLeaveRequest({
        leaveRequest,
        prisma,
      }),
    );
  }

  const [
    approvalNotificationScan,
    requesterNotificationScan,
    autoApprovalCandidates,
    koreanRepairScan,
    requestableGrantScan,
    calendarVisibilityScan,
    birthdayAnnualDeductionRecovery,
  ] = await Promise.all([
    findMissingApprovalNotifications({ prisma, pendingRequests }),
    findMissingRequesterNotifications({ prisma, approvedRequests }),
    findAutoApprovalCandidates({ prisma, pendingRequests }),
    findKoreanNotificationRepairs({ prisma, notificationScanLimit, window: windowFilter }),
    findRequestableGrantOptionIssues({ prisma, date: requestableGrantScanDate }),
    findCalendarVisibilityIssues({ prisma, window: windowFilter }),
    runBirthdayAnnualDeductionRecovery({
      prisma,
      dryRun: true,
      fromDate: window.fromDate,
      toDate: window.toDate,
      leaveRequestId,
    }),
  ]);
  const missingApprovalNotifications = approvalNotificationScan.missing;
  const missingRequesterNotifications = requesterNotificationScan.missing;
  const notificationLinkRepairs = [
    ...approvalNotificationScan.linkRepairs,
    ...requesterNotificationScan.linkRepairs,
  ];
  const report: LeaveOperationalRecoveryReport = {
    dryRun,
    window,
    checked: {
      pendingLeaveRequests: pendingRequests.length,
      approvedLeaveRequests: approvedRequests.length,
      leaveNotifications: koreanRepairScan.checkedCount,
      activeLeaveGrants: requestableGrantScan.checkedCount,
      approvedCalendarLeaveRequests: calendarVisibilityScan.checkedCount,
    },
    missingApprovalNotifications,
    missingRequesterNotifications,
    notificationLinkRepairs,
    autoApprovalCandidates,
    calendarEligibleApprovedLeaveRequestIds: approvedRequests.map((request) => request.id),
    calendarVisibilityIssues: calendarVisibilityScan.issues,
    requestableGrantOptionIssues: requestableGrantScan.issues,
    birthdayGrantOptionIssues: requestableGrantScan.issues.filter(
      (issue) => issue.isBirthdayHalfDay,
    ),
    birthdayAnnualDeductionRepairs: birthdayAnnualDeductionRecovery.candidates,
    koreanNotificationRepairs: koreanRepairScan.repairs,
    applied: {
      approvalNotificationsCreated: 0,
      requesterNotificationsCreated: 0,
      notificationLinksUpdated: 0,
      autoApprovedRequests: 0,
      koreanNotificationsUpdated: 0,
      birthdayAnnualDeductionLedgersReclassified: 0,
      birthdayAnnualLeaveBalancesUpdated: 0,
    },
    skipped: {
      autoApprovalRequestIds: [],
      birthdayAnnualDeductionAlreadyRecovered:
        birthdayAnnualDeductionRecovery.applied.skippedAlreadyRecovered,
      birthdayAnnualDeductionNotRepairable:
        birthdayAnnualDeductionRecovery.applied.skippedNotRepairable,
    },
  };

  if (dryRun) {
    return report;
  }

  const requestsById = new Map(pendingRequests.map((request) => [request.id, request]));
  const autoApprovedIds = new Set<string>();

  for (const candidate of autoApprovalCandidates) {
    const approved = await autoApprovePendingRequestByPolicy({
      prisma,
      leaveRequestId: candidate.leaveRequestId,
    });

    if (approved) {
      report.applied.autoApprovedRequests += 1;
      autoApprovedIds.add(candidate.leaveRequestId);
    } else {
      report.skipped.autoApprovalRequestIds.push(candidate.leaveRequestId);
    }
  }

  report.applied.approvalNotificationsCreated = await applyApprovalNotificationRepairs({
    prisma,
    missing: missingApprovalNotifications.filter(
      (item) => !autoApprovedIds.has(item.leaveRequestId),
    ),
    requestsById,
    policiesByRequestId,
  });
  report.applied.requesterNotificationsCreated = await applyRequesterNotificationRepairs({
    prisma,
    missing: missingRequesterNotifications,
  });
  report.applied.notificationLinksUpdated = await applyNotificationLinkRepairs({
    prisma,
    repairs: notificationLinkRepairs,
  });

  report.applied.koreanNotificationsUpdated = await applyKoreanNotificationRepairs({
    prisma,
    repairs: koreanRepairScan.repairs,
  });

  const birthdayAnnualApply = await runBirthdayAnnualDeductionRecovery({
    prisma,
    dryRun: false,
    fromDate: window.fromDate,
    toDate: window.toDate,
    leaveRequestId,
  });
  report.applied.birthdayAnnualDeductionLedgersReclassified =
    birthdayAnnualApply.applied.annualLedgersReclassified;
  report.applied.birthdayAnnualLeaveBalancesUpdated =
    birthdayAnnualApply.applied.leaveBalancesUpdated;
  report.skipped.birthdayAnnualDeductionAlreadyRecovered =
    birthdayAnnualApply.applied.skippedAlreadyRecovered;
  report.skipped.birthdayAnnualDeductionNotRepairable =
    birthdayAnnualApply.applied.skippedNotRepairable;

  return report;
}
