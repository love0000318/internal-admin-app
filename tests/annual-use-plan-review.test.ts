import { describe, expect, it, vi } from "vitest";

import {
  canReviewAnnualUsePlan,
  canSubmitAnnualUsePlan,
  deriveAnnualUsePlanReviewStatus,
  notifyAnnualUsePlanSubmittedForReview,
  reviewAnnualUsePlan,
  type AnnualUsePlanReviewHistoryItem,
} from "@/lib/leave/annual-use-plan-review";
import type { RbacUser } from "@/lib/rbac/roles";

const owner: RbacUser = { id: "owner", role: "OWNER", status: "ACTIVE" };
const lead: RbacUser = {
  id: "lead-a",
  role: "LEAD",
  status: "ACTIVE",
  managedTeamIds: ["team-a", "team-a-child"],
};
const manager: RbacUser = { id: "manager", role: "MANAGER", status: "ACTIVE" };

function reviewHistory(
  actionType: "CONFIRMED" | "REVISION_REQUESTED",
  reviewedAt: Date,
): AnnualUsePlanReviewHistoryItem[] {
  return [
    {
      id: "audit-1",
      planId: "plan-1",
      actionType,
      previousStatus: "SUBMITTED",
      nextStatus: actionType === "CONFIRMED" ? "CONFIRMED" : "REVISION_REQUESTED",
      reviewerUserId: "owner",
      reviewerName: "Owner",
      reviewedAt,
      revisionReason: actionType === "REVISION_REQUESTED" ? "일정 확인 필요" : null,
      createdAt: reviewedAt,
    },
  ];
}

describe("annual use-plan review", () => {
  it("allows OWNER and scoped LEAD to review while blocking self and out-of-scope users", () => {
    expect(canReviewAnnualUsePlan(owner, { id: "target", teamId: "team-z" })).toBe(true);
    expect(canReviewAnnualUsePlan(lead, { id: "target", teamId: "team-a-child" })).toBe(
      true,
    );
    expect(canReviewAnnualUsePlan(lead, { id: "lead-a", teamId: "team-a" })).toBe(
      false,
    );
    expect(canReviewAnnualUsePlan(lead, { id: "target", teamId: "team-b" })).toBe(
      false,
    );
    expect(canReviewAnnualUsePlan(manager, { id: "target", teamId: "team-a" })).toBe(
      false,
    );
  });

  it("derives confirmed, revision-requested, and resubmitted states from AuditLog history", () => {
    const submittedAt = new Date("2026-07-01T00:00:00.000Z");
    const plan = { status: "SUBMITTED" as const, submittedAt };

    expect(
      deriveAnnualUsePlanReviewStatus(
        plan,
        reviewHistory("CONFIRMED", new Date("2026-07-01T01:00:00.000Z")),
      ),
    ).toBe("CONFIRMED");
    expect(
      deriveAnnualUsePlanReviewStatus(
        plan,
        reviewHistory("REVISION_REQUESTED", new Date("2026-07-01T01:00:00.000Z")),
      ),
    ).toBe("REVISION_REQUESTED");
    expect(
      deriveAnnualUsePlanReviewStatus(
        plan,
        reviewHistory("REVISION_REQUESTED", new Date("2026-06-30T01:00:00.000Z")),
      ),
    ).toBe("RESUBMITTED");
    expect(canSubmitAnnualUsePlan(plan, reviewHistory("REVISION_REQUESTED", new Date()))).toBe(
      true,
    );
    expect(canSubmitAnnualUsePlan(plan, reviewHistory("CONFIRMED", new Date()))).toBe(
      false,
    );
  });

  it("notifies OWNER and scoped LEAD when an employee submits a use plan", async () => {
    const notifications: Array<Record<string, unknown>> = [];
    const prisma = {
      annualLeaveUsePlan: {
        findUnique: vi.fn(async () => ({
          id: "plan-1",
          userId: "employee-a",
          referenceYear: 2026,
          status: "SUBMITTED",
          submittedAt: new Date("2026-07-01T00:00:00.000Z"),
          totalPlannedAmount: 3,
          user: { id: "employee-a", name: "홍길동" },
        })),
      },
      user: {
        findMany: vi.fn(async () => [
          { id: "owner", role: "OWNER" },
          { id: "lead-a", role: "LEAD" },
          { id: "lead-b", role: "LEAD" },
        ]),
        findUnique: vi.fn(async () => ({ teamId: "team-a-child" })),
      },
      team: {
        findMany: vi.fn(async () => [
          { id: "team-a", parentTeamId: null, leadUserId: "lead-a", status: "ACTIVE" },
          {
            id: "team-a-child",
            parentTeamId: "team-a",
            leadUserId: null,
            status: "ACTIVE",
          },
          { id: "team-b", parentTeamId: null, leadUserId: "lead-b", status: "ACTIVE" },
        ]),
      },
      notification: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          notifications.push(args.data);
          return { id: `notification-${notifications.length}`, ...args.data };
        }),
      },
    };

    const result = await notifyAnnualUsePlanSubmittedForReview({
      usePlanId: "plan-1",
      prisma: prisma as never,
    });

    expect(result.count).toBe(2);
    expect(notifications.map((notification) => notification.userId).sort()).toEqual([
      "lead-a",
      "owner",
    ]);
    expect(notifications[0].title).toBe("연차 사용계획 확인 요청");
    expect(notifications[0].linkUrl).toBe("/admin/reports/leaves/promotions?year=2026");
    expect(JSON.stringify(notifications)).not.toMatch(/[�占]/);
  });

  it("records AuditLog and employee notification for OWNER confirmation", async () => {
    const auditLogs: Array<Record<string, unknown>> = [];
    const notifications: Array<Record<string, unknown>> = [];
    const prisma = {
      annualLeaveUsePlan: {
        findUnique: vi.fn(async () => ({
          id: "plan-1",
          userId: "employee-a",
          referenceYear: 2026,
          status: "SUBMITTED",
          submittedAt: new Date("2026-07-01T00:00:00.000Z"),
          totalPlannedAmount: 2,
          user: { id: "employee-a", name: "홍길동", teamId: "team-a" },
        })),
      },
      auditLog: {
        findMany: vi.fn(async () => []),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          auditLogs.push(args.data);
          return { id: "audit-1", ...args.data };
        }),
      },
      notification: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          notifications.push(args.data);
          return { id: "notification-1", ...args.data };
        }),
      },
    };

    await reviewAnnualUsePlan({
      actor: owner,
      planId: "plan-1",
      actionType: "CONFIRMED",
      prisma: prisma as never,
    });

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({
      action: "ANNUAL_LEAVE_USE_PLAN_UPDATED",
      targetType: "ANNUAL_LEAVE_USE_PLAN",
      targetId: "plan-1",
      targetUserId: "employee-a",
    });
    expect(auditLogs[0].metadata).toMatchObject({
      annualLeaveUsePlanId: "plan-1",
      actionType: "CONFIRMED",
      previousStatus: "SUBMITTED",
      nextStatus: "CONFIRMED",
      reviewerUserId: "owner",
    });
    expect(notifications[0]).toMatchObject({
      userId: "employee-a",
      title: "연차 사용계획 확인 완료",
      linkUrl: "/leaves/me/use-plan",
    });
  });

  it("requires a reason for revision requests", async () => {
    const prisma = {
      annualLeaveUsePlan: {
        findUnique: vi.fn(async () => ({
          id: "plan-1",
          userId: "employee-a",
          referenceYear: 2026,
          status: "SUBMITTED",
          submittedAt: new Date("2026-07-01T00:00:00.000Z"),
          user: { id: "employee-a", name: "홍길동", teamId: "team-a" },
        })),
      },
      auditLog: {
        findMany: vi.fn(async () => []),
      },
    };

    await expect(
      reviewAnnualUsePlan({
        actor: owner,
        planId: "plan-1",
        actionType: "REVISION_REQUESTED",
        revisionReason: "",
        prisma: prisma as never,
      }),
    ).rejects.toMatchObject({ code: "revision-reason-required" });
  });
});
