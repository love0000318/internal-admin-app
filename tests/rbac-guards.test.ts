import { describe, expect, it } from "vitest";

import {
  canInviteUser,
  canManageLeaveGrants,
  canManageLeaveTypes,
  canManageLeavePolicy,
  canManageUser,
  canApproveLeaveRequest,
  canCancelApprovedLeaveRequest,
  canRejectLeaveRequest,
  canReviewLeaveRequest,
  canViewLeaveBalance,
} from "@/lib/rbac/guards";
import { buildRequesterWhere } from "@/lib/leave/approval-queries";
import { canAccessRoute } from "@/lib/rbac/server-guards";
import type { RbacUser } from "@/lib/rbac/roles";

const owner: RbacUser = { id: "owner", role: "OWNER", status: "ACTIVE" };
const lead: RbacUser = {
  id: "lead",
  role: "LEAD",
  status: "ACTIVE",
  teamId: "team-a",
  managedTeamIds: ["team-a", "team-a-1"],
};
const managerInLeadTeam: RbacUser = {
  id: "manager-a",
  role: "MANAGER",
  status: "ACTIVE",
  teamId: "team-a-1",
};
const managerInOtherTeam: RbacUser = {
  id: "manager-b",
  role: "MANAGER",
  status: "ACTIVE",
  teamId: "team-b",
};
const externalPartner: RbacUser = {
  id: "external",
  role: "EXTERNAL_PARTNER",
  status: "ACTIVE",
};

describe("rbac guards", () => {
  it("allows only OWNER to invite users and manage leave policies", () => {
    expect(canInviteUser(owner)).toBe(true);
    expect(canInviteUser(lead)).toBe(false);
    expect(canManageLeavePolicy(owner)).toBe(true);
    expect(canManageLeavePolicy(lead)).toBe(false);
    expect(canManageLeaveTypes(owner)).toBe(true);
    expect(canManageLeaveTypes(lead)).toBe(false);
    expect(canManageLeaveTypes(managerInLeadTeam)).toBe(false);
    expect(canManageLeaveGrants(owner)).toBe(true);
    expect(canManageLeaveGrants(lead)).toBe(false);
    expect(canManageLeaveGrants(managerInLeadTeam)).toBe(false);
  });

  it("allows OWNER to manage MVP users", () => {
    expect(canManageUser(owner, managerInLeadTeam)).toBe(true);
    expect(canManageUser(lead, managerInLeadTeam)).toBe(false);
    expect(
      canManageUser(owner, {
        id: "external",
        role: "EXTERNAL_PARTNER",
        status: "ACTIVE",
      }),
    ).toBe(false);
  });

  it("limits LEAD leave review to managed team tree and blocks self approval", () => {
    expect(canReviewLeaveRequest(lead, managerInLeadTeam)).toBe(true);
    expect(canReviewLeaveRequest(lead, managerInOtherTeam)).toBe(false);
    expect(canReviewLeaveRequest(lead, lead)).toBe(false);
    expect(canReviewLeaveRequest(owner, lead)).toBe(true);
  });

  it("enforces leave approval actions by status, scope, and self-review", () => {
    const pendingInLeadTeam = {
      id: "leave-1",
      userId: managerInLeadTeam.id,
      status: "PENDING" as const,
      user: managerInLeadTeam,
    };
    const pendingInOtherTeam = {
      id: "leave-2",
      userId: managerInOtherTeam.id,
      status: "PENDING" as const,
      user: managerInOtherTeam,
    };
    const leadSelfPending = {
      id: "leave-3",
      userId: lead.id,
      status: "PENDING" as const,
      user: lead,
    };
    const approvedInLeadTeam = {
      id: "leave-4",
      userId: managerInLeadTeam.id,
      status: "APPROVED" as const,
      user: managerInLeadTeam,
    };

    expect(canApproveLeaveRequest(owner, pendingInOtherTeam)).toBe(true);
    expect(canRejectLeaveRequest(owner, pendingInOtherTeam)).toBe(true);
    expect(canApproveLeaveRequest(lead, pendingInLeadTeam)).toBe(true);
    expect(canRejectLeaveRequest(lead, pendingInLeadTeam)).toBe(true);
    expect(canApproveLeaveRequest(lead, pendingInOtherTeam)).toBe(false);
    expect(canRejectLeaveRequest(lead, pendingInOtherTeam)).toBe(false);
    expect(canApproveLeaveRequest(lead, leadSelfPending)).toBe(false);
    expect(canRejectLeaveRequest(lead, leadSelfPending)).toBe(false);
    expect(canApproveLeaveRequest(managerInLeadTeam, pendingInLeadTeam)).toBe(false);
    expect(canCancelApprovedLeaveRequest(lead, approvedInLeadTeam)).toBe(true);
    expect(canCancelApprovedLeaveRequest(lead, pendingInLeadTeam)).toBe(false);
  });

  it("limits leave balance visibility by role", () => {
    expect(canViewLeaveBalance(owner, managerInOtherTeam)).toBe(true);
    expect(canViewLeaveBalance(lead, managerInLeadTeam)).toBe(true);
    expect(canViewLeaveBalance(lead, managerInOtherTeam)).toBe(false);
    expect(canViewLeaveBalance(managerInLeadTeam, managerInLeadTeam)).toBe(true);
    expect(canViewLeaveBalance(managerInLeadTeam, managerInOtherTeam)).toBe(
      false,
    );
  });

  it("enforces route access by MVP route policy", () => {
    expect(canAccessRoute(owner, "/organization")).toBe(true);
    expect(canAccessRoute(owner, "/admin/work-management")).toBe(true);
    expect(canAccessRoute(owner, "/admin/leaves/grants")).toBe(true);
    expect(canAccessRoute(owner, "/admin/leaves/birthday-policy")).toBe(true);
    expect(canAccessRoute(owner, "/admin/leaves/promotions")).toBe(true);
    expect(canAccessRoute(owner, "/admin/reports/leaves/promotions")).toBe(true);
    expect(canAccessRoute(managerInLeadTeam, "/notifications")).toBe(true);
    expect(canAccessRoute(lead, "/organization")).toBe(false);
    expect(canAccessRoute(lead, "/admin/work-management")).toBe(false);
    expect(canAccessRoute(lead, "/admin/leaves/grants")).toBe(false);
    expect(canAccessRoute(lead, "/admin/leaves/birthday-policy")).toBe(false);
    expect(canAccessRoute(lead, "/admin/leaves/promotions")).toBe(true);
    expect(canAccessRoute(lead, "/admin/reports/leaves/promotions")).toBe(true);
    expect(canAccessRoute(lead, "/admin/leaves/balances")).toBe(true);
    expect(canAccessRoute(lead, "/leaves/approvals")).toBe(true);
    expect(canAccessRoute(managerInLeadTeam, "/leaves/approvals")).toBe(false);
    expect(canAccessRoute(managerInLeadTeam, "/admin/reports/leaves/promotions")).toBe(
      false,
    );
    expect(canAccessRoute(externalPartner, "/admin/reports/leaves/promotions")).toBe(false);
    expect(canAccessRoute(managerInLeadTeam, "/admin/work-management")).toBe(false);
    expect(canAccessRoute(externalPartner, "/leaves/calendar")).toBe(false);
    expect(canAccessRoute(managerInLeadTeam, "/tasks")).toBe(false);
  });

  it("does not let a LEAD team filter override their review scope", () => {
    expect(
      buildRequesterWhere(lead, {
        teamId: "team-b",
        requester: "홍길동",
      }),
    ).toEqual({
      AND: [
        {
          id: { not: "lead" },
          teamId: { in: ["team-a", "team-a-1"] },
        },
        { teamId: "team-b" },
        {
          OR: [
            { name: { contains: "홍길동", mode: "insensitive" } },
            { email: { contains: "홍길동", mode: "insensitive" } },
          ],
        },
      ],
    });
  });
});
