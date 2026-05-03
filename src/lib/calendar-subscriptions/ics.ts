import type { LeaveCalendarEvent } from "@/lib/leave/calendar";

const ICS_DESCRIPTION =
  "사내 휴가 일정에서 생성된 읽기 전용 일정입니다.";

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
    `DTSTART;VALUE=DATE:${formatIcsDate(event.date)}`,
    `DTEND;VALUE=DATE:${formatIcsDate(nextDateOnly(event.date))}`,
  ];
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

  for (const event of params.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:leave-${escapeIcsText(event.leaveRequestId)}-${event.date}@internal-ops`,
      `DTSTAMP:${dtstamp}`,
      ...buildEventDateLines(event),
      `SUMMARY:${escapeIcsText(event.title)}`,
      `DESCRIPTION:${escapeIcsText(ICS_DESCRIPTION)}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  return `${lines.join("\r\n")}\r\n`;
}
