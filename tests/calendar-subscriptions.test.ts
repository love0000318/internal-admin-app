import { describe, expect, it } from "vitest";

import {
  buildIcsCalendar,
  escapeIcsText,
  nextDateOnly,
} from "@/lib/calendar-subscriptions/ics";
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

    expect(ics).toContain("DTSTART;VALUE=DATE:20260510");
    expect(ics).toContain("DTEND;VALUE=DATE:20260511");
    expect(ics).toContain("SUMMARY:김하나 - 연차");
  });

  it("uses time ranges for half-day events", () => {
    const am = buildIcsCalendar({
      calendarName: "사내 휴가 일정",
      events: [baseEvent({ title: "김하나 - 반차 오전", halfDayPeriod: "AM" })],
      generatedAt: new Date("2026-05-03T00:00:00.000Z"),
    });
    const pm = buildIcsCalendar({
      calendarName: "사내 휴가 일정",
      events: [baseEvent({ title: "김하나 - 반차 오후", halfDayPeriod: "PM" })],
      generatedAt: new Date("2026-05-03T00:00:00.000Z"),
    });

    expect(am).toContain("DTSTART;TZID=Asia/Seoul:20260510T090000");
    expect(am).toContain("DTEND;TZID=Asia/Seoul:20260510T130000");
    expect(pm).toContain("DTSTART;TZID=Asia/Seoul:20260510T140000");
    expect(pm).toContain("DTEND;TZID=Asia/Seoul:20260510T180000");
  });

  it("does not include sensitive leave fields", () => {
    const ics = buildIcsCalendar({
      calendarName: "사내 휴가 일정",
      events: [baseEvent({ title: "김하나 - 휴가", isPrivate: true })],
      generatedAt: new Date("2026-05-03T00:00:00.000Z"),
    });

    expect(ics).toContain("SUMMARY:김하나 - 휴가");
    expect(ics).not.toContain("사유");
    expect(ics).not.toContain("증명자료");
    expect(ics).not.toContain("fileKey");
  });
});
