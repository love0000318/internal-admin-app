import { describe, expect, it } from "vitest";

import {
  assertCanMutateEmployee,
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
    expect(validateEmail("jack@curinginnos.com")).toBe(true);
    expect(validateEmail("not-email")).toBe(false);

    expect(
      inviteEmployeeSchema.safeParse({
        name: "홍길동",
        email: "employee@example.com",
        role: "MANAGER",
      }).success,
    ).toBe(true);
    expect(
      inviteEmployeeSchema.safeParse({
        name: "홍길동",
        email: "employee@example.com",
        role: "OWNER",
      }).success,
    ).toBe(false);
  });

  it("validates team input", () => {
    expect(teamInputSchema.safeParse({ name: "사업팀" }).success).toBe(true);
    expect(teamInputSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("detects future birth dates for server-side employee validation", () => {
    expect(isFutureDateOnly("2026-05-02", "2026-05-01")).toBe(true);
    expect(isFutureDateOnly("2026-05-01", "2026-05-01")).toBe(false);
    expect(isFutureDateOnly("2026-04-30", "2026-05-01")).toBe(false);
  });

  it("prevents self deactivation and self role downgrade", () => {
    expect(() =>
      assertCanMutateEmployee({
        actorId: "owner-1",
        target: { id: "owner-1", role: "OWNER", status: "ACTIVE" },
        nextRole: "OWNER",
        nextStatus: "DEACTIVATED",
        activeOwnerCount: 2,
      }),
    ).toThrow("자기 자신의 계정을 비활성화할 수 없습니다.");

    expect(() =>
      assertCanMutateEmployee({
        actorId: "owner-1",
        target: { id: "owner-1", role: "OWNER", status: "ACTIVE" },
        nextRole: "MANAGER",
        nextStatus: "ACTIVE",
        activeOwnerCount: 2,
      }),
    ).toThrow("자기 자신의 role을 낮출 수 없습니다.");
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
    ).toThrow("마지막 OWNER 계정을 비활성화할 수 없습니다.");

    expect(() =>
      assertCanMutateEmployee({
        actorId: "owner-2",
        target: { id: "owner-1", role: "OWNER", status: "ACTIVE" },
        nextRole: "LEAD",
        nextStatus: "ACTIVE",
        activeOwnerCount: 1,
      }),
    ).toThrow("마지막 OWNER의 role을 변경할 수 없습니다.");
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
