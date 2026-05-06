import type { LeaveCalendarEvent } from "@/lib/leave/calendar";

const ICS_DESCRIPTION =
  "Internal Ops에서 승인된 휴가 일정입니다. 민감한 세부 내용은 포함하지 않습니다.";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function formatIcsDate(dateOnly: string) {
  return dateOnly.replace(/-/g, "");
}

export function formatIcsUtcDateTime(date: Date) {
  return [
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
    "T",
    pad2(date.getUTCHours()),
    pad2(date.getUTCMinutes()),
    pad2(date.getUTCSeconds()),
    "Z",
  ].join("");
}

export function nextDateOnly(dateOnly: string) {
  const current = new Date(`${dateOnly}T00:00:00.000Z`);
  current.setUTCDate(current.getUTCDate() + 1);
  return current.toISOString().slice(0, 10);
}

function dateTimeInSeoul(dateOnly: string, time: string) {
  return `${formatIcsDate(dateOnly)}T${time}`;
}

function eventSummary(event: LeaveCalendarEvent) {
  if (event.halfDayPeriod === "AM") {
    return "오전 반차";
  }

  if (event.halfDayPeriod === "PM") {
    return "오후 반차";
  }

  return event.leaveTypeLabel ?? "휴가";
}

function buildEventDateLines(event: LeaveCalendarEvent) {
  if (event.halfDayPeriod === "AM") {
    return [
      `DTSTART;TZID=Asia/Seoul:${dateTimeInSeoul(event.date, "090000")}`,
      `DTEND;TZID=Asia/Seoul:${dateTimeInSeoul(event.date, "130000")}`,
    ];
  }

  if (event.halfDayPeriod === "PM") {
    return [
      `DTSTART;TZID=Asia/Seoul:${dateTimeInSeoul(event.date, "140000")}`,
      `DTEND;TZID=Asia/Seoul:${dateTimeInSeoul(event.date, "180000")}`,
    ];
  }

  return [
    `DTSTART;VALUE=DATE:${formatIcsDate(event.startDate)}`,
    `DTEND;VALUE=DATE:${formatIcsDate(nextDateOnly(event.endDate))}`,
  ];
}

function groupEventsByLeaveRequest(events: LeaveCalendarEvent[]) {
  const grouped = new Map<string, LeaveCalendarEvent>();

  for (const event of events) {
    const existing = grouped.get(event.leaveRequestId);

    if (!existing) {
      grouped.set(event.leaveRequestId, event);
      continue;
    }

    grouped.set(event.leaveRequestId, {
      ...existing,
      startDate:
        event.startDate < existing.startDate ? event.startDate : existing.startDate,
      endDate: event.endDate > existing.endDate ? event.endDate : existing.endDate,
    });
  }

  return [...grouped.values()].sort(
    (left, right) =>
      left.startDate.localeCompare(right.startDate) ||
      left.leaveRequestId.localeCompare(right.leaveRequestId),
  );
}

export function buildIcsCalendar(params: {
  calendarName: string;
  events: LeaveCalendarEvent[];
  generatedAt?: Date;
}) {
  const generatedAt = params.generatedAt ?? new Date();
  const dtstamp = formatIcsUtcDateTime(generatedAt);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Curinginnos//Internal Ops Leave Calendar//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(params.calendarName)}`,
    "X-WR-TIMEZONE:Asia/Seoul",
  ];

  for (const event of groupEventsByLeaveRequest(params.events)) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:leave-request-${escapeIcsText(event.leaveRequestId)}@internal-ops`,
      `DTSTAMP:${dtstamp}`,
      `CREATED:${dtstamp}`,
      `LAST-MODIFIED:${dtstamp}`,
      ...buildEventDateLines(event),
      `SUMMARY:${escapeIcsText(eventSummary(event))}`,
      `DESCRIPTION:${escapeIcsText(ICS_DESCRIPTION)}`,
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  return `${lines.join("\r\n")}\r\n`;
}
