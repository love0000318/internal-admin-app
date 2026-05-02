import Link from "next/link";

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
import type { LeaveRequestStatus } from "@/generated/prisma/client";
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

function statusBadgeClass(status: LeaveRequestStatus) {
  if (status === "APPROVED") {
    return "border-green-200 bg-green-50 text-green-700";
  }

  if (status === "PENDING") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-neutral-200 bg-neutral-50 text-neutral-600";
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
      className={`block rounded border px-2 py-1 text-xs transition hover:brightness-95 ${colorClassName}`}
    >
      {content}
    </Link>
  ) : (
    <div className={`rounded border px-2 py-1 text-xs ${colorClassName}`}>
      {content}
    </div>
  );
}

export default async function LeaveCalendarPage({ searchParams }: CalendarPageProps) {
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
    <section>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">휴가</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">휴가 캘린더</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">
            승인된 휴가 일정을 확인할 수 있습니다. 휴가 유형별 공개 범위에 따라 일부 정보는 제한적으로 표시됩니다.
          </p>
        </div>
        <Link
          href="/leaves/me/requests/new"
          className="inline-flex h-10 items-center justify-center rounded-md bg-neutral-950 px-4 text-sm font-medium text-white"
        >
          휴가 요청
        </Link>
      </div>

      <form
        action="/leaves/calendar"
        className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm md:grid-cols-6"
      >
        <label className="text-sm">
          기준 월
          <input
            name="month"
            type="month"
            defaultValue={month}
            className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
          />
        </label>
        <label className="text-sm">
          보기 범위
          <select
            name="scope"
            defaultValue={scope}
            className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
          >
            <option value="ME">내 휴가만</option>
            <option value="TEAM">팀 휴가</option>
            {actor.role === "OWNER" ? <option value="ALL">전체 보기</option> : null}
          </select>
        </label>
        <label className="text-sm">
          팀
          <select
            name="teamId"
            defaultValue={params.teamId ?? ""}
            className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
          >
            <option value="">전체</option>
            {options.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          직원
          <select
            name="userId"
            defaultValue={params.userId ?? ""}
            className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
          >
            <option value="">전체</option>
            {options.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          휴가 유형
          <select
            name="leaveTypeId"
            defaultValue={params.leaveTypeId ?? ""}
            className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
          >
            <option value="">전체</option>
            {options.leaveTypes.map((leaveType) => (
              <option key={leaveType.id} value={leaveType.id}>
                {leaveType.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          상태
          <select
            name="status"
            defaultValue={statuses[0]}
            className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
          >
            {statusOptions.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
        <div className="md:col-span-6">
          <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
            필터 적용
          </button>
          <p className="mt-2 text-xs text-neutral-500">
            승인 대기 휴가는 본인 또는 승인권자에게만 표시됩니다. 휴가 사유와 증명자료 정보는 캘린더에 표시하지 않습니다.
          </p>
        </div>
      </form>

      <div className="mt-6 rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50 text-center text-xs font-medium text-neutral-500">
          {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
            <div key={day} className="px-2 py-3">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: leadingBlankCount }).map((_, index) => (
            <div
              key={`blank-${index}`}
              className="min-h-28 border-b border-r border-neutral-100 bg-neutral-50"
            />
          ))}
          {days.map((day) => {
            const dayEvents = grouped[day] ?? [];
            const isToday = day === today;

            return (
              <div
                key={day}
                className="min-h-28 border-b border-r border-neutral-100 p-2"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={
                      isToday
                        ? "inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-neutral-950 px-1 text-xs font-semibold text-white"
                        : "text-xs font-medium text-neutral-700"
                    }
                  >
                    {Number(day.slice(8, 10))}
                  </span>
                  {dayEvents.length > 0 ? (
                    <span className="text-[11px] text-neutral-400">{dayEvents.length}</span>
                  ) : null}
                </div>
                <div className="grid gap-1">
                  {dayEvents.slice(0, 4).map((event) => (
                    <EventLine key={event.id} event={event} />
                  ))}
                  {dayEvents.length > 4 ? (
                    <p className="text-[11px] text-neutral-500">
                      외 {dayEvents.length - 4}건
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-4 py-3">
          <h2 className="font-semibold">목록 보기</h2>
          <p className="mt-1 text-sm text-neutral-500">
            비공개 휴가는 권한이 있는 사용자에게만 표시됩니다.
          </p>
        </div>
        {events.length === 0 ? (
          <p className="px-4 py-8 text-sm text-neutral-500">
            표시할 휴가 일정이 없습니다.
          </p>
        ) : (
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-3">날짜</th>
                <th className="px-4 py-3">직원</th>
                <th className="px-4 py-3">팀</th>
                <th className="px-4 py-3">표시명</th>
                <th className="px-4 py-3">반차</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">상세</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="px-4 py-3">{event.date}</td>
                  <td className="px-4 py-3">{event.employeeName}</td>
                  <td className="px-4 py-3">{event.teamName ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${getLeaveCalendarEventColorClass(event)}`}
                    >
                      {event.title}
                    </span>
                    {event.isPrivate ? (
                      <span className="ml-2 text-xs text-neutral-400">제한 표시</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {event.halfDayPeriod
                      ? CALENDAR_HALF_DAY_LABELS[event.halfDayPeriod]
                      : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusBadgeClass(event.status)}`}
                    >
                      {CALENDAR_STATUS_LABELS[event.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {event.detailUrl ? (
                      <Link className="text-sm font-medium underline" href={event.detailUrl}>
                        상세 보기
                      </Link>
                    ) : (
                      <span className="text-neutral-400">상세 제한</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
