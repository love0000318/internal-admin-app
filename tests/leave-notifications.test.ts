import { describe, expect, it, vi } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import {
  buildLeaveNotificationMetadata,
  getLeaveApprovalNotificationRecipients,
  getManagedOrganizationLeaveNotificationRecipients,
  notifyLeaveApprovalNeeded,
} from "@/lib/notifications/leave-notifications";

const teams = [
  { id: "team-a", parentTeamId: null, leadUserId: "lead-a", status: "ACTIVE" },
  { id: "team-a-child", parentTeamId: "team-a", leadUserId: null, status: "ACTIVE" },
  { id: "team-b", parentTeamId: null, leadUserId: "lead-b", status: "ACTIVE" },
] as const;

function prismaMock() {
  return {
    team: {
      findMany: vi.fn(async (args?: { where?: { leadUserId?: string } }) => {
        if (args?.where?.leadUserId) {
          return teams.filter((team) => team.leadUserId === args.where?.leadUserId);
        }

        return teams;
      }),
    },
    user: {
      findMany: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
        const role = args?.where?.role;
        const status = args?.where?.status;
        const notId = (args?.where?.id as { not?: string; notIn?: string[] } | undefined)?.not;
        const notIn =
          (args?.where?.id as { not?: string; notIn?: string[] } | undefined)?.notIn ?? [];
        const teamFilter = args?.where?.teamId as { in?: string[] } | undefined;
        const candidates = [
          { id: "owner", role: "OWNER", status: "ACTIVE", teamId: null },
          { id: "lead-a", role: "LEAD", status: "ACTIVE", teamId: "team-a" },
          { id: "lead-b", role: "LEAD", status: "ACTIVE", teamId: "team-b" },
          { id: "inactive-lead", role: "LEAD", status: "DEACTIVATED", teamId: "team-a" },
          { id: "manager-approver", role: "MANAGER", status: "ACTIVE", teamId: "team-b" },
          { id: "external-approver", role: "EXTERNAL_PARTNER", status: "ACTIVE", teamId: null },
          { id: "requester", role: "MANAGER", status: "ACTIVE", teamId: "team-a-child" },
        ];

        return candidates.filter((user) => {
          if (role === "LEAD" && user.role !== "LEAD") {
            return false;
          }
          if (role && typeof role === "object" && "in" in role) {
            const allowed = (role as { in: string[] }).in;
            if (!allowed.includes(user.role)) {
              return false;
            }
          }
          if (status && user.status !== status) {
            return false;
          }
          if (notId && user.id === notId) {
            return false;
          }
          if (notIn.includes(user.id)) {
            return false;
          }
          if (teamFilter?.in && (!user.teamId || !teamFilter.in.includes(user.teamId))) {
            return false;
          }

          return true;
        });
      }),
    },
  };
}

const leaveRequest = {
  id: "leave-request-1",
  userId: "requester",
  type: "ANNUAL" as const,
  requestKind: "LEGACY" as const,
  leaveTypeId: null,
  status: "PENDING" as const,
  startDate: new Date("2026-05-01T00:00:00.000Z"),
  endDate: new Date("2026-05-02T00:00:00.000Z"),
  halfDayPeriod: null,
  dayCount: new Prisma.Decimal(2),
  attachmentStatus: "NOT_REQUIRED" as const,
  user: {
    id: "requester",
    name: "요청자",
    role: "MANAGER" as const,
    status: "ACTIVE" as const,
    teamId: "team-a-child",
  },
  customLeaveType: null,
};

describe("leave notification recipients", () => {
  it("includes OWNER and the scoped LEAD for approval-needed notifications", async () => {
    const recipients = await getLeaveApprovalNotificationRecipients({
      leaveRequest,
      approvalPolicy: {
        approvalMode: "SINGLE",
        approverRule: "TEAM_LEAD_OR_OWNER",
        customApproverUserId: null,
      },
      prisma: prismaMock() as never,
    });

    expect(recipients).toEqual(["owner", "lead-a"]);
  });

  it("sends managed organization approval notifications only to relevant active LEADs", async () => {
    const recipients = await getManagedOrganizationLeaveNotificationRecipients({
      leaveRequest: {
        id: "leave-request-1",
        userId: "requester",
        user: { id: "requester", teamId: "team-a-child" },
      },
      approvedByUserId: "owner",
      prisma: prismaMock() as never,
    });

    expect(recipients).toEqual(["lead-a"]);
  });

  it("does not resolve MANAGER or EXTERNAL_PARTNER custom approvers for internal leave notifications", async () => {
    await expect(
      getLeaveApprovalNotificationRecipients({
        leaveRequest,
        approvalPolicy: {
          approvalMode: "SINGLE",
          approverRule: "CUSTOM_USER",
          customApproverUserId: "manager-approver",
        },
        prisma: prismaMock() as never,
      }),
    ).resolves.toEqual(["owner"]);

    await expect(
      getLeaveApprovalNotificationRecipients({
        leaveRequest,
        approvalPolicy: {
          approvalMode: "SINGLE",
          approverRule: "CUSTOM_USER",
          customApproverUserId: "external-approver",
        },
        prisma: prismaMock() as never,
      }),
    ).resolves.toEqual(["owner"]);
  });

  it("keeps notification metadata free of sensitive leave content", () => {
    const metadata = buildLeaveNotificationMetadata({
      deduplicationKey: "leave-approval-needed:requester",
      leaveRequestId: "leave-request-1",
      requesterUserId: "requester",
      targetUserId: "requester",
      teamId: "team-a",
      startDate: "2026-05-01",
      endDate: "2026-05-02",
      notificationPurpose: "LEAVE_APPROVAL_NEEDED",
    });

    expect(JSON.stringify(metadata)).not.toContain("reason");
    expect(JSON.stringify(metadata)).not.toContain("attachment");
    expect(JSON.stringify(metadata)).not.toContain("adminMemo");
  });

  it("creates Korean approval-needed notifications with review links", async () => {
    const notifications: Array<{
      userId: string;
      title: string;
      message: string;
      linkUrl: string | null;
    }> = [];
    const prisma = {
      ...prismaMock(),
      auditLog: {
        create: vi.fn(async () => ({})),
      },
      notification: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => {
          notifications.push({
            userId: data.userId,
            title: data.title,
            message: data.message,
            linkUrl: data.linkUrl,
          });

          return { id: `notification-${notifications.length}`, ...data };
        }),
      },
    };

    const result = await notifyLeaveApprovalNeeded({
      leaveRequest,
      approvalPolicy: {
        id: "approval-policy-1",
        code: "DEFAULT_TEAM_LEAD_OR_OWNER",
        approvalMode: "SINGLE",
        approverRule: "TEAM_LEAD_OR_OWNER",
        customApproverUserId: null,
      },
      leaveRequestId: leaveRequest.id,
      leaveTypeName: "연차",
      prisma: prisma as never,
    });

    expect(result.count).toBe(2);
    expect(notifications.map((notification) => notification.userId)).toEqual([
      "owner",
      "lead-a",
    ]);
    expect(notifications[0]).toMatchObject({
      title: "휴가 승인 요청이 접수되었습니다.",
      linkUrl: "/leaves/approvals/leave-request-1",
    });
    expect(notifications[0].message).toContain("연차 2일을 요청했습니다.");
    expect(notifications[0].message).not.toMatch(/�|[占筌獄]|[利泥湲諛痍]/);
  });
});
