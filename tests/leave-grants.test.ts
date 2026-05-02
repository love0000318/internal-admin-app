import { describe, expect, it } from "vitest";

import { isAuditRequiredAction } from "@/lib/audit/audit-log";
import {
  assertGrantRevocable,
  assertLeaveTypeGrantable,
  assertValidGrantAmount,
  assertValidGrantDates,
  calculateLeaveGrantRemaining,
  leaveGrantFormSchema,
} from "@/lib/leave/grants";

const customLeaveType = {
  code: "REFRESH",
  category: "CUSTOM",
  isEnabled: true,
  grantMethod: "MANUAL",
} as const;

describe("leave grant helpers", () => {
  it("accepts only enabled grantable custom leave types", () => {
    expect(() => assertLeaveTypeGrantable(customLeaveType)).not.toThrow();
    expect(() =>
      assertLeaveTypeGrantable({
        ...customLeaveType,
        isEnabled: false,
      }),
    ).toThrow();
    expect(() =>
      assertLeaveTypeGrantable({
        ...customLeaveType,
        category: "ANNUAL",
      }),
    ).toThrow();
    expect(() =>
      assertLeaveTypeGrantable({
        ...customLeaveType,
        grantMethod: "ON_REQUEST",
      }),
    ).toThrow();
  });

  it("calculates remaining amount from granted, used, and pending amounts", () => {
    expect(
      calculateLeaveGrantRemaining({
        grantedAmount: 3,
        usedAmount: 1,
        pendingAmount: 0.5,
      }),
    ).toBe(1.5);
  });

  it("validates grant amount and date range", () => {
    expect(() => assertValidGrantAmount(0.5)).not.toThrow();
    expect(() => assertValidGrantAmount(0)).toThrow();
    expect(() =>
      assertValidGrantDates({
        effectiveFrom: "2026-05-02",
        expiresAt: "2026-05-02",
      }),
    ).not.toThrow();
    expect(() =>
      assertValidGrantDates({
        effectiveFrom: "2026-05-03",
        expiresAt: "2026-05-02",
      }),
    ).toThrow();
  });

  it("blocks revoke when a grant is used, pending, inactive, or empty", () => {
    expect(() =>
      assertGrantRevocable({
        status: "ACTIVE",
        usedAmount: 0,
        pendingAmount: 0,
        remainingAmount: 1,
      }),
    ).not.toThrow();
    expect(() =>
      assertGrantRevocable({
        status: "ACTIVE",
        usedAmount: 1,
        pendingAmount: 0,
        remainingAmount: 0,
      }),
    ).toThrow();
    expect(() =>
      assertGrantRevocable({
        status: "ACTIVE",
        usedAmount: 0,
        pendingAmount: 0.5,
        remainingAmount: 0.5,
      }),
    ).toThrow();
    expect(() =>
      assertGrantRevocable({
        status: "REVOKED",
        usedAmount: 0,
        pendingAmount: 0,
        remainingAmount: 1,
      }),
    ).toThrow();
  });

  it("validates leave grant form shape and audit action coverage", () => {
    const parsed = leaveGrantFormSchema.safeParse({
      userIds: ["user-1", "user-2"],
      leaveTypeId: "leave-type-1",
      grantedAmount: "2",
      unit: "DAY",
      effectiveFrom: "2026-05-02",
      expiresAt: "",
      reason: "포상휴가 지급",
    });

    expect(parsed.success).toBe(false);
    expect(
      leaveGrantFormSchema.safeParse({
        userIds: ["user-1"],
        leaveTypeId: "leave-type-1",
        grantedAmount: "2",
        unit: "DAY",
        effectiveFrom: "2026-05-02",
        expiresAt: null,
        reason: "포상휴가 지급",
      }).success,
    ).toBe(true);
    expect(isAuditRequiredAction("LEAVE_GRANT_CREATED")).toBe(true);
    expect(isAuditRequiredAction("LEAVE_GRANT_BULK_CREATED")).toBe(true);
    expect(isAuditRequiredAction("LEAVE_GRANT_REVOKED")).toBe(true);
  });
});
