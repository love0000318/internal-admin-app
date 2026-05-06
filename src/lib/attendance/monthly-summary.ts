import { getPrisma } from "@/lib/db/prisma";
import { getManagedScopeForUser } from "@/lib/organization/permissions";
import type { RbacUser } from "@/lib/rbac/roles";

export type MonthlyAttendanceStatus =
  | "NORMAL"
  | "LATE"
  | "EARLY_LEAVE"
  | "ABSENT"
  | "ON_LEAVE"
  | "MISSING_CHECK_IN"
  | "MISSING_CHECK_OUT"
  | "HOLIDAY";

export type MonthlyAttendanceRow = {
  userId: string;
  employeeName: string;
  teamName: string | null;
  workDate: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  workedMinutes: number | null;
  status: MonthlyAttendanceStatus;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  approvedLeaveInfo: string | null;
  changeRequestStatus: string | null;
  warnings: string[];
};

export type MonthlyAttendanceSummary = {
  year: number;
  month: number;
  closeStatus: "DRAFT" | "CLOSED" | "REOPENED";
  workingDays: number;
  summary: {
    totalEmployees: number;
    normalCount: number;
    missingCheckInCount: number;
    missingCheckOutCount: number;
    lateCount: number;
    earlyLeaveCount: number;
    absentCount: number;
    onLeaveCount: number;
    holidayCount: number;
    changeRequestPendingCount: number;
  };
  rows: MonthlyAttendanceRow[];
};

type MonthlyAttendancePrisma = ReturnType<typeof getPrisma>;

export function assertValidYearMonth(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("INVALID_YEAR");
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("INVALID_MONTH");
  }
}

export function getMonthDateRange(year: number, month: number) {
  assertValidYearMonth(year, month);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start, end };
}

export function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function getYearMonthFromDate(value: Date) {
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 };
}

export async function isAttendanceMonthClosed(params: {
  year: number;
  month: number;
  prisma?: MonthlyAttendancePrisma;
}) {
  const prisma = params.prisma ?? getPrisma();
  const close = await prisma.attendanceMonthlyClose.findUnique({
    where: { year_month: { year: params.year, month: params.month } },
    select: { status: true },
  });

  return close?.status === "CLOSED";
}

export async function assertAttendanceMonthOpen(params: {
  year: number;
  month: number;
  prisma?: MonthlyAttendancePrisma;
}) {
  if (await isAttendanceMonthClosed(params)) {
    throw new Error("ATTENDANCE_MONTH_CLOSED");
  }
}

export async function getMonthlyAttendanceSummary(params: {
  year: number;
  month: number;
  actor: RbacUser;
  teamId?: string | null;
  userId?: string | null;
  status?: MonthlyAttendanceStatus | null;
  prisma?: MonthlyAttendancePrisma;
}): Promise<MonthlyAttendanceSummary> {
  assertValidYearMonth(params.year, params.month);
  const prisma = params.prisma ?? getPrisma();
  const { start, end } = getMonthDateRange(params.year, params.month);
  const scope = await getManagedScopeForUser(params.actor, "ATTENDANCE", prisma);

  if (scope.scope === "NONE" || scope.scope === "SELF") {
    throw new Error("ACCESS_DENIED");
  }

  let userIds =
    scope.scope === "ALL"
      ? undefined
      : scope.userIds.length > 0
        ? scope.userIds
        : ["__NO_VISIBLE_USERS__"];

  if (params.userId) {
    if (userIds && !userIds.includes(params.userId)) {
      throw new Error("ACCESS_DENIED");
    }
    userIds = [params.userId];
  }

  const [close, users, records, changeRequests, holidays, leaves] =
    await Promise.all([
      prisma.attendanceMonthlyClose.findUnique({
        where: { year_month: { year: params.year, month: params.month } },
      }),
      prisma.user.findMany({
        where: {
          status: "ACTIVE",
          role: { not: "EXTERNAL_PARTNER" },
          ...(userIds ? { id: { in: userIds } } : {}),
          ...(params.teamId ? { teamId: params.teamId } : {}),
        },
        include: { team: true },
        orderBy: [{ teamId: "asc" }, { name: "asc" }],
      }),
      prisma.attendanceRecord.findMany({
        where: {
          workDate: { gte: start, lte: end },
          ...(userIds ? { userId: { in: userIds } } : {}),
        },
      }),
      prisma.attendanceChangeRequest.findMany({
        where: {
          workDate: { gte: start, lte: end },
          ...(userIds ? { userId: { in: userIds } } : {}),
        },
      }),
      prisma.companyHoliday.findMany({
        where: {
          isEnabled: true,
          date: { gte: start, lte: end },
        },
      }),
      prisma.leaveRequest.findMany({
        where: {
          status: "APPROVED",
          startDate: { lte: end },
          endDate: { gte: start },
          ...(userIds ? { userId: { in: userIds } } : {}),
        },
        include: { customLeaveType: true },
      }),
    ]);

  const recordByUserDate = new Map(
    records.map((record) => [`${record.userId}:${toDateOnly(record.workDate)}`, record]),
  );
  const requestsByUserDate = new Map<string, typeof changeRequests>();
  for (const request of changeRequests) {
    const key = `${request.userId}:${toDateOnly(request.workDate)}`;
    requestsByUserDate.set(key, [...(requestsByUserDate.get(key) ?? []), request]);
  }
  const holidayDates = new Set(holidays.map((holiday) => toDateOnly(holiday.date)));
  const dateList = getDatesInMonth(start, end);
  const workingDates = dateList.filter(
    (date) => isWeekday(date) && !holidayDates.has(toDateOnly(date)),
  );
  const rows: MonthlyAttendanceRow[] = [];

  for (const user of users) {
    for (const date of dateList) {
      const dateOnly = toDateOnly(date);
      const key = `${user.id}:${dateOnly}`;
      const isHoliday = holidayDates.has(dateOnly);
      const isWorkingDay = isWeekday(date) && !isHoliday;
      const approvedLeave = leaves.find(
        (leave) =>
          leave.userId === user.id &&
          toDateOnly(leave.startDate) <= dateOnly &&
          toDateOnly(leave.endDate) >= dateOnly,
      );
      const record = recordByUserDate.get(key);
      const userRequests = requestsByUserDate.get(key) ?? [];
      const pendingRequest = userRequests.find((request) => request.status === "PENDING");
      const warnings: string[] = [];
      let status: MonthlyAttendanceStatus = "NORMAL";
      let approvedLeaveInfo: string | null = null;

      if (isHoliday) {
        status = "HOLIDAY";
      } else if (approvedLeave) {
        status = "ON_LEAVE";
        approvedLeaveInfo =
          approvedLeave.customLeaveType?.name ??
          (approvedLeave.halfDayPeriod ? "반차" : "승인 휴가");
        if (approvedLeave.halfDayPeriod) {
          warnings.push("반차 휴가는 근무시간 자동 계산 대상이 아닙니다.");
        }
      } else if (!isWorkingDay) {
        continue;
      } else if (!record) {
        status = "ABSENT";
        warnings.push("근무일에 출근 기록이 없습니다.");
      } else if (record.checkInAt && !record.checkOutAt) {
        status = "MISSING_CHECK_OUT";
        warnings.push("퇴근 기록이 누락되었습니다.");
      } else if (!record.checkInAt) {
        status = "MISSING_CHECK_IN";
        warnings.push("출근 기록이 누락되었습니다.");
      } else if (record.status === "LATE" || record.lateMinutes > 0) {
        status = "LATE";
      } else if (record.status === "EARLY_LEAVE" || record.earlyLeaveMinutes > 0) {
        status = "EARLY_LEAVE";
      } else {
        status = "NORMAL";
      }

      if (pendingRequest) {
        warnings.push("수정 요청 대기 중입니다.");
      }

      if (params.status && params.status !== status) {
        continue;
      }

      rows.push({
        userId: user.id,
        employeeName: user.name,
        teamName: user.team?.name ?? null,
        workDate: dateOnly,
        checkInAt: record?.checkInAt ?? null,
        checkOutAt: record?.checkOutAt ?? null,
        workedMinutes: record?.workedMinutes ?? null,
        status,
        lateMinutes: record?.lateMinutes ?? 0,
        earlyLeaveMinutes: record?.earlyLeaveMinutes ?? 0,
        approvedLeaveInfo,
        changeRequestStatus: pendingRequest?.status ?? null,
        warnings,
      });
    }
  }

  return {
    year: params.year,
    month: params.month,
    closeStatus: close?.status ?? "DRAFT",
    workingDays: workingDates.length,
    summary: {
      totalEmployees: users.length,
      normalCount: countRows(rows, "NORMAL"),
      missingCheckInCount: countRows(rows, "MISSING_CHECK_IN"),
      missingCheckOutCount: countRows(rows, "MISSING_CHECK_OUT"),
      lateCount: countRows(rows, "LATE"),
      earlyLeaveCount: countRows(rows, "EARLY_LEAVE"),
      absentCount: countRows(rows, "ABSENT"),
      onLeaveCount: countRows(rows, "ON_LEAVE"),
      holidayCount: countRows(rows, "HOLIDAY"),
      changeRequestPendingCount: changeRequests.filter(
        (request) => request.status === "PENDING",
      ).length,
    },
    rows,
  };
}

function getDatesInMonth(start: Date, end: Date) {
  const dates: Date[] = [];
  for (
    let current = new Date(start);
    current.getTime() <= end.getTime();
    current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1))
  ) {
    dates.push(current);
  }
  return dates;
}

function isWeekday(date: Date) {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

function countRows(rows: MonthlyAttendanceRow[], status: MonthlyAttendanceStatus) {
  return rows.filter((row) => row.status === status).length;
}
