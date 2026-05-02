import { calculateAnnualEntitlement } from "@/lib/leave/calculate-entitlement";
import type {
  DateOnly,
  LeaveAdjustmentForBalance,
  LeaveBalanceSnapshot,
  LeavePolicy,
  LeaveRequestForBalance,
  LeaveType,
} from "@/lib/leave/types";

export type CalculatedLeaveBalance = LeaveBalanceSnapshot & {
  grantedDays: number;
  remainingDays: number;
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
}: {
  hireDate: DateOnly | null | undefined;
  asOfDate: DateOnly;
  adjustments: LeaveAdjustmentForBalance[];
  leaveRequests: LeaveRequestForBalance[];
  policies: Record<LeaveType, LeavePolicy>;
}): CalculatedLeaveBalance {
  const annualEntitled = calculateAnnualEntitlement({ hireDate, asOfDate });
  const manualGranted = adjustments.reduce((sum, adjustment) => {
    return sum + adjustment.days;
  }, 0);
  const grantedDays = annualEntitled + manualGranted;

  const annualDeductingRequests = leaveRequests.filter((request) => {
    return policyDeductsAnnual(policies[request.type]);
  });
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
