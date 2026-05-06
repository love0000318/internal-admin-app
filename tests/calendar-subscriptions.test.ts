import { describe, expect, it } from "vitest";

import {
  buildIcsCalendar,
  escapeIcsText,
  nextDateOnly,
} from "@/lib/calendar-subscriptions/ics";
import {
  getCalendarProviderFromName,
  getCalendarProviderLabel,
  isCalendarProvider,
} from "@/lib/calendar-subscriptions/permissions";
import {
  generateCalendarSubscriptionToken,
  hashCalendarSubscriptionToken,
} from "@/lib/calendar-subscriptions/tokens";
import type { LeaveCalendarEvent } from "@/lib/leave/calendar";

function baseEvent(overrides: Partial<LeaveCalendarEvent> = {}): LeaveCalendarEvent {
  return {
    id: "event-1",
    leaveRequestId: "request-1",
    date: "2026-05-10",
    startDate: "2026-05-10",
    endDate: "2026-05-10",
    title: "김하나 - 연차",
    employeeName: "김하나",
    employeeUserId: "user-1",
    teamName: "운영팀",
    leaveTypeCode: "ANNUAL",
    leaveTypeLabel: "연차",
    status: "APPROVED",
    statusLabel: "승인 완료",
    amount: 1,
    unit: "DAY",
    isPrivate: false,
    canViewDetail: true,
    ...overrides,
  };
}

describe("calendar subscription tokens", () => {
  it("generates long URL-safe tokens and stores only hashes", () => {
    const token = generateCalendarSubscriptionToken();
    const hash = hashCalendarSubscriptionToken(token);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(hash).not.toBe(token);
    expect(hash).toBe(hashCalendarSubscriptionToken(token));
  });
});

describe("calendar provider mapping", () => {
  it("maps supported providers and falls back safely", () => {
    expect(isCalendarProvider("GOOGLE")).toBe(true);
    expect(getCalendarProviderLabel("GOOGLE")).toBe("Google Calendar");
    expect(getCalendarProviderFromName("provider:OUTLOOK")).toBe("OUTLOOK");
    expect(getCalendarProviderFromName("unexpected")).toBe("OTHER");
  });
});

describe("ICS generation", () => {
  it("escapes ICS text safely", () => {
    expect(escapeIcsText("휴가, 사유; 줄\n바꿈")).toBe(
      "휴가\\, 사유\\; 줄\\n바꿈",
    );
  });

  it("uses exclusive DTEND for all-day events", () => {
    expect(nextDateOnly("2026-05-10")).toBe("2026-05-11");

    const ics = buildIcsCalendar({
      calendarName: "사내 휴가 일정",
      events: [baseEvent()],
      generatedAt: new Date("2026-05-03T00:00:00.000Z"),
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:");
    expect(ics).toContain("UID:leave-request-request-1@internal-ops");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260510");
    expect(ics).toContain("DTEND;VALUE=DATE:20260511");
    expect(ics).toContain("SUMMARY:연차");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("TRANSP:OPAQUE");
  });

  it("uses one multi-day event per leave request", () => {
    const ics = buildIcsCalendar({
      calendarName: "사내 휴가 일정",
      events: [
        baseEvent({
          id: "request-1:2026-05-10",
          date: "2026-05-10",
          startDate: "2026-05-10",
          endDate: "2026-05-12",
        }),
        baseEvent({
          id: "request-1:2026-05-11",
          date: "2026-05-11",
          startDate: "2026-05-10",
          endDate: "2026-05-12",
        }),
      ],
      generatedAt: new Date("2026-05-03T00:00:00.000Z"),
    });

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260510");
    expect(ics).toContain("DTEND;VALUE=DATE:20260513");
  });

  it("uses time ranges for half-day events", () => {
    const am = buildIcsCalendar({
      calendarName: "사내 휴가 일정",
      events: [baseEvent({ halfDayPeriod: "AM" })],
      generatedAt: new Date("2026-05-03T00:00:00.000Z"),
    });
    const pm = buildIcsCalendar({
      calendarName: "사내 휴가 일정",
      events: [baseEvent({ halfDayPeriod: "PM" })],
      generatedAt: new Date("2026-05-03T00:00:00.000Z"),
    });

    expect(am).toContain("DTSTART;TZID=Asia/Seoul:20260510T090000");
    expect(am).toContain("DTEND;TZID=Asia/Seoul:20260510T130000");
    expect(am).toContain("SUMMARY:오전 반차");
    expect(pm).toContain("DTSTART;TZID=Asia/Seoul:20260510T140000");
    expect(pm).toContain("DTEND;TZID=Asia/Seoul:20260510T180000");
    expect(pm).toContain("SUMMARY:오후 반차");
  });

  it("does not include sensitive leave fields", () => {
    const ics = buildIcsCalendar({
      calendarName: "사내 휴가 일정",
      events: [baseEvent({ title: "개인 사유: 병원", isPrivate: true })],
      generatedAt: new Date("2026-05-03T00:00:00.000Z"),
    });

    expect(ics).toContain("SUMMARY:연차");
    expect(ics).not.toContain("개인 사유");
    expect(ics).not.toContain("증명자료");
    expect(ics).not.toContain("fileKey");
  });
});
