import { describe, expect, it } from "vitest";

import {
  assertAttendanceMonthOpen,
  getMonthDateRange,
  getMonthlyAttendanceSummary,
} from "@/lib/attendance/monthly-summary";
import type { RbacUser } from "@/lib/rbac/roles";

const owner: RbacUser = { id: "owner", role: "OWNER", status: "ACTIVE" };
const lead: RbacUser = { id: "lead", role: "LEAD", status: "ACTIVE" };
const manager: RbacUser = { id: "employee-a", role: "MANAGER", status: "ACTIVE" };

describe("attendance monthly close", () => {
  it("calculates monthly attendance summary with holidays, leave, missing checkout, absence, and pending requests", async () => {
    const prisma = createAttendancePrismaMock();
    const summary = await getMonthlyAttendanceSummary({
      year: 2026,
      month: 5,
      actor: owner,
      prisma: prisma as never,
    });

    expect(summary.closeStatus).toBe("DRAFT");
    expect(summary.workingDays).toBe(20);
    expect(summary.summary.totalEmployees).toBe(2);
    expect(summary.summary.holidayCount).toBe(2);
    expect(summary.summary.onLeaveCount).toBe(1);
    expect(summary.summary.missingCheckOutCount).toBe(1);
    expect(summary.summary.absentCount).toBeGreaterThan(0);
    expect(summary.summary.changeRequestPendingCount).toBe(1);
    expect(
      summary.rows.find(
        (row) => row.userId === "employee-a" && row.workDate === "2026-05-08",
      )?.status,
    ).toBe("ON_LEAVE");
  });

  it("keeps LEAD monthly summary scoped to managed teams", async () => {
    const prisma = createAttendancePrismaMock();
    const summary = await getMonthlyAttendanceSummary({
      year: 2026,
      month: 5,
      actor: lead,
      prisma: prisma as never,
    });

    expect(summary.summary.totalEmployees).toBe(1);
    expect(new Set(summary.rows.map((row) => row.userId))).toEqual(
      new Set(["employee-a"]),
    );
  });

  it("blocks MANAGER from admin monthly summary", async () => {
    await expect(
      getMonthlyAttendanceSummary({
        year: 2026,
        month: 5,
        actor: manager,
        prisma: createAttendancePrismaMock() as never,
      }),
    ).rejects.toThrow("ACCESS_DENIED");
  });

  it("detects closed months for change request blocking", async () => {
    const prisma = createAttendancePrismaMock({ closeStatus: "CLOSED" });

    await expect(
      assertAttendanceMonthOpen({ year: 2026, month: 5, prisma: prisma as never }),
    ).rejects.toThrow("ATTENDANCE_MONTH_CLOSED");
  });

  it("validates month date ranges", () => {
    const range = getMonthDateRange(2026, 5);

    expect(range.start.toISOString().slice(0, 10)).toBe("2026-05-01");
    expect(range.end.toISOString().slice(0, 10)).toBe("2026-05-31");
    expect(() => getMonthDateRange(2026, 13)).toThrow("INVALID_MONTH");
  });
});

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function createAttendancePrismaMock(options?: { closeStatus?: "DRAFT" | "CLOSED" | "REOPENED" }) {
  const users = [
    {
      id: "employee-a",
      name: "Employee A",
      role: "MANAGER",
      status: "ACTIVE",
      teamId: "team-a",
      team: { id: "team-a", name: "Team A" },
    },
    {
      id: "employee-b",
      name: "Employee B",
      role: "MANAGER",
      status: "ACTIVE",
      teamId: "team-b",
      team: { id: "team-b", name: "Team B" },
    },
  ];
  const teams = [
    { id: "team-a", parentTeamId: null, leadUserId: "lead", status: "ACTIVE" },
    { id: "team-b", parentTeamId: null, leadUserId: null, status: "ACTIVE" },
  ];

  return {
    team: {
      findMany: async (args?: { where?: { leadUserId?: string; status?: "ACTIVE" } }) => {
        let result = teams;
        if (args?.where?.status) {
          result = result.filter((team) => team.status === args.where?.status);
        }
        if (args?.where?.leadUserId) {
          result = result.filter((team) => team.leadUserId === args.where?.leadUserId);
        }
        return result;
      },
    },
    user: {
      findMany: async (args?: {
        where?: {
          id?: { in?: string[] };
          teamId?: string | { in?: string[] };
          status?: string;
          role?: { not?: string };
        };
      }) => {
        let result = users;
        if (args?.where?.id?.in) {
          result = result.filter((user) => args.where?.id?.in?.includes(user.id));
        }
        if (typeof args?.where?.teamId === "string") {
          result = result.filter((user) => user.teamId === args.where?.teamId);
        }
        if (args?.where?.teamId && typeof args.where.teamId !== "string") {
          result = result.filter((user) =>
            args.where?.teamId && typeof args.where.teamId !== "string"
              ? args.where.teamId.in?.includes(user.teamId)
              : true,
          );
        }
        if (args?.where?.role?.not) {
          result = result.filter((user) => user.role !== args.where?.role?.not);
        }
        return result;
      },
    },
    attendanceMonthlyClose: {
      findUnique: async () =>
        options?.closeStatus
          ? { id: "close-1", year: 2026, month: 5, status: options.closeStatus }
          : null,
    },
    attendanceRecord: {
      findMany: async () => [
        {
          id: "record-1",
          userId: "employee-a",
          workDate: date("2026-05-04"),
          checkInAt: new Date("2026-05-04T00:05:00.000Z"),
          checkOutAt: null,
          workedMinutes: null,
          status: "NORMAL",
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
        },
        {
          id: "record-2",
          userId: "employee-b",
          workDate: date("2026-05-06"),
          checkInAt: new Date("2026-05-06T00:30:00.000Z"),
          checkOutAt: new Date("2026-05-06T09:00:00.000Z"),
          workedMinutes: 510,
          status: "LATE",
          lateMinutes: 30,
          earlyLeaveMinutes: 0,
        },
      ],
    },
    attendanceChangeRequest: {
      findMany: async () => [
        {
          id: "change-1",
          userId: "employee-a",
          workDate: date("2026-05-04"),
          status: "PENDING",
        },
      ],
    },
    companyHoliday: {
      findMany: async () => [
        {
          id: "holiday-1",
          date: date("2026-05-05"),
          name: "Holiday",
          isEnabled: true,
        },
      ],
    },
    leaveRequest: {
      findMany: async () => [
        {
          id: "leave-1",
          userId: "employee-a",
          startDate: date("2026-05-08"),
          endDate: date("2026-05-08"),
          halfDayPeriod: null,
          customLeaveType: null,
        },
      ],
    },
  };
}
