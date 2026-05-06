import { describe, expect, it } from "vitest";

import {
  assertCanMutateEmployee,
  getEmployeeMutationBlockReason,
  wouldCreateTeamCycle,
} from "@/lib/organization/rules";
import {
  collectDescendantTeamIds,
  describeRoleChangeImpact,
  describeTeamChangeImpact,
  getLeadVisibleTeamIds,
  getLeadVisibleUserIds,
  getManagedScopeForUser,
  isEligibleTeamLeadCandidate,
} from "@/lib/organization/permissions";
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

  it("collects descendant teams with cycle protection and inactive exclusion", () => {
    const teams = [
      { id: "root", parentTeamId: null, status: "ACTIVE" as const },
      { id: "child", parentTeamId: "root", status: "ACTIVE" as const },
      { id: "grandchild", parentTeamId: "child", status: "ACTIVE" as const },
      { id: "inactive", parentTeamId: "root", status: "INACTIVE" as const },
      { id: "cycle-a", parentTeamId: "cycle-b", status: "ACTIVE" as const },
      { id: "cycle-b", parentTeamId: "cycle-a", status: "ACTIVE" as const },
    ];

    expect(
      collectDescendantTeamIds({ rootTeamIds: ["root"], teams }),
    ).toEqual(["child", "grandchild", "root"]);
    expect(
      collectDescendantTeamIds({ rootTeamIds: ["cycle-a"], teams }),
    ).toEqual(["cycle-a", "cycle-b"]);
  });

  it("limits team lead candidates to active OWNER or LEAD users", () => {
    expect(isEligibleTeamLeadCandidate({ role: "LEAD", status: "ACTIVE" })).toBe(true);
    expect(isEligibleTeamLeadCandidate({ role: "OWNER", status: "ACTIVE" })).toBe(true);
    expect(isEligibleTeamLeadCandidate({ role: "MANAGER", status: "ACTIVE" })).toBe(false);
    expect(
      isEligibleTeamLeadCandidate({
        role: "EXTERNAL_PARTNER",
        status: "ACTIVE",
      }),
    ).toBe(false);
    expect(isEligibleTeamLeadCandidate({ role: "LEAD", status: "DEACTIVATED" })).toBe(false);
  });

  it("calculates LEAD visible teams and users from assigned team trees", async () => {
    const prisma = createOrganizationPrismaMock();

    await expect(getLeadVisibleTeamIds("lead-a", prisma as never)).resolves.toEqual([
      "team-a",
      "team-a-child",
    ]);
    await expect(getLeadVisibleUserIds("lead-a", prisma as never)).resolves.toEqual([
      "employee-a",
      "lead-a",
    ]);
  });

  it("returns managed scopes by role without exposing internal data to external partners", async () => {
    const prisma = createOrganizationPrismaMock();
    const ownerScope = await getManagedScopeForUser(
      { id: "owner", role: "OWNER", status: "ACTIVE" },
      "REPORT",
      prisma as never,
    );
    const leadScope = await getManagedScopeForUser(
      { id: "lead-a", role: "LEAD", status: "ACTIVE" },
      "LEAVE_APPROVAL",
      prisma as never,
    );
    const managerScope = await getManagedScopeForUser(
      { id: "employee-a", role: "MANAGER", status: "ACTIVE" },
      "EMPLOYEE_DIRECTORY",
      prisma as never,
    );
    const externalScope = await getManagedScopeForUser(
      { id: "external", role: "EXTERNAL_PARTNER", status: "ACTIVE" },
      "REPORT",
      prisma as never,
    );

    expect(ownerScope.scope).toBe("ALL");
    expect(ownerScope.userIds.sort()).toEqual(["employee-a", "employee-b", "lead-a", "owner"]);
    expect(ownerScope.canExport).toBe(true);
    expect(leadScope).toMatchObject({
      scope: "MANAGED_TEAMS",
      teamIds: ["team-a", "team-a-child"],
      userIds: ["employee-a", "lead-a"],
      canExport: false,
      canMutate: true,
    });
    expect(managerScope).toEqual({
      scope: "SELF",
      teamIds: [],
      userIds: ["employee-a"],
      canExport: false,
      canMutate: false,
    });
    expect(externalScope).toEqual({
      scope: "NONE",
      teamIds: [],
      userIds: [],
      canExport: false,
      canMutate: false,
    });
  });

  it("describes role and team change impact before saving", () => {
    expect(
      describeRoleChangeImpact({
        previousRole: "MANAGER",
        nextRole: "LEAD",
        managedTeamCount: 2,
        managedUserCount: 5,
      }),
    ).toContain("팀 2개");
    expect(
      describeRoleChangeImpact({
        previousRole: "OWNER",
        nextRole: "MANAGER",
        managedTeamCount: 0,
        managedUserCount: 0,
      }),
    ).toContain("마지막 OWNER");
    expect(
      describeTeamChangeImpact({
        previousTeamName: "CS",
        nextTeamName: "Ops",
        previousLeadNames: ["Lead A"],
        nextLeadNames: ["Lead B"],
      }),
    ).toContain("Lead B");
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
    expect(canAccessRoute(owner, "/admin/organization/permissions-preview")).toBe(true);
    expect(canAccessRoute(lead, "/organization")).toBe(false);
    expect(canAccessRoute(lead, "/admin/organization/permissions-preview")).toBe(false);
    expect(canAccessRoute(manager, "/organization/teams")).toBe(false);
  });
});

function createOrganizationPrismaMock() {
  const teams = [
    {
      id: "team-a",
      parentTeamId: null,
      leadUserId: "lead-a",
      status: "ACTIVE" as const,
    },
    {
      id: "team-a-child",
      parentTeamId: "team-a",
      leadUserId: null,
      status: "ACTIVE" as const,
    },
    {
      id: "team-b",
      parentTeamId: null,
      leadUserId: null,
      status: "ACTIVE" as const,
    },
  ];
  const users = [
    {
      id: "owner",
      role: "OWNER" as const,
      status: "ACTIVE" as const,
      teamId: null,
    },
    {
      id: "lead-a",
      role: "LEAD" as const,
      status: "ACTIVE" as const,
      teamId: "team-a",
    },
    {
      id: "employee-a",
      role: "MANAGER" as const,
      status: "ACTIVE" as const,
      teamId: "team-a-child",
    },
    {
      id: "employee-b",
      role: "MANAGER" as const,
      status: "ACTIVE" as const,
      teamId: "team-b",
    },
    {
      id: "external",
      role: "EXTERNAL_PARTNER" as const,
      status: "ACTIVE" as const,
      teamId: "team-b",
    },
  ];

  return {
    team: {
      findMany: async (args?: {
        where?: { leadUserId?: string; status?: "ACTIVE" };
      }) => {
        let result = teams;
        if (args?.where?.status) {
          result = result.filter((team) => team.status === args.where?.status);
        }
        if (args?.where?.leadUserId) {
          result = result.filter(
            (team) => team.leadUserId === args.where?.leadUserId,
          );
        }
        return result;
      },
    },
    user: {
      findMany: async (args?: {
        where?: {
          status?: "ACTIVE";
          role?: { not?: "EXTERNAL_PARTNER" };
          teamId?: { in?: string[] };
        };
      }) => {
        let result = users;
        if (args?.where?.status) {
          result = result.filter((user) => user.status === args.where?.status);
        }
        if (args?.where?.role?.not) {
          result = result.filter((user) => user.role !== args.where?.role?.not);
        }
        if (args?.where?.teamId?.in) {
          result = result.filter((user) =>
            user.teamId ? args.where?.teamId?.in?.includes(user.teamId) : false,
          );
        }
        return result;
      },
    },
  };
}
