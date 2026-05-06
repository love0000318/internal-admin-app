import type { CalendarSubscriptionScope } from "@/generated/prisma/client";
import { isLead, isManager, isOwner, type RbacUser } from "@/lib/rbac/roles";

export const CALENDAR_PROVIDERS = [
  "GOOGLE",
  "APPLE",
  "SAMSUNG",
  "OUTLOOK",
  "OTHER",
] as const;

export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];

export const CALENDAR_PROVIDER_LABELS: Record<CalendarProvider, string> = {
  GOOGLE: "Google Calendar",
  APPLE: "Apple Calendar",
  SAMSUNG: "Samsung Calendar",
  OUTLOOK: "Outlook Calendar",
  OTHER: "기타 iCal 지원 캘린더",
};

const PROVIDER_NAME_PREFIX = "provider:";

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

export function isCalendarProvider(value: unknown): value is CalendarProvider {
  return CALENDAR_PROVIDERS.some((provider) => provider === value);
}

export function getCalendarProviderLabel(provider: CalendarProvider) {
  return CALENDAR_PROVIDER_LABELS[provider];
}

export function encodeCalendarProviderName(provider: CalendarProvider) {
  return `${PROVIDER_NAME_PREFIX}${provider}`;
}

export function getCalendarProviderFromName(
  name: string | null | undefined,
): CalendarProvider {
  if (!name?.startsWith(PROVIDER_NAME_PREFIX)) {
    return "OTHER";
  }

  const provider = name.slice(PROVIDER_NAME_PREFIX.length);
  return isCalendarProvider(provider) ? provider : "OTHER";
}
