import {
  Prisma,
  type AnnualLeaveUsePlan,
  type AnnualLeaveUsePlanItem,
  type PrismaClient,
} from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { dateToDateOnly } from "@/lib/leave/calculate-business-days";
import { getReviewableTeamIdsForLead } from "@/lib/leave/review";
import { createNotificationOnce, dedupeRecipientUserIds } from "@/lib/notifications/notifications";
import { canLeadManageUser } from "@/lib/organization/permissions";
import { isLead, isOwner, type RbacUser } from "@/lib/rbac/roles";

type ReviewDb = PrismaClient | Prisma.TransactionClient;

export type AnnualUsePlanReviewActionType =
  | "CONFIRMED"
  | "REVISION_REQUESTED"
  | "RESUBMITTED_AFTER_REVISION";

export type AnnualUsePlanWorkflowStatus =
  | "NOT_SUBMITTED"
  | "DRAFT"
  | "SUBMITTED"
  | "CONFIRMED"
  | "REVISION_REQUESTED"
  | "RESUBMITTED_AFTER_REVISION"
  | "CANCELLED";

export type AnnualUsePlanReviewLog = {
  id: string;
  actorId: string | null;
  actorUserId: string | null;
  action: string;
  targetId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  actor: { id: string; name: string; email: string } | null;
};

export type AnnualUsePlanReviewState = {
  status: AnnualUsePlanWorkflowStatus;
  label: string;
  reviewedAt: Date | null;
  reviewerUserId: string | null;
  reviewerName: string | null;
  revisionReason: string | null;
  latestReviewLog: AnnualUsePlanReviewLog | null;
  canReviewerAct: boolean;
  canEmployeeEdit: boolean;
};

export type AnnualUsePlanWithItems = Pick<
  AnnualLeaveUsePlan,
  | "id"
  | "userId"
  | "referenceYear"
  | "status"
  | "totalPlannedAmount"
  | "submittedAt"
  | "cancelledAt"
  | "memo"
  | "updatedAt"
> & {
  items?: AnnualLeaveUsePlanItem[];
};

export const ANNUAL_USE_PLAN_EMPLOYEE_LINK_URL = "/leaves/me/use-plan";

export function annualUsePlanAdminLinkUrl(referenceYear: number, planId?: string) {
  const query = `year=${referenceYear}`;
  return planId
    ? `/admin/leaves/promotions?${query}#plan-${planId}`
    : `/admin/leaves/promotions?${query}`;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function metadataRecord(metadata: Prisma.JsonValue | null | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return metadata as Record<string, unknown>;
}

function stringMetadata(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function dateMetadata(metadata: Record<string, unknown> | null, key: string) {
  const value = stringMetadata(metadata, key);
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getAnnualUsePlanReviewActionType(
  log: Pick<AnnualUsePlanReviewLog, "metadata">,
): AnnualUsePlanReviewActionType | null {
  const actionType = stringMetadata(metadataRecord(log.metadata), "actionType");

  if (
    actionType === "CONFIRMED" ||
    actionType === "REVISION_REQUESTED" ||
    actionType === "RESUBMITTED_AFTER_REVISION"
  ) {
    return actionType;
  }

  return null;
}

export function annualUsePlanWorkflowStatusLabel(
  status: AnnualUsePlanWorkflowStatus,
) {
  switch (status) {
    case "DRAFT":
      return "작성 중";
    case "SUBMITTED":
      return "제출 완료";
    case "CONFIRMED":
      return "관리자 확인 완료";
    case "REVISION_REQUESTED":
      return "보완요청";
    case "RESUBMITTED_AFTER_REVISION":
      return "보완 후 재제출";
    case "CANCELLED":
      return "취소됨";
    case "NOT_SUBMITTED":
    default:
      return "미제출";
  }
}

export function deriveAnnualUsePlanReviewState({
  plan,
  logs,
}: {
  plan: AnnualUsePlanWithItems | null | undefined;
  logs: AnnualUsePlanReviewLog[];
}): AnnualUsePlanReviewState {
  if (!plan) {
    return {
      status: "NOT_SUBMITTED",
      label: annualUsePlanWorkflowStatusLabel("NOT_SUBMITTED"),
      reviewedAt: null,
      reviewerUserId: null,
      reviewerName: null,
      revisionReason: null,
      latestReviewLog: null,
      canReviewerAct: false,
      canEmployeeEdit: true,
    };
  }

  if (plan.status === "DRAFT" || plan.status === "CANCELLED") {
    return {
      status: plan.status,
      label: annualUsePlanWorkflowStatusLabel(plan.status),
      reviewedAt: null,
      reviewerUserId: null,
      reviewerName: null,
      revisionReason: null,
      latestReviewLog: null,
      canReviewerAct: false,
      canEmployeeEdit: plan.status !== "CANCELLED",
    };
  }

  const reviewLogs = logs
    .filter((log) => getAnnualUsePlanReviewActionType(log) !== null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const latestReviewLog = reviewLogs[0] ?? null;
  const actionType = latestReviewLog
    ? getAnnualUsePlanReviewActionType(latestReviewLog)
    : null;
  const metadata = metadataRecord(latestReviewLog?.metadata);
  const reviewedAt =
    dateMetadata(metadata, "reviewedAt") ?? latestReviewLog?.createdAt ?? null;
  const reviewerUserId =
    stringMetadata(metadata, "reviewerUserId") ??
    latestReviewLog?.actorUserId ??
    latestReviewLog?.actorId ??
    null;
  const reviewerName = latestReviewLog?.actor?.name ?? null;
  const revisionReason = stringMetadata(metadata, "revisionReason");

  let status: AnnualUsePlanWorkflowStatus = "SUBMITTED";

  if (actionType === "CONFIRMED" && reviewedAt) {
    status =
      plan.submittedAt && plan.submittedAt.getTime() > reviewedAt.getTime()
        ? "SUBMITTED"
        : "CONFIRMED";
  }

  if (actionType === "REVISION_REQUESTED" && reviewedAt) {
    status =
      plan.submittedAt && plan.submittedAt.getTime() > reviewedAt.getTime()
        ? "RESUBMITTED_AFTER_REVISION"
        : "REVISION_REQUESTED";
  }

  if (actionType === "RESUBMITTED_AFTER_REVISION") {
    status = "RESUBMITTED_AFTER_REVISION";
  }

  return {
    status,
    label: annualUsePlanWorkflowStatusLabel(status),
    reviewedAt,
    reviewerUserId,
    reviewerName,
    revisionReason,
    latestReviewLog,
    canReviewerAct: status === "SUBMITTED" || status === "RESUBMITTED_AFTER_REVISION",
    canEmployeeEdit: status === "REVISION_REQUESTED",
  };
}

export async function listAnnualUsePlanReviewLogs({
  planIds,
  prisma = getPrisma(),
}: {
  planIds: string[];
  prisma?: ReviewDb;
}) {
  if (planIds.length === 0) {
    return [];
  }

  return prisma.auditLog.findMany({
    where: {
      targetType: "ANNUAL_LEAVE_USE_PLAN",
      targetId: { in: planIds },
      action: {
        in: [
          "ANNUAL_LEAVE_USE_PLAN_SUBMITTED",
          "ANNUAL_LEAVE_USE_PLAN_UPDATED",
          "ANNUAL_LEAVE_USE_PLAN_CANCELLED",
        ],
      },
    },
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function groupAnnualUsePlanReviewLogsByPlanId(
  logs: AnnualUsePlanReviewLog[],
) {
  const grouped = new Map<string, AnnualUsePlanReviewLog[]>();

  for (const log of logs) {
    const planId = log.targetId;

    if (!planId) {
      continue;
    }

    const current = grouped.get(planId) ?? [];
    current.push(log);
    grouped.set(planId, current);
  }

  return grouped;
}

export async function hydrateAnnualUsePlanReviewActor(
  actor: RbacUser,
  prisma: ReviewDb = getPrisma(),
) {
  if (!isLead(actor) || actor.managedTeamIds?.length) {
    return actor;
  }

  return {
    ...actor,
    managedTeamIds: await getReviewableTeamIdsForLead(
      actor.id,
      prisma as PrismaClient,
    ),
  };
}

export function canReviewAnnualUsePlan(
  actor: RbacUser,
  targetUser: RbacUser,
) {
  if (isOwner(actor)) {
    return true;
  }

  if (isLead(actor)) {
    return (
      actor.id !== targetUser.id &&
      Boolean(targetUser.teamId) &&
      (actor.managedTeamIds ?? []).includes(targetUser.teamId as string)
    );
  }

  return false;
}

export function buildAnnualUsePlanReviewUserWhere(
  actor: RbacUser,
): Prisma.UserWhereInput {
  if (isOwner(actor)) {
    return {
      status: "ACTIVE",
      role: { not: "EXTERNAL_PARTNER" },
    };
  }

  if (isLead(actor)) {
    return {
      status: "ACTIVE",
      role: { not: "EXTERNAL_PARTNER" },
      id: { not: actor.id },
      teamId: { in: actor.managedTeamIds ?? [] },
    };
  }

  return { id: "__no_annual_use_plan_review_access__" };
}

export function buildAnnualUsePlanReviewAuditMetadata(input: {
  annualLeaveUsePlanId: string;
  userId: string;
  referenceYear: number;
  actionType: AnnualUsePlanReviewActionType;
  previousStatus: AnnualUsePlanWorkflowStatus;
  nextStatus: AnnualUsePlanWorkflowStatus;
  reviewerUserId?: string | null;
  reviewedAt?: Date | null;
  revisionReason?: string | null;
  totalPlannedAmount?: number;
  remainingDays?: number;
}) {
  return toJsonValue({
    annualLeaveUsePlanId: input.annualLeaveUsePlanId,
    userId: input.userId,
    referenceYear: input.referenceYear,
    actionType: input.actionType,
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
    reviewerUserId: input.reviewerUserId ?? null,
    reviewedAt: input.reviewedAt?.toISOString() ?? null,
    revisionReason: input.revisionReason ?? undefined,
    totalPlannedAmount: input.totalPlannedAmount,
    remainingDays: input.remainingDays,
  });
}

export function sanitizeRevisionReason(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 500);
}

export function planItemDateRangeLabel(
  item: Pick<AnnualLeaveUsePlanItem, "plannedDate" | "plannedStartDate" | "plannedEndDate">,
) {
  const start = dateToDateOnly(item.plannedStartDate ?? item.plannedDate);
  const end = dateToDateOnly(item.plannedEndDate ?? item.plannedDate);

  return start === end ? start : `${start} ~ ${end}`;
}

export function formatUsePlanAmount(value: number) {
  return Number.isInteger(value) ? `${value}일` : `${value.toFixed(1)}일`;
}

async function getAnnualUsePlanReviewerRecipientIds({
  userId,
  prisma,
}: {
  userId: string;
  prisma: ReviewDb;
}) {
  const [owners, leads] = await Promise.all([
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        role: "OWNER",
        id: { not: userId },
      },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        role: "LEAD",
        id: { not: userId },
      },
      select: { id: true },
    }),
  ]);
  const leadRecipientIds: string[] = [];

  for (const lead of leads) {
    if (await canLeadManageUser(lead.id, userId, prisma as ReturnType<typeof getPrisma>)) {
      leadRecipientIds.push(lead.id);
    }
  }

  return dedupeRecipientUserIds([
    ...owners.map((owner) => owner.id),
    ...leadRecipientIds,
  ]);
}

export async function notifyAnnualUsePlanSubmittedForReview({
  plan,
  requesterName,
  prisma = getPrisma(),
}: {
  plan: Pick<
    AnnualLeaveUsePlan,
    "id" | "userId" | "referenceYear" | "totalPlannedAmount" | "submittedAt" | "updatedAt"
  >;
  requesterName: string;
  prisma?: ReviewDb;
}) {
  const recipientIds = await getAnnualUsePlanReviewerRecipientIds({
    userId: plan.userId,
    prisma,
  });
  const submittedAt = plan.submittedAt ?? plan.updatedAt;

  await Promise.all(
    recipientIds.map((recipientId) =>
      createNotificationOnce({
        prisma,
        userId: recipientId,
        type: "ANNUAL_LEAVE_USE_PLAN_SUBMITTED",
        priority: "HIGH",
        title: "연차 사용계획 확인 요청",
        message: `${requesterName}님이 ${plan.referenceYear}년 연차 사용계획 ${formatUsePlanAmount(
          plan.totalPlannedAmount,
        )}을 제출했습니다. 접수 확인 또는 보완요청을 검토해 주세요.`,
        linkUrl: annualUsePlanAdminLinkUrl(plan.referenceYear, plan.id),
        metadata: toJsonValue({
          deduplicationKey: `annual-use-plan-review-needed:${plan.id}:${submittedAt.toISOString()}:${recipientId}`,
          annualLeaveUsePlanId: plan.id,
          userId: plan.userId,
          referenceYear: plan.referenceYear,
          totalPlannedAmount: plan.totalPlannedAmount,
          notificationPurpose: "ANNUAL_USE_PLAN_REVIEW_NEEDED",
        }),
      }),
    ),
  );

  return { count: recipientIds.length };
}

export async function notifyAnnualUsePlanReviewConfirmed({
  plan,
  reviewerName,
  reviewedAt,
  prisma = getPrisma(),
}: {
  plan: Pick<AnnualLeaveUsePlan, "id" | "userId" | "referenceYear" | "totalPlannedAmount">;
  reviewerName: string;
  reviewedAt: Date;
  prisma?: ReviewDb;
}) {
  await createNotificationOnce({
    prisma,
    userId: plan.userId,
    type: "ANNUAL_LEAVE_USE_PLAN_SUBMITTED",
    priority: "NORMAL",
    title: "연차 사용계획 접수 확인 완료",
    message: `${plan.referenceYear}년 연차 사용계획 ${formatUsePlanAmount(
      plan.totalPlannedAmount,
    )}이 접수 확인되었습니다. 확인자: ${reviewerName}.`,
    linkUrl: ANNUAL_USE_PLAN_EMPLOYEE_LINK_URL,
    metadata: toJsonValue({
      deduplicationKey: `annual-use-plan-confirmed:${plan.id}:${reviewedAt.toISOString()}`,
      annualLeaveUsePlanId: plan.id,
      userId: plan.userId,
      referenceYear: plan.referenceYear,
      actionType: "CONFIRMED",
      reviewerName,
      reviewedAt: reviewedAt.toISOString(),
      notificationPurpose: "ANNUAL_USE_PLAN_CONFIRMED",
    }),
  });

  return { count: 1 };
}

export async function notifyAnnualUsePlanRevisionRequested({
  plan,
  reviewerName,
  reviewedAt,
  revisionReason,
  prisma = getPrisma(),
}: {
  plan: Pick<AnnualLeaveUsePlan, "id" | "userId" | "referenceYear" | "totalPlannedAmount">;
  reviewerName: string;
  reviewedAt: Date;
  revisionReason: string;
  prisma?: ReviewDb;
}) {
  await createNotificationOnce({
    prisma,
    userId: plan.userId,
    type: "ANNUAL_LEAVE_USE_PLAN_SUBMITTED",
    priority: "HIGH",
    title: "연차 사용계획 보완요청",
    message: `${plan.referenceYear}년 연차 사용계획에 보완요청이 있습니다. 사유: ${revisionReason}`,
    linkUrl: ANNUAL_USE_PLAN_EMPLOYEE_LINK_URL,
    metadata: toJsonValue({
      deduplicationKey: `annual-use-plan-revision:${plan.id}:${reviewedAt.toISOString()}`,
      annualLeaveUsePlanId: plan.id,
      userId: plan.userId,
      referenceYear: plan.referenceYear,
      actionType: "REVISION_REQUESTED",
      reviewerName,
      reviewedAt: reviewedAt.toISOString(),
      revisionReason,
      notificationPurpose: "ANNUAL_USE_PLAN_REVISION_REQUESTED",
    }),
  });

  return { count: 1 };
}
