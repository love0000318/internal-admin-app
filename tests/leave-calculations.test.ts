import { describe, expect, it } from "vitest";

import { assertLeaveRequestAllowed } from "@/lib/leave/assert-leave-request-allowed";
import {
  calculateUnderOneYearFiscalProratedLeave,
  roundUpToHalfDay,
} from "@/lib/leave/annual-policy";
import { calculateAnnualEntitlement } from "@/lib/leave/calculate-entitlement";
import {
  assertValidLeaveDateRange,
  calculateBusinessLeaveDays,
  calculateHalfDayLeaveDays,
  calculateRequestedLeaveDays,
  isHalfDayRequest,
} from "@/lib/leave/calculate-business-days";
import {
  assertEnoughLeaveBalance,
  calculateLeaveBalanceForUser,
  calculateRemainingDays,
} from "@/lib/leave/balance";
import { assertNoOverlappingLeaveRequest } from "@/lib/leave/overlap";
import { resolveLeaveBalanceAsOfDateForYear } from "@/lib/leave/queries";
import type { LeavePolicy } from "@/lib/leave/types";

const annualPolicy: LeavePolicy = {
  type: "ANNUAL",
  isEnabled: true,
  deductsAnnual: true,
  deductsAnnualBalance: true,
  minRequestDays: null,
  maxRequestDays: null,
  maxDaysPerRequest: null,
  maxDaysPerYear: null,
  requestWindowStartOffsetDays: null,
  requestWindowEndOffsetDays: null,
  requiresAttachment: false,
  approvalRequired: true,
};

const nonDeductingSickPolicy: LeavePolicy = {
  type: "SICK",
  isEnabled: true,
  deductsAnnual: false,
  deductsAnnualBalance: false,
  minRequestDays: null,
  maxRequestDays: null,
  maxDaysPerRequest: null,
  maxDaysPerYear: null,
  requestWindowStartOffsetDays: null,
  requestWindowEndOffsetDays: null,
  requiresAttachment: true,
  approvalRequired: true,
};

describe("leave calculations", () => {
  it("calculates annual entitlement by tenure", () => {
    expect(
      calculateAnnualEntitlement({
        hireDate: "2026-01-01",
        asOfDate: "2026-04-01",
      }),
    ).toBe(3);

    expect(
      calculateAnnualEntitlement({
        hireDate: "2025-05-01",
        asOfDate: "2026-05-01",
      }),
    ).toBe(15);

    expect(
      calculateAnnualEntitlement({
        hireDate: "2020-05-01",
        asOfDate: "2026-05-01",
      }),
    ).toBe(17);
  });

  it("rounds fiscal prorated leave up to half-day units", () => {
    expect(roundUpToHalfDay(5.01)).toBe(5.5);
    expect(roundUpToHalfDay(5.5)).toBe(5.5);
    expect(roundUpToHalfDay(5.51)).toBe(6);
    expect(roundUpToHalfDay(0.01)).toBe(0.5);
    expect(roundUpToHalfDay(0)).toBe(0);
  });

  it("calculates fiscal-year prorated leave only for under-one-year previous-year new hires", () => {
    const prorated = calculateUnderOneYearFiscalProratedLeave({
      hireDate: "2025-09-01",
      fiscalYear: 2026,
      asOfDate: "2026-05-01",
    });

    expect(prorated).toMatchObject({
      isEligible: true,
      previousYear: 2025,
      workedDaysInPreviousYear: 122,
      roundedDays: 5.5,
      roundingPolicy: "CEIL_TO_HALF_DAY",
      reason: "ELIGIBLE",
    });
    expect(prorated.rawDays).toBeCloseTo(5.01, 2);

    expect(
      calculateUnderOneYearFiscalProratedLeave({
        hireDate: "2019-08-19",
        fiscalYear: 2026,
        asOfDate: "2026-05-01",
      }).roundedDays,
    ).toBe(0);
    expect(
      calculateUnderOneYearFiscalProratedLeave({
        hireDate: "2023-06-30",
        fiscalYear: 2026,
        asOfDate: "2026-05-01",
      }).roundedDays,
    ).toBe(0);

    const serviceDaysAtLeast365 = calculateUnderOneYearFiscalProratedLeave({
      hireDate: "2025-05-01",
      fiscalYear: 2026,
      asOfDate: "2026-05-01",
    });
    expect(serviceDaysAtLeast365).toMatchObject({
      isEligible: false,
      roundedDays: 0,
      reason: "SERVICE_DAYS_AT_LEAST_365",
    });
  });

  it("excludes weekends and company holidays from business leave days", () => {
    expect(
      calculateBusinessLeaveDays({
        type: "ANNUAL",
        startDate: "2026-05-01",
        endDate: "2026-05-05",
        companyHolidays: ["2026-05-05"],
      }),
    ).toBe(2);
  });

  it("calculates half-day leave as 0.5 day and requires one date", () => {
    expect(
      isHalfDayRequest({
        startDate: "2026-05-01",
        endDate: "2026-05-01",
        halfDayPeriod: "AM",
      }),
    ).toBe(true);

    expect(
      calculateHalfDayLeaveDays({
        startDate: "2026-05-01",
        endDate: "2026-05-01",
        halfDayPeriod: "AM",
      }),
    ).toBe(0.5);

    expect(
      calculateBusinessLeaveDays({
        type: "HALF_DAY",
        startDate: "2026-05-01",
        endDate: "2026-05-01",
        halfDayPeriod: "PM",
      }),
    ).toBe(0.5);

    expect(() =>
      calculateBusinessLeaveDays({
        type: "HALF_DAY",
        startDate: "2026-05-01",
        endDate: "2026-05-04",
        halfDayPeriod: "AM",
      }),
    ).toThrow("Half-day leave must use a single date.");
  });

  it("calculates requested days by leave type", () => {
    expect(
      calculateRequestedLeaveDays({
        type: "HALF_DAY",
        startDate: "2026-05-01",
        endDate: "2026-05-01",
        halfDayPeriod: "PM",
      }),
    ).toBe(0.5);

    expect(
      calculateRequestedLeaveDays({
        type: "ANNUAL",
        startDate: "2026-05-01",
        endDate: "2026-05-04",
      }),
    ).toBe(2);
  });

  it("rejects invalid date ranges and zero-day requests", () => {
    expect(() =>
      assertValidLeaveDateRange({
        type: "ANNUAL",
        startDate: "2026-05-04",
        endDate: "2026-05-01",
        today: "2026-05-01",
      }),
    ).toThrow("Leave start date must be before or equal to end date.");

    expect(
      calculateBusinessLeaveDays({
        type: "ANNUAL",
        startDate: "2026-05-02",
        endDate: "2026-05-03",
      }),
    ).toBe(0);
  });

  it("allows retroactive annual and half-day request dates when the caller opts in", () => {
    expect(() =>
      assertValidLeaveDateRange({
        type: "ANNUAL",
        startDate: "2026-04-30",
        endDate: "2026-04-30",
        today: "2026-05-01",
      }),
    ).toThrow("Past leave requests are not allowed.");

    expect(() =>
      assertValidLeaveDateRange({
        type: "ANNUAL",
        startDate: "2026-04-30",
        endDate: "2026-04-30",
        today: "2026-05-01",
        allowPast: true,
      }),
    ).not.toThrow();

    expect(() =>
      assertValidLeaveDateRange({
        type: "HALF_DAY",
        startDate: "2026-04-30",
        endDate: "2026-04-30",
        halfDayPeriod: "PM",
        today: "2026-05-01",
        allowPast: true,
      }),
    ).not.toThrow();
  });

  it("rejects annual leave requests exceeding remaining balance", () => {
    expect(() =>
      assertLeaveRequestAllowed({
        type: "ANNUAL",
        startDate: "2026-05-01",
        endDate: "2026-05-04",
        policy: annualPolicy,
        balance: {
          annualEntitled: 1,
          manualGranted: 0,
          usedDays: 0,
          pendingDays: 0,
        },
      }),
    ).toThrow("Leave request exceeds remaining annual leave.");
  });

  it("calculates remaining days and reflects pending withdrawal", () => {
    expect(
      calculateRemainingDays({
        grantedDays: 15,
        usedDays: 3,
        pendingDays: 1.5,
      }),
    ).toBe(10.5);

    const balance = calculateLeaveBalanceForUser({
      hireDate: "2025-05-01",
      asOfDate: "2026-05-01",
      adjustments: [{ days: 1 }],
      leaveRequests: [
        { type: "ANNUAL", status: "APPROVED", dayCount: 2 },
        { type: "HALF_DAY", status: "PENDING", dayCount: 0.5 },
        { type: "ANNUAL", status: "WITHDRAWN", dayCount: 4 },
        { type: "SICK", status: "PENDING", dayCount: 1 },
      ],
      policies: {
        ANNUAL: annualPolicy,
        HALF_DAY: { ...annualPolicy, type: "HALF_DAY" },
        RESERVE_FORCES: { ...nonDeductingSickPolicy, type: "RESERVE_FORCES" },
        SICK: nonDeductingSickPolicy,
        BEREAVEMENT: { ...nonDeductingSickPolicy, type: "BEREAVEMENT" },
      },
    });

    expect(balance.grantedDays).toBe(16);
    expect(balance.usedDays).toBe(2);
    expect(balance.pendingDays).toBe(0.5);
    expect(balance.remainingDays).toBe(13.5);
  });

  it("adds under-one-year fiscal prorated leave only to eligible employees", () => {
    const policies = {
      ANNUAL: annualPolicy,
      HALF_DAY: { ...annualPolicy, type: "HALF_DAY" as const },
      RESERVE_FORCES: { ...nonDeductingSickPolicy, type: "RESERVE_FORCES" as const },
      SICK: nonDeductingSickPolicy,
      BEREAVEMENT: { ...nonDeductingSickPolicy, type: "BEREAVEMENT" as const },
    };
    const yangBalance = calculateLeaveBalanceForUser({
      hireDate: "2025-09-01",
      asOfDate: "2026-05-01",
      fiscalYear: 2026,
      includeUnderOneYearFiscalProratedLeave: true,
      adjustments: [],
      leaveRequests: [{ type: "ANNUAL", status: "APPROVED", dayCount: 3 }],
      policies,
    });

    expect(yangBalance.monthlyAccruedDays).toBe(8);
    expect(yangBalance.underOneYearProratedAnnualDays).toBe(5.5);
    expect(yangBalance.grantedDays).toBe(13.5);
    expect(yangBalance.usedDays).toBe(3);
    expect(yangBalance.manualGranted).toBe(0);
    expect(yangBalance.remainingDays).toBe(10.5);

    const longServiceCases = [
      { hireDate: "2019-08-19", expectedAnnualEntitled: 17 },
      { hireDate: "2023-06-30", expectedAnnualEntitled: 15 },
      { hireDate: "2024-10-04", expectedAnnualEntitled: 15 },
    ] as const;

    for (const { hireDate, expectedAnnualEntitled } of longServiceCases) {
      const before = calculateLeaveBalanceForUser({
        hireDate,
        asOfDate: "2026-05-01",
        fiscalYear: 2026,
        includeUnderOneYearFiscalProratedLeave: false,
        adjustments: [{ days: 2 }],
        leaveRequests: [{ type: "ANNUAL", status: "APPROVED", dayCount: 1 }],
        policies,
      });
      const after = calculateLeaveBalanceForUser({
        hireDate,
        asOfDate: "2026-05-01",
        fiscalYear: 2026,
        includeUnderOneYearFiscalProratedLeave: true,
        adjustments: [{ days: 2 }],
        leaveRequests: [{ type: "ANNUAL", status: "APPROVED", dayCount: 1 }],
        policies,
      });

      expect(after.underOneYearProratedAnnualDays).toBe(0);
      expect(after.monthlyAccruedDays).toBe(0);
      expect(after.annualEntitled).toBe(expectedAnnualEntitled);
      expect(after.grantedDays).toBe(before.grantedDays);
      expect(after.manualGranted).toBe(before.manualGranted);
      expect(after.remainingDays).toBe(before.remainingDays);
    }
  });

  it("does not mix under-one-year prorated leave into one-year-or-more balances", () => {
    const policies = {
      ANNUAL: annualPolicy,
      HALF_DAY: { ...annualPolicy, type: "HALF_DAY" as const },
      RESERVE_FORCES: { ...nonDeductingSickPolicy, type: "RESERVE_FORCES" as const },
      SICK: nonDeductingSickPolicy,
      BEREAVEMENT: { ...nonDeductingSickPolicy, type: "BEREAVEMENT" as const },
    };
    const balance = calculateLeaveBalanceForUser({
      hireDate: "2025-05-01",
      asOfDate: "2026-05-01",
      fiscalYear: 2026,
      includeUnderOneYearFiscalProratedLeave: true,
      adjustments: [],
      leaveRequests: [],
      policies,
    });

    expect(balance.annualEntitled).toBe(15);
    expect(balance.monthlyAccruedDays).toBe(0);
    expect(balance.underOneYearProratedAnnualDays).toBe(0);
    expect(balance.grantedDays).toBe(15);
    expect(balance.remainingDays).toBe(15);
  });

  it("keeps annual entitlement monotonic as tenure increases", () => {
    const entitlements = [2026, 2028, 2030].map((year) =>
      calculateAnnualEntitlement({
        hireDate: "2025-01-01",
        asOfDate: `${year}-12-31`,
      }),
    );

    expect(entitlements).toEqual([15, 16, 17]);
    expect(entitlements[1]).toBeGreaterThanOrEqual(entitlements[0]);
    expect(entitlements[2]).toBeGreaterThanOrEqual(entitlements[1]);
  });

  it("keeps used leave and manual adjustments separated in balance totals", () => {
    const policies = {
      ANNUAL: annualPolicy,
      HALF_DAY: { ...annualPolicy, type: "HALF_DAY" as const },
      RESERVE_FORCES: { ...nonDeductingSickPolicy, type: "RESERVE_FORCES" as const },
      SICK: nonDeductingSickPolicy,
      BEREAVEMENT: { ...nonDeductingSickPolicy, type: "BEREAVEMENT" as const },
    };
    const balance = calculateLeaveBalanceForUser({
      hireDate: "2024-01-01",
      asOfDate: "2026-05-01",
      fiscalYear: 2026,
      adjustments: [{ days: 2 }],
      leaveRequests: [
        { type: "ANNUAL", status: "APPROVED", dayCount: 3 },
        { type: "HALF_DAY", status: "PENDING", dayCount: 0.5 },
      ],
      policies,
    });

    expect(balance.annualEntitled).toBe(15);
    expect(balance.manualGranted).toBe(2);
    expect(balance.grantedDays).toBe(17);
    expect(balance.usedDays).toBe(3);
    expect(balance.pendingDays).toBe(0.5);
    expect(balance.remainingDays).toBe(13.5);
  });

  it("keeps birthday half-day grant usage out of annual balance totals", () => {
    const policies = {
      ANNUAL: annualPolicy,
      HALF_DAY: { ...annualPolicy, type: "HALF_DAY" as const },
      RESERVE_FORCES: { ...nonDeductingSickPolicy, type: "RESERVE_FORCES" as const },
      SICK: nonDeductingSickPolicy,
      BEREAVEMENT: { ...nonDeductingSickPolicy, type: "BEREAVEMENT" as const },
    };
    const balance = calculateLeaveBalanceForUser({
      hireDate: "2024-01-01",
      asOfDate: "2026-05-01",
      fiscalYear: 2026,
      adjustments: [],
      leaveRequests: [
        { type: "ANNUAL", status: "APPROVED", dayCount: 1 },
        { type: "HALF_DAY", status: "APPROVED", dayCount: 0.5 },
        {
          type: "HALF_DAY",
          status: "APPROVED",
          dayCount: 0.5,
          requestKind: "CUSTOM_GRANT",
          customLeaveType: {
            code: "BIRTHDAY_HALF_DAY",
            category: "CUSTOM",
            deductsAnnualBalance: true,
          },
          grantUsages: [
            {
              leaveGrant: {
                source: "BIRTHDAY_AUTO",
                leaveType: { code: "BIRTHDAY_HALF_DAY" },
              },
            },
          ],
        },
      ],
      policies,
    });

    expect(balance.usedDays).toBe(1.5);
    expect(balance.pendingDays).toBe(0);
    expect(balance.remainingDays).toBe(13.5);
  });

  it("keeps balance consistent after approve, reject, and cancel statuses", () => {
    const policies = {
      ANNUAL: annualPolicy,
      HALF_DAY: { ...annualPolicy, type: "HALF_DAY" as const },
      RESERVE_FORCES: { ...nonDeductingSickPolicy, type: "RESERVE_FORCES" as const },
      SICK: nonDeductingSickPolicy,
      BEREAVEMENT: { ...nonDeductingSickPolicy, type: "BEREAVEMENT" as const },
    };
    const common = {
      hireDate: "2025-05-01" as const,
      asOfDate: "2026-05-01" as const,
      adjustments: [],
      policies,
    };

    const pendingBalance = calculateLeaveBalanceForUser({
      ...common,
      leaveRequests: [{ type: "ANNUAL", status: "PENDING", dayCount: 2 }],
    });
    expect(pendingBalance.usedDays).toBe(0);
    expect(pendingBalance.pendingDays).toBe(2);
    expect(pendingBalance.remainingDays).toBe(13);

    const approvedBalance = calculateLeaveBalanceForUser({
      ...common,
      leaveRequests: [{ type: "ANNUAL", status: "APPROVED", dayCount: 2 }],
    });
    expect(approvedBalance.usedDays).toBe(2);
    expect(approvedBalance.pendingDays).toBe(0);
    expect(approvedBalance.remainingDays).toBe(13);

    const rejectedBalance = calculateLeaveBalanceForUser({
      ...common,
      leaveRequests: [{ type: "ANNUAL", status: "REJECTED", dayCount: 2 }],
    });
    expect(rejectedBalance.usedDays).toBe(0);
    expect(rejectedBalance.pendingDays).toBe(0);
    expect(rejectedBalance.remainingDays).toBe(15);

    const cancelledBalance = calculateLeaveBalanceForUser({
      ...common,
      leaveRequests: [{ type: "ANNUAL", status: "CANCELLED", dayCount: 2 }],
    });
    expect(cancelledBalance.usedDays).toBe(0);
    expect(cancelledBalance.pendingDays).toBe(0);
    expect(cancelledBalance.remainingDays).toBe(15);
  });

  it("rejects remaining balance overflow", () => {
    expect(() =>
      assertEnoughLeaveBalance({
        requestedDays: 2,
        balance: { remainingDays: 1.5 },
      }),
    ).toThrow("Leave request exceeds remaining annual leave.");
  });

  it("prevents overlapping pending or approved leave requests", () => {
    expect(() =>
      assertNoOverlappingLeaveRequest({
        candidate: {
          type: "ANNUAL",
          status: "PENDING",
          startDate: "2026-05-01",
          endDate: "2026-05-01",
        },
        existingRequests: [
          {
            type: "HALF_DAY",
            status: "PENDING",
            startDate: "2026-05-01",
            endDate: "2026-05-01",
            halfDayPeriod: "AM",
          },
        ],
      }),
    ).toThrow("Overlapping leave request already exists.");

    expect(() =>
      assertNoOverlappingLeaveRequest({
        candidate: {
          type: "HALF_DAY",
          status: "PENDING",
          startDate: "2026-05-01",
          endDate: "2026-05-01",
          halfDayPeriod: "PM",
        },
        existingRequests: [
          {
            type: "HALF_DAY",
            status: "PENDING",
            startDate: "2026-05-01",
            endDate: "2026-05-01",
            halfDayPeriod: "AM",
          },
        ],
      }),
    ).not.toThrow();

    expect(() =>
      assertNoOverlappingLeaveRequest({
        candidate: {
          type: "HALF_DAY",
          status: "PENDING",
          startDate: "2026-05-01",
          endDate: "2026-05-01",
          halfDayPeriod: "AM",
        },
        existingRequests: [
          {
            type: "HALF_DAY",
            status: "WITHDRAWN",
            startDate: "2026-05-01",
            endDate: "2026-05-01",
            halfDayPeriod: "AM",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("keeps overlap and balance checks active for retroactive requests", () => {
    expect(() =>
      assertNoOverlappingLeaveRequest({
        candidate: {
          type: "HALF_DAY",
          status: "PENDING",
          startDate: "2026-04-30",
          endDate: "2026-04-30",
          halfDayPeriod: "AM",
        },
        existingRequests: [
          {
            type: "HALF_DAY",
            status: "APPROVED",
            startDate: "2026-04-30",
            endDate: "2026-04-30",
            halfDayPeriod: "AM",
          },
        ],
      }),
    ).toThrow("Overlapping leave request already exists.");

    expect(() =>
      assertEnoughLeaveBalance({
        requestedDays: 0.5,
        balance: { remainingDays: 0 },
      }),
    ).toThrow("Leave request exceeds remaining annual leave.");
  });

  it("uses the selected year end as the default balance date for past and future years", () => {
    expect(
      resolveLeaveBalanceAsOfDateForYear({
        year: 2026,
        today: "2026-05-01",
      }),
    ).toBe("2026-05-01");
    expect(
      resolveLeaveBalanceAsOfDateForYear({
        year: 2027,
        today: "2026-05-01",
      }),
    ).toBe("2027-12-31");
    expect(
      resolveLeaveBalanceAsOfDateForYear({
        year: 2025,
        today: "2026-05-01",
      }),
    ).toBe("2025-12-31");
  });

  it("reflects additional tenure when calculating future-year annual balances", () => {
    const policies = {
      ANNUAL: annualPolicy,
      HALF_DAY: { ...annualPolicy, type: "HALF_DAY" as const },
      RESERVE_FORCES: { ...nonDeductingSickPolicy, type: "RESERVE_FORCES" as const },
      SICK: nonDeductingSickPolicy,
      BEREAVEMENT: { ...nonDeductingSickPolicy, type: "BEREAVEMENT" as const },
    };
    const currentYear = calculateLeaveBalanceForUser({
      hireDate: "2024-01-01",
      asOfDate: resolveLeaveBalanceAsOfDateForYear({
        year: 2026,
        today: "2026-05-01",
      }),
      fiscalYear: 2026,
      adjustments: [],
      leaveRequests: [],
      policies,
    });
    const futureYear = calculateLeaveBalanceForUser({
      hireDate: "2024-01-01",
      asOfDate: resolveLeaveBalanceAsOfDateForYear({
        year: 2027,
        today: "2026-05-01",
      }),
      fiscalYear: 2027,
      adjustments: [],
      leaveRequests: [],
      policies,
    });

    expect(currentYear.annualEntitled).toBe(15);
    expect(futureYear.annualEntitled).toBe(16);
  });
});
