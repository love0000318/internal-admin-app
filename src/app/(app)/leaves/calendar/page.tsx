import Link from "next/link";

import { Badge, buttonClassName, Card, EmptyState } from "@/components/design-system/primitives";
import { ResponsiveTable } from "@/components/design-system/responsive";
import type { LeaveRequestStatus } from "@/generated/prisma/client";
import {
  CALENDAR_HALF_DAY_LABELS,
  CALENDAR_STATUS_LABELS,
  getLeaveCalendarEventColorClass,
  listCalendarFilterOptions,
  listCalendarLeaveEvents,
  monthRange,
  type CalendarScope,
  type LeaveCalendarEvent,
} from "@/lib/leave/calendar";
import { todayInSeoul } from "@/lib/leave/calculate-business-days";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type CalendarPageProps = {
  searchParams: Promise<{
    month?: string;
    teamId?: string;
    userId?: string;
    leaveTypeId?: string;
    status?: string;
    scope?: string;
  }>;
};

const statusOptions: Array<{ value: LeaveRequestStatus; label: string }> = [
  { value: "APPROVED", label: "승인 완료" },
  { value: "PENDING", label: "승인 대기" },
  { value: "REJECTED", label: "반려" },
  { value: "CANCELLED", label: "취소" },
  { value: "WITHDRAWN", label: "철회" },
];

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

function defaultScope(role: string): CalendarScope {
  return role === "OWNER" ? "ALL" : "TEAM";
}

function normalizeScope(value: string | undefined, role: string): CalendarScope {
  if (value === "ME") {
    return "ME";
  }

  if (value === "ALL" && role === "OWNER") {
    return "ALL";
  }

  return defaultScope(role);
}

function normalizeStatuses(value: string | undefined): LeaveRequestStatus[] {
  if (statusOptions.some((option) => option.value === value)) {
    return [value as LeaveRequestStatus];
  }

  return ["APPROVED"];
}

function monthDays(fromDate: string, toDate: string) {
  const days: string[] = [];
  const start = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);

  for (
    let current = start;
    current.getTime() <= end.getTime();
    current = new Date(current.getTime() + 24 * 60 * 60 * 1000)
  ) {
    days.push(current.toISOString().slice(0, 10));
  }

  return days;
}

function eventsByDate(events: LeaveCalendarEvent[]) {
  return events.reduce<Record<string, LeaveCalendarEvent[]>>((acc, event) => {
    acc[event.date] = [...(acc[event.date] ?? []), event];
    return acc;
  }, {});
}

function statusBadgeTone(status: LeaveRequestStatus) {
  if (status === "APPROVED") {
    return "success" as const;
  }

  if (status === "PENDING") {
    return "warning" as const;
  }

  if (status === "REJECTED" || status === "CANCELLED") {
    return "danger" as const;
  }

  return "default" as const;
}

function EventLine({ event }: { event: LeaveCalendarEvent }) {
  const colorClassName = getLeaveCalendarEventColorClass(event);
  const content = (
    <span className="block truncate">
      {event.title}
      {event.status === "PENDING" ? " · 승인 대기" : ""}
    </span>
  );

  return event.detailUrl ? (
    <Link
      href={event.detailUrl}
      className={`block rounded-lg border px-2 py-1 text-xs transition hover:brightness-95 ${colorClassName}`}
    >
      {content}
    </Link>
  ) : (
    <div className={`rounded-lg border px-2 py-1 text-xs ${colorClassName}`}>
      {content}
    </div>
  );
}

export default async function LeaveCalendarPage({
  searchParams,
}: CalendarPageProps) {
  const actor = await requireRouteAccess("/leaves/calendar");
  const params = await searchParams;
  const today = todayInSeoul();
  const { month, fromDate, toDate } = monthRange(params.month, today);
  const scope = normalizeScope(params.scope, actor.role);
  const statuses = normalizeStatuses(params.status);
  const [events, options] = await Promise.all([
    listCalendarLeaveEvents({
      actor,
      fromDate,
      toDate,
      teamId: params.teamId || null,
      userId: params.userId || null,
      leaveTypeId: params.leaveTypeId || null,
      statuses,
      scope,
    }),
    listCalendarFilterOptions({ actor }),
  ]);
  const grouped = eventsByDate(events);
  const days = monthDays(fromDate, toDate);
  const leadingBlankCount = new Date(`${fromDate}T00:00:00.000Z`).getUTCDay();

  return (
    <section className="min-w-0 space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">휴가</p>
          <h1 className="mt-2 break-keep text-2xl font-bold tracking-normal text-slate-950 sm:text-3xl">
            휴가 캘린더
          </h1>
          <p className="mt-2 max-w-3xl break-keep text-sm leading-relaxed text-slate-600">
            승인된 휴가 일정을 확인합니다. 공개 범위에 따라 일부 휴가 유형은
            중립색과 “휴가”로만 표시됩니다.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href="/leaves/calendar/settings"
            className={buttonClassName({
              tone: "neutral",
              className: "w-full sm:w-auto",
            })}
          >
            외부 캘린더 연동
          </Link>
          <Link
            href="/leaves/me/requests/new"
            className={buttonClassName({ className: "w-full sm:w-auto" })}
          >
            휴가 요청
          </Link>
        </div>
      </div>

      <Card>
        <form action="/leaves/calendar" className="grid gap-3 md:grid-cols-6">
          <label className="text-sm font-medium text-slate-800">
            기준 월
            <input
              name="month"
              type="month"
              defaultValue={month}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3"
            />
          </label>
          <label className="text-sm font-medium text-slate-800">
            보기 범위
            <select
              name="scope"
              defaultValue={scope}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3"
            >
              <option value="ME">내 휴가만</option>
              <option value="TEAM">팀 휴가</option>
              {actor.role === "OWNER" ? <option value="ALL">전체 보기</option> : null}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-800">
            팀
            <select
              name="teamId"
              defaultValue={params.teamId ?? ""}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3"
            >
              <option value="">전체</option>
              {options.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-800">
            직원
            <select
              name="userId"
              defaultValue={params.userId ?? ""}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3"
            >
              <option value="">전체</option>
              {options.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-800">
            휴가 유형
            <select
              name="leaveTypeId"
              defaultValue={params.leaveTypeId ?? ""}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3"
            >
              <option value="">전체</option>
              {options.leaveTypes.map((leaveType) => (
                <option key={leaveType.id} value={leaveType.id}>
                  {leaveType.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-800">
            상태
            <select
              name="status"
              defaultValue={statuses[0]}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3"
            >
              {statusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-6">
            <button className={buttonClassName({ className: "w-full sm:w-auto" })}>
              필터 적용
            </button>
            <p className="mt-2 break-keep text-xs leading-relaxed text-slate-500">
              휴가 사유와 증명자료 정보는 캘린더에 표시하지 않습니다.
            </p>
          </div>
        </form>
      </Card>

      <div className="hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold text-slate-500">
          {weekdayLabels.map((day) => (
            <div key={day} className="px-2 py-3">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: leadingBlankCount }).map((_, index) => (
            <div
              key={`blank-${index}`}
              className="min-h-28 border-b border-r border-slate-100 bg-slate-50"
            />
          ))}
          {days.map((day) => {
            const dayEvents = grouped[day] ?? [];
            const isToday = day === today;

            return (
              <div
                key={day}
                className="min-h-28 border-b border-r border-slate-100 p-2"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={
                      isToday
                        ? "inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-700 px-1 text-xs font-semibold text-white"
                        : "text-xs font-semibold text-slate-700"
                    }
                  >
                    {Number(day.slice(8, 10))}
                  </span>
                  {dayEvents.length > 0 ? (
                    <span className="text-[11px] text-slate-400">
                      {dayEvents.length}
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-1">
                  {dayEvents.slice(0, 4).map((event) => (
                    <EventLine key={event.id} event={event} />
                  ))}
                  {dayEvents.length > 4 ? (
                    <p className="text-[11px] text-slate-500">
                      외 {dayEvents.length - 4}건
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Card className="lg:hidden">
        <h2 className="text-base font-semibold text-slate-950">월간 목록</h2>
        <p className="mt-1 break-keep text-sm text-slate-500">
          모바일에서는 일정 목록을 먼저 보여줍니다.
        </p>
        <div className="mt-4 grid gap-3">
          {events.length === 0 ? (
            <EmptyState title="표시할 휴가 일정이 없습니다." />
          ) : (
            events.map((event) => (
              <article
                key={event.id}
                className={`rounded-2xl border p-4 ${getLeaveCalendarEventColorClass(event)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{event.title}</p>
                    <p className="mt-1 text-xs">
                      {event.date} · {event.teamName ?? "팀 없음"}
                    </p>
                  </div>
                  <Badge tone={statusBadgeTone(event.status)}>
                    {CALENDAR_STATUS_LABELS[event.status]}
                  </Badge>
                </div>
                {event.detailUrl ? (
                  <Link
                    href={event.detailUrl}
                    className="mt-3 inline-flex text-sm font-semibold underline"
                  >
                    상세 보기
                  </Link>
                ) : null}
              </article>
            ))
          )}
        </div>
      </Card>

      <ResponsiveTable minWidth="900px">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th>날짜</th>
            <th>직원</th>
            <th>팀</th>
            <th>표시명</th>
            <th>반차</th>
            <th>상태</th>
            <th>상세</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {events.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-slate-500">
                표시할 휴가 일정이 없습니다.
              </td>
            </tr>
          ) : (
            events.map((event) => (
              <tr key={event.id}>
                <td>{event.date}</td>
                <td>{event.employeeName}</td>
                <td>{event.teamName ?? "-"}</td>
                <td>
                  <span
                    className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${getLeaveCalendarEventColorClass(event)}`}
                  >
                    {event.title}
                  </span>
                  {event.isPrivate ? (
                    <span className="ml-2 text-xs text-slate-400">제한 표시</span>
                  ) : null}
                </td>
                <td>
                  {event.halfDayPeriod
                    ? CALENDAR_HALF_DAY_LABELS[event.halfDayPeriod]
                    : "-"}
                </td>
                <td>
                  <Badge tone={statusBadgeTone(event.status)}>
                    {CALENDAR_STATUS_LABELS[event.status]}
                  </Badge>
                </td>
                <td>
                  {event.detailUrl ? (
                    <Link className="text-sm font-semibold underline" href={event.detailUrl}>
                      상세 보기
                    </Link>
                  ) : (
                    <span className="text-slate-400">상세 제한</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </ResponsiveTable>
    </section>
  );
}
