import { describe, expect, it } from "vitest";

import {
  assertCanMutateEmployee,
  getEmployeeMutationBlockReason,
  wouldCreateTeamCycle,
} from "@/lib/organization/rules";
import { calculateTenureDays } from "@/lib/organization/tenure";
import {
  inviteEmployeeSchema,
  isFutureDateOnly,
  teamInputSchema,
  validateEmail,
} from "@/lib/organization/validation";
import { canAccessRoute } from "@/lib/rbac/server-guards";
import type { RbacUser } from "@/lib/rbac/roles";

describe("organization rules", () => {
  it("calculates tenure days by Asia/Seoul date-only values", () => {
    expect(calculateTenureDays("2026-05-01", "2026-05-01")).toBe(1);
    expect(calculateTenureDays("2026-05-01", "2026-05-10")).toBe(10);
    expect(calculateTenureDays(null, "2026-05-10")).toBeNull();
  });

  it("validates email and employee invitation input", () => {
    expect(validateEmail("jack@example.com")).toBe(true);
    expect(validateEmail("not-email")).toBe(false);

    expect(
      inviteEmployeeSchema.safeParse({
        name: "Employee",
        email: "employee@example.com",
        role: "MANAGER",
      }).success,
    ).toBe(true);
    expect(
      inviteEmployeeSchema.safeParse({
        name: "Employee",
        email: "employee@example.com",
        role: "OWNER",
      }).success,
    ).toBe(false);
  });

  it("validates team input", () => {
    expect(teamInputSchema.safeParse({ name: "Business" }).success).toBe(true);
    expect(teamInputSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("detects future birth dates for server-side employee validation", () => {
    expect(isFutureDateOnly("2026-05-02", "2026-05-01")).toBe(true);
    expect(isFutureDateOnly("2026-05-01", "2026-05-01")).toBe(false);
    expect(isFutureDateOnly("2026-04-30", "2026-05-01")).toBe(false);
  });

  it("prevents self deactivation and self owner downgrade", () => {
    const selfDeactivate = {
      actorId: "owner-1",
      target: { id: "owner-1", role: "OWNER" as const, status: "ACTIVE" as const },
      nextRole: "OWNER" as const,
      nextStatus: "DEACTIVATED" as const,
      activeOwnerCount: 2,
    };

    expect(getEmployeeMutationBlockReason(selfDeactivate)).toBe(
      "SELF_DEACTIVATION_BLOCKED",
    );
    expect(() => assertCanMutateEmployee(selfDeactivate)).toThrow(
      "SELF_DEACTIVATION_BLOCKED",
    );

    expect(() =>
      assertCanMutateEmployee({
        actorId: "owner-1",
        target: { id: "owner-1", role: "OWNER", status: "ACTIVE" },
        nextRole: "MANAGER",
        nextStatus: "ACTIVE",
        activeOwnerCount: 2,
      }),
    ).toThrow("SELF_OWNER_ROLE_DOWNGRADE_BLOCKED");
  });

  it("prevents last OWNER deactivation or role change", () => {
    expect(() =>
      assertCanMutateEmployee({
        actorId: "owner-2",
        target: { id: "owner-1", role: "OWNER", status: "ACTIVE" },
        nextRole: "OWNER",
        nextStatus: "DEACTIVATED",
        activeOwnerCount: 1,
      }),
    ).toThrow("LAST_OWNER_DEACTIVATION_BLOCKED");

    expect(() =>
      assertCanMutateEmployee({
        actorId: "owner-2",
        target: { id: "owner-1", role: "OWNER", status: "ACTIVE" },
        nextRole: "LEAD",
        nextStatus: "ACTIVE",
        activeOwnerCount: 1,
      }),
    ).toThrow("LAST_OWNER_ROLE_CHANGE_BLOCKED");
  });

  it("allows a different active OWNER to grant OWNER role after step-up", () => {
    expect(() =>
      assertCanMutateEmployee({
        actorId: "owner-1",
        target: { id: "manager-1", role: "MANAGER", status: "ACTIVE" },
        nextRole: "OWNER",
        nextStatus: "ACTIVE",
        activeOwnerCount: 1,
      }),
    ).not.toThrow();
  });

  it("requires OWNER grants to target active internal users", () => {
    expect(
      getEmployeeMutationBlockReason({
        actorId: "owner-1",
        target: { id: "manager-1", role: "MANAGER", status: "SUSPENDED" },
        nextRole: "OWNER",
        nextStatus: "SUSPENDED",
        activeOwnerCount: 1,
      }),
    ).toBe("OWNER_GRANT_TARGET_NOT_ACTIVE");

    expect(
      getEmployeeMutationBlockReason({
        actorId: "owner-1",
        target: {
          id: "external-1",
          role: "EXTERNAL_PARTNER",
          status: "ACTIVE",
        },
        nextRole: "OWNER",
        nextStatus: "ACTIVE",
        activeOwnerCount: 1,
      }),
    ).toBe("OWNER_GRANT_EXTERNAL_PARTNER_BLOCKED");
  });

  it("prevents team parent cycles", () => {
    const teams = [
      { id: "a", parentTeamId: null },
      { id: "b", parentTeamId: "a" },
      { id: "c", parentTeamId: "b" },
    ];

    expect(wouldCreateTeamCycle("a", "c", teams)).toBe(true);
    expect(wouldCreateTeamCycle("c", "a", teams)).toBe(false);
    expect(wouldCreateTeamCycle("a", "a", teams)).toBe(true);
  });

  it("keeps organization routes OWNER-only", () => {
    const owner: RbacUser = { id: "owner", role: "OWNER", status: "ACTIVE" };
    const lead: RbacUser = { id: "lead", role: "LEAD", status: "ACTIVE" };
    const manager: RbacUser = {
      id: "manager",
      role: "MANAGER",
      status: "ACTIVE",
    };

    expect(canAccessRoute(owner, "/organization")).toBe(true);
    expect(canAccessRoute(owner, "/organization/employees/user-1")).toBe(true);
    expect(canAccessRoute(lead, "/organization")).toBe(false);
    expect(canAccessRoute(manager, "/organization/teams")).toBe(false);
  });
});
