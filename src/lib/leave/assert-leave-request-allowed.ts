import { calculateBusinessLeaveDays } from "@/lib/leave/calculate-business-days";
import { policyDeductsAnnual } from "@/lib/leave/balance";
import type {
  DateOnly,
  LeaveBalanceSnapshot,
  LeavePolicy,
  LeaveRequestInput,
} from "@/lib/leave/types";

type AssertLeaveRequestAllowedParams = LeaveRequestInput & {
  policy: LeavePolicy;
  balance: LeaveBalanceSnapshot;
  companyHolidays?: DateOnly[];
};

function remainingAnnualDays(balance: LeaveBalanceSnapshot) {
  return (
    balance.annualEntitled +
    balance.manualGranted -
    balance.usedDays -
    balance.pendingDays
  );
}

export function assertLeaveRequestAllowed(
  params: AssertLeaveRequestAllowedParams,
): void {
  if (!params.policy.isEnabled) {
    throw new Error("Leave policy is disabled.");
  }

  const dayCount = calculateBusinessLeaveDays(params);

  if (dayCount <= 0) {
    throw new Error("Leave request must include at least one business day.");
  }

  const maxDays = params.policy.maxRequestDays ?? params.policy.maxDaysPerRequest;
  const minDays = params.policy.minRequestDays ?? null;

  if (minDays !== null && dayCount < minDays) {
    throw new Error("Leave request is shorter than min request days.");
  }

  if (maxDays !== null && dayCount > maxDays) {
    throw new Error("Leave request exceeds max days per request.");
  }

  if (params.policy.requiresAttachment && !params.attachmentUrl) {
    throw new Error("Attachment is required for this leave type.");
  }

  if (
    (params.type === "ANNUAL" ||
      params.type === "HALF_DAY" ||
      policyDeductsAnnual(params.policy)) &&
    dayCount > remainingAnnualDays(params.balance)
  ) {
    throw new Error("Leave request exceeds remaining annual leave.");
  }
}
