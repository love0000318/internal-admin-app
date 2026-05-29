import { describe, expect, it } from "vitest";

import { dateOnlyToDate } from "@/lib/leave/calculate-business-days";
import {
  assertAttachmentPolicySatisfied,
  assertCustomLeaveGrantRequestAllowed,
  assertLeaveGrantDateInUsableRange,
  assertLeaveGrantHasEnoughRemaining,
  assertLeaveTypeUnitAllowed,
  calculateCustomLeaveRequestAmount,
  filterRequestableLeaveGrantsForDate,
  isRequestableLeaveGrantType,
} from "@/lib/leave/custom-grant-requests";

const leaveType = {
  id: "leave-type-1",
  code: "BIRTHDAY_HALF_DAY",
  name: "생일 반차",
  description: null,
  category: "CUSTOM",
  isSystemRequired: true,
  isEnabled: true,
  isPaid: true,
  paidRate: 1,
  grantMethod: "SYSTEM",
  grantAmount: 0.5,
  grantUnit: "DAY",
  usageMode: "USE_ALL_AT_ONCE",
  allowedUnits: "HALF_DAY",
  unusedRemainderHandling: "EXPIRE_REMAINING",
  deductsAnnualBalance: false,
  attachmentPolicy: "NOT_REQUIRED",
  attachmentDescription: null,
  includeHolidayInDeduction: false,
  visibility: "PUBLIC_WITH_TYPE",
  approvalPolicyId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as const;

const grant = {
  id: "grant-1",
  userId: "user-1",
  leaveTypeId: leaveType.id,
  grantedAmount: 0.5,
  usedAmount: 0,
  pendingAmount: 0,
  remainingAmount: 0.5,
  unit: "DAY",
  status: "ACTIVE",
  effectiveFrom: dateOnlyToDate("2026-05-10"),
  expiresAt: dateOnlyToDate("2026-05-17"),
  grantedByUserId: "owner-1",
  revokedByUserId: null,
  revokedAt: null,
  revokeReason: null,
  reason: "생일 반차 자동 지급",
  source: "BIRTHDAY_AUTO",
  referenceYear: 2026,
  referenceDate: dateOnlyToDate("2026-05-10"),
  idempotencyKey: "birthday-auto:user-1:2026",
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  leaveType,
} as const;

describe("custom leave request helpers", () => {
  it("calculates full-day and half-day custom leave request amounts", () => {
    expect(
      calculateCustomLeaveRequestAmount({
        usageUnit: "HALF_DAY",
        startDate: "2026-05-11",
        endDate: "2026-05-11",
        halfDayPeriod: "AM",
      }),
    ).toBe(0.5);

    expect(
      calculateCustomLeaveRequestAmount({
        usageUnit: "FULL_DAY",
        startDate: "2026-05-08",
        endDate: "2026-05-11",
        companyHolidays: [],
      }),
    ).toBe(2);
  });

  it("validates grant usable range and remaining amount", () => {
    expect(() =>
      assertLeaveGrantDateInUsableRange({
        grant,
        startDate: "2026-05-10",
        endDate: "2026-05-17",
      }),
    ).not.toThrow();
    expect(() =>
      assertLeaveGrantDateInUsableRange({
        grant,
        startDate: "2026-05-18",
        endDate: "2026-05-18",
      }),
    ).toThrow();
    expect(() =>
      assertLeaveGrantHasEnoughRemaining({ remainingAmount: 0.5, amount: 0.5 }),
    ).not.toThrow();
    expect(() =>
      assertLeaveGrantHasEnoughRemaining({ remainingAmount: 0.5, amount: 1 }),
    ).toThrow();
  });

  it("validates allowed usage units and attachment policy", () => {
    expect(() =>
      assertLeaveTypeUnitAllowed({ leaveType, usageUnit: "HALF_DAY" }),
    ).not.toThrow();
    expect(() =>
      assertLeaveTypeUnitAllowed({ leaveType, usageUnit: "FULL_DAY" }),
    ).toThrow();
    expect(() =>
      assertAttachmentPolicySatisfied({
        attachmentPolicy: "REQUIRED_BEFORE_REQUEST",
        attachmentUrl: null,
      }),
    ).toThrow();
    expect(() =>
      assertAttachmentPolicySatisfied({
        attachmentPolicy: "REQUIRED_AFTER_REQUEST",
        attachmentUrl: null,
      }),
    ).not.toThrow();
  });

  it("allows only the owning user to request an enabled active custom grant", () => {
    expect(() =>
      assertCustomLeaveGrantRequestAllowed({
        grant,
        userId: "user-1",
        usageUnit: "HALF_DAY",
        amount: 0.5,
        startDate: "2026-05-10",
        endDate: "2026-05-10",
      }),
    ).not.toThrow();
    expect(() =>
      assertCustomLeaveGrantRequestAllowed({
        grant,
        userId: "other-user",
        usageUnit: "HALF_DAY",
        amount: 0.5,
        startDate: "2026-05-10",
        endDate: "2026-05-10",
      }),
    ).toThrow();
  });

  it("exposes usable birthday half-day grants even if legacy category data is not CUSTOM", () => {
    const birthdayGrant = {
      ...grant,
      leaveType: {
        ...leaveType,
        category: "ANNUAL",
      },
    } as const;

    expect(isRequestableLeaveGrantType(birthdayGrant)).toBe(true);
    expect(
      filterRequestableLeaveGrantsForDate([birthdayGrant], "2026-05-11").map(
        (item) => item.id,
      ),
    ).toEqual(["grant-1"]);
  });

  it("uses actual grant-date metadata for already-created birthday half-day grants", () => {
    const legacyBirthdayRangeGrant = {
      ...grant,
      effectiveFrom: dateOnlyToDate("2026-06-04"),
      expiresAt: dateOnlyToDate("2026-06-11"),
      referenceDate: dateOnlyToDate("2026-06-04"),
      metadata: {
        birthdayDate: "2026-06-04",
        actualGrantDate: "2026-05-28",
        usableFrom: "2026-06-04",
        usableUntil: "2026-06-11",
      },
    } as const;

    expect(
      filterRequestableLeaveGrantsForDate(
        [legacyBirthdayRangeGrant],
        "2026-05-28",
      ).map((item) => item.id),
    ).toEqual(["grant-1"]);
    expect(
      filterRequestableLeaveGrantsForDate(
        [legacyBirthdayRangeGrant],
        "2026-06-05",
      ).map((item) => item.id),
    ).toEqual([]);
    expect(() =>
      assertCustomLeaveGrantRequestAllowed({
        grant: legacyBirthdayRangeGrant,
        userId: "user-1",
        usageUnit: "HALF_DAY",
        amount: 0.5,
        startDate: "2026-05-28",
        endDate: "2026-05-28",
      }),
    ).not.toThrow();
    expect(() =>
      assertCustomLeaveGrantRequestAllowed({
        grant: legacyBirthdayRangeGrant,
        userId: "user-1",
        usageUnit: "HALF_DAY",
        amount: 0.5,
        startDate: "2026-06-05",
        endDate: "2026-06-05",
      }),
    ).toThrow();
  });

  it("hides expired or already-used birthday half-day grants from request options", () => {
    expect(
      filterRequestableLeaveGrantsForDate(
        [
          { ...grant, id: "usable" },
          {
            ...grant,
            id: "expired",
            expiresAt: dateOnlyToDate("2026-05-09"),
          },
          {
            ...grant,
            id: "used",
            remainingAmount: 0,
            usedAmount: 0.5,
          },
        ],
        "2026-05-11",
      ).map((item) => item.id),
    ).toEqual(["usable"]);
  });

  it("keeps birthday half-day requests to exactly 0.5 days", () => {
    expect(() =>
      assertCustomLeaveGrantRequestAllowed({
        grant,
        userId: "user-1",
        usageUnit: "FULL_DAY",
        amount: 0.5,
        startDate: "2026-05-10",
        endDate: "2026-05-10",
      }),
    ).toThrow();

    expect(() =>
      assertCustomLeaveGrantRequestAllowed({
        grant: { ...grant, remainingAmount: 0, usedAmount: 0.5 },
        userId: "user-1",
        usageUnit: "HALF_DAY",
        amount: 0.5,
        startDate: "2026-05-10",
        endDate: "2026-05-10",
      }),
    ).toThrow();
  });
});
