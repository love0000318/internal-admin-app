import {
  calculateAnnualEntitlement,
  calculateMonthlyEntitlement,
  calculateUnderOneYearFiscalProratedEntitlement,
} from "@/lib/leave/calculate-entitlement";
import type {
  DateOnly,
  LeaveAdjustmentForBalance,
  LeaveBalanceSnapshot,
  LeavePolicy,
  LeaveRequestForBalance,
  LeaveType,
} from "@/lib/leave/types";
import { legacyLeaveTypeDeductsAnnualBalance } from "@/lib/leave/legacy-request-policy";

export type CalculatedLeaveBalance = LeaveBalanceSnapshot & {
  grantedDays: number;
  remainingDays: number;
  monthlyAccruedDays: number;
  underOneYearProratedAnnualDays: number;
};

export function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  if (value && typeof value === "object" && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }

  if (value && typeof value === "object" && "toString" in value) {
    return Number(value.toString());
  }

  return 0;
}

export function policyDeductsAnnual(policy: Pick<LeavePolicy, "deductsAnnual"> & {
  deductsAnnualBalance?: boolean | null;
}) {
  return policy.deductsAnnualBalance ?? policy.deductsAnnual;
}

const BIRTHDAY_HALF_DAY_BALANCE_CODE = "BIRTHDAY_HALF_DAY";

export function isBirthdayHalfDayBalanceRequest(
  request: Pick<
    LeaveRequestForBalance,
    "requestKind" | "customLeaveType" | "grantUsages"
  >,
) {
  return (
    request.customLeaveType?.code === BIRTHDAY_HALF_DAY_BALANCE_CODE ||
    request.grantUsages?.some((usage) => {
      const grant = usage.leaveGrant;

      return (
        grant?.source === "BIRTHDAY_AUTO" ||
        grant?.leaveType?.code === BIRTHDAY_HALF_DAY_BALANCE_CODE
      );
    }) === true
  );
}

export function leaveRequestDeductsAnnualBalance({
  request,
  policies,
}: {
  request: LeaveRequestForBalance;
  policies: Record<LeaveType, LeavePolicy>;
}) {
  if (isBirthdayHalfDayBalanceRequest(request)) {
    return false;
  }

  if (request.requestKind === "CUSTOM_GRANT") {
    return request.customLeaveType?.deductsAnnualBalance === true;
  }

  return legacyLeaveTypeDeductsAnnualBalance({
    type: request.type,
    policy: policies[request.type],
  });
}

export function calculateRemainingDays({
  grantedDays,
  usedDays,
  pendingDays,
}: {
  grantedDays: number;
  usedDays: number;
  pendingDays: number;
}) {
  return grantedDays - usedDays - pendingDays;
}

export function calculateLeaveBalanceForUser({
  hireDate,
  asOfDate,
  adjustments,
  leaveRequests,
  policies,
  fiscalYear,
  includeUnderOneYearFiscalProratedLeave = false,
}: {
  hireDate: DateOnly | null | undefined;
  asOfDate: DateOnly;
  adjustments: LeaveAdjustmentForBalance[];
  leaveRequests: LeaveRequestForBalance[];
  policies: Record<LeaveType, LeavePolicy>;
  fiscalYear?: number;
  includeUnderOneYearFiscalProratedLeave?: boolean;
}): CalculatedLeaveBalance {
  const monthlyAccruedDays = calculateMonthlyEntitlement({ hireDate, asOfDate });
  const underOneYearProratedAnnualDays =
    includeUnderOneYearFiscalProratedLeave && fiscalYear
      ? calculateUnderOneYearFiscalProratedEntitlement({
          hireDate,
          fiscalYear,
          asOfDate,
        }).roundedDays
      : 0;
  const annualEntitled = calculateAnnualEntitlement({
    hireDate,
    asOfDate,
    fiscalYear,
    includeUnderOneYearFiscalProratedLeave,
  });
  const manualGranted = adjustments.reduce((sum, adjustment) => {
    return sum + adjustment.days;
  }, 0);
  const grantedDays = annualEntitled + manualGranted;

  const annualDeductingRequests = leaveRequests.filter((request) =>
    leaveRequestDeductsAnnualBalance({ request, policies }),
  );
  const usedDays = annualDeductingRequests
    .filter((request) => request.status === "APPROVED")
    .reduce((sum, request) => sum + request.dayCount, 0);
  const pendingDays = annualDeductingRequests
    .filter((request) => request.status === "PENDING")
    .reduce((sum, request) => sum + request.dayCount, 0);
  const remainingDays = calculateRemainingDays({
    grantedDays,
    usedDays,
    pendingDays,
  });

  return {
    annualEntitled,
    monthlyAccruedDays,
    underOneYearProratedAnnualDays,
    manualGranted,
    grantedDays,
    usedDays,
    pendingDays,
    remainingDays,
  };
}

export function assertEnoughLeaveBalance({
  requestedDays,
  balance,
}: {
  requestedDays: number;
  balance: Pick<CalculatedLeaveBalance, "remainingDays">;
}): void {
  if (requestedDays > balance.remainingDays) {
    throw new Error("Leave request exceeds remaining annual leave.");
  }
}
