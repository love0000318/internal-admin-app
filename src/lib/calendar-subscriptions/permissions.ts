import type { CalendarSubscriptionScope } from "@/generated/prisma/client";
import { isLead, isManager, isOwner, type RbacUser } from "@/lib/rbac/roles";

export function canCreateCalendarSubscription(
  actor: RbacUser,
  scope: CalendarSubscriptionScope,
) {
  if (actor.status !== "ACTIVE" || actor.role === "EXTERNAL_PARTNER") {
    return false;
  }

  if (isOwner(actor)) {
    return true;
  }

  if (isLead(actor)) {
    return scope === "ME" || scope === "TEAM" || scope === "MANAGED_TEAMS";
  }

  if (isManager(actor)) {
    return scope === "ME" || scope === "TEAM";
  }

  return false;
}

export function getCalendarSubscriptionScopeLabel(
  scope: CalendarSubscriptionScope,
) {
  switch (scope) {
    case "ME":
      return "내 휴가 캘린더";
    case "TEAM":
      return "팀 휴가 캘린더";
    case "MANAGED_TEAMS":
      return "담당 팀 휴가 캘린더";
    case "ALL_COMPANY":
      return "전체 직원 휴가 캘린더";
  }
}

export function isCalendarSubscriptionScope(
  value: unknown,
): value is CalendarSubscriptionScope {
  return (
    value === "ME" ||
    value === "TEAM" ||
    value === "MANAGED_TEAMS" ||
    value === "ALL_COMPANY"
  );
}
