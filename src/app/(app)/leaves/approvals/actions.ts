"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { assertEnoughLeaveBalance, toNumber } from "@/lib/leave/balance";
import { dateToDateOnly } from "@/lib/leave/calculate-business-days";
import {
  convertLeaveGrantPendingToUsed,
  CustomLeaveRequestError,
  releaseLeaveGrantPendingAmount,
  restoreLeaveGrantUsedAmount,
} from "@/lib/leave/custom-grant-requests";
import {
  approvalPolicySummary,
  assertAttachmentRequirementForApproval,
  canApproveLeaveRequestWithPolicy,
  canCancelApprovedLeaveRequestWithPolicy,
  canRejectLeaveRequestWithPolicy,
  resolveApprovalPolicyForLeaveRequest,
} from "@/lib/leave/approval-policy";
import { assertNoOverlappingLeaveRequest } from "@/lib/leave/overlap";
import { getLeavePolicyMap, getUserLeaveBalance } from "@/lib/leave/queries";
import { legacyLeaveTypeDeductsAnnualBalance } from "@/lib/leave/legacy-request-policy";
import {
  hydrateReviewScope,
} from "@/lib/leave/review";
import {
  recordLeaveRequestApprovedLedger,
  recordLeaveRequestCancelledLedger,
  recordLeaveRequestRejectedLedger,
} from "@/lib/leave/ledger";
import {
  notifyLeaveRequestApproved,
  notifyLeaveRequestRejectedOrCancelled,
} from "@/lib/notifications/leave-notifications";
import type { LeaveOverlapCandidate } from "@/lib/leave/types";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

class LeaveApprovalActionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getRequiredFormValue(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

function getComment(formData: FormData, name: string) {
  const value = getRequiredFormValue(formData, name).trim();

  return value.length > 0 ? value : null;
}

function getReturnTo(formData: FormData) {
  const value = getRequiredFormValue(formData, "returnTo");

  return value.startsWith("/leaves/approvals") ? value : "/leaves/approvals";
}

function withSearchParam(path: string, key: string, value: string) {
  const separator = path.includes("?") ? "&" : "?";

  return `${path}${separator}${key}=${encodeURIComponent(value)}`;
}

function approvalMetadata(input: {
  leaveRequestId: string;
  requesterId: string;
  reviewerId: string;
  beforeStatus: string;
  afterStatus: string;
  requestedDays: number;
  leaveType: string;
  requestKind?: string;
  leaveTypeId?: string | null;
  leaveTypeCode?: string | null;
  approvalPolicy?: {
    policyId: string;
    policyCode: string;
    approvalMode: string;
    approverRule: string;
  };
  grantUsages?: Array<{
    leaveGrantId: string;
    amount: number;
    unit: string;
  }>;
  startDate: string;
  endDate: string;
  reviewComment?: string | null;
  cancelComment?: string | null;
}) {
  return toJsonValue(input);
}

const leaveRequestActionInclude = {
  user: true,
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

function grantUsageMetadata(
  leaveRequest: {
    grantUsages?: Array<{
      leaveGrantId: string;
      amount: number;
      unit: string;
    }>;
  },
) {
  return (leaveRequest.grantUsages ?? []).map((usage) => ({
    leaveGrantId: usage.leaveGrantId,
    amount: usage.amount,
    unit: usage.unit,
  }));
}

async function assertApprovalStillValid(params: {
  tx: Prisma.TransactionClient;
  leaveRequest: Awaited<
    ReturnType<Prisma.TransactionClient["leaveRequest"]["findUniqueOrThrow"]>
  > & {
    user: {
      id: string;
      role: "OWNER" | "LEAD" | "MANAGER" | "EXTERNAL_PARTNER";
      status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED" | "DELETED";
      teamId: string | null;
    };
  };
}) {
  const { tx, leaveRequest } = params;
  const policies = await getLeavePolicyMap(tx as unknown as ReturnType<typeof getPrisma>);
  const policy = policies[leaveRequest.type];

  if (
    leaveRequest.requestKind !== "CUSTOM_GRANT" &&
    legacyLeaveTypeDeductsAnnualBalance({
      type: leaveRequest.type,
      policy,
    })
  ) {
    const balance = await getUserLeaveBalance({
      userId: leaveRequest.userId,
      year: Number(dateToDateOnly(leaveRequest.startDate).slice(0, 4)),
      prisma: tx as unknown as ReturnType<typeof getPrisma>,
    });

    assertEnoughLeaveBalance({
      requestedDays: 0,
      balance,
    });
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

export async function approveLeaveRequest(formData: FormData) {
  const actor = await requireRouteAccess("/leaves/approvals");
  const returnTo = getReturnTo(formData);
  const requestId = getRequiredFormValue(formData, "requestId");
  const reviewComment = getComment(formData, "reviewComment");

  if (!requestId) {
    redirect(withSearchParam(returnTo, "error", "invalid"));
  }

  const prisma = getPrisma();
  const scopedActor = await hydrateReviewScope(actor, prisma);

  try {
    await prisma.$transaction(
      async (tx) => {
        const leaveRequest = await tx.leaveRequest.findUnique({
          where: { id: requestId },
          include: leaveRequestActionInclude,
        });

        if (!leaveRequest) {
          throw new LeaveApprovalActionError("not-found");
        }

        if (leaveRequest.status !== "PENDING") {
          throw new LeaveApprovalActionError("not-pending");
        }

        if (leaveRequest.user.status !== "ACTIVE") {
          throw new LeaveApprovalActionError("requester-inactive");
        }

        const approvalPolicy = await resolveApprovalPolicyForLeaveRequest({
          leaveRequest,
          prisma: tx,
        });

        if (
          !canApproveLeaveRequestWithPolicy(
            scopedActor,
            leaveRequest,
            approvalPolicy,
          )
        ) {
          throw new LeaveApprovalActionError("forbidden");
        }

        try {
          assertAttachmentRequirementForApproval(leaveRequest, approvalPolicy);
        } catch {
          throw new LeaveApprovalActionError("attachment-not-accepted");
        }

        try {
          await assertApprovalStillValid({ tx, leaveRequest });
        } catch {
          throw new LeaveApprovalActionError("balance-or-overlap");
        }

        const updateResult = await tx.leaveRequest.updateMany({
          where: { id: leaveRequest.id, status: "PENDING" },
          data: {
            status: "APPROVED",
            reviewerId: actor.id,
            reviewedAt: new Date(),
            reviewComment,
            rejectReason: null,
            cancelReason: null,
            cancelledAt: null,
          },
        });

        if (updateResult.count !== 1) {
          throw new LeaveApprovalActionError("not-pending");
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
              throw new LeaveApprovalActionError("grant-state");
            }

            throw error;
          }
        }

        const updated = await tx.leaveRequest.findUniqueOrThrow({
          where: { id: leaveRequest.id },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            actorUserId: actor.id,
            targetUserId: leaveRequest.userId,
            action:
              leaveRequest.requestKind === "CUSTOM_GRANT"
                ? "CUSTOM_LEAVE_REQUEST_APPROVED"
                : "LEAVE_REQUEST_APPROVED",
            targetType: "LEAVE_REQUEST",
            targetId: leaveRequest.id,
            metadata: approvalMetadata({
              leaveRequestId: leaveRequest.id,
              requesterId: leaveRequest.userId,
              reviewerId: actor.id,
              beforeStatus: leaveRequest.status,
              afterStatus: updated.status,
              requestedDays: toNumber(leaveRequest.dayCount),
              leaveType: leaveRequest.type,
              requestKind: leaveRequest.requestKind,
              leaveTypeId: leaveRequest.leaveTypeId,
              leaveTypeCode: leaveRequest.customLeaveType?.code,
              approvalPolicy: approvalPolicySummary(approvalPolicy),
              grantUsages: grantUsageMetadata(leaveRequest),
              startDate: dateToDateOnly(leaveRequest.startDate),
              endDate: dateToDateOnly(leaveRequest.endDate),
              reviewComment,
            }),
          },
        });

        await recordLeaveRequestApprovedLedger({
          tx,
          leaveRequest,
          actorId: actor.id,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof LeaveApprovalActionError) {
      redirect(withSearchParam(returnTo, "error", error.code));
    }

    throw error;
  }

  revalidatePath("/leaves/approvals");
  revalidatePath("/leaves/approvals/approved");
  revalidatePath("/leaves/me");
  revalidatePath("/leaves/calendar");
  await notifyLeaveRequestApproved({ leaveRequestId: requestId, approvedByUserId: actor.id, prisma });
  redirect(withSearchParam(returnTo, "success", "approved"));
}

export async function rejectLeaveRequest(formData: FormData) {
  const actor = await requireRouteAccess("/leaves/approvals");
  const returnTo = getReturnTo(formData);
  const requestId = getRequiredFormValue(formData, "requestId");
  const reviewComment = getComment(formData, "reviewComment");

  if (!requestId) {
    redirect(withSearchParam(returnTo, "error", "invalid"));
  }

  const prisma = getPrisma();
  const scopedActor = await hydrateReviewScope(actor, prisma);

  try {
    await prisma.$transaction(
      async (tx) => {
        const leaveRequest = await tx.leaveRequest.findUnique({
          where: { id: requestId },
          include: leaveRequestActionInclude,
        });

        if (!leaveRequest) {
          throw new LeaveApprovalActionError("not-found");
        }

        if (leaveRequest.status !== "PENDING") {
          throw new LeaveApprovalActionError("not-pending");
        }

        const approvalPolicy = await resolveApprovalPolicyForLeaveRequest({
          leaveRequest,
          prisma: tx,
        });

        if (approvalPolicy.requireCommentOnReject && !reviewComment) {
          throw new LeaveApprovalActionError("reject-comment-required");
        }

        if (
          !canRejectLeaveRequestWithPolicy(
            scopedActor,
            leaveRequest,
            approvalPolicy,
          )
        ) {
          throw new LeaveApprovalActionError("forbidden");
        }

        const updateResult = await tx.leaveRequest.updateMany({
          where: { id: leaveRequest.id, status: "PENDING" },
          data: {
            status: "REJECTED",
            reviewerId: actor.id,
            reviewedAt: new Date(),
            reviewComment,
            rejectReason: reviewComment,
          },
        });

        if (updateResult.count !== 1) {
          throw new LeaveApprovalActionError("not-pending");
        }

        if (leaveRequest.requestKind === "CUSTOM_GRANT") {
          try {
            for (const usage of leaveRequest.grantUsages) {
              await releaseLeaveGrantPendingAmount({
                tx,
                leaveGrantId: usage.leaveGrantId,
                amount: usage.amount,
              });
            }
          } catch (error) {
            if (error instanceof CustomLeaveRequestError) {
              throw new LeaveApprovalActionError("grant-state");
            }

            throw error;
          }
        }

        const updated = await tx.leaveRequest.findUniqueOrThrow({
          where: { id: leaveRequest.id },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            actorUserId: actor.id,
            targetUserId: leaveRequest.userId,
            action:
              leaveRequest.requestKind === "CUSTOM_GRANT"
                ? "CUSTOM_LEAVE_REQUEST_REJECTED"
                : "LEAVE_REQUEST_REJECTED",
            targetType: "LEAVE_REQUEST",
            targetId: leaveRequest.id,
            metadata: approvalMetadata({
              leaveRequestId: leaveRequest.id,
              requesterId: leaveRequest.userId,
              reviewerId: actor.id,
              beforeStatus: leaveRequest.status,
              afterStatus: updated.status,
              requestedDays: toNumber(leaveRequest.dayCount),
              leaveType: leaveRequest.type,
              requestKind: leaveRequest.requestKind,
              leaveTypeId: leaveRequest.leaveTypeId,
              leaveTypeCode: leaveRequest.customLeaveType?.code,
              approvalPolicy: approvalPolicySummary(approvalPolicy),
              grantUsages: grantUsageMetadata(leaveRequest),
              startDate: dateToDateOnly(leaveRequest.startDate),
              endDate: dateToDateOnly(leaveRequest.endDate),
              reviewComment,
            }),
          },
        });

        await recordLeaveRequestRejectedLedger({
          tx,
          leaveRequest,
          actorId: actor.id,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof LeaveApprovalActionError) {
      redirect(withSearchParam(returnTo, "error", error.code));
    }

    throw error;
  }

  revalidatePath("/leaves/approvals");
  revalidatePath("/leaves/me");
  await notifyLeaveRequestRejectedOrCancelled({ leaveRequestId: requestId, action: "REJECTED", prisma });
  redirect(withSearchParam(returnTo, "success", "rejected"));
}

export async function cancelApprovedLeaveRequest(formData: FormData) {
  const actor = await requireRouteAccess("/leaves/approvals");
  const returnTo = getReturnTo(formData);
  const requestId = getRequiredFormValue(formData, "requestId");
  const cancelComment = getComment(formData, "cancelComment");

  if (!requestId) {
    redirect(withSearchParam(returnTo, "error", "invalid"));
  }

  const prisma = getPrisma();
  const scopedActor = await hydrateReviewScope(actor, prisma);

  try {
    await prisma.$transaction(
      async (tx) => {
        const leaveRequest = await tx.leaveRequest.findUnique({
          where: { id: requestId },
          include: leaveRequestActionInclude,
        });

        if (!leaveRequest) {
          throw new LeaveApprovalActionError("not-found");
        }

        if (leaveRequest.status !== "APPROVED") {
          throw new LeaveApprovalActionError("not-approved");
        }

        const approvalPolicy = await resolveApprovalPolicyForLeaveRequest({
          leaveRequest,
          prisma: tx,
        });

        if (approvalPolicy.requireCommentOnCancel && !cancelComment) {
          throw new LeaveApprovalActionError("cancel-comment-required");
        }

        if (
          !canCancelApprovedLeaveRequestWithPolicy(
            scopedActor,
            leaveRequest,
            approvalPolicy,
          )
        ) {
          throw new LeaveApprovalActionError("forbidden");
        }

        const updateResult = await tx.leaveRequest.updateMany({
          where: { id: leaveRequest.id, status: "APPROVED" },
          data: {
            status: "CANCELLED",
            reviewerId: actor.id,
            reviewedAt: new Date(),
            reviewComment: cancelComment,
            cancelReason: cancelComment,
            cancelledAt: new Date(),
          },
        });

        if (updateResult.count !== 1) {
          throw new LeaveApprovalActionError("not-approved");
        }

        if (leaveRequest.requestKind === "CUSTOM_GRANT") {
          try {
            for (const usage of leaveRequest.grantUsages) {
              await restoreLeaveGrantUsedAmount({
                tx,
                leaveGrantId: usage.leaveGrantId,
                amount: usage.amount,
              });
            }
          } catch (error) {
            if (error instanceof CustomLeaveRequestError) {
              throw new LeaveApprovalActionError("grant-state");
            }

            throw error;
          }
        }

        const updated = await tx.leaveRequest.findUniqueOrThrow({
          where: { id: leaveRequest.id },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            actorUserId: actor.id,
            targetUserId: leaveRequest.userId,
            action:
              leaveRequest.requestKind === "CUSTOM_GRANT"
                ? "CUSTOM_LEAVE_REQUEST_CANCELLED"
                : "LEAVE_REQUEST_CANCELLED",
            targetType: "LEAVE_REQUEST",
            targetId: leaveRequest.id,
            metadata: approvalMetadata({
              leaveRequestId: leaveRequest.id,
              requesterId: leaveRequest.userId,
              reviewerId: actor.id,
              beforeStatus: leaveRequest.status,
              afterStatus: updated.status,
              requestedDays: toNumber(leaveRequest.dayCount),
              leaveType: leaveRequest.type,
              requestKind: leaveRequest.requestKind,
              leaveTypeId: leaveRequest.leaveTypeId,
              leaveTypeCode: leaveRequest.customLeaveType?.code,
              approvalPolicy: approvalPolicySummary(approvalPolicy),
              grantUsages: grantUsageMetadata(leaveRequest),
              startDate: dateToDateOnly(leaveRequest.startDate),
              endDate: dateToDateOnly(leaveRequest.endDate),
              cancelComment,
            }),
          },
        });

        await recordLeaveRequestCancelledLedger({
          tx,
          leaveRequest,
          actorId: actor.id,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof LeaveApprovalActionError) {
      redirect(withSearchParam(returnTo, "error", error.code));
    }

    throw error;
  }

  revalidatePath("/leaves/approvals");
  revalidatePath("/leaves/approvals/approved");
  revalidatePath("/leaves/me");
  revalidatePath("/leaves/calendar");
  await notifyLeaveRequestRejectedOrCancelled({ leaveRequestId: requestId, action: "CANCELLED", prisma });
  redirect(withSearchParam(returnTo, "success", "cancelled"));
}
