import { describe, expect, it } from "vitest";

import {
  assertAttachmentRequirementForApproval,
  canApproveLeaveRequestWithPolicy,
  canCancelApprovedLeaveRequestWithPolicy,
  canRejectLeaveRequestWithPolicy,
} from "@/lib/leave/approval-policy";
import { Prisma } from "@/generated/prisma/client";
import type { RbacUser } from "@/lib/rbac/roles";

const requester = {
  id: "requester",
  role: "MANAGER" as const,
  status: "ACTIVE" as const,
  teamId: "team-a",
  name: "요청자",
};

function request(status: "PENDING" | "APPROVED" = "PENDING") {
  return {
    id: "request-1",
    userId: requester.id,
    type: "ANNUAL" as const,
    requestKind: "LEGACY" as const,
    leaveTypeId: null,
    status,
    startDate: new Date("2026-05-10T00:00:00.000Z"),
    endDate: new Date("2026-05-10T00:00:00.000Z"),
    halfDayPeriod: null,
    dayCount: new Prisma.Decimal(1),
    reason: null,
    attachmentRequired: false,
    attachmentUrl: null,
    attachmentStatus: "NOT_REQUIRED" as const,
    reviewerId: null,
    reviewedAt: null,
    reviewComment: null,
    rejectReason: null,
    cancelReason: null,
    withdrawnAt: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: requester,
    customLeaveType: null,
  };
}

function policy(rule: "OWNER" | "TEAM_LEAD" | "TEAM_LEAD_OR_OWNER" | "CUSTOM_USER") {
  return {
    approvalMode: "SINGLE" as const,
    approverRule: rule,
    customApproverUserId: rule === "CUSTOM_USER" ? "custom-approver" : null,
  };
}

const owner: RbacUser = { id: "owner", role: "OWNER", status: "ACTIVE" };
const lead: RbacUser = {
  id: "lead",
  role: "LEAD",
  status: "ACTIVE",
  managedTeamIds: ["team-a"],
};
const outsideLead: RbacUser = {
  id: "outside",
  role: "LEAD",
  status: "ACTIVE",
  managedTeamIds: ["team-b"],
};
const manager: RbacUser = { id: "manager", role: "MANAGER", status: "ACTIVE" };

describe("approval policy authorization", () => {
  it("allows only OWNER for OWNER policy", () => {
    expect(canApproveLeaveRequestWithPolicy(owner, request(), policy("OWNER"))).toBe(true);
    expect(canApproveLeaveRequestWithPolicy(lead, request(), policy("OWNER"))).toBe(false);
  });

  it("allows scoped team lead for TEAM_LEAD policy", () => {
    expect(canApproveLeaveRequestWithPolicy(lead, request(), policy("TEAM_LEAD"))).toBe(true);
    expect(canApproveLeaveRequestWithPolicy(outsideLead, request(), policy("TEAM_LEAD"))).toBe(false);
    expect(canApproveLeaveRequestWithPolicy(owner, request(), policy("TEAM_LEAD"))).toBe(true);
  });

  it("allows OWNER and scoped team lead for TEAM_LEAD_OR_OWNER policy", () => {
    expect(canApproveLeaveRequestWithPolicy(owner, request(), policy("TEAM_LEAD_OR_OWNER"))).toBe(true);
    expect(canApproveLeaveRequestWithPolicy(lead, request(), policy("TEAM_LEAD_OR_OWNER"))).toBe(true);
    expect(canApproveLeaveRequestWithPolicy(manager, request(), policy("TEAM_LEAD_OR_OWNER"))).toBe(false);
  });

  it("allows custom approver and OWNER for CUSTOM_USER policy", () => {
    const customApprover: RbacUser = {
      id: "custom-approver",
      role: "LEAD",
      status: "ACTIVE",
    };

    expect(canApproveLeaveRequestWithPolicy(customApprover, request(), policy("CUSTOM_USER"))).toBe(true);
    expect(canApproveLeaveRequestWithPolicy(owner, request(), policy("CUSTOM_USER"))).toBe(true);
    expect(canApproveLeaveRequestWithPolicy(lead, request(), policy("CUSTOM_USER"))).toBe(false);
  });

  it("blocks requester self approval and NONE mode manual approval", () => {
    const self: RbacUser = {
      id: requester.id,
      role: "OWNER",
      status: "ACTIVE",
    };

    expect(canApproveLeaveRequestWithPolicy(self, request(), policy("OWNER"))).toBe(false);
    expect(
      canApproveLeaveRequestWithPolicy(owner, request(), {
        approvalMode: "NONE",
        approverRule: "OWNER",
        customApproverUserId: null,
      }),
    ).toBe(false);
  });

  it("uses the same policy rule for reject and cancel", () => {
    expect(canRejectLeaveRequestWithPolicy(lead, request(), policy("TEAM_LEAD"))).toBe(true);
    expect(canCancelApprovedLeaveRequestWithPolicy(lead, request("APPROVED"), policy("TEAM_LEAD"))).toBe(true);
  });

  it("requires accepted attachment when the policy demands evidence review", () => {
    expect(() =>
      assertAttachmentRequirementForApproval(
        { attachmentStatus: "SUBMITTED" },
        { requireAttachmentAcceptedBeforeApproval: true },
      ),
    ).toThrow("attachment-not-accepted");
    expect(() =>
      assertAttachmentRequirementForApproval(
        { attachmentStatus: "ACCEPTED" },
        { requireAttachmentAcceptedBeforeApproval: true },
      ),
    ).not.toThrow();
  });
});
