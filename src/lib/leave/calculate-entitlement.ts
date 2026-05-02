import {
  DEFAULT_ANNUAL_LEAVE_POLICY,
  calculateAnnualLeaveEntitlement,
} from "@/lib/leave/annual-policy";
import type { DateOnly } from "@/lib/leave/types";

type CalculateAnnualEntitlementParams = {
  hireDate: DateOnly | null | undefined;
  asOfDate: DateOnly;
};

export function calculateAnnualEntitlement({
  hireDate,
  asOfDate,
}: CalculateAnnualEntitlementParams): number {
  return calculateAnnualLeaveEntitlement({
    hireDate,
    asOfDate,
    policy: DEFAULT_ANNUAL_LEAVE_POLICY,
  });
}
