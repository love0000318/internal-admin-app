import {
  Prisma,
  type AnnualLeaveUsePlan,
  type AnnualLeaveUsePlanItem,
  type PrismaClient,
} from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { getLeaveBalanceScope } from "@/lib/leave/balance-scope";
import { dateToDateOnly } from "@/lib/leave/calculate-business-days";
import { findAnnualPromotionCandidates } from "@/lib/leave/annual-promotion";
import { getReviewableTeamIdsForLead } from "@/lib/leave/review";
import { getUserLeaveBalance } from "@/lib/leave/queries";
import {
  createInAppNotificationOnce,
  dedupeRecipientUserIds,
} from "@/lib/notifications/notifications";
import { isLead, isOwner, type RbacUser } from "@/lib/rbac/roles";

type ReviewDb = PrismaClient | Prisma.TransactionClient;

export const ANNUAL_USE_PLAN_EMPLOYEE_LINK_URL = "/leaves/me/use-plan";
export const ANNUAL_USE_PLAN_REVIEW_LINK_URL = "/admin/reports/leaves/promotions";

export const ANNUAL_USE_PLAN_REVIEW_ACTION_TYPES = [
  "CONFIRMED",
  "REVISION_REQUESTED",
] as const;

export type AnnualUsePlanReviewActionType =
  (typeof ANNUAL_USE_PLAN_REVIEW_ACTION_TYPES)[number];

export type AnnualUsePlanReviewStatus =
  | "NOT_SUBMITTED"
  | "DRAFT"
  | "SUBMITTED"
  | "CONFIRMED"
  | "REVISION_REQUESTED"
  | "RESUBMITTED"
  | "CANCELLED";

export type AnnualUsePlanReviewHistoryItem = {
  id: string;
  planId: string;
  actionType: AnnualUsePlanReviewActionType;
  previousStatus: string | null;
  nextStatus: string | null;
  reviewerUserId: string | null;
  reviewerName: string | null;
  reviewedAt: Date;
  revisionReason: string | null;
  createdAt: Date;
};

export type AnnualUsePlanReviewRow = {
  userId: string;
  name: string;
  email: string;
  teamName: string | null;
  title: string | null;
  referenceYear: number;
  remainingAnnualDays: number | null;
  expiringAnnualDays: number | null;
  expirationDate: string | null;
  plan: (AnnualLeaveUsePlan & { items: AnnualLeaveUsePlanItem[] }) | null;
  reviewStatus: AnnualUsePlanReviewStatus;
  latestReview: AnnualUsePlanReviewHistoryItem | null;
  reviewHistory: AnnualUsePlanReviewHistoryItem[];
};

export class AnnualUsePlanReviewError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function metadataString(value: unknown, key: string) {
  const record = metadataRecord(value);
  const item = record[key];

  return typeof item === "string" ? item : null;
}

function metadataDate(value: unknown, key: string, fallback: Date) {
  const raw = metadataString(value, key);
  const date = raw ? new Date(raw) : null;

  return date && !Number.isNaN(date.getTime()) ? date : fallback;
}

function parseReviewActionType(value: unknown): AnnualUsePlanReviewActionType | null {
  return ANNUAL_USE_PLAN_REVIEW_ACTION_TYPES.includes(
    value as AnnualUsePlanReviewActionType,
  )
    ? (value as AnnualUsePlanReviewActionType)
    : null;
}

function formatAmount(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "-";
  }

  return Number.isInteger(value) ? `${value}일` : `${value.toFixed(1)}일`;
}

function reviewLink(referenceYear: number) {
  return `${ANNUAL_USE_PLAN_REVIEW_LINK_URL}?year=${referenceYear}`;
}

function submittedAtKey(value: Date | null | undefined) {
  return value ? value.toISOString() : "unknown-submitted-at";
}

export function annualUsePlanReviewStatusLabel(status: AnnualUsePlanReviewStatus) {
  switch (status) {
    case "DRAFT":
      return "작성 중";
    case "SUBMITTED":
      return "제출 완료";
    case "CONFIRMED":
      return "관리자 확인 완료";
    case "REVISION_REQUESTED":
      return "보완요청";
    case "RESUBMITTED":
      return "보완 후 재제출";
    case "CANCELLED":
      return "취소됨";
    default:
      return "미제출";
  }
}

export function annualUsePlanReviewActionLabel(
  actionType: AnnualUsePlanReviewActionType,
) {
  return actionType === "CONFIRMED" ? "확인 완료" : "보완요청";
}

export function deriveAnnualUsePlanReviewStatus(
  plan: Pick<AnnualLeaveUsePlan, "status" | "submittedAt"> | null | undefined,
  reviewHistory: AnnualUsePlanReviewHistoryItem[] = [],
): AnnualUsePlanReviewStatus {
  if (!plan) {
    return "NOT_SUBMITTED";
  }

  if (plan.status === "DRAFT" || plan.status === "CANCELLED") {
    return plan.status;
  }

  const latestReview = reviewHistory[0];

  if (!latestReview) {
    return "SUBMITTED";
  }

  const submittedAt = plan.submittedAt?.getTime() ?? 0;
  const reviewedAt = latestReview.reviewedAt.getTime();

  if (reviewedAt >= submittedAt) {
    return latestReview.actionType === "CONFIRMED"
      ? "CONFIRMED"
      : "REVISION_REQUESTED";
  }

  return latestReview.actionType === "REVISION_REQUESTED"
    ? "RESUBMITTED"
    : "SUBMITTED";
}

export function canSubmitAnnualUsePlan(
  plan: Pick<AnnualLeaveUsePlan, "status" | "submittedAt"> | null | undefined,
  reviewHistory: AnnualUsePlanReviewHistoryItem[] = [],
) {
  if (!plan || plan.status !== "SUBMITTED") {
    return true;
  }

  return deriveAnnualUsePlanReviewStatus(plan, reviewHistory) === "REVISION_REQUESTED";
}

export async function getAnnualUsePlanReviewHistoryByPlanIds({
  planIds,
  prisma = getPrisma(),
}: {
  planIds: string[];
  prisma?: ReviewDb;
}) {
  const historyByPlanId = new Map<string, AnnualUsePlanReviewHistoryItem[]>();

  if (planIds.length === 0) {
    return historyByPlanId;
  }

  const logs = await prisma.auditLog.findMany({
    where: {
      action: "ANNUAL_LEAVE_USE_PLAN_UPDATED",
      targetType: "ANNUAL_LEAVE_USE_PLAN",
      targetId: { in: planIds },
    },
    include: {
      actor: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  for (const log of logs) {
    if (!log.targetId) {
      continue;
    }

    const actionType = parseReviewActionType(metadataRecord(log.metadata).actionType);

    if (!actionType) {
      continue;
    }

    const reviewedAt = metadataDate(log.metadata, "reviewedAt", log.createdAt);
    const item: AnnualUsePlanReviewHistoryItem = {
      id: log.id,
      planId: log.targetId,
      actionType,
      previousStatus: metadataString(log.metadata, "previousStatus"),
      nextStatus: metadataString(log.metadata, "nextStatus"),
      reviewerUserId: metadataString(log.metadata, "reviewerUserId") ?? log.actorId,
      reviewerName: log.actor?.name ?? null,
      reviewedAt,
      revisionReason: metadataString(log.metadata, "revisionReason"),
      createdAt: log.createdAt,
    };
    const items = historyByPlanId.get(log.targetId) ?? [];
    items.push(item);
    historyByPlanId.set(log.targetId, items);
  }

  return historyByPlanId;
}

export function canReviewAnnualUsePlan(
  actor: RbacUser,
  targetUser: { id: string; teamId: string | null },
) {
  if (isOwner(actor)) {
    return true;
  }

  if (!isLead(actor) || actor.id === targetUser.id || !targetUser.teamId) {
    return false;
  }

  return actor.managedTeamIds?.includes(targetUser.teamId) ?? false;
}

async function hydrateAnnualUsePlanReviewActor(actor: RbacUser, prisma: ReviewDb) {
  if (!isLead(actor) || actor.managedTeamIds?.length) {
    return actor;
  }

  return {
    ...actor,
    managedTeamIds: await getReviewableTeamIdsForLead(actor.id, prisma),
  };
}

async function getReviewerRecipientIds({
  targetUserId,
  prisma,
}: {
  targetUserId: string;
  prisma: ReviewDb;
}) {
  const reviewers = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: { in: ["OWNER", "LEAD"] },
      id: { not: targetUserId },
    },
    select: { id: true, role: true },
  });
  const ownerIds = reviewers
    .filter((reviewer) => reviewer.role === "OWNER")
    .map((reviewer) => reviewer.id);
  const leadIds: string[] = [];
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { teamId: true },
  });

  for (const reviewer of reviewers) {
    if (reviewer.role !== "LEAD") {
      continue;
    }

    const managedTeamIds = await getReviewableTeamIdsForLead(reviewer.id, prisma);

    if (target?.teamId && managedTeamIds.includes(target.teamId)) {
      leadIds.push(reviewer.id);
    }
  }

  return dedupeRecipientUserIds([...ownerIds, ...leadIds]);
}

export async function notifyAnnualUsePlanSubmittedForReview({
  usePlanId,
  prisma = getPrisma(),
}: {
  usePlanId: string;
  prisma?: ReviewDb;
}) {
  const usePlan = await prisma.annualLeaveUsePlan.findUnique({
    where: { id: usePlanId },
    include: {
      user: {
        select: { id: true, name: true },
      },
    },
  });

  if (!usePlan || usePlan.status !== "SUBMITTED") {
    return { count: 0 };
  }

  const recipientIds = await getReviewerRecipientIds({
    targetUserId: usePlan.userId,
    prisma,
  });
  const submittedAt = submittedAtKey(usePlan.submittedAt);

  await Promise.all(
    recipientIds.map((recipientId) =>
      createInAppNotificationOnce({
        prisma,
        userId: recipientId,
        type: "ANNUAL_LEAVE_USE_PLAN_SUBMITTED",
        priority: "HIGH",
        title: "연차 사용계획 확인 요청",
        message: `${usePlan.user.name}님이 ${usePlan.referenceYear}년 연차 사용계획을 제출했습니다. 계획일수 ${formatAmount(usePlan.totalPlannedAmount)}를 확인해 주세요.`,
        linkUrl: reviewLink(usePlan.referenceYear),
        metadata: toJsonValue({
          deduplicationKey: `annual-use-plan-submitted:${usePlan.id}:${submittedAt}:${recipientId}`,
          annualLeaveUsePlanId: usePlan.id,
          userId: usePlan.userId,
          referenceYear: usePlan.referenceYear,
          submittedAt,
          actionType: "SUBMITTED",
          notificationPurpose: "ANNUAL_USE_PLAN_REVIEW_REQUESTED",
        }),
      }),
    ),
  );

  return { count: recipientIds.length };
}

async function createReviewResultNotification({
  plan,
  actionType,
  reviewerUserId,
  reviewedAt,
  revisionReason,
  prisma,
}: {
  plan: AnnualLeaveUsePlan & { user: { name: string } };
  actionType: AnnualUsePlanReviewActionType;
  reviewerUserId: string;
  reviewedAt: Date;
  revisionReason?: string | null;
  prisma: ReviewDb;
}) {
  const confirmed = actionType === "CONFIRMED";
  const title = confirmed
    ? "연차 사용계획 확인 완료"
    : "연차 사용계획 보완 요청";
  const message = confirmed
    ? `${plan.referenceYear}년 연차 사용계획이 관리자 확인 완료 처리되었습니다. 실제 휴가 사용은 별도 휴가 신청 절차를 따라 주세요.`
    : `${plan.referenceYear}년 연차 사용계획에 보완요청이 등록되었습니다. 사유: ${revisionReason ?? "보완 사유를 확인해 주세요."}`;

  return createInAppNotificationOnce({
    prisma,
    userId: plan.userId,
    type: "ANNUAL_LEAVE_PROMOTION",
    priority: confirmed ? "NORMAL" : "HIGH",
    title,
    message,
    linkUrl: ANNUAL_USE_PLAN_EMPLOYEE_LINK_URL,
    metadata: toJsonValue({
      deduplicationKey: `annual-use-plan-review:${plan.id}:${submittedAtKey(
        plan.submittedAt,
      )}:${actionType}`,
      annualLeaveUsePlanId: plan.id,
      userId: plan.userId,
      referenceYear: plan.referenceYear,
      actionType,
      reviewerUserId,
      reviewedAt: reviewedAt.toISOString(),
      revisionReason: revisionReason ?? null,
      notificationPurpose: confirmed
        ? "ANNUAL_USE_PLAN_CONFIRMED"
        : "ANNUAL_USE_PLAN_REVISION_REQUESTED",
    }),
  });
}

export async function reviewAnnualUsePlan({
  actor,
  planId,
  actionType,
  revisionReason,
  prisma = getPrisma(),
}: {
  actor: RbacUser;
  planId: string;
  actionType: AnnualUsePlanReviewActionType;
  revisionReason?: string | null;
  prisma?: PrismaClient;
}) {
  const scopedActor = await hydrateAnnualUsePlanReviewActor(actor, prisma);
  const plan = await prisma.annualLeaveUsePlan.findUnique({
    where: { id: planId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          teamId: true,
        },
      },
    },
  });

  if (!plan) {
    throw new AnnualUsePlanReviewError("not-found");
  }

  if (!canReviewAnnualUsePlan(scopedActor, plan.user)) {
    throw new AnnualUsePlanReviewError("forbidden");
  }

  const historyByPlanId = await getAnnualUsePlanReviewHistoryByPlanIds({
    planIds: [plan.id],
    prisma,
  });
  const history = historyByPlanId.get(plan.id) ?? [];
  const previousStatus = deriveAnnualUsePlanReviewStatus(plan, history);

  if (plan.status !== "SUBMITTED") {
    throw new AnnualUsePlanReviewError("not-submitted");
  }

  if (previousStatus !== "SUBMITTED" && previousStatus !== "RESUBMITTED") {
    throw new AnnualUsePlanReviewError("already-reviewed");
  }

  if (actionType === "REVISION_REQUESTED" && !revisionReason?.trim()) {
    throw new AnnualUsePlanReviewError("revision-reason-required");
  }

  const reviewedAt = new Date();
  const nextStatus: AnnualUsePlanReviewStatus =
    actionType === "CONFIRMED" ? "CONFIRMED" : "REVISION_REQUESTED";

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      targetUserId: plan.userId,
      action: "ANNUAL_LEAVE_USE_PLAN_UPDATED",
      category: "LEAVE",
      severity: "INFO",
      targetType: "ANNUAL_LEAVE_USE_PLAN",
      targetId: plan.id,
      metadata: toJsonValue({
        annualLeaveUsePlanId: plan.id,
        userId: plan.userId,
        referenceYear: plan.referenceYear,
        actionType,
        previousStatus,
        nextStatus,
        reviewerUserId: actor.id,
        reviewedAt: reviewedAt.toISOString(),
        revisionReason: actionType === "REVISION_REQUESTED" ? revisionReason : null,
      }),
    },
  });

  await createReviewResultNotification({
    plan,
    actionType,
    reviewerUserId: actor.id,
    reviewedAt,
    revisionReason: actionType === "REVISION_REQUESTED" ? revisionReason : null,
    prisma,
  });

  return { previousStatus, nextStatus };
}

export async function listAnnualUsePlanReviewRows({
  actor,
  year,
  prisma = getPrisma(),
}: {
  actor: RbacUser;
  year: number;
  prisma?: PrismaClient;
}) {
  const scope = await getLeaveBalanceScope(actor, prisma);
  const candidates = (await findAnnualPromotionCandidates({ year, prisma })).filter(
    (candidate) =>
      scope.userIds.includes(candidate.userId) &&
      !(isLead(actor) && candidate.userId === actor.id),
  );
  const candidatesByUserId = new Map(
    candidates.map((candidate) => [candidate.userId, candidate]),
  );
  const plans = await prisma.annualLeaveUsePlan.findMany({
    where: {
      referenceYear: year,
      user: {
        status: "ACTIVE",
        role: { not: "EXTERNAL_PARTNER" },
        id: {
          in: scope.userIds.filter((userId) => !(isLead(actor) && userId === actor.id)),
        },
      },
    },
    include: {
      user: {
        include: { team: true },
      },
      items: {
        orderBy: [{ plannedStartDate: "asc" }, { plannedDate: "asc" }],
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
  const plansByUserId = new Map(plans.map((plan) => [plan.userId, plan]));
  const userIds = dedupeRecipientUserIds([
    ...candidatesByUserId.keys(),
    ...plansByUserId.keys(),
  ]);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    include: { team: true },
  });
  const usersById = new Map(users.map((user) => [user.id, user]));
  const historyByPlanId = await getAnnualUsePlanReviewHistoryByPlanIds({
    planIds: plans.map((plan) => plan.id),
    prisma,
  });
  const balanceByUserId = new Map<string, number | null>();

  await Promise.all(
    userIds.map(async (userId) => {
      try {
        const balance = await getUserLeaveBalance({ userId, year, prisma });
        balanceByUserId.set(userId, balance.remainingDays);
      } catch {
        balanceByUserId.set(userId, null);
      }
    }),
  );

  const rows = userIds.map((userId): AnnualUsePlanReviewRow => {
    const candidate = candidatesByUserId.get(userId);
    const plan = plansByUserId.get(userId) ?? null;
    const user = usersById.get(userId);
    const history = plan ? historyByPlanId.get(plan.id) ?? [] : [];

    return {
      userId,
      name: user?.name ?? candidate?.name ?? "-",
      email: user?.email ?? candidate?.email ?? "-",
      teamName: user?.team?.name ?? candidate?.teamName ?? null,
      title: user?.title ?? candidate?.title ?? null,
      referenceYear: year,
      remainingAnnualDays:
        balanceByUserId.get(userId) ?? candidate?.remainingAmount ?? null,
      expiringAnnualDays: candidate?.remainingAmount ?? null,
      expirationDate: candidate?.expirationDate ?? null,
      plan,
      reviewStatus: deriveAnnualUsePlanReviewStatus(plan, history),
      latestReview: history[0] ?? null,
      reviewHistory: history,
    };
  });

  return rows.sort((a, b) => {
    const statusOrder: Record<AnnualUsePlanReviewStatus, number> = {
      REVISION_REQUESTED: 0,
      SUBMITTED: 1,
      RESUBMITTED: 2,
      NOT_SUBMITTED: 3,
      DRAFT: 4,
      CONFIRMED: 5,
      CANCELLED: 6,
    };
    const byStatus = statusOrder[a.reviewStatus] - statusOrder[b.reviewStatus];

    return byStatus || a.name.localeCompare(b.name, "ko");
  });
}

export function dateLabel(value: Date | null | undefined) {
  return value ? dateToDateOnly(value) : "-";
}
