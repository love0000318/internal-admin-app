import type { DateOnly, HalfDayPeriod, LeaveRequestInput } from "@/lib/leave/types";

type CalculateBusinessLeaveDaysParams = LeaveRequestInput & {
  companyHolidays?: DateOnly[];
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function parseDateOnly(value: DateOnly) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error(`Invalid date-only value: ${value}`);
  }

  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDateOnly(date: Date): DateOnly {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}` as DateOnly;
}

export function dateOnlyToDate(value: DateOnly) {
  return parseDateOnly(value);
}

export function dateToDateOnly(value: Date) {
  return formatDateOnly(value);
}

export function todayInSeoul(now = new Date()): DateOnly {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now) as DateOnly;
}

export function compareDateOnly(left: DateOnly, right: DateOnly) {
  return parseDateOnly(left).getTime() - parseDateOnly(right).getTime();
}

function isWeekend(date: Date) {
  const day = date.getUTCDay();

  return day === 0 || day === 6;
}

function isBusinessDay(date: Date, holidays: Set<DateOnly>) {
  return !isWeekend(date) && !holidays.has(formatDateOnly(date));
}

export function isHalfDayRequest(params: {
  startDate: DateOnly;
  endDate: DateOnly;
  halfDayPeriod?: HalfDayPeriod | null;
}): boolean {
  return params.halfDayPeriod === "AM" || params.halfDayPeriod === "PM";
}

export function calculateBusinessLeaveDays({
  startDate,
  endDate,
  halfDayPeriod,
  companyHolidays = [],
}: CalculateBusinessLeaveDaysParams): number {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (start.getTime() > end.getTime()) {
    throw new Error("Leave start date must be before or equal to end date.");
  }

  const holidays = new Set(companyHolidays);

  if (isHalfDayRequest({ startDate, endDate, halfDayPeriod })) {
    if (startDate !== endDate) {
      throw new Error("Half-day leave must use a single date.");
    }

    return isBusinessDay(start, holidays) ? 0.5 : 0;
  }

  let days = 0;

  for (
    let current = start;
    current.getTime() <= end.getTime();
    current = new Date(current.getTime() + ONE_DAY_MS)
  ) {
    if (isBusinessDay(current, holidays)) {
      days += 1;
    }
  }

  return days;
}

export function calculateHalfDayLeaveDays({
  startDate,
  endDate,
  halfDayPeriod,
  companyHolidays = [],
}: {
  startDate: DateOnly;
  endDate: DateOnly;
  halfDayPeriod?: HalfDayPeriod | null;
  companyHolidays?: DateOnly[];
}): number {
  if (startDate !== endDate) {
    throw new Error("Half-day leave must use a single date.");
  }

  if (halfDayPeriod !== "AM" && halfDayPeriod !== "PM") {
    throw new Error("Half-day leave requires AM or PM.");
  }

  return calculateBusinessLeaveDays({
    type: "HALF_DAY",
    startDate,
    endDate,
    halfDayPeriod,
    companyHolidays,
  });
}

export function assertValidLeaveDateRange({
  type,
  startDate,
  endDate,
  halfDayPeriod,
  today = todayInSeoul(),
  allowPast = false,
}: LeaveRequestInput & {
  today?: DateOnly;
  allowPast?: boolean;
}): void {
  if (compareDateOnly(startDate, endDate) > 0) {
    throw new Error("Leave start date must be before or equal to end date.");
  }

  if (!allowPast && compareDateOnly(startDate, today) < 0) {
    throw new Error("Past leave requests are not allowed.");
  }

  if (type === "HALF_DAY") {
    if (startDate !== endDate) {
      throw new Error("Half-day leave must use a single date.");
    }

    if (halfDayPeriod !== "AM" && halfDayPeriod !== "PM") {
      throw new Error("Half-day leave requires AM or PM.");
    }
  }
}

export function calculateRequestedLeaveDays(
  params: LeaveRequestInput & {
    companyHolidays?: DateOnly[];
  },
): number {
  if (params.type === "HALF_DAY") {
    return calculateHalfDayLeaveDays(params);
  }

  return calculateBusinessLeaveDays({
    ...params,
    halfDayPeriod: null,
  });
}
