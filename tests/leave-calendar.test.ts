import { describe, expect, it } from "vitest";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  buildLeaveCalendarEventsFromRequest,
  canViewCalendarLeaveDetail,
  canViewCalendarLeaveEvent,
  formatCalendarLeaveTitle,
  getLeaveCalendarEventColorClass,
  listCalendarLeaveEvents,
  type CalendarLeaveRequest,
} from "@/lib/leave/calendar";
import type { RbacUser } from "@/lib/rbac/roles";

const definitions = new Map([
  [
    "ANNUAL",
    {
      id: "annual-type",
      code: "ANNUAL",
      name: "연차",
      visibility: "PUBLIC_WITH_TYPE" as const,
    },
  ],
  [
    "SICK",
    {
      id: "sick-type",
      code: "SICK",
      name: "병가",
      visibility: "PUBLIC_AS_LEAVE" as const,
    },
  ],
  [
    "BEREAVEMENT",
    {
      id: "bereavement-type",
      code: "BEREAVEMENT",
      name: "경조사",
      visibility: "PRIVATE_TO_APPROVERS" as const,
    },
  ],
]);

const owner: RbacUser = { id: "owner", role: "OWNER", status: "ACTIVE" };
const lead: RbacUser = {
  id: "lead",
  role: "LEAD",
  status: "ACTIVE",
  managedTeamIds: ["team-a"],
};
const outsideLead: RbacUser = {
  id: "outside-lead",
  role: "LEAD",
  status: "ACTIVE",
  managedTeamIds: ["team-b"],
};
const manager: RbacUser = {
  id: "manager",
  role: "MANAGER",
  status: "ACTIVE",
  teamId: "team-a",
};
const otherTeamManager: RbacUser = {
  id: "other-manager",
  role: "MANAGER",
  status: "ACTIVE",
  teamId: "team-b",
};
const externalPartner: RbacUser = {
  id: "external",
  role: "EXTERNAL_PARTNER",
  status: "ACTIVE",
};

function request(overrides: Partial<CalendarLeaveRequest> = {}): CalendarLeaveRequest {
  return {
    id: "request-1",
    userId: "employee-1",
    type: "ANNUAL",
    leaveTypeId: null,
    status: "APPROVED",
    startDate: new Date("2026-05-04T00:00:00.000Z"),
    endDate: new Date("2026-05-06T00:00:00.000Z"),
    halfDayPeriod: null,
    dayCount: new Prisma.Decimal(3),
    user: {
      id: "employee-1",
      name: "양현지",
      role: "MANAGER",
      status: "ACTIVE",
      teamId: "team-a",
      team: { id: "team-a", name: "운영팀" },
    },
    customLeaveType: null,
    ...overrides,
  };
}

describe("leave calendar visibility", () => {
  it("formats PUBLIC_WITH_TYPE events with the leave type", () => {
    expect(
      formatCalendarLeaveTitle({
        actor: manager,
        request: request(),
        leaveTypeLabel: "연차",
        visibility: "PUBLIC_WITH_TYPE",
      }),
    ).toBe("양현지 - 연차");
  });

  it("formats PUBLIC_AS_LEAVE events as generic leave for peers", () => {
    expect(
      formatCalendarLeaveTitle({
        actor: manager,
        request: request({ type: "SICK" }),
        leaveTypeLabel: "병가",
        visibility: "PUBLIC_AS_LEAVE",
      }),
    ).toBe("양현지 - 휴가");
  });

  it("shows half-day period in event titles", () => {
    expect(
      formatCalendarLeaveTitle({
        actor: manager,
        request: request({
          type: "ANNUAL",
          halfDayPeriod: "PM",
          startDate: new Date("2026-05-04T00:00:00.000Z"),
          endDate: new Date("2026-05-04T00:00:00.000Z"),
          dayCount: new Prisma.Decimal(0.5),
        }),
        leaveTypeLabel: "반차",
        visibility: "PUBLIC_WITH_TYPE",
      }),
    ).toBe("양현지 - 반차 오후");
  });

  it("shows approved private leave as a limited public calendar event", () => {
    expect(
      canViewCalendarLeaveEvent({
        actor: manager,
        request: request({ type: "BEREAVEMENT" }),
        visibility: "PRIVATE_TO_APPROVERS",
      }),
    ).toBe(true);

    const events = buildLeaveCalendarEventsFromRequest({
      actor: manager,
      request: request({ type: "BEREAVEMENT" }),
      definitionsByCode: definitions,
    });

    expect(events).toHaveLength(3);
    expect(events[0].isPrivate).toBe(true);
    expect(events[0].leaveTypeLabel).toBeUndefined();
  });

  it("allows OWNER and scoped LEAD to see private and pending requests", () => {
    const pendingPrivate = request({
      type: "BEREAVEMENT",
      status: "PENDING",
    });

    expect(
      canViewCalendarLeaveEvent({
        actor: owner,
        request: pendingPrivate,
        visibility: "PRIVATE_TO_APPROVERS",
      }),
    ).toBe(true);
    expect(
      canViewCalendarLeaveEvent({
        actor: lead,
        request: pendingPrivate,
        visibility: "PRIVATE_TO_APPROVERS",
      }),
    ).toBe(true);
    expect(
      canViewCalendarLeaveEvent({
        actor: outsideLead,
        request: pendingPrivate,
        visibility: "PRIVATE_TO_APPROVERS",
      }),
    ).toBe(false);
  });

  it("allows internal users to see approved company leave but not pending peer leave", () => {
    expect(
      canViewCalendarLeaveEvent({
        actor: otherTeamManager,
        request: request(),
        visibility: "PUBLIC_WITH_TYPE",
      }),
    ).toBe(true);
    expect(
      canViewCalendarLeaveEvent({
        actor: manager,
        request: request(),
        visibility: "PUBLIC_WITH_TYPE",
      }),
    ).toBe(true);
    expect(
      canViewCalendarLeaveEvent({
        actor: outsideLead,
        request: request(),
        visibility: "PUBLIC_WITH_TYPE",
      }),
    ).toBe(true);
    expect(
      canViewCalendarLeaveEvent({
        actor: manager,
        request: request({ status: "PENDING" }),
        visibility: "PUBLIC_WITH_TYPE",
      }),
    ).toBe(false);
    expect(
      canViewCalendarLeaveEvent({
        actor: externalPartner,
        request: request(),
        visibility: "PUBLIC_WITH_TYPE",
      }),
    ).toBe(false);
  });

  it("allows detail only to requester, OWNER, and scoped LEAD", () => {
    expect(canViewCalendarLeaveDetail(owner, request())).toBe(true);
    expect(canViewCalendarLeaveDetail(lead, request())).toBe(true);
    expect(canViewCalendarLeaveDetail(manager, request())).toBe(false);
    expect(canViewCalendarLeaveDetail({ ...manager, id: "employee-1" }, request())).toBe(true);
  });

  it("splits date ranges into daily events without exposing reason or attachment data", () => {
    const events = buildLeaveCalendarEventsFromRequest({
      actor: owner,
      request: request(),
      definitionsByCode: definitions,
    });

    expect(events.map((event) => event.date)).toEqual([
      "2026-05-04",
      "2026-05-05",
      "2026-05-06",
    ]);
    expect(events[0]).not.toHaveProperty("reason");
    expect(events[0]).not.toHaveProperty("attachmentStatus");
  });

  it("shows approved birthday half-day custom leave on the calendar", () => {
    const events = buildLeaveCalendarEventsFromRequest({
      actor: owner,
      request: request({
        type: "HALF_DAY",
        leaveTypeId: "birthday-half-day-type",
        startDate: new Date("2026-05-28T00:00:00.000Z"),
        endDate: new Date("2026-05-28T00:00:00.000Z"),
        halfDayPeriod: "PM",
        dayCount: new Prisma.Decimal(0.5),
        customLeaveType: {
          id: "birthday-half-day-type",
          code: "BIRTHDAY_HALF_DAY",
          name: "생일 반차",
          visibility: "PUBLIC_WITH_TYPE",
        },
      }),
      definitionsByCode: definitions,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      date: "2026-05-28",
      leaveTypeCode: "BIRTHDAY_HALF_DAY",
      leaveTypeLabel: "생일 반차",
      amount: 0.5,
      detailUrl: "/leaves/approvals/request-1",
    });
  });

  it("colors annual and half-day events without exposing hidden leave types", () => {
    expect(
      getLeaveCalendarEventColorClass({
        leaveTypeCode: "ANNUAL",
        leaveTypeLabel: "연차",
        isPrivate: false,
      }),
    ).toContain("bg-blue-100");
    expect(
      getLeaveCalendarEventColorClass({
        leaveTypeCode: "HALF_DAY",
        leaveTypeLabel: "반차",
        isPrivate: false,
      }),
    ).toContain("bg-orange-100");
    expect(
      getLeaveCalendarEventColorClass({
        leaveTypeCode: "SICK",
        leaveTypeLabel: "병가",
        isPrivate: true,
      }),
    ).toContain("bg-slate-100");
    expect(
      getLeaveCalendarEventColorClass({
        leaveTypeCode: "BIRTHDAY_HALF_DAY",
        leaveTypeLabel: "생일 반차",
        isPrivate: false,
      }),
    ).toContain("bg-purple-100");
  });

  it("lists approved company events for MANAGER and LEAD across teams", async () => {
    const otherTeamApproved = request({
      id: "request-other-team",
      userId: "employee-2",
      user: {
        id: "employee-2",
        name: "다른팀 구성원",
        role: "MANAGER",
        status: "ACTIVE",
        teamId: "team-b",
        team: { id: "team-b", name: "다른팀" },
      },
    });
    const prisma = fakeCalendarPrisma([request(), otherTeamApproved]);

    const managerEvents = await listCalendarLeaveEvents({
      actor: manager,
      fromDate: "2026-05-01",
      toDate: "2026-05-31",
      scope: "ALL",
      statuses: ["APPROVED"],
      prisma,
    });
    const leadEvents = await listCalendarLeaveEvents({
      actor: lead,
      fromDate: "2026-05-01",
      toDate: "2026-05-31",
      scope: "ALL",
      statuses: ["APPROVED"],
      prisma,
    });

    expect(new Set(managerEvents.map((event) => event.leaveRequestId))).toEqual(
      new Set(["request-1", "request-other-team"]),
    );
    expect(new Set(leadEvents.map((event) => event.leaveRequestId))).toEqual(
      new Set(["request-1", "request-other-team"]),
    );
  });

  it("does not list pending, rejected, or cancelled leave on the all-company calendar", async () => {
    const hiddenRequests = [
      request({ id: "pending", status: "PENDING" }),
      request({ id: "rejected", status: "REJECTED" }),
      request({ id: "cancelled", status: "CANCELLED" }),
      request({ id: "approved", status: "APPROVED" }),
    ];
    const events = await listCalendarLeaveEvents({
      actor: manager,
      fromDate: "2026-05-01",
      toDate: "2026-05-31",
      scope: "ALL",
      statuses: ["APPROVED", "PENDING", "REJECTED", "CANCELLED"],
      prisma: fakeCalendarPrisma(hiddenRequests),
    });

    expect(new Set(events.map((event) => event.leaveRequestId))).toEqual(
      new Set(["approved"]),
    );
  });
});

function fakeCalendarPrisma(requests: CalendarLeaveRequest[]) {
  return {
    leaveTypeDefinition: {
      findMany: async () => Array.from(definitions.values()),
    },
    leaveRequest: {
      findMany: async (args: { where: { status: { in: string[] } } }) =>
        requests.filter((item) => args.where.status.in.includes(item.status)),
    },
  } as unknown as PrismaClient;
}
