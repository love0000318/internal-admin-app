import { describe, expect, it } from "vitest";

import {
  assertCanViewLeaveBalances,
  assertCanViewUserLeaveBalance,
  collectDescendantTeamIds,
  getLeaveBalanceScope,
} from "@/lib/leave/balance-scope";
import type { RbacUser } from "@/lib/rbac/roles";

const owner: RbacUser = { id: "owner", role: "OWNER", status: "ACTIVE" };
const lead: RbacUser = { id: "lead", role: "LEAD", status: "ACTIVE", teamId: "team-a" };
const manager: RbacUser = {
  id: "manager-a",
  role: "MANAGER",
  status: "ACTIVE",
  teamId: "team-a-child",
};
const external: RbacUser = {
  id: "external",
  role: "EXTERNAL_PARTNER",
  status: "ACTIVE",
};

function createMockPrisma() {
  const teams = [
    { id: "team-a", parentTeamId: null, leadUserId: "lead", status: "ACTIVE" },
    { id: "team-a-child", parentTeamId: "team-a", leadUserId: null, status: "ACTIVE" },
    { id: "team-b", parentTeamId: null, leadUserId: null, status: "ACTIVE" },
    { id: "team-a-inactive", parentTeamId: "team-a", leadUserId: null, status: "INACTIVE" },
  ];
  const users = [
    { id: "owner", role: "OWNER", status: "ACTIVE", teamId: "team-b" },
    { id: "lead", role: "LEAD", status: "ACTIVE", teamId: "team-a" },
    { id: "manager-a", role: "MANAGER", status: "ACTIVE", teamId: "team-a-child" },
    { id: "manager-b", role: "MANAGER", status: "ACTIVE", teamId: "team-b" },
    { id: "deleted", role: "MANAGER", status: "DELETED", teamId: "team-a" },
    { id: "partner", role: "EXTERNAL_PARTNER", status: "ACTIVE", teamId: "team-a" },
  ];

  return {
    team: {
      findMany: async () => teams,
    },
    user: {
      findMany: async ({ where }: { where?: { teamId?: { in?: string[] } } }) => {
        const teamIds = where?.teamId?.in;

        return users
          .filter((user) => user.status === "ACTIVE")
          .filter((user) => user.role !== "EXTERNAL_PARTNER")
          .filter((user) => !teamIds || teamIds.includes(user.teamId))
          .map((user) => ({ id: user.id }));
      },
    },
  };
}

describe("leave balance scope", () => {
  it("collects active descendant teams and ignores inactive descendants", () => {
    expect(
      collectDescendantTeamIds({
        rootTeamIds: ["team-a"],
        teams: [
          { id: "team-a", parentTeamId: null, status: "ACTIVE" },
          { id: "team-a-child", parentTeamId: "team-a", status: "ACTIVE" },
          { id: "team-a-grandchild", parentTeamId: "team-a-child", status: "ACTIVE" },
          { id: "team-a-inactive", parentTeamId: "team-a", status: "INACTIVE" },
          { id: "team-b", parentTeamId: null, status: "ACTIVE" },
        ],
      }).sort(),
    ).toEqual(["team-a", "team-a-child", "team-a-grandchild"]);
  });

  it("returns ALL scope for OWNER", async () => {
    const scope = await getLeaveBalanceScope(owner, createMockPrisma() as never);

    expect(scope.scope).toBe("ALL");
    expect(scope.userIds.sort()).toEqual(["lead", "manager-a", "manager-b", "owner"]);
  });

  it("returns managed team and child team members for LEAD", async () => {
    const scope = await getLeaveBalanceScope(lead, createMockPrisma() as never);

    expect(scope.scope).toBe("MANAGED_TEAMS");
    expect(scope.teamIds.sort()).toEqual(["team-a", "team-a-child"]);
    expect(scope.userIds.sort()).toEqual(["lead", "manager-a"]);
  });

  it("returns SELF scope for MANAGER and NONE for EXTERNAL_PARTNER", async () => {
    await expect(getLeaveBalanceScope(manager, createMockPrisma() as never)).resolves.toEqual({
      scope: "SELF",
      userIds: ["manager-a"],
      teamIds: ["team-a-child"],
    });
    await expect(getLeaveBalanceScope(external, createMockPrisma() as never)).resolves.toEqual({
      scope: "NONE",
      userIds: [],
      teamIds: [],
    });
  });

  it("allows only OWNER and LEAD to open the member balance list", () => {
    expect(() => assertCanViewLeaveBalances(owner)).not.toThrow();
    expect(() => assertCanViewLeaveBalances(lead)).not.toThrow();
    expect(() => assertCanViewLeaveBalances(manager)).toThrow("접근 권한이 없습니다.");
    expect(() => assertCanViewLeaveBalances(external)).toThrow("접근 권한이 없습니다.");
  });

  it("blocks LEAD and MANAGER from users outside their scope", async () => {
    await expect(
      assertCanViewUserLeaveBalance(lead, "manager-b", createMockPrisma() as never),
    ).rejects.toThrow("접근 권한이 없습니다.");
    await expect(
      assertCanViewUserLeaveBalance(manager, "manager-b", createMockPrisma() as never),
    ).rejects.toThrow("접근 권한이 없습니다.");
    await expect(
      assertCanViewUserLeaveBalance(lead, "manager-a", createMockPrisma() as never),
    ).resolves.toBeTruthy();
  });
});
