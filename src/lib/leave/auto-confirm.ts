import { Prisma, type ApprovalPolicy, type PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  approvalPolicySummary,
  assertAttachmentRequirementForApproval,
  resolveApprovalPolicyForLeaveRequest,
  type LeaveRequestWithPolicy,
} from "@/lib/leave/approval-policy";
import { assertEnoughLeaveBalance, policyDeductsAnnual, toNumber } from "@/lib/leave/balance";
import {
  compareDateOnly,
  dateOnlyToDate,
  dateToDateOnly,
  todayInSeoul,
} from "@/lib/leave/calculate-business-days";
import {
  convertLeaveGrantPendingToUsed,
  CustomLeaveRequestError,
} from "@/lib/leave/custom-grant-requests";
import { recordLeaveRequestAutoConfirmedLedger } from "@/lib/leave/ledger";
import { assertNoOverlappingLeaveRequest } from "@/lib/leave/overlap";
import { getLeavePolicyMap, getUserLeaveBalance } from "@/lib/leave/queries";
import type { DateOnly, LeaveOverlapCandidate } from "@/lib/leave/types";

const AUTO_CONFIRM_REASON = "휴가 시작일 경과로 자동 확정";

export type AutoConfirmSkipReason =
  | "NOT_PENDING"
  | "ALREADY_AUTO_CONFIRMED"
  | "REQUESTER_INACTIVE"
  | "LEAVE_TYPE_DISABLED"
  | "POLICY_DISABLED"
  | "AUTO_CONFIRM_DISABLED"
  | "START_DATE_NOT_REACHED"
  | "ATTACHMENT_NOT_ACCEPTED"
  | "BALANCE_OR_OVERLAP"
  | "GRANT_STATE"
  | "ALREADY_HAS_AUTO_CONFIRM_LEDGER";

export type AutoConfirmDecision =
  | { shouldAutoConfirm: true }
  | { shouldAutoConfirm: false; reason: AutoConfirmSkipReason };

export type AutoConfirmRunResult = {
  checkedCount: number;
  autoConfirmedCount: number;
  skippedCount: number;
  failedCount: number;
  skippedReasons: Record<string, number>;
  failedRequestIds: string[];
};

const autoConfirmLeaveRequestInclude = {
  user: true,
  customLeaveType: {
    include: {
      approvalPolicy: {
        include: { customApprover: true },
      },
    },
  },
  grantUsages: true,
} satisfies Prisma.LeaveRequestInclude;

type AutoConfirmLeaveRequest = LeaveRequestWithPolicy & {
  grantUsages: Array<{ leaveGrantId: string; amount: number; unit: string }>;
  autoConfirmedAt?: Date | null;
};

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function incrementReason(target: Record<string, number>, reason: string) {
  target[reason] = (target[reason] ?? 0) + 1;
}

function isStartDateEligible({
  startDate,
  today,
  timing,
}: {
  startDate: Date;
  today: DateOnly;
  timing: ApprovalPolicy["autoConfirmTiming"];
}) {
  // Current operating policy is strictly "today > startDate".
  // `timing` remains for stored policy compatibility and future expansion.
  void timing;
  const start = dateToDateOnly(startDate);
  const comparison = compareDateOnly(today, start);

  return comparison > 0;
}

export function shouldAutoConfirmLeaveRequest({
  leaveRequest,
  policy,
  today,
}: {
  leaveRequest: Pick<
    AutoConfirmLeaveRequest,
    | "status"
    | "startDate"
    | "autoConfirmedAt"
    | "attachmentStatus"
    | "requestKind"
  > & {
    user: Pick<AutoConfirmLeaveRequest["user"], "status">;
    customLeaveType?: Pick<NonNullable<AutoConfirmLeaveRequest["customLeaveType"]>, "isEnabled"> | null;
  };
  policy: Pick<
    ApprovalPolicy,
    | "isEnabled"
    | "autoConfirmWhenStartDatePassed"
    | "autoConfirmTiming"
    | "requireAttachmentAcceptedBeforeApproval"
  >;
  today: DateOnly;
}): AutoConfirmDecision {
  if (leaveRequest.status !== "PENDING") {
    return { shouldAutoConfirm: false, reason: "NOT_PENDING" };
  }

  if (leaveRequest.autoConfirmedAt) {
    return { shouldAutoConfirm: false, reason: "ALREADY_AUTO_CONFIRMED" };
  }

  if (leaveRequest.user.status !== "ACTIVE") {
    return { shouldAutoConfirm: false, reason: "REQUESTER_INACTIVE" };
  }

  if (leaveRequest.requestKind === "CUSTOM_GRANT" && !leaveRequest.customLeaveType?.isEnabled) {
    return { shouldAutoConfirm: false, reason: "LEAVE_TYPE_DISABLED" };
  }

  if (!policy.isEnabled) {
    return { shouldAutoConfirm: false, reason: "POLICY_DISABLED" };
  }

  if (!policy.autoConfirmWhenStartDatePassed) {
    return { shouldAutoConfirm: false, reason: "AUTO_CONFIRM_DISABLED" };
  }

  if (
    !isStartDateEligible({
      startDate: leaveRequest.startDate,
      today,
      timing: policy.autoConfirmTiming,
    })
  ) {
    return { shouldAutoConfirm: false, reason: "START_DATE_NOT_REACHED" };
  }

  if (
    policy.requireAttachmentAcceptedBeforeApproval &&
    leaveRequest.attachmentStatus !== "ACCEPTED"
  ) {
    return { shouldAutoConfirm: false, reason: "ATTACHMENT_NOT_ACCEPTED" };
  }

  return { shouldAutoConfirm: true };
}

async function assertAutoConfirmStillValid({
  tx,
  leaveRequest,
}: {
  tx: Prisma.TransactionClient;
  leaveRequest: AutoConfirmLeaveRequest;
}) {
  const existingAutoConfirmLedger = await tx.leaveLedger.findUnique({
    where: { idempotencyKey: `auto-confirm-used:${leaveRequest.id}` },
  });

  if (existingAutoConfirmLedger) {
    throw new Error("ALREADY_HAS_AUTO_CONFIRM_LEDGER");
  }

  const policies = await getLeavePolicyMap(tx as unknown as ReturnType<typeof getPrisma>);
  const leavePolicy = policies[leaveRequest.type];

  if (leaveRequest.requestKind !== "CUSTOM_GRANT") {
    if (!leavePolicy?.isEnabled) {
      throw new Error("LEAVE_TYPE_DISABLED");
    }

    if (policyDeductsAnnual(leavePolicy)) {
      const balance = await getUserLeaveBalance({
        userId: leaveRequest.userId,
        year: Number(dateToDateOnly(leaveRequest.startDate).slice(0, 4)),
        asOfDate: todayInSeoul(),
        prisma: tx as unknown as ReturnType<typeof getPrisma>,
      });

      assertEnoughLeaveBalance({
        requestedDays: 0,
        balance,
      });
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

export async function findPendingLeaveRequestsToAutoConfirm({
  date = todayInSeoul(),
  prisma = getPrisma(),
}: {
  date?: DateOnly;
  prisma?: PrismaClient;
} = {}) {
  return prisma.leaveRequest.findMany({
    where: {
      status: "PENDING",
      autoConfirmedAt: null,
      startDate: { lt: dateOnlyToDate(date) },
      user: { status: "ACTIVE" },
    },
    include: autoConfirmLeaveRequestInclude,
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });
}

export async function autoConfirmPendingLeaveRequest({
  leaveRequestId,
  date = todayInSeoul(),
  prisma = getPrisma(),
}: {
  leaveRequestId: string;
  date?: DateOnly;
  prisma?: PrismaClient;
}) {
  return prisma.$transaction(
    async (tx) => {
      const leaveRequest = (await tx.leaveRequest.findUnique({
        where: { id: leaveRequestId },
        include: autoConfirmLeaveRequestInclude,
      })) as AutoConfirmLeaveRequest | null;

      if (!leaveRequest) {
        return { status: "SKIPPED" as const, reason: "NOT_PENDING" as AutoConfirmSkipReason };
      }

      const approvalPolicy = await resolveApprovalPolicyForLeaveRequest({
        leaveRequest,
        prisma: tx,
      });

      const decision = shouldAutoConfirmLeaveRequest({
        leaveRequest,
        policy: approvalPolicy,
        today: date,
      });

      if (!decision.shouldAutoConfirm) {
        return { status: "SKIPPED" as const, reason: decision.reason };
      }

      try {
        assertAttachmentRequirementForApproval(leaveRequest, approvalPolicy);
        await assertAutoConfirmStillValid({ tx, leaveRequest });
      } catch (error) {
        const reason =
          error instanceof Error && error.message === "ALREADY_HAS_AUTO_CONFIRM_LEDGER"
            ? "ALREADY_HAS_AUTO_CONFIRM_LEDGER"
            : error instanceof Error && error.message === "LEAVE_TYPE_DISABLED"
              ? "LEAVE_TYPE_DISABLED"
              : "BALANCE_OR_OVERLAP";
        return { status: "SKIPPED" as const, reason: reason as AutoConfirmSkipReason };
      }

      const autoConfirmedAt = new Date();
      const updateResult = await tx.leaveRequest.updateMany({
        where: {
          id: leaveRequest.id,
          status: "PENDING",
          autoConfirmedAt: null,
        },
        data: {
          status: "APPROVED",
          reviewerId: null,
          reviewedAt: autoConfirmedAt,
          reviewComment: AUTO_CONFIRM_REASON,
          rejectReason: null,
          cancelReason: null,
          cancelledAt: null,
          autoConfirmedAt,
          autoConfirmReason: AUTO_CONFIRM_REASON,
          approvalSource: "AUTO_START_DATE",
        },
      });

      if (updateResult.count !== 1) {
        return { status: "SKIPPED" as const, reason: "NOT_PENDING" as AutoConfirmSkipReason };
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

      await recordLeaveRequestAutoConfirmedLedger({ tx, leaveRequest });

      await tx.notification.create({
        data: {
          userId: leaveRequest.userId,
          type: "LEAVE_AUTO_CONFIRMED",
          title: "휴가 요청이 자동 확정되었습니다.",
          message: "휴가 시작일이 지나 승인 대기 중이던 휴가 요청이 자동 확정되었습니다.",
          linkUrl: `/leaves/me/requests/${leaveRequest.id}`,
          metadata: toJsonValue({ leaveRequestId: leaveRequest.id }),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: null,
          actorUserId: null,
          targetUserId: leaveRequest.userId,
          action: "LEAVE_REQUEST_AUTO_CONFIRMED_AFTER_START_DATE",
          targetType: "LEAVE_REQUEST",
          targetId: leaveRequest.id,
          metadata: toJsonValue({
            leaveRequestId: leaveRequest.id,
            requesterId: leaveRequest.userId,
            leaveTypeId: leaveRequest.leaveTypeId,
            startDate: dateToDateOnly(leaveRequest.startDate),
            endDate: dateToDateOnly(leaveRequest.endDate),
            requestedDays: toNumber(leaveRequest.dayCount),
            previousStatus: leaveRequest.status,
            newStatus: "APPROVED",
            autoConfirmedAt: autoConfirmedAt.toISOString(),
            reason: "START_DATE_PASSED",
            approvalPolicy: approvalPolicySummary(approvalPolicy),
          }),
        },
      });

      return { status: "AUTO_CONFIRMED" as const };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function autoConfirmPendingLeaveRequestsForDate({
  date = todayInSeoul(),
  dryRun = false,
  prisma = getPrisma(),
}: {
  date?: DateOnly;
  dryRun?: boolean;
  prisma?: PrismaClient;
} = {}): Promise<AutoConfirmRunResult> {
  const candidates = await findPendingLeaveRequestsToAutoConfirm({ date, prisma });
  const result: AutoConfirmRunResult = {
    checkedCount: candidates.length,
    autoConfirmedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    skippedReasons: {},
    failedRequestIds: [],
  };

  for (const candidate of candidates as AutoConfirmLeaveRequest[]) {
    try {
      const policy = await resolveApprovalPolicyForLeaveRequest({
        leaveRequest: candidate,
        prisma,
      });
      const decision = shouldAutoConfirmLeaveRequest({
        leaveRequest: candidate,
        policy,
        today: date,
      });

      if (!decision.shouldAutoConfirm) {
        result.skippedCount += 1;
        incrementReason(result.skippedReasons, decision.reason);
        continue;
      }

      if (dryRun) {
        result.autoConfirmedCount += 1;
        continue;
      }

      const itemResult = await autoConfirmPendingLeaveRequest({
        leaveRequestId: candidate.id,
        date,
        prisma,
      });

      if (itemResult.status === "AUTO_CONFIRMED") {
        result.autoConfirmedCount += 1;
      } else {
        result.skippedCount += 1;
        incrementReason(result.skippedReasons, itemResult.reason);
      }
    } catch {
      result.failedCount += 1;
      result.failedRequestIds.push(candidate.id);
    }
  }

  await prisma.auditLog.create({
    data: {
      actorId: null,
      actorUserId: null,
      action: dryRun
        ? "AUTO_CONFIRM_PAST_START_LEAVES_DRY_RUN"
        : "AUTO_CONFIRM_PAST_START_LEAVES_RUN",
      targetType: "JOB_RUN",
      metadata: toJsonValue({
        date,
        dryRun,
        checkedCount: result.checkedCount,
        autoConfirmedCount: result.autoConfirmedCount,
        skippedCount: result.skippedCount,
        failedCount: result.failedCount,
        skippedReasons: result.skippedReasons,
      }),
    },
  });

  return result;
}
