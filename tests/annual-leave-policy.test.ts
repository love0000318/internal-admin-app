import { describe, expect, it } from "vitest";

import {
  DEFAULT_ANNUAL_LEAVE_POLICY,
  calculateAnnualLeaveEntitlement,
  calculateAnnualLeaveExpirationDate,
  calculateAnnualLeavePromotionSchedule,
  calculateFiscalYearDateRange,
  calculateLongServiceAdditionalDays,
  calculateMonthlyLeaveEntitlement,
} from "@/lib/leave/annual-policy";

describe("annual leave policy calculations", () => {
  it("calculates the fiscal-year date range from the policy start date", () => {
    expect(calculateFiscalYearDateRange(DEFAULT_ANNUAL_LEAVE_POLICY, 2026)).toEqual({
      start: "2026-01-01",
      end: "2026-12-31",
    });
  });

  it("grants monthly leave to first-year employees with the configured cap", () => {
    expect(
      calculateMonthlyLeaveEntitlement({
        hireDate: "2026-01-10",
        asOfDate: "2026-05-10",
        policy: DEFAULT_ANNUAL_LEAVE_POLICY,
      }),
    ).toBe(4);
    expect(
      calculateMonthlyLeaveEntitlement({
        hireDate: "2025-01-10",
        asOfDate: "2025-12-31",
        policy: DEFAULT_ANNUAL_LEAVE_POLICY,
      }),
    ).toBe(11);
  });

  it("grants base annual leave and long-service additions after one year", () => {
    expect(
      calculateAnnualLeaveEntitlement({
        hireDate: "2024-01-01",
        asOfDate: "2026-12-31",
        policy: DEFAULT_ANNUAL_LEAVE_POLICY,
      }),
    ).toBe(15);
    expect(
      calculateLongServiceAdditionalDays({
        hireDate: "2020-01-01",
        asOfDate: "2026-12-31",
        policy: DEFAULT_ANNUAL_LEAVE_POLICY,
      }),
    ).toBe(2);
  });

  it("caps annual leave at the configured maximum", () => {
    expect(
      calculateAnnualLeaveEntitlement({
        hireDate: "1990-01-01",
        asOfDate: "2026-12-31",
        policy: DEFAULT_ANNUAL_LEAVE_POLICY,
      }),
    ).toBe(25);
  });

  it("calculates expiration and promotion schedules", () => {
    const expirationDate = calculateAnnualLeaveExpirationDate({
      fiscalYearEnd: "2026-12-31",
      policy: DEFAULT_ANNUAL_LEAVE_POLICY,
    });
    const notices = calculateAnnualLeavePromotionSchedule({
      expirationDate: expirationDate ?? "2027-12-31",
      policy: DEFAULT_ANNUAL_LEAVE_POLICY,
    });

    expect(expirationDate).toBe("2027-12-31");
    expect(notices).toContainEqual({
      noticeType: "ANNUAL_USE_PLAN_REQUEST",
      scheduledDate: "2027-06-30",
    });
    expect(notices).toContainEqual({
      noticeType: "MONTHLY_FIRST_NOTICE",
      scheduledDate: "2027-09-30",
    });
    expect(notices).toContainEqual({
      noticeType: "MONTHLY_SECOND_NOTICE",
      scheduledDate: "2027-11-30",
    });
  });
});
