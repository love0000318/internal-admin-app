import type {
  LeaveRequestStatus,
  LeaveType,
  LeaveTypeDefinition,
  LeaveVisibility,
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  dateOnlyToDate,
  dateToDateOnly,
  parseDateOnly,
} from "@/lib/leave/calculate-business-days";
import { hydrateReviewScope } from "@/lib/leave/review";
import type { DateOnly, HalfDayPeriod } from "@/lib/leave/types";
import { isLead, isManager, isOwner, type RbacUser } from "@/lib/rbac/roles";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const INTERNAL_CALENDAR_ROLES = ["OWNER", "LEAD", "MANAGER"] as const;

export const CALENDAR_STATUS_LABELS: Record<LeaveRequestStatus, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인 완료",
  REJECTED: "반려",
  CANCELLED: "취소",
  WITHDRAWN: "철회",
};

export const CALENDAR_HALF_DAY_LABELS: Record<HalfDayPeriod, string> = {
  AM: "오전",
  PM: "오후",
};

export type LeaveCalendarEvent = {
  id: string;
  leaveRequestId: string;
  date: string;
  startDate: string;
  endDate: string;
  title: string;
  employeeName: string;
  employeeUserId: string;
  teamName?: string;
  leaveTypeCode?: string;
  leaveTypeLabel?: string;
  status: LeaveRequestStatus;
  statusLabel: string;
  halfDayPeriod?: HalfDayPeriod;
  amount?: number;
  unit?: string;
  isPrivate: boolean;
  canViewDetail: boolean;
  detailUrl?: string;
};

export type CalendarScope = "ME" | "TEAM" | "ALL";

export type CalendarLeaveRequest = {
  id: string;
  userId: string;
  type: LeaveType;
  leaveTypeId: string | null;
  status: LeaveRequestStatus;
  startDate: Date;
  endDate: Date;
  halfDayPeriod: HalfDayPeriod | null;
  dayCount: Prisma.Decimal;
  user: {
    id: string;
    name: string;
    role: RbacUser["role"];
    status: NonNullable<RbacUser["status"]>;
    teamId: string | null;
    team?: { id: string; name: string } | null;
  };
  customLeaveType?: Pick<
    LeaveTypeDefinition,
    "id" | "code" | "name" | "visibility"
  > | null;
};

export type LeaveCalendarListParams = {
  actor: RbacUser;
  fromDate: DateOnly;
  toDate: DateOnly;
  teamId?: string | null;
  userId?: string | null;
  leaveTypeId?: string | null;
  statuses?: LeaveRequestStatus[];
  scope?: CalendarScope;
  prisma?: PrismaClient;
};

function isSelf(actor: RbacUser, request: Pick<CalendarLeaveRequest, "userId">) {
  return actor.id === request.userId;
}

function isInManagedTeam(actor: RbacUser, teamId: string | null) {
  return Boolean(teamId && actor.managedTeamIds?.includes(teamId));
}

export function resolveCalendarEventVisibility(
  request: CalendarLeaveRequest,
  leaveTypeDefinition?: Pick<LeaveTypeDefinition, "visibility"> | null,
): LeaveVisibility {
  return leaveTypeDefinition?.visibility ?? "PUBLIC_WITH_TYPE";
}

export function canViewCalendarLeaveDetail(
  actor: RbacUser,
  request: CalendarLeaveRequest,
) {
  if (isSelf(actor, request) || isOwner(actor)) {
    return true;
  }

  return isLead(actor) && isInManagedTeam(actor, request.user.teamId);
}

export function canViewCalendarLeaveEvent({
  actor,
  request,
  visibility: _visibility,
}: {
  actor: RbacUser;
  request: CalendarLeaveRequest;
  visibility: LeaveVisibility;
}) {
  void _visibility;

  if (request.status === "APPROVED" && (isOwner(actor) || isLead(actor) || isManager(actor))) {
    return true;
  }

  if (isSelf(actor, request) || isOwner(actor)) {
    return true;
  }

  if (isLead(actor)) {
    return isInManagedTeam(actor, request.user.teamId);
  }

  return false;
}

function canViewActualLeaveType(actor: RbacUser, request: CalendarLeaveRequest) {
  return (
    isSelf(actor, request) ||
    isOwner(actor) ||
    (isLead(actor) && isInManagedTeam(actor, request.user.teamId))
  );
}

export function formatCalendarLeaveTitle({
  actor,
  request,
  leaveTypeLabel,
  visibility,
}: {
  actor: RbacUser;
  request: CalendarLeaveRequest;
  leaveTypeLabel: string;
  visibility: LeaveVisibility;
}) {
  const suffix =
    request.halfDayPeriod === "AM" || request.halfDayPeriod === "PM"
      ? ` ${CALENDAR_HALF_DAY_LABELS[request.halfDayPeriod]}`
      : "";

  if (canViewActualLeaveType(actor, request)) {
    const prefix = isSelf(actor, request) ? "나" : request.user.name;

    return `${prefix} - ${leaveTypeLabel}${suffix}`;
  }

  if (visibility === "PUBLIC_WITH_TYPE") {
    return `${request.user.name} - ${leaveTypeLabel}${suffix}`;
  }

  return `${request.user.name} - 휴가${suffix}`;
}

export function getLeaveCalendarEventColorClass(event: {
  isPrivate?: boolean;
  leaveTypeCode?: string | null;
  leaveTypeLabel?: string | null;
}) {
  if (event.isPrivate) {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  const code = event.leaveTypeCode ?? "";
  const label = event.leaveTypeLabel ?? "";

  if (code === "BIRTHDAY_HALF_DAY" || label.includes("생일 반차")) {
    return "border-purple-200 bg-purple-100 text-purple-800";
  }

  if (code === "HALF_DAY" || label.includes("반차")) {
    return "border-orange-200 bg-orange-100 text-orange-800";
  }

  if (code === "ANNUAL" || label.includes("연차")) {
    return "border-blue-200 bg-blue-100 text-blue-800";
  }

  return "border-slate-200 bg-slate-100 text-slate-700";
}

function resolveLeaveTypeDefinition(
  request: CalendarLeaveRequest,
  definitionsByCode: Map<
    string,
    Pick<LeaveTypeDefinition, "id" | "code" | "name" | "visibility">
  >,
) {
  return request.customLeaveType ?? definitionsByCode.get(request.type) ?? null;
}

function dateRange(startDate: DateOnly, endDate: DateOnly) {
  const dates: DateOnly[] = [];
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  for (
    let current = start;
    current.getTime() <= end.getTime();
    current = new Date(current.getTime() + ONE_DAY_MS)
  ) {
    dates.push(dateToDateOnly(current));
  }

  return dates;
}

export function buildLeaveCalendarEventsFromRequest({
  actor,
  request,
  definitionsByCode,
}: {
  actor: RbacUser;
  request: CalendarLeaveRequest;
  definitionsByCode: Map<
    string,
    Pick<LeaveTypeDefinition, "id" | "code" | "name" | "visibility">
  >;
}) {
  const definition = resolveLeaveTypeDefinition(request, definitionsByCode);
  const visibility = resolveCalendarEventVisibility(request, definition);

  if (!canViewCalendarLeaveEvent({ actor, request, visibility })) {
    return [];
  }

  const canViewDetail = canViewCalendarLeaveDetail(actor, request);
  const leaveTypeLabel = definition?.name ?? request.type;
  const canExposeLeaveType =
    canViewActualLeaveType(actor, request) || visibility === "PUBLIC_WITH_TYPE";
  const startDate = dateToDateOnly(request.startDate);
  const endDate = dateToDateOnly(request.endDate);
  const title = formatCalendarLeaveTitle({
    actor,
    request,
    leaveTypeLabel,
    visibility,
  });
  const detailUrl = canViewDetail
    ? isSelf(actor, request)
      ? `/leaves/me/requests/${request.id}`
      : `/leaves/approvals/${request.id}`
    : undefined;

  return dateRange(startDate, endDate).map((date) => ({
    id: `${request.id}:${date}`,
    leaveRequestId: request.id,
    date,
    startDate,
    endDate,
    title,
    employeeName: request.user.name,
    employeeUserId: request.userId,
    teamName: request.user.team?.name,
    leaveTypeCode: canExposeLeaveType ? definition?.code ?? request.type : undefined,
    leaveTypeLabel: canExposeLeaveType ? leaveTypeLabel : undefined,
    status: request.status,
    statusLabel: CALENDAR_STATUS_LABELS[request.status],
    halfDayPeriod: request.halfDayPeriod ?? undefined,
    amount: Number(request.dayCount),
    unit: "DAY",
    isPrivate:
      visibility !== "PUBLIC_WITH_TYPE" && !canViewActualLeaveType(actor, request),
    canViewDetail,
    detailUrl,
  }));
}

function statusWhere(
  actor: RbacUser,
  statuses: LeaveRequestStatus[] | undefined,
  scope: CalendarScope,
) {
  const requested = statuses?.length ? statuses : ["APPROVED" as const];

  if (scope === "ALL") {
    return requested.filter((status) => status === "APPROVED");
  }

  if (isOwner(actor) || isLead(actor)) {
    return requested;
  }

  return requested.filter(
    (status) => status === "APPROVED" || status === "PENDING",
  );
}

function internalCalendarUserWhere(): Prisma.UserWhereInput {
  return {
    role: { in: [...INTERNAL_CALENDAR_ROLES] },
    status: "ACTIVE",
  };
}

function baseUserWhere(
  actor: RbacUser,
  scope: CalendarScope,
): Prisma.UserWhereInput {
  if (scope === "ME") {
    return { id: actor.id };
  }

  if (scope === "ALL") {
    return isOwner(actor) || isLead(actor) || isManager(actor)
      ? internalCalendarUserWhere()
      : { id: "__calendar_access_denied__" };
  }

  if (isOwner(actor)) {
    return {};
  }

  if (isLead(actor)) {
    return {
      OR: [{ id: actor.id }, { teamId: { in: actor.managedTeamIds ?? [] } }],
    };
  }

  if (isManager(actor)) {
    return actor.teamId ? { teamId: actor.teamId } : { id: actor.id };
  }

  return { id: "__calendar_access_denied__" };
}

export async function listCalendarLeaveEvents({
  actor,
  fromDate,
  toDate,
  teamId,
  userId,
  leaveTypeId,
  statuses,
  scope = "TEAM",
  prisma = getPrisma(),
}: LeaveCalendarListParams) {
  const scopedActor = await hydrateReviewScope(actor, prisma);
  const definitions = await prisma.leaveTypeDefinition.findMany({
    select: { id: true, code: true, name: true, visibility: true },
  });
  const definitionsByCode = new Map(
    definitions.map((definition) => [definition.code, definition]),
  );
  const selectedType = leaveTypeId
    ? definitions.find((definition) => definition.id === leaveTypeId)
    : null;
  const userWhere: Prisma.UserWhereInput = {
    AND: [
      baseUserWhere(scopedActor, scope),
      teamId ? { teamId } : {},
      userId ? { id: userId } : {},
    ],
  };
  const queryStatuses = statusWhere(scopedActor, statuses, scope);

  const requests = await prisma.leaveRequest.findMany({
    where: {
      status: { in: queryStatuses },
      startDate: { lte: dateOnlyToDate(toDate) },
      endDate: { gte: dateOnlyToDate(fromDate) },
      user: userWhere,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          role: true,
          status: true,
          teamId: true,
          team: { select: { id: true, name: true } },
        },
      },
      customLeaveType: {
        select: { id: true, code: true, name: true, visibility: true },
      },
    },
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });

  return requests
    .filter((request) => {
      if (!selectedType) {
        return true;
      }

      return (
        request.leaveTypeId === selectedType.id ||
        request.type === selectedType.code
      );
    })
    .flatMap((request) =>
      buildLeaveCalendarEventsFromRequest({
        actor: scopedActor,
        request,
        definitionsByCode,
      }),
    )
    .filter((event) => event.date >= fromDate && event.date <= toDate)
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.title.localeCompare(right.title),
    );
}

export async function listCalendarFilterOptions({
  actor,
  prisma = getPrisma(),
}: {
  actor: RbacUser;
  prisma?: PrismaClient;
}) {
  const scopedActor = await hydrateReviewScope(actor, prisma);
  const canViewCompanyCalendar =
    isOwner(scopedActor) || isLead(scopedActor) || isManager(scopedActor);
  const teamWhere: Prisma.TeamWhereInput = canViewCompanyCalendar
    ? { status: "ACTIVE" }
    : { id: "__no_team__" };
  const userWhere = canViewCompanyCalendar
    ? internalCalendarUserWhere()
    : { id: "__no_user__" };

  const [teams, users, leaveTypes] = await Promise.all([
    prisma.team.findMany({
      where: teamWhere,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { AND: [userWhere, { status: "ACTIVE" }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.leaveTypeDefinition.findMany({
      where: { isEnabled: true },
      select: { id: true, name: true, code: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
  ]);

  return { teams, users, leaveTypes };
}

export function monthRange(month: string | undefined, today: DateOnly) {
  const normalized = /^\d{4}-\d{2}$/.test(month ?? "")
    ? month!
    : today.slice(0, 7);
  const [year, monthNumber] = normalized.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const last = new Date(Date.UTC(year, monthNumber, 0));

  return {
    month: normalized,
    fromDate: dateToDateOnly(first),
    toDate: dateToDateOnly(last),
  };
}
