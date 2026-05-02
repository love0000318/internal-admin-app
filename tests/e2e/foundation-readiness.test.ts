import { describe, expect, it } from "vitest";

import { hashToken } from "@/lib/security/token";
import type { InvitationTokenRules } from "@/types/invitation";
import type { LeaveCalculationRules } from "@/types/leave";

describe("foundation readiness", () => {
  it("documents invite token storage as hash-only", () => {
    const rules: InvitationTokenRules = {
      storeRawToken: false,
      hashAlgorithm: "HMAC-SHA256",
      oneTimeUse: true,
    };

    expect(rules.storeRawToken).toBe(false);
    expect(hashToken("example-token", "invite")).toHaveLength(64);
  });

  it("documents leave calculation constraints before implementation", () => {
    const rules: LeaveCalculationRules = {
      timezone: "Asia/Seoul",
      dateOnly: true,
      excludeWeekends: true,
      excludeCompanyHolidays: true,
      annualUnderOneYearMonthlyGrant: 1,
      annualUnderOneYearCap: 11,
      annualAfterOneYearBase: 15,
      annualAdditionalEveryTwoYearsAfterThirdYear: 1,
      annualEntitlementCap: 25,
      halfDayValue: 0.5,
      halfDaySingleDateOnly: true,
    };

    expect(rules).toMatchObject({
      timezone: "Asia/Seoul",
      dateOnly: true,
      halfDayValue: 0.5,
    });
  });
});
