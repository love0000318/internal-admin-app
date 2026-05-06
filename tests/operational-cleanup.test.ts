import { describe, expect, it } from "vitest";

import {
  assertOperationalCleanupApplyAllowed,
  buildCleanupPlan,
  cutoffDate,
  PROTECTED_BUSINESS_TABLES,
} from "@/lib/cleanup/operational-cleanup";

describe("operational cleanup plan", () => {
  it("defaults to dry-run safe operational targets only", () => {
    const plan = buildCleanupPlan({
      mode: "dry-run",
      only: "all",
      limit: 500,
      verbose: false,
    });

    expect(plan.items.map((item) => item.target)).toEqual([
      "sessions",
      "invitations",
      "verification-codes",
      "notifications",
      "job-runs",
      "imports",
      "files",
    ]);
    expect(plan.items.every((item) => item.protected === false)).toBe(true);
    expect(plan.protectedTables).toEqual([...PROTECTED_BUSINESS_TABLES]);
    expect(plan.protectedTables).toEqual(
      expect.arrayContaining([
        "LeaveRequest",
        "LeaveLedger",
        "LeaveGrant",
        "LeaveAdjustment",
        "AttendanceRecord",
        "AuditLog",
      ]),
    );
  });

  it("selects a single target when --only is used", () => {
    const plan = buildCleanupPlan({
      mode: "dry-run",
      only: "sessions",
      limit: 50,
      verbose: false,
    });

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({
      target: "sessions",
      retentionDays: 30,
      action: "delete",
    });
  });

  it("keeps verification code cleanup as a hash-clearing update", () => {
    const plan = buildCleanupPlan({
      mode: "dry-run",
      only: "verification-codes",
      limit: 50,
      verbose: false,
    });

    expect(plan.items[0]).toMatchObject({
      target: "verification-codes",
      action: "update",
      retentionDays: 30,
    });
  });

  it("uses inspect-only mode for files in this MVP", () => {
    const plan = buildCleanupPlan({
      mode: "dry-run",
      only: "files",
      limit: 50,
      verbose: false,
    });

    expect(plan.items[0]).toMatchObject({
      target: "files",
      action: "inspect-only",
    });
  });

  it("calculates retention cutoffs deterministically", () => {
    expect(cutoffDate(new Date("2026-05-06T00:00:00.000Z"), 30).toISOString()).toBe(
      "2026-04-06T00:00:00.000Z",
    );
  });

  it("blocks apply mode without explicit confirmation", () => {
    expect(() =>
      assertOperationalCleanupApplyAllowed(
        {
          mode: "apply",
        },
        {},
      ),
    ).toThrow("CONFIRM_OPERATIONAL_CLEANUP=true");
  });

  it("allows dry-run without confirmation", () => {
    expect(() =>
      assertOperationalCleanupApplyAllowed(
        {
          mode: "dry-run",
        },
        {},
      ),
    ).not.toThrow();
  });
});
