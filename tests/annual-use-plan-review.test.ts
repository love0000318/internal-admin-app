import { describe, expect, it, vi } from "vitest";

import {
  ANNUAL_USE_PLAN_EMPLOYEE_LINK_URL,
  canReviewAnnualUsePlan,
  deriveAnnualUsePlanReviewState,
  notifyAnnualUsePlanReviewConfirmed,
  notifyAnnualUsePlanRevisionRequested,
  type AnnualUsePlanReviewLog,
  type AnnualUsePlanWithItems,
} from "@/lib/leave/annual-use-plan-review";

function submittedPlan(
  overrides: Partial<AnnualUsePlanWithItems> = {},
): AnnualUsePlanWithItems {
  return {
    id: "plan-1",
    userId: "manager-1",
    referenceYear: 2026,
    status: "SUBMITTED",
    totalPlannedAmount: 3,
    unit: "DAY",
    submittedAt: new Date("2026-06-10T00:00:00.000Z"),
    cancelledAt: null,
    memo: null,
    createdAt: new Date("2026-06-10T00:00:00.000Z"),
    updatedAt: new Date("2026-06-10T00:00:00.000Z"),
    items: [],
    ...overrides,
  } as AnnualUsePlanWithItems;
}

function reviewLog(
  actionType: "CONFIRMED" | "REVISION_REQUESTED",
  reviewedAt: string,
  metadata: Record<string, unknown> = {},
): AnnualUsePlanReviewLog {
  return {
    id: `log-${actionType}`,
    actorId: "owner-1",
    actorUserId: "owner-1",
    targetId: "plan-1",
    action: "ANNUAL_LEAVE_USE_PLAN_UPDATED",
    createdAt: new Date(reviewedAt),
    metadata: {
      annualLeaveUsePlanId: "plan-1",
      actionType,
      reviewedAt,
      reviewerUserId: "owner-1",
      ...metadata,
    },
    actor: {
      id: "owner-1",
      name: "총괄관리자",
      email: "owner@example.com",
    },
  };
}

function resubmissionLog(resubmittedAt: string): AnnualUsePlanReviewLog {
  return {
    id: "log-resubmitted",
    actorId: "manager-1",
    actorUserId: "manager-1",
    targetId: "plan-1",
    action: "ANNUAL_LEAVE_USE_PLAN_SUBMITTED",
    createdAt: new Date(resubmittedAt),
    metadata: {
      annualLeaveUsePlanId: "plan-1",
      actionType: "RESUBMITTED_AFTER_REVISION",
      resubmittedAt,
    },
    actor: {
      id: "manager-1",
      name: "구성원",
      email: "manager@example.com",
    },
  };
}

describe("annual use plan review state", () => {
  it("derives submitted, confirmed, revision-requested, and resubmitted states", () => {
    expect(
      deriveAnnualUsePlanReviewState({
        plan: submittedPlan(),
        logs: [],
      }).status,
    ).toBe("SUBMITTED");

    expect(
      deriveAnnualUsePlanReviewState({
        plan: submittedPlan(),
        logs: [reviewLog("CONFIRMED", "2026-06-11T00:00:00.000Z")],
      }),
    ).toMatchObject({
      status: "CONFIRMED",
      label: "관리자 확인 완료",
      reviewerName: "총괄관리자",
    });

    expect(
      deriveAnnualUsePlanReviewState({
        plan: submittedPlan(),
        logs: [
          reviewLog("REVISION_REQUESTED", "2026-06-11T00:00:00.000Z", {
            revisionReason: "일정 충돌 확인 요청",
          }),
        ],
      }),
    ).toMatchObject({
      status: "REVISION_REQUESTED",
      label: "보완요청",
      revisionReason: "일정 충돌 확인 요청",
      canEmployeeEdit: true,
    });

    expect(
      deriveAnnualUsePlanReviewState({
        plan: submittedPlan({
          submittedAt: new Date("2026-06-12T00:00:00.000Z"),
          updatedAt: new Date("2026-06-12T00:00:00.000Z"),
        }),
        logs: [
          resubmissionLog("2026-06-12T00:00:00.000Z"),
          reviewLog("REVISION_REQUESTED", "2026-06-11T00:00:00.000Z"),
        ],
      }),
    ).toMatchObject({
      status: "RESUBMITTED_AFTER_REVISION",
      label: "보완 후 재제출",
      canReviewerAct: true,
    });
  });

  it("keeps lead review scope limited to managed teams and not self", () => {
    const owner = { id: "owner-1", role: "OWNER" as const, status: "ACTIVE" as const };
    const lead = {
      id: "lead-1",
      role: "LEAD" as const,
      status: "ACTIVE" as const,
      teamId: "team-a",
      managedTeamIds: ["team-a", "team-a-child"],
    };
    const manager = {
      id: "manager-1",
      role: "MANAGER" as const,
      status: "ACTIVE" as const,
      teamId: "team-a-child",
    };

    expect(canReviewAnnualUsePlan(owner, manager)).toBe(true);
    expect(canReviewAnnualUsePlan(lead, manager)).toBe(true);
    expect(canReviewAnnualUsePlan(lead, { ...manager, id: "lead-1" })).toBe(false);
    expect(
      canReviewAnnualUsePlan(lead, { ...manager, id: "manager-2", teamId: "team-b" }),
    ).toBe(false);
    expect(canReviewAnnualUsePlan(manager, manager)).toBe(false);
  });
});

describe("annual use plan review notifications", () => {
  it("creates Korean confirmation and revision notifications for the employee", async () => {
    const created: Array<{
      title: string;
      message: string;
      linkUrl: string | null;
      metadata: unknown;
    }> = [];
    const prisma = {
      notification: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => {
          created.push(data);
          return { id: `notification-${created.length}`, ...data };
        }),
      },
    };
    const plan = submittedPlan();

    await notifyAnnualUsePlanReviewConfirmed({
      plan,
      reviewerName: "총괄관리자",
      reviewedAt: new Date("2026-06-11T00:00:00.000Z"),
      prisma: prisma as never,
    });
    await notifyAnnualUsePlanRevisionRequested({
      plan,
      reviewerName: "총괄관리자",
      reviewedAt: new Date("2026-06-12T00:00:00.000Z"),
      revisionReason: "사용 예정일을 다시 확인해 주세요.",
      prisma: prisma as never,
    });

    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({
      title: "연차 사용계획 접수 확인 완료",
      linkUrl: ANNUAL_USE_PLAN_EMPLOYEE_LINK_URL,
    });
    expect(created[1]).toMatchObject({
      title: "연차 사용계획 보완요청",
      linkUrl: ANNUAL_USE_PLAN_EMPLOYEE_LINK_URL,
    });
    expect(created[1].message).toContain("사용 예정일을 다시 확인해 주세요.");
    expect(created.map((item) => `${item.title} ${item.message}`).join("\n")).not.toMatch(
      /占|�/,
    );
  });
});
