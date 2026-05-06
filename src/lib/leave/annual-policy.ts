import { z } from "zod";

import type { AnnualLeavePolicy, Prisma, PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  dateOnlyToDate,
  dateToDateOnly,
  formatDateOnly,
} from "@/lib/leave/calculate-business-days";
import { getFiscalYearLeaveExpirationDate } from "@/lib/leave/fiscal-year-expiration";
import type { DateOnly } from "@/lib/leave/types";

export const DEFAULT_ANNUAL_LEAVE_POLICY = {
  isEnabled: true,
  grantBasis: "FISCAL_YEAR" as const,
  fiscalYearStartMonth: 1,
  fiscalYearStartDay: 1,
  usageUnit: "HALF_DAY" as const,
  allowAdvanceUse: false,
  approvalOnRequest: true,
  approvalOnCancel: false,
  monthlyLeaveEnabled: true,
  monthlyLeaveAmount: 1,
  monthlyLeaveGrantRule: "MONTHLY_FULL_ATTENDANCE" as const,
  firstFiscalYearGrantRule: "NEEDS_CONFIRMATION" as const,
  annualLeaveEnabled: true,
  baseAnnualDays: 15,
  maxAnnualDays: 25,
  additionalGrantEnabled: true,
  expirationEnabled: true,
  annualExpirationMonths: 12,
  monthlyExpirationMonths: 12,
  carryOverAllowed: false,
  promotionEnabled: true,
  memberReminderEnabled: true,
  managerReminderEnabled: false,
  usePlanReminderDaysBefore: 10,
  annualPromotionMonthsBeforeExpiration: 6,
  monthlyPromotionFirstMonthsBeforeExpiration: 3,
  monthlyPromotionSecondMonthsBeforeExpiration: 1,
  memo: "첫 회계연도 부여 방식은 회사 기준 최종 확인이 필요합니다.",
};

export const annualLeavePolicySchema = z.object({
  id: z.string().min(1),
  isEnabled: z.coerce.boolean(),
  grantBasis: z.enum(["HIRE_DATE", "FISCAL_YEAR"]),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
  fiscalYearStartDay: z.coerce.number().int().min(1).max(31),
  usageUnit: z.enum(["DAY", "HALF_DAY", "HOUR"]),
  allowAdvanceUse: z.coerce.boolean(),
  approvalOnRequest: z.coerce.boolean(),
  approvalOnCancel: z.coerce.boolean(),
  monthlyLeaveEnabled: z.coerce.boolean(),
  monthlyLeaveAmount: z.coerce.number().min(0).max(31),
  monthlyLeaveGrantRule: z.enum([
    "MONTHLY_FULL_ATTENDANCE",
    "FRONTLOAD_ON_HIRE",
    "DISABLED",
  ]),
  firstFiscalYearGrantRule: z.enum([
    "NEEDS_CONFIRMATION",
    "PRORATED_BY_HIRE_DATE",
    "GRANT_REMAINING_MONTHS",
    "COMPANY_CUSTOM",
  ]),
  annualLeaveEnabled: z.coerce.boolean(),
  baseAnnualDays: z.coerce.number().min(0).max(365),
  maxAnnualDays: z.coerce.number().min(0).max(365),
  additionalGrantEnabled: z.coerce.boolean(),
  expirationEnabled: z.coerce.boolean(),
  annualExpirationMonths: z.coerce.number().int().min(0).max(120),
  monthlyExpirationMonths: z.coerce.number().int().min(0).max(120),
  carryOverAllowed: z.coerce.boolean(),
  promotionEnabled: z.coerce.boolean(),
  promotionApproverUserId: z.string().optional().nullable(),
  memberReminderEnabled: z.coerce.boolean(),
  managerReminderEnabled: z.coerce.boolean(),
  usePlanReminderDaysBefore: z.coerce.number().int().min(0).max(365),
  annualPromotionMonthsBeforeExpiration: z.coerce.number().int().min(0).max(24),
  monthlyPromotionFirstMonthsBeforeExpiration: z.coerce.number().int().min(0).max(24),
  monthlyPromotionSecondMonthsBeforeExpiration: z.coerce.number().int().min(0).max(24),
  memo: z.string().max(2000).optional().nullable(),
});

type AnnualPolicyDb = PrismaClient | Prisma.TransactionClient;

export async function ensureDefaultAnnualLeavePolicy(
  prisma: AnnualPolicyDb = getPrisma(),
) {
  const existing = await prisma.annualLeavePolicy.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    return existing;
  }

  return prisma.annualLeavePolicy.create({
    data: DEFAULT_ANNUAL_LEAVE_POLICY,
  });
}

export async function getActiveAnnualLeavePolicy(
  prisma: AnnualPolicyDb = getPrisma(),
) {
  const policy = await prisma.annualLeavePolicy.findFirst({
    orderBy: { createdAt: "asc" },
    include: { promotionApprover: true },
  });

  return policy ?? ensureDefaultAnnualLeavePolicy(prisma);
}

function parseDateOnly(value: DateOnly) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error(`Invalid date-only value: ${value}`);
  }

  return { year, month, day };
}

function addMonths(value: DateOnly, months: number): DateOnly {
  const { year, month, day } = parseDateOnly(value);
  const monthIndex = month - 1 + months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonthIndex = ((monthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonthIndex + 1, 0),
  ).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);

  return formatDateOnly(
    new Date(Date.UTC(targetYear, targetMonthIndex, clampedDay)),
  );
}

function addDays(value: DateOnly, days: number): DateOnly {
  const date = dateOnlyToDate(value);
  date.setUTCDate(date.getUTCDate() + days);

  return formatDateOnly(date);
}

function completedYears(from: DateOnly, to: DateOnly) {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  let years = end.year - start.year;

  if (end.month < start.month || (end.month === start.month && end.day < start.day)) {
    years -= 1;
  }

  return Math.max(0, years);
}

function daysBetween(start: DateOnly, end: DateOnly) {
  const startDate = dateOnlyToDate(start);
  const endDate = dateOnlyToDate(end);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return Math.floor((endDate.getTime() - startDate.getTime()) / millisecondsPerDay);
}

function dateOnlyMax(first: DateOnly, second: DateOnly) {
  return first > second ? first : second;
}

function dateOnlyMin(first: DateOnly, second: DateOnly) {
  return first < second ? first : second;
}

function completedMonths(from: DateOnly, to: DateOnly) {
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  let months = (end.year - start.year) * 12 + (end.month - start.month);

  if (end.day < start.day) {
    months -= 1;
  }

  return Math.max(0, months);
}

export function calculateFiscalYearDateRange(
  policy: Pick<AnnualLeavePolicy, "fiscalYearStartMonth" | "fiscalYearStartDay">,
  year: number,
) {
  const start = `${year}-${String(policy.fiscalYearStartMonth).padStart(2, "0")}-${String(
    policy.fiscalYearStartDay,
  ).padStart(2, "0")}` as DateOnly;
  const end = addDays(addMonths(start, 12), -1);

  return { start, end };
}

export function calculateLongServiceAdditionalDays({
  hireDate,
  asOfDate,
  policy,
}: {
  hireDate: DateOnly | null | undefined;
  asOfDate: DateOnly;
  policy: Pick<AnnualLeavePolicy, "additionalGrantEnabled" | "maxAnnualDays" | "baseAnnualDays">;
}) {
  if (!hireDate || !policy.additionalGrantEnabled) {
    return 0;
  }

  const years = completedYears(hireDate, asOfDate);

  if (years < 3) {
    return 0;
  }

  const additionalDays = Math.floor((years - 1) / 2);
  return Math.min(additionalDays, Math.max(0, policy.maxAnnualDays - policy.baseAnnualDays));
}

export function calculateMonthlyLeaveEntitlement({
  hireDate,
  asOfDate,
  policy,
}: {
  hireDate: DateOnly | null | undefined;
  asOfDate: DateOnly;
  policy: Pick<
    AnnualLeavePolicy,
    "monthlyLeaveEnabled" | "monthlyLeaveAmount" | "monthlyLeaveGrantRule"
  >;
}) {
  if (!hireDate || !policy.monthlyLeaveEnabled || policy.monthlyLeaveGrantRule === "DISABLED") {
    return 0;
  }

  const years = completedYears(hireDate, asOfDate);

  if (years >= 1) {
    return 0;
  }

  // Until attendance is integrated, the system assumes full attendance and caps the first-year monthly grant at 11 days.
  return Math.min(completedMonths(hireDate, asOfDate) * policy.monthlyLeaveAmount, 11);
}

export function roundUpToHalfDay(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.ceil(value * 2) / 2;
}

export function calculateWorkedDaysInYear({
  hireDate,
  year,
  endDate,
}: {
  hireDate: DateOnly;
  year: number;
  endDate?: DateOnly | null;
}) {
  const yearStart = `${year}-01-01` as DateOnly;
  const yearEnd = `${year}-12-31` as DateOnly;
  const workedFrom = dateOnlyMax(hireDate, yearStart);
  const workedTo = dateOnlyMin(endDate ?? yearEnd, yearEnd);

  if (workedFrom > workedTo) {
    return 0;
  }

  return daysBetween(workedFrom, workedTo) + 1;
}

export function calculateUnderOneYearFiscalProratedLeave({
  hireDate,
  fiscalYear,
  asOfDate,
  baseAnnualDays = 15,
}: {
  hireDate: DateOnly | null | undefined;
  fiscalYear: number;
  asOfDate: DateOnly;
  baseAnnualDays?: number;
}) {
  const previousYear = fiscalYear - 1;
  const notEligible = {
    isEligible: false,
    previousYear,
    workedDaysInPreviousYear: 0,
    rawDays: 0,
    roundedDays: 0,
    roundingPolicy: "CEIL_TO_HALF_DAY" as const,
  };

  if (!hireDate) {
    return { ...notEligible, reason: "MISSING_HIRE_DATE" as const };
  }

  if (daysBetween(hireDate, asOfDate) >= 365) {
    return { ...notEligible, reason: "SERVICE_DAYS_AT_LEAST_365" as const };
  }

  if (!hireDate.startsWith(`${previousYear}-`)) {
    return { ...notEligible, reason: "NOT_PREVIOUS_YEAR_NEW_HIRE" as const };
  }

  const workedDaysInPreviousYear = calculateWorkedDaysInYear({
    hireDate,
    year: previousYear,
  });
  const rawDays = (baseAnnualDays * workedDaysInPreviousYear) / 365;
  const roundedDays = roundUpToHalfDay(rawDays);

  return {
    isEligible: roundedDays > 0,
    previousYear,
    workedDaysInPreviousYear,
    rawDays,
    roundedDays,
    roundingPolicy: "CEIL_TO_HALF_DAY" as const,
    reason: roundedDays > 0 ? ("ELIGIBLE" as const) : ("NO_WORKED_DAYS" as const),
  };
}

export function calculateAnnualLeaveEntitlement({
  hireDate,
  asOfDate,
  policy,
  fiscalYear,
  includeUnderOneYearFiscalProratedLeave = false,
}: {
  hireDate: DateOnly | null | undefined;
  asOfDate: DateOnly;
  policy: Pick<
    AnnualLeavePolicy,
    | "annualLeaveEnabled"
    | "baseAnnualDays"
    | "maxAnnualDays"
    | "additionalGrantEnabled"
    | "monthlyLeaveEnabled"
    | "monthlyLeaveAmount"
    | "monthlyLeaveGrantRule"
  >;
  fiscalYear?: number;
  includeUnderOneYearFiscalProratedLeave?: boolean;
}) {
  if (!hireDate || !policy.annualLeaveEnabled) {
    return 0;
  }

  const years = completedYears(hireDate, asOfDate);

  if (years < 1) {
    const monthlyLeaveEntitlement = calculateMonthlyLeaveEntitlement({
      hireDate,
      asOfDate,
      policy,
    });
    const proratedLeaveEntitlement =
      includeUnderOneYearFiscalProratedLeave && fiscalYear
        ? calculateUnderOneYearFiscalProratedLeave({
            hireDate,
            fiscalYear,
            asOfDate,
            baseAnnualDays: policy.baseAnnualDays,
          }).roundedDays
        : 0;

    return monthlyLeaveEntitlement + proratedLeaveEntitlement;
  }

  const additionalDays = calculateLongServiceAdditionalDays({
    hireDate,
    asOfDate,
    policy,
  });

  return Math.min(policy.baseAnnualDays + additionalDays, policy.maxAnnualDays);
}

export function calculateAnnualLeaveExpirationDate({
  fiscalYearEnd,
  policy,
}: {
  fiscalYearEnd: DateOnly;
  policy: Pick<AnnualLeavePolicy, "expirationEnabled" | "annualExpirationMonths">;
}) {
  if (!policy.expirationEnabled) {
    return null;
  }

  return getFiscalYearLeaveExpirationDate(parseDateOnly(fiscalYearEnd).year);
}

export function calculateMonthlyLeaveExpirationDate({
  grantedDate,
  policy,
}: {
  grantedDate: DateOnly;
  policy: Pick<AnnualLeavePolicy, "expirationEnabled" | "monthlyExpirationMonths">;
}) {
  if (!policy.expirationEnabled) {
    return null;
  }

  return getFiscalYearLeaveExpirationDate(parseDateOnly(grantedDate).year);
}

export function calculateAnnualLeavePromotionSchedule({
  expirationDate,
  policy,
}: {
  expirationDate: DateOnly;
  policy: Pick<
    AnnualLeavePolicy,
    | "promotionEnabled"
    | "annualPromotionMonthsBeforeExpiration"
    | "monthlyPromotionFirstMonthsBeforeExpiration"
    | "monthlyPromotionSecondMonthsBeforeExpiration"
  >;
}) {
  if (!policy.promotionEnabled) {
    return [];
  }

  return [
    {
      noticeType: "ANNUAL_USE_PLAN_REQUEST" as const,
      scheduledDate: addMonths(expirationDate, -policy.annualPromotionMonthsBeforeExpiration),
    },
    {
      noticeType: "MONTHLY_FIRST_NOTICE" as const,
      scheduledDate: addMonths(expirationDate, -policy.monthlyPromotionFirstMonthsBeforeExpiration),
    },
    {
      noticeType: "MONTHLY_SECOND_NOTICE" as const,
      scheduledDate: addMonths(expirationDate, -policy.monthlyPromotionSecondMonthsBeforeExpiration),
    },
  ];
}

export async function getUserHireDateForLeave(
  userId: string,
  prisma: AnnualPolicyDb = getPrisma(),
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      employmentProfile: true,
    },
  });

  if (!user) {
    throw new Error("User not found.");
  }

  return (
    user.employmentProfile?.hireDate ??
    user.profile?.hireDate ??
    user.hireDate ??
    null
  );
}

export function normalizeDateOnly(value: Date | null | undefined) {
  return value ? dateToDateOnly(value) : null;
}
