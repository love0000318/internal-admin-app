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

    for (const hireDate of ["2019-08-19", "2023-06-30", "2024-10-04"] as const) {
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
      expect(after.grantedDays).toBe(before.grantedDays);
      expect(after.manualGranted).toBe(before.manualGranted);
      expect(after.remainingDays).toBe(before.remainingDays);
    }
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
});
