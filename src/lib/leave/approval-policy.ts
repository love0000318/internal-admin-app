import type {
  ApprovalPolicy,
  ApproverRule,
  LeaveRequest,
  LeaveType,
  LeaveTypeDefinition,
  Prisma,
  PrismaClient,
  User,
} from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { hydrateReviewScope, toReviewableLeaveRequest } from "@/lib/leave/review";
import { canReviewLeaveRequest } from "@/lib/rbac/guards";
import { isLead, isOwner, type RbacUser } from "@/lib/rbac/roles";

export const DEFAULT_APPROVAL_POLICY_CODE = "DEFAULT_TEAM_LEAD_OR_OWNER";

export type ApprovalPolicyWithApprover = ApprovalPolicy & {
  customApprover?: Pick<User, "id" | "role" | "status" | "teamId"> | null;
};

export type LeaveRequestWithPolicy = Pick<
  LeaveRequest,
  | "id"
  | "userId"
  | "type"
  | "requestKind"
  | "leaveTypeId"
  | "status"
  | "startDate"
  | "endDate"
  | "halfDayPeriod"
  | "dayCount"
  | "attachmentStatus"
> & {
  user: Pick<User, "id" | "role" | "status" | "teamId" | "name">;
  customLeaveType?: (LeaveTypeDefinition & {
    approvalPolicy?: ApprovalPolicyWithApprover | null;
  }) | null;
};

export const fallbackApprovalPolicy: Pick<
  ApprovalPolicy,
  | "id"
  | "code"
  | "name"
  | "description"
  | "appliesTo"
  | "leaveTypeId"
  | "approvalMode"
  | "approverRule"
  | "customApproverUserId"
  | "requireCommentOnReject"
  | "requireCommentOnCancel"
  | "requireAttachmentAcceptedBeforeApproval"
  | "autoApproveIfNoApprover"
  | "autoConfirmWhenStartDatePassed"
  | "autoConfirmTiming"
  | "isEnabled"
  | "createdAt"
  | "updatedAt"
> = {
  id: "fallback",
  code: DEFAULT_APPROVAL_POLICY_CODE,
  name: "기본 휴가 승인 정책",
  description: "담당 리드 또는 OWNER가 휴가 요청을 승인합니다.",
  appliesTo: "LEAVE_REQUEST",
  leaveTypeId: null,
  approvalMode: "SINGLE",
  approverRule: "TEAM_LEAD_OR_OWNER",
  customApproverUserId: null,
  requireCommentOnReject: true,
  requireCommentOnCancel: true,
  requireAttachmentAcceptedBeforeApproval: false,
  autoApproveIfNoApprover: false,
  autoConfirmWhenStartDatePassed: true,
  autoConfirmTiming: "AFTER_START_DATE",
  isEnabled: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

export function isApprovalPolicyManual(policy: Pick<ApprovalPolicy, "approvalMode">) {
  return policy.approvalMode !== "NONE";
}

export function approvalPolicySummary(policy: Pick<ApprovalPolicy, "id" | "code" | "approvalMode" | "approverRule">) {
  return {
    policyId: policy.id,
    policyCode: policy.code,
    approvalMode: policy.approvalMode,
    approverRule: policy.approverRule,
  };
}

export async function getDefaultApprovalPolicy(
  prisma: PrismaClient | Prisma.TransactionClient = getPrisma(),
) {
  return (
    (await prisma.approvalPolicy.findUnique({
      where: { code: DEFAULT_APPROVAL_POLICY_CODE },
      include: { customApprover: true },
    })) ?? fallbackApprovalPolicy
  );
}

export async function resolveApprovalPolicyForLeaveTypeCode({
  leaveType,
  prisma = getPrisma(),
}: {
  leaveType: LeaveType;
  prisma?: PrismaClient | Prisma.TransactionClient;
}) {
  const leaveTypeDefinition = await prisma.leaveTypeDefinition.findUnique({
    where: { code: leaveType },
    include: {
      approvalPolicy: {
        include: { customApprover: true },
      },
    },
  });

  if (leaveTypeDefinition?.approvalPolicy?.isEnabled) {
    return leaveTypeDefinition.approvalPolicy;
  }

  return getDefaultApprovalPolicy(prisma);
}

export async function resolveApprovalPolicyForLeaveRequest({
  leaveRequest,
  prisma = getPrisma(),
}: {
  leaveRequest: LeaveRequestWithPolicy;
  prisma?: PrismaClient | Prisma.TransactionClient;
}) {
  if (leaveRequest.customLeaveType?.approvalPolicy?.isEnabled) {
    return leaveRequest.customLeaveType.approvalPolicy;
  }

  return resolveApprovalPolicyForLeaveTypeCode({
    leaveType: leaveRequest.type,
    prisma,
  });
}

function isSelf(actor: RbacUser, request: Pick<LeaveRequest, "userId">) {
  return actor.id === request.userId;
}

function isManagedLead(actor: RbacUser, requester: Pick<User, "teamId">) {
  if (!isLead(actor) || !requester.teamId) {
    return false;
  }

  return actor.managedTeamIds?.includes(requester.teamId) ?? false;
}

export function canReviewLeaveRequestWithPolicy({
  actor,
  leaveRequest,
  policy,
}: {
  actor: RbacUser;
  leaveRequest: LeaveRequestWithPolicy;
  policy: Pick<ApprovalPolicy, "approvalMode" | "approverRule" | "customApproverUserId">;
}) {
  if (policy.approvalMode === "NONE") {
    return false;
  }

  if (policy.approvalMode === "SEQUENTIAL") {
    return false;
  }

  if (isSelf(actor, leaveRequest)) {
    return false;
  }

  if (policy.approverRule === "OWNER") {
    return isOwner(actor);
  }

  if (policy.approverRule === "TEAM_LEAD") {
    return isOwner(actor) || isManagedLead(actor, leaveRequest.user);
  }

  if (policy.approverRule === "TEAM_LEAD_OR_OWNER") {
    return isOwner(actor) || isManagedLead(actor, leaveRequest.user);
  }

  if (policy.approverRule === "CUSTOM_USER") {
    return actor.id === policy.customApproverUserId || isOwner(actor);
  }

  return false;
}

export function canApproveLeaveRequestWithPolicy(
  actor: RbacUser,
  leaveRequest: LeaveRequestWithPolicy,
  policy: Pick<ApprovalPolicy, "approvalMode" | "approverRule" | "customApproverUserId">,
) {
  return (
    leaveRequest.status === "PENDING" &&
    canReviewLeaveRequestWithPolicy({ actor, leaveRequest, policy })
  );
}

export function canRejectLeaveRequestWithPolicy(
  actor: RbacUser,
  leaveRequest: LeaveRequestWithPolicy,
  policy: Pick<ApprovalPolicy, "approvalMode" | "approverRule" | "customApproverUserId">,
) {
  return canApproveLeaveRequestWithPolicy(actor, leaveRequest, policy);
}

export function canCancelApprovedLeaveRequestWithPolicy(
  actor: RbacUser,
  leaveRequest: LeaveRequestWithPolicy,
  policy: Pick<ApprovalPolicy, "approvalMode" | "approverRule" | "customApproverUserId">,
) {
  return (
    leaveRequest.status === "APPROVED" &&
    canReviewLeaveRequestWithPolicy({ actor, leaveRequest, policy })
  );
}

export async function resolveApproversForLeaveRequest({
  leaveRequest,
  policy,
  prisma = getPrisma(),
}: {
  leaveRequest: LeaveRequestWithPolicy;
  policy: Pick<ApprovalPolicy, "approvalMode" | "approverRule" | "customApproverUserId">;
  prisma?: PrismaClient;
}) {
  if (policy.approvalMode !== "SINGLE") {
    return [];
  }

  const whereByRule: Record<ApproverRule, Prisma.UserWhereInput> = {
    OWNER: { role: "OWNER" },
    TEAM_LEAD: { role: { in: ["OWNER", "LEAD"] } },
    TEAM_LEAD_OR_OWNER: { role: { in: ["OWNER", "LEAD"] } },
    CUSTOM_USER: policy.customApproverUserId
      ? { OR: [{ id: policy.customApproverUserId }, { role: "OWNER" }] }
      : { role: "OWNER" },
  };

  const candidates = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      id: { not: leaveRequest.userId },
      ...whereByRule[policy.approverRule],
    },
    select: { id: true, role: true, status: true, teamId: true },
  });

  const approvers: Array<{ id: string }> = [];

  for (const candidate of candidates) {
    const scoped = await hydrateReviewScope(candidate, prisma);
    if (
      canReviewLeaveRequestWithPolicy({
        actor: scoped,
        leaveRequest,
        policy,
      })
    ) {
      approvers.push({ id: candidate.id });
    }
  }

  return approvers;
}

export async function resolveNotificationApproversForLeaveRequest({
  leaveRequest,
  policy,
  prisma = getPrisma(),
}: {
  leaveRequest: LeaveRequestWithPolicy;
  policy: Pick<ApprovalPolicy, "approvalMode" | "approverRule" | "customApproverUserId">;
  prisma?: PrismaClient;
}) {
  const approvers = await resolveApproversForLeaveRequest({
    leaveRequest,
    policy,
    prisma,
  });

  if (!["TEAM_LEAD", "TEAM_LEAD_OR_OWNER"].includes(policy.approverRule)) {
    return approvers;
  }

  const ids = approvers.map((approver) => approver.id);
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, role: true },
  });
  const leadApprovers = users
    .filter((user) => user.role === "LEAD")
    .map((user) => ({ id: user.id }));

  return leadApprovers.length > 0 ? leadApprovers : approvers;
}

export function assertAttachmentRequirementForApproval(
  leaveRequest: Pick<LeaveRequest, "attachmentStatus">,
  policy: Pick<ApprovalPolicy, "requireAttachmentAcceptedBeforeApproval">,
) {
  if (
    policy.requireAttachmentAcceptedBeforeApproval &&
    leaveRequest.attachmentStatus !== "ACCEPTED"
  ) {
    throw new Error("attachment-not-accepted");
  }
}

export async function shouldAutoApproveLeaveRequest({
  leaveRequest,
  policy,
  prisma = getPrisma(),
}: {
  leaveRequest: LeaveRequestWithPolicy;
  policy: Pick<
    ApprovalPolicy,
    | "approvalMode"
    | "approverRule"
    | "customApproverUserId"
    | "autoApproveIfNoApprover"
    | "requireAttachmentAcceptedBeforeApproval"
  >;
  prisma?: PrismaClient;
}) {
  if (
    "requireAttachmentAcceptedBeforeApproval" in policy &&
    policy.requireAttachmentAcceptedBeforeApproval &&
    leaveRequest.attachmentStatus !== "ACCEPTED"
  ) {
    return false;
  }

  if (policy.approvalMode === "NONE") {
    return true;
  }

  if (policy.approvalMode !== "SINGLE" || !policy.autoApproveIfNoApprover) {
    return false;
  }

  const approvers = await resolveApproversForLeaveRequest({
    leaveRequest,
    policy,
    prisma,
  });

  return approvers.length === 0;
}

export function assertCanReviewByLegacyScope(actor: RbacUser, leaveRequest: LeaveRequestWithPolicy) {
  if (!canReviewLeaveRequest(actor, toReviewableLeaveRequest(leaveRequest).user)) {
    throw new Error("접근 권한이 없습니다.");
  }
}
