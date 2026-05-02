import {
  compareDateOnly,
  dateOnlyToDate,
  dateToDateOnly,
} from "@/lib/leave/calculate-business-days";
import type { DateOnly, HalfDayPeriod } from "@/lib/leave/types";

export const ANNUAL_USE_PLAN_USAGE_TYPES = [
  "FULL_DAY",
  "AM_HALF_DAY",
  "PM_HALF_DAY",
] as const;

export type AnnualUsePlanUsageType =
  (typeof ANNUAL_USE_PLAN_USAGE_TYPES)[number];

export type AnnualUsePlanCalculationResult = {
  amount: number;
  countedDates: DateOnly[];
  excludedDates: DateOnly[];
};

export function annualUsePlanUsageTypeLabel(type: AnnualUsePlanUsageType) {
  switch (type) {
    case "AM_HALF_DAY":
      return "오전 반차";
    case "PM_HALF_DAY":
      return "오후 반차";
    default:
      return "종일";
  }
}

export function usageTypeToHalfDayPeriod(
  type: AnnualUsePlanUsageType,
): HalfDayPeriod | null {
  if (type === "AM_HALF_DAY") {
    return "AM";
  }

  if (type === "PM_HALF_DAY") {
    return "PM";
  }

  return null;
}

export function halfDayPeriodToUsageType(
  value: HalfDayPeriod | null | undefined,
): AnnualUsePlanUsageType {
  if (value === "AM") {
    return "AM_HALF_DAY";
  }

  if (value === "PM") {
    return "PM_HALF_DAY";
  }

  return "FULL_DAY";
}

function addDays(value: DateOnly, days: number): DateOnly {
  const date = dateOnlyToDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateToDateOnly(date);
}

function isWeekend(value: DateOnly) {
  const day = dateOnlyToDate(value).getUTCDay();

  return day === 0 || day === 6;
}

function isDeductibleDate({
  date,
  holidays,
  includeHolidaysInDeduction,
}: {
  date: DateOnly;
  holidays: Set<DateOnly>;
  includeHolidaysInDeduction: boolean;
}) {
  if (includeHolidaysInDeduction) {
    return true;
  }

  return !isWeekend(date) && !holidays.has(date);
}

export function calculateAnnualUsePlanItemAmount({
  startDate,
  endDate,
  usageType,
  companyHolidays = [],
  includeHolidaysInDeduction = false,
}: {
  startDate: DateOnly;
  endDate: DateOnly;
  usageType: AnnualUsePlanUsageType;
  companyHolidays?: DateOnly[];
  includeHolidaysInDeduction?: boolean;
}): AnnualUsePlanCalculationResult {
  if (!startDate || !endDate) {
    throw new Error("사용계획 시작일과 종료일을 입력해 주세요.");
  }

  if (compareDateOnly(startDate, endDate) > 0) {
    throw new Error("사용계획 시작일은 종료일보다 늦을 수 없습니다.");
  }

  const holidays = new Set(companyHolidays);

  if (usageType === "AM_HALF_DAY" || usageType === "PM_HALF_DAY") {
    if (startDate !== endDate) {
      throw new Error("반차 사용계획은 시작일과 종료일이 같아야 합니다.");
    }

    if (
      !isDeductibleDate({
        date: startDate,
        holidays,
        includeHolidaysInDeduction,
      })
    ) {
      throw new Error("휴일에는 반차 사용계획을 제출할 수 없습니다.");
    }

    return {
      amount: 0.5,
      countedDates: [startDate],
      excludedDates: [],
    };
  }

  const countedDates: DateOnly[] = [];
  const excludedDates: DateOnly[] = [];

  for (
    let current = startDate;
    compareDateOnly(current, endDate) <= 0;
    current = addDays(current, 1)
  ) {
    if (
      isDeductibleDate({
        date: current,
        holidays,
        includeHolidaysInDeduction,
      })
    ) {
      countedDates.push(current);
    } else {
      excludedDates.push(current);
    }
  }

  if (countedDates.length === 0) {
    throw new Error("사용계획 기간에 차감 가능한 영업일이 없습니다.");
  }

  return {
    amount: countedDates.length,
    countedDates,
    excludedDates,
  };
}
