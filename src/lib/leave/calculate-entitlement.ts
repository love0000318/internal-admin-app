import {
  DEFAULT_ANNUAL_LEAVE_POLICY,
  calculateAnnualLeaveEntitlement,
  calculateMonthlyLeaveEntitlement,
  calculateUnderOneYearFiscalProratedLeave,
} from "@/lib/leave/annual-policy";
import type { DateOnly } from "@/lib/leave/types";

type CalculateAnnualEntitlementParams = {
  hireDate: DateOnly | null | undefined;
  asOfDate: DateOnly;
  fiscalYear?: number;
  includeUnderOneYearFiscalProratedLeave?: boolean;
};

export function calculateAnnualEntitlement({
  hireDate,
  asOfDate,
  fiscalYear,
  includeUnderOneYearFiscalProratedLeave = false,
}: CalculateAnnualEntitlementParams): number {
  return calculateAnnualLeaveEntitlement({
    hireDate,
    asOfDate,
    fiscalYear,
    includeUnderOneYearFiscalProratedLeave,
    policy: DEFAULT_ANNUAL_LEAVE_POLICY,
  });
}

export function calculateMonthlyEntitlement({
  hireDate,
  asOfDate,
}: {
  hireDate: DateOnly | null | undefined;
  asOfDate: DateOnly;
}) {
  return calculateMonthlyLeaveEntitlement({
    hireDate,
    asOfDate,
    policy: DEFAULT_ANNUAL_LEAVE_POLICY,
  });
}

export function calculateUnderOneYearFiscalProratedEntitlement({
  hireDate,
  fiscalYear,
  asOfDate,
}: {
  hireDate: DateOnly | null | undefined;
  fiscalYear: number;
  asOfDate: DateOnly;
}) {
  return calculateUnderOneYearFiscalProratedLeave({
    hireDate,
    fiscalYear,
    asOfDate,
    baseAnnualDays: DEFAULT_ANNUAL_LEAVE_POLICY.baseAnnualDays,
  });
}
