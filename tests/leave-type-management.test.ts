import { describe, expect, it } from "vitest";

import { isAuditRequiredAction } from "@/lib/audit/audit-log";
import {
  assertSystemRequiredLeaveTypeProtection,
  changedFields,
  deserializeAllowedUnits,
  leaveTypeCreateSchema,
  normalizeLeaveTypeCode,
  serializeAllowedUnits,
  validateAllowedUnits,
  validateLeaveTypeCode,
  validatePaidRate,
} from "@/lib/leave/leave-types";

describe("leave type management helpers", () => {
  it("normalizes and validates leave type codes", () => {
    expect(normalizeLeaveTypeCode(" refresh leave ")).toBe("REFRESH_LEAVE");
    expect(validateLeaveTypeCode("REFRESH_2026")).toBe(true);
    expect(validateLeaveTypeCode("refresh")).toBe(false);
    expect(validateLeaveTypeCode("REFRESH-LEAVE")).toBe(false);
  });

  it("validates paid rate boundaries", () => {
    expect(validatePaidRate(0)).toBe(true);
    expect(validatePaidRate(0.5)).toBe(true);
    expect(validatePaidRate(1)).toBe(true);
    expect(validatePaidRate(-0.1)).toBe(false);
    expect(validatePaidRate(1.1)).toBe(false);
  });

  it("requires at least one allowed usage unit", () => {
    expect(validateAllowedUnits(["FULL_DAY"])).toBe(true);
    expect(validateAllowedUnits(["FULL_DAY", "HALF_DAY"])).toBe(true);
    expect(validateAllowedUnits([])).toBe(false);
    expect(deserializeAllowedUnits(serializeAllowedUnits(["FULL_DAY", "HALF_DAY"]))).toEqual([
      "FULL_DAY",
      "HALF_DAY",
    ]);
  });

  it("protects system required leave type code and category", () => {
    expect(() =>
      assertSystemRequiredLeaveTypeProtection({
        isSystemRequired: true,
        beforeCode: "ANNUAL",
        nextCode: "CUSTOM_ANNUAL",
        beforeCategory: "ANNUAL",
        nextCategory: "ANNUAL",
      }),
    ).toThrow("시스템 기본 휴가의 코드는 변경할 수 없습니다.");

    expect(() =>
      assertSystemRequiredLeaveTypeProtection({
        isSystemRequired: true,
        beforeCode: "ANNUAL",
        nextCode: "ANNUAL",
        beforeCategory: "ANNUAL",
        nextCategory: "CUSTOM",
      }),
    ).toThrow("시스템 기본 휴가의 구분은 변경할 수 없습니다.");

    expect(() =>
      assertSystemRequiredLeaveTypeProtection({
        isSystemRequired: false,
        beforeCode: "REFRESH",
        nextCode: "REFRESH_2",
        beforeCategory: "CUSTOM",
        nextCategory: "CUSTOM",
      }),
    ).not.toThrow();
  });

  it("validates create input shape", () => {
    const parsed = leaveTypeCreateSchema.safeParse({
      code: "refresh",
      name: "리프레시",
      description: null,
      category: "CUSTOM",
      isEnabled: "on",
      isPaid: "on",
      paidRate: "1",
      grantMethod: "MANUAL",
      grantAmount: "",
      grantUnit: "DAY",
      usageMode: "SPLIT_ALLOWED",
      allowedUnits: ["FULL_DAY", "HALF_DAY"],
      unusedRemainderHandling: "KEEP_REMAINING",
      deductsAnnualBalance: null,
      attachmentPolicy: "NOT_REQUIRED",
      attachmentDescription: null,
      includeHolidayInDeduction: null,
      visibility: "PUBLIC_WITH_TYPE",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.code).toBe("REFRESH");
      expect(parsed.data.grantAmount).toBeNull();
    }
  });

  it("tracks changed fields and marks leave type audit actions required", () => {
    expect(changedFields({ name: "A", enabled: true }, { name: "B", enabled: true })).toEqual([
      "name",
    ]);
    expect(isAuditRequiredAction("LEAVE_TYPE_CREATED")).toBe(true);
    expect(isAuditRequiredAction("LEAVE_TYPE_UPDATED")).toBe(true);
    expect(isAuditRequiredAction("LEAVE_TYPE_DEACTIVATED")).toBe(true);
  });
});
