import type {
  CalendarSubscriptionScope,
  CalendarSubscriptionToken,
} from "@/generated/prisma/client";
import { buildIcsCalendar } from "@/lib/calendar-subscriptions/ics";
import {
  canCreateCalendarSubscription,
  getCalendarSubscriptionScopeLabel,
} from "@/lib/calendar-subscriptions/permissions";
import {
  generateCalendarSubscriptionToken,
  getCalendarSubscriptionUrl,
  hashCalendarSubscriptionToken,
} from "@/lib/calendar-subscriptions/tokens";
import { getPrisma } from "@/lib/db/prisma";
import {
  listCalendarLeaveEvents,
  type CalendarScope,
} from "@/lib/leave/calendar";
import { todayInSeoul } from "@/lib/leave/calculate-business-days";
import { hydrateReviewScope } from "@/lib/leave/review";
import type { DateOnly } from "@/lib/leave/types";
import type { RbacUser } from "@/lib/rbac/roles";
import { sanitizeAuditMetadata } from "@/lib/security/sanitize";

type CalendarSubscriptionWithTeam = CalendarSubscriptionToken & {
  team: { id: string; name: string } | null;
};

type VerifiedCalendarSubscription = CalendarSubscriptionToken & {
  user: {
    id: string;
    role: RbacUser["role"];
    status: NonNullable<RbacUser["status"]>;
    teamId: string | null;
  };
};

function addMonthsDateOnly(dateOnly: string, months: number) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10) as DateOnly;
}

function resolveTeamIdForScope(actor: RbacUser, scope: CalendarSubscriptionScope) {
  if (scope !== "TEAM") {
    return null;
  }

  if (!actor.teamId) {
    throw new Error("팀 캘린더 구독 링크를 만들 수 있는 소속 팀이 없습니다.");
  }

  return actor.teamId;
}

function mapSubscriptionScopeToCalendarScope(
  scope: CalendarSubscriptionScope,
): CalendarScope {
  if (scope === "ME") {
    return "ME";
  }

  if (scope === "ALL_COMPANY") {
    return "ALL";
  }

  return "TEAM";
}

async function createCalendarAudit(params: {
  actorId: string | null;
  action:
    | "CALENDAR_SUBSCRIPTION_CREATED"
    | "CALENDAR_SUBSCRIPTION_REVOKED"
    | "CALENDAR_SUBSCRIPTION_REGENERATED";
  targetId: string | null;
  metadata: Record<string, unknown>;
}) {
  try {
    await getPrisma().auditLog.create({
      data: {
        actorId: params.actorId,
        actorUserId: params.actorId,
        action: params.action,
        targetType: "CALENDAR_SUBSCRIPTION",
        targetId: params.targetId,
        metadata: sanitizeAuditMetadata(params.metadata),
      },
    });
  } catch (error) {
    console.warn("[calendar-subscription:audit-failed]", String(error));
  }
}

export async function listCalendarSubscriptions(userId: string) {
  return getPrisma().calendarSubscriptionToken.findMany({
    where: { userId },
    include: { team: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export function getCalendarSubscriptionStatus(
  subscription: Pick<
    CalendarSubscriptionToken,
    "isEnabled" | "revokedAt" | "expiresAt"
  >,
) {
  const now = new Date();

  if (subscription.revokedAt || !subscription.isEnabled) {
    return "비활성화됨";
  }

  if (subscription.expiresAt && subscription.expiresAt <= now) {
    return "만료됨";
  }

  return "사용 가능";
}

export async function createCalendarSubscription(params: {
  actor: RbacUser;
  scope: CalendarSubscriptionScope;
  name?: string | null;
}) {
  if (!canCreateCalendarSubscription(params.actor, params.scope)) {
    throw new Error("외부 캘린더 구독 링크를 생성할 권한이 없습니다.");
  }

  const rawToken = generateCalendarSubscriptionToken();
  const tokenHash = hashCalendarSubscriptionToken(rawToken);
  const teamId = resolveTeamIdForScope(params.actor, params.scope);
  const subscription = await getPrisma().calendarSubscriptionToken.create({
    data: {
      userId: params.actor.id,
      tokenHash,
      scope: params.scope,
      teamId,
      name: params.name?.trim() || getCalendarSubscriptionScopeLabel(params.scope),
    },
    include: { team: { select: { id: true, name: true } } },
  });

  await createCalendarAudit({
    actorId: params.actor.id,
    action: "CALENDAR_SUBSCRIPTION_CREATED",
    targetId: subscription.id,
    metadata: {
      scope: params.scope,
      teamId,
      userId: params.actor.id,
    },
  });

  return {
    subscription,
    rawToken,
    url: getCalendarSubscriptionUrl(rawToken),
  };
}

export async function revokeCalendarSubscription(params: {
  actor: RbacUser;
  subscriptionId: string;
}) {
  const prisma = getPrisma();
  const subscription = await prisma.calendarSubscriptionToken.findFirst({
    where: {
      id: params.subscriptionId,
      userId: params.actor.id,
      revokedAt: null,
    },
  });

  if (!subscription) {
    throw new Error("비활성화할 구독 링크를 찾을 수 없습니다.");
  }

  const revoked = await prisma.calendarSubscriptionToken.update({
    where: { id: subscription.id },
    data: { isEnabled: false, revokedAt: new Date() },
  });

  await createCalendarAudit({
    actorId: params.actor.id,
    action: "CALENDAR_SUBSCRIPTION_REVOKED",
    targetId: revoked.id,
    metadata: {
      scope: revoked.scope,
      teamId: revoked.teamId,
      userId: params.actor.id,
    },
  });

  return revoked;
}

export async function regenerateCalendarSubscription(params: {
  actor: RbacUser;
  subscriptionId: string;
}) {
  const prisma = getPrisma();
  const previous = await prisma.calendarSubscriptionToken.findFirst({
    where: { id: params.subscriptionId, userId: params.actor.id },
  });

  if (!previous) {
    throw new Error("재발급할 구독 링크를 찾을 수 없습니다.");
  }

  if (!canCreateCalendarSubscription(params.actor, previous.scope)) {
    throw new Error("외부 캘린더 구독 링크를 재발급할 권한이 없습니다.");
  }

  const rawToken = generateCalendarSubscriptionToken();
  const tokenHash = hashCalendarSubscriptionToken(rawToken);
  const now = new Date();
  const created = await prisma.$transaction(async (tx) => {
    await tx.calendarSubscriptionToken.update({
      where: { id: previous.id },
      data: { isEnabled: false, revokedAt: now },
    });

    return tx.calendarSubscriptionToken.create({
      data: {
        userId: params.actor.id,
        tokenHash,
        scope: previous.scope,
        teamId: previous.teamId,
        name: previous.name,
      },
      include: { team: { select: { id: true, name: true } } },
    });
  });

  await createCalendarAudit({
    actorId: params.actor.id,
    action: "CALENDAR_SUBSCRIPTION_REGENERATED",
    targetId: created.id,
    metadata: {
      previousSubscriptionId: previous.id,
      scope: created.scope,
      teamId: created.teamId,
      userId: params.actor.id,
    },
  });

  return {
    subscription: created,
    rawToken,
    url: getCalendarSubscriptionUrl(rawToken),
  };
}

async function verifyCalendarSubscriptionToken(
  rawToken: string,
): Promise<VerifiedCalendarSubscription | null> {
  const tokenHash = hashCalendarSubscriptionToken(rawToken);
  const subscription = await getPrisma().calendarSubscriptionToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: { id: true, role: true, status: true, teamId: true },
      },
    },
  });

  if (!subscription) {
    return null;
  }

  if (
    !subscription.isEnabled ||
    subscription.revokedAt ||
    subscription.user.status !== "ACTIVE" ||
    subscription.user.role === "EXTERNAL_PARTNER"
  ) {
    return null;
  }

  if (subscription.expiresAt && subscription.expiresAt <= new Date()) {
    return null;
  }

  return subscription;
}

export async function buildCalendarSubscriptionIcs(rawToken: string) {
  const subscription = await verifyCalendarSubscriptionToken(rawToken);

  if (!subscription) {
    return null;
  }

  const actor = await hydrateReviewScope({
    id: subscription.user.id,
    role: subscription.user.role,
    status: subscription.user.status,
    teamId: subscription.user.teamId,
  });
  const today = todayInSeoul();
  const fromDate = addMonthsDateOnly(today, -3);
  const toDate = addMonthsDateOnly(today, 12);
  const calendarScope = mapSubscriptionScopeToCalendarScope(subscription.scope);
  const events = await listCalendarLeaveEvents({
    actor,
    fromDate,
    toDate,
    statuses: ["APPROVED"],
    scope: calendarScope,
    teamId: subscription.teamId,
  });

  await getPrisma().calendarSubscriptionToken.update({
    where: { id: subscription.id },
    data: { lastUsedAt: new Date() },
  });

  return buildIcsCalendar({
    calendarName: getCalendarSubscriptionScopeLabel(subscription.scope),
    events,
  });
}

export type { CalendarSubscriptionWithTeam };
