import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import {
  buildRecoveredLeaveNotificationContent,
  containsLegacyKoreanMojibake,
  normalizeLeaveOperationalRecoveryDateWindow,
  runLeaveOperationalRecovery,
} from "@/lib/leave/operational-recovery";

const leaveRequest = {
  id: "leave-request-1",
  userId: "requester",
  type: "ANNUAL" as const,
  requestKind: "LEGACY" as const,
  leaveTypeId: null,
  status: "APPROVED" as const,
  startDate: new Date("2026-05-04T00:00:00.000Z"),
  endDate: new Date("2026-05-04T00:00:00.000Z"),
  halfDayPeriod: null,
  dayCount: new Prisma.Decimal(1),
  attachmentStatus: "NOT_REQUIRED" as const,
  reviewedAt: new Date("2026-05-01T03:00:00.000Z"),
  approvalSource: "MANUAL" as const,
  user: {
    id: "requester",
    name: "현지",
    role: "MANAGER" as const,
    status: "ACTIVE" as const,
    teamId: "team-a",
  },
  customLeaveType: null,
  grantUsages: [],
};

describe("leave operational recovery helpers", () => {
  it("detects legacy mojibake without flagging normal Korean messages", () => {
    expect(containsLegacyKoreanMojibake("?땅? ?렐??")).toBe(true);
    expect(containsLegacyKoreanMojibake("휴가 승인 요청이 접수되었습니다.")).toBe(false);
    expect(containsLegacyKoreanMojibake("이 휴가 요청을 승인할까요?")).toBe(false);
  });

  it("reconstructs approval-needed notifications from LeaveRequest metadata", () => {
    const content = buildRecoveredLeaveNotificationContent({
      notification: {
        type: "LEAVE_REQUEST_CREATED",
        metadata: {
          leaveRequestId: "leave-request-1",
          notificationPurpose: "LEAVE_APPROVAL_NEEDED",
        },
      },
      leaveRequest: { ...leaveRequest, status: "PENDING" },
    });

    expect(content).toEqual({
      title: "휴가 승인 요청이 접수되었습니다.",
      message: "현지님이 연차 1일을 요청했습니다. 기간: 2026-05-04.",
    });
  });

  it("reconstructs auto-policy approval notifications in Korean", () => {
    const content = buildRecoveredLeaveNotificationContent({
      notification: {
        type: "LEAVE_REQUEST_APPROVED",
        metadata: {
          leaveRequestId: "leave-request-1",
          notificationPurpose: "LEAVE_REQUEST_APPROVED",
          approvalSource: "AUTO_POLICY",
        },
      },
      leaveRequest,
    });

    expect(content?.title).toBe("연차 요청이 자동 승인되었습니다.");
    expect(content?.message).toContain("승인 정책에 따라 자동 승인되었습니다.");
    expect(content?.message).not.toMatch(/�|[占筌獄]|[利泥湲諛痍]/);
  });

  it("validates recovery date windows", () => {
    expect(
      normalizeLeaveOperationalRecoveryDateWindow({
        fromDate: "2026-05-28",
        toDate: "2026-05-29",
      }),
    ).toEqual({ fromDate: "2026-05-28", toDate: "2026-05-29" });
    expect(() =>
      normalizeLeaveOperationalRecoveryDateWindow({
        fromDate: "2026-05-30",
        toDate: "2026-05-29",
      }),
    ).toThrow(/date range/);
  });

  it("reports bad approval notification links without creating duplicate notifications", async () => {
    const prisma = {
      leaveRequest: {
        findMany: async (args: { where: Record<string, unknown> }) => {
          if (args.where.status === "PENDING") {
            return [{ ...leaveRequest, status: "PENDING" }];
          }

          return [];
        },
      },
      leaveTypeDefinition: {
        findUnique: async () => null,
      },
      approvalPolicy: {
        findUnique: async () => null,
      },
      user: {
        findMany: async () => [
          { id: "owner", role: "OWNER", status: "ACTIVE", teamId: null },
        ],
      },
      notification: {
        findFirst: async () => ({
          id: "notification-1",
          linkUrl: "/leaves/approvals",
        }),
        findMany: async () => [],
      },
    };

    const report = await runLeaveOperationalRecovery({
      prisma: prisma as never,
      dryRun: true,
      fromDate: "2026-05-28",
      toDate: "2026-05-29",
    });

    expect(report.missingApprovalNotifications).toHaveLength(0);
    expect(report.notificationLinkRepairs).toEqual([
      {
        notificationId: "notification-1",
        leaveRequestId: "leave-request-1",
        recipientUserId: "owner",
        currentLinkUrl: "/leaves/approvals",
        expectedLinkUrl: "/leaves/approvals/leave-request-1",
        reason: "APPROVAL_DETAIL_LINK",
      },
    ]);
  });
});

