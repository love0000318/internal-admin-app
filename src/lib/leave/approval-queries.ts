import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  getReviewableRequesterWhere,
  hydrateReviewScope,
  toReviewableLeaveRequest,
} from "@/lib/leave/review";
import type { LeaveRequestStatus, LeaveType } from "@/lib/leave/types";
import { LEAVE_TYPES } from "@/lib/leave/types";
import {
  canReviewLeaveRequestWithPolicy,
  resolveApprovalPolicyForLeaveRequest,
} from "@/lib/leave/approval-policy";
import { canReviewLeaveRequest } from "@/lib/rbac/guards";
import type { RbacUser } from "@/lib/rbac/roles";

export type LeaveApprovalFilters = {
  teamId?: string;
  type?: string;
  requester?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  reviewerId?: string;
  sort?: string;
};

export const LEAVE_APPROVAL_INCLUDE = {
  user: {
    include: {
      team: true,
      profile: true,
    },
  },
  reviewer: true,
  customLeaveType: {
    include: {
      approvalPolicy: {
        include: { customApprover: true },
      },
    },
  },
  attachments: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: true,
      reviewedBy: true,
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

function parseLeaveType(value: string | undefined): LeaveType | undefined {
  return LEAVE_TYPES.includes(value as LeaveType) ? (value as LeaveType) : undefined;
}

function parseStatus(value: string | undefined): LeaveRequestStatus | undefined {
  const statuses: LeaveRequestStatus[] = [
    "PENDING",
    "APPROVED",
    "REJECTED",
    "CANCELLED",
    "WITHDRAWN",
  ];

  return statuses.includes(value as LeaveRequestStatus)
    ? (value as LeaveRequestStatus)
    : undefined;
}

export function buildRequesterWhere(
  actor: RbacUser,
  filters: LeaveApprovalFilters,
): Prisma.UserWhereInput {
  const scope = getReviewableRequesterWhere(actor);
  const search = filters.requester?.trim();
  const conditions: Prisma.UserWhereInput[] = [scope];

  if (filters.teamId) {
    conditions.push({ teamId: filters.teamId });
  }

  if (search) {
    conditions.push({
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
      ],
    });
  }

  return {
    AND: conditions,
  };
}

function buildWhere(
  actor: RbacUser,
  filters: LeaveApprovalFilters,
  defaultStatus: LeaveRequestStatus,
): Prisma.LeaveRequestWhereInput {
  const leaveType = parseLeaveType(filters.type);
  const status = parseStatus(filters.status) ?? defaultStatus;

  return {
    status,
    ...(leaveType ? { type: leaveType } : {}),
    ...(filters.reviewerId ? { reviewerId: filters.reviewerId } : {}),
    ...(filters.startDate || filters.endDate
      ? {
          startDate: {
            ...(filters.startDate
              ? { gte: new Date(`${filters.startDate}T00:00:00.000Z`) }
              : {}),
            ...(filters.endDate
              ? { lte: new Date(`${filters.endDate}T00:00:00.000Z`) }
              : {}),
          },
        }
      : {}),
    OR: [
      { user: buildRequesterWhere(actor, filters) },
      {
        customLeaveType: {
          approvalPolicy: {
            approvalMode: "SINGLE",
            approverRule: "CUSTOM_USER",
            customApproverUserId: actor.id,
            isEnabled: true,
          },
        },
      },
    ],
  };
}

function buildOrderBy(sort: string | undefined): Prisma.LeaveRequestOrderByWithRelationInput[] {
  if (sort === "startDate") {
    return [{ startDate: "asc" }, { createdAt: "desc" }];
  }

  if (sort === "requester") {
    return [{ user: { name: "asc" } }, { createdAt: "desc" }];
  }

  return [{ createdAt: "desc" }];
}

export async function listPendingLeaveApprovals({
  actor,
  filters,
  prisma = getPrisma(),
}: {
  actor: RbacUser;
  filters: LeaveApprovalFilters;
  prisma?: PrismaClient;
}) {
  const scopedActor = await hydrateReviewScope(actor, prisma);

  return prisma.leaveRequest.findMany({
    where: buildWhere(scopedActor, filters, "PENDING"),
    include: LEAVE_APPROVAL_INCLUDE,
    orderBy: buildOrderBy(filters.sort),
  });
}

export async function listApprovedLeaveRequestsForReview({
  actor,
  filters,
  prisma = getPrisma(),
}: {
  actor: RbacUser;
  filters: LeaveApprovalFilters;
  prisma?: PrismaClient;
}) {
  const scopedActor = await hydrateReviewScope(actor, prisma);

  return prisma.leaveRequest.findMany({
    where: buildWhere(scopedActor, filters, "APPROVED"),
    include: LEAVE_APPROVAL_INCLUDE,
    orderBy: buildOrderBy(filters.sort),
  });
}

export async function getLeaveApprovalDetail({
  actor,
  requestId,
  prisma = getPrisma(),
}: {
  actor: RbacUser;
  requestId: string;
  prisma?: PrismaClient;
}) {
  const scopedActor = await hydrateReviewScope(actor, prisma);
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: LEAVE_APPROVAL_INCLUDE,
  });

  if (!leaveRequest) {
    return null;
  }

  const approvalPolicy = await resolveApprovalPolicyForLeaveRequest({
    leaveRequest,
    prisma,
  });

  if (
    !canReviewLeaveRequest(scopedActor, toReviewableLeaveRequest(leaveRequest).user) &&
    !canReviewLeaveRequestWithPolicy({
      actor: scopedActor,
      leaveRequest,
      policy: approvalPolicy,
    })
  ) {
    return null;
  }

  return leaveRequest;
}
