import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import {
  findBirthdayAnnualDeductionRecoveryCandidates,
  runBirthdayAnnualDeductionRecovery,
} from "@/lib/leave/birthday-half-day-recovery";
import {
  buildRecoveredLeaveNotificationContent,
  containsLegacyKoreanMojibake,
  normalizeLeaveOperationalRecoveryDateWindow,
  runLeaveOperationalRecovery,
} from "@/lib/leave/operational-recovery";
import { parseLeaveOperationalRecoveryArgs } from "../scripts/recover-leave-operational-records";

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
      leaveGrant: {
        findMany: async () => [],
      },
      leaveLedger: {
        findMany: async () => [],
      },
      leaveBalance: {
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

  it("reports grant option and calendar visibility diagnostics in dry-run mode", async () => {
    const prisma = {
      leaveRequest: {
        findMany: async (args: { where: Record<string, unknown> }) => {
          if (args.where.status === "PENDING") {
            return [];
          }

          if (args.where.status === "APPROVED" && args.where.user) {
            return [];
          }

          if (args.where.status === "APPROVED") {
            return [
              {
                ...leaveRequest,
                id: "external-approved",
                userId: "external-user",
                user: {
                  id: "external-user",
                  name: "외부 사용자",
                  role: "EXTERNAL_PARTNER" as const,
                  status: "ACTIVE" as const,
                  teamId: null,
                },
              },
            ];
          }

          return [];
        },
      },
      leaveGrant: {
        findMany: async () => [
          {
            id: "birthday-grant-1",
            userId: "requester",
            leaveTypeId: "birthday-type",
            source: "BIRTHDAY_AUTO" as const,
            status: "ACTIVE" as const,
            remainingAmount: 0.5,
            effectiveFrom: new Date("2026-05-01T00:00:00.000Z"),
            expiresAt: null,
            createdAt: new Date("2026-05-01T00:00:00.000Z"),
            leaveType: {
              id: "birthday-type",
              code: "BIRTHDAY_HALF_DAY",
              category: "ANNUAL" as const,
              isEnabled: false,
            },
          },
        ],
      },
      leaveLedger: {
        findMany: async () => [],
      },
      leaveBalance: {
        findMany: async () => [],
      },
      notification: {
        findMany: async () => [],
      },
      leaveTypeDefinition: {
        findUnique: async () => null,
      },
      approvalPolicy: {
        findUnique: async () => null,
      },
      user: {
        findMany: async () => [],
      },
    };

    const report = await runLeaveOperationalRecovery({
      prisma: prisma as never,
      dryRun: true,
      fromDate: "2026-05-28",
      toDate: "2026-05-29",
    });

    expect(report.birthdayGrantOptionIssues).toEqual([
      {
        userId: "requester",
        leaveGrantId: "birthday-grant-1",
        leaveTypeId: "birthday-type",
        leaveTypeCode: "BIRTHDAY_HALF_DAY",
        reason: "LEAVE_TYPE_DISABLED",
        isBirthdayHalfDay: true,
      },
    ]);
    expect(report.calendarVisibilityIssues).toEqual([
      {
        leaveRequestId: "external-approved",
        requesterUserId: "external-user",
        reason: "REQUESTER_NOT_INTERNAL_CALENDAR_ROLE",
      },
    ]);
  });
});

describe("birthday half-day annual deduction recovery", () => {
  it("reports wrong annual ledger deductions in dry-run without touching birthday grant usage", async () => {
    const prisma = {
      leaveRequest: {
        findMany: async () => [
          {
            id: "birthday-request-1",
            userId: "requester",
            type: "HALF_DAY" as const,
            requestKind: "CUSTOM_GRANT" as const,
            leaveTypeId: "birthday-type",
            status: "APPROVED" as const,
            startDate: new Date("2026-05-29T00:00:00.000Z"),
            endDate: new Date("2026-05-29T00:00:00.000Z"),
            dayCount: new Prisma.Decimal(0.5),
            createdAt: new Date("2026-05-28T00:00:00.000Z"),
            customLeaveType: { code: "BIRTHDAY_HALF_DAY" },
            grantUsages: [
              {
                leaveGrantId: "birthday-grant-1",
                amount: 0.5,
                unit: "DAY",
                leaveGrant: {
                  source: "BIRTHDAY_AUTO" as const,
                  leaveType: { code: "BIRTHDAY_HALF_DAY" },
                },
              },
            ],
          },
        ],
      },
      leaveLedger: {
        findMany: async (args: { where: Record<string, unknown> }) => {
          if ("idempotencyKey" in args.where) {
            return [];
          }

          return [
            {
              id: "wrong-annual-used-ledger",
              leaveRequestId: "birthday-request-1",
              source: "LEAVE_APPROVAL",
              eventType: "USED",
              amount: 0.5,
              createdAt: new Date("2026-05-29T00:00:00.000Z"),
            },
          ];
        },
      },
      leaveBalance: {
        findMany: async () => [
          {
            id: "annual-balance-1",
            userId: "requester",
            fiscalYear: 2026,
            usedDays: new Prisma.Decimal(2),
            pendingDays: new Prisma.Decimal(0),
            remainingDays: new Prisma.Decimal(13),
          },
        ],
      },
    };

    const report = await findBirthdayAnnualDeductionRecoveryCandidates({
      prisma: prisma as never,
      fromDate: "2026-05-28",
      toDate: "2026-05-29",
    });

    expect(report.checkedBirthdayRequests).toBe(1);
    expect(report.candidates).toEqual([
      expect.objectContaining({
        userId: "requester",
        leaveRequestId: "birthday-request-1",
        amount: 0.5,
        repairEventType: "USED_RESTORED",
        annualLedgerIds: ["wrong-annual-used-ledger"],
        targetAnnualLedgerIds: ["wrong-annual-used-ledger"],
        birthdayGrantIds: ["birthday-grant-1"],
        alreadyRecovered: false,
        repairPossible: true,
        leaveBalance: expect.objectContaining({
          id: "annual-balance-1",
          repairPossible: true,
          expectedUsedDays: 1.5,
          expectedRemainingDays: 13.5,
        }),
      }),
    ]);
  });

  it("reclassifies wrong annual birthday ledgers and restores only regular annual balance on apply", async () => {
    const birthdayRequest = {
      id: "birthday-request-1",
      userId: "requester",
      type: "HALF_DAY" as const,
      requestKind: "CUSTOM_GRANT" as const,
      leaveTypeId: "birthday-type",
      status: "APPROVED" as const,
      startDate: new Date("2026-05-29T00:00:00.000Z"),
      endDate: new Date("2026-05-29T00:00:00.000Z"),
      dayCount: new Prisma.Decimal(0.5),
      createdAt: new Date("2026-05-28T00:00:00.000Z"),
      customLeaveType: { code: "BIRTHDAY_HALF_DAY" },
      grantUsages: [
        {
          leaveGrantId: "birthday-grant-1",
          amount: 0.5,
          unit: "DAY",
          leaveGrant: {
            source: "BIRTHDAY_AUTO" as const,
            leaveType: { code: "BIRTHDAY_HALF_DAY" },
          },
        },
      ],
    };
    const wrongLedgers = [
      {
        id: "wrong-annual-pending-ledger",
        leaveRequestId: "birthday-request-1",
        source: "LEAVE_REQUEST",
        eventType: "PENDING",
        amount: 0.5,
        createdAt: new Date("2026-05-28T00:00:00.000Z"),
      },
      {
        id: "wrong-annual-used-ledger",
        leaveRequestId: "birthday-request-1",
        source: "LEAVE_APPROVAL",
        eventType: "USED",
        amount: 0.5,
        createdAt: new Date("2026-05-29T00:00:00.000Z"),
      },
    ];
    const annualBalance = {
      id: "annual-balance-1",
      userId: "requester",
      fiscalYear: 2026,
      usedDays: new Prisma.Decimal(2),
      pendingDays: new Prisma.Decimal(0),
      remainingDays: new Prisma.Decimal(13),
    };
    let ledgerUpdateArgs: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    } | null = null;
    let balanceUpdateArgs: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    } | null = null;
    let auditLogCreateArgs: { data: Record<string, unknown> } | null = null;
    const transaction = {
      leaveRequest: {
        findUnique: async () => birthdayRequest,
      },
      leaveLedger: {
        findMany: async () => wrongLedgers,
        updateMany: async (args: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          ledgerUpdateArgs = args;

          return { count: 2 };
        },
      },
      leaveBalance: {
        findMany: async () => [annualBalance],
        updateMany: async (args: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          balanceUpdateArgs = args;

          return { count: 1 };
        },
      },
      auditLog: {
        findMany: async () => [],
        create: async (args: { data: Record<string, unknown> }) => {
          auditLogCreateArgs = args;

          return { id: "audit-log-1" };
        },
      },
    };
    const prisma = {
      leaveRequest: {
        findMany: async () => [birthdayRequest],
      },
      leaveLedger: {
        findMany: async () => wrongLedgers,
      },
      leaveBalance: {
        findMany: async () => [annualBalance],
      },
      auditLog: {
        findMany: async () => [],
      },
      $transaction: async <T>(callback: (txClient: typeof transaction) => Promise<T>) =>
        callback(transaction),
    };

    const report = await runBirthdayAnnualDeductionRecovery({
      prisma: prisma as never,
      dryRun: false,
      fromDate: "2026-05-28",
      toDate: "2026-05-29",
    });

    expect(report.applied).toEqual({
      annualLedgersReclassified: 2,
      leaveBalancesUpdated: 1,
      skippedAlreadyRecovered: 0,
      skippedNotRepairable: 0,
    });
    expect(ledgerUpdateArgs).toEqual({
      where: {
        id: { in: ["wrong-annual-pending-ledger", "wrong-annual-used-ledger"] },
        leaveRequestId: "birthday-request-1",
        source: { in: ["LEAVE_REQUEST", "LEAVE_APPROVAL", "LEAVE_AUTO_CONFIRM"] },
        eventType: { in: ["PENDING", "USED"] },
      },
      data: { source: "BIRTHDAY_AUTO" },
    });
    expect(balanceUpdateArgs).toEqual({
      where: {
        id: "annual-balance-1",
        userId: "requester",
        fiscalYear: 2026,
        usedDays: { gte: 0.5 },
      },
      data: {
        usedDays: { decrement: 0.5 },
        remainingDays: { increment: 0.5 },
      },
    });
    expect(auditLogCreateArgs).not.toBeNull();
    expect((auditLogCreateArgs as unknown as { data: Record<string, unknown> }).data).toEqual(
      expect.objectContaining({
        action: "LEAVE_LEDGER_REBUILT",
        targetType: "LEAVE_REQUEST",
        targetId: "birthday-request-1",
      }),
    );
  });

  it("explains why leave balance repair is blocked for a targeted birthday request", async () => {
    const prisma = {
      leaveRequest: {
        findMany: async () => [
          {
            id: "birthday-request-1",
            userId: "requester",
            status: "APPROVED" as const,
            startDate: new Date("2026-05-29T00:00:00.000Z"),
            endDate: new Date("2026-05-29T00:00:00.000Z"),
            customLeaveType: { code: "BIRTHDAY_HALF_DAY" },
            grantUsages: [
              {
                leaveGrantId: "birthday-grant-1",
                leaveGrant: {
                  source: "BIRTHDAY_AUTO" as const,
                  leaveType: { code: "BIRTHDAY_HALF_DAY" },
                },
              },
            ],
          },
        ],
      },
      leaveLedger: {
        findMany: async () => [
          {
            id: "wrong-annual-used-ledger",
            leaveRequestId: "birthday-request-1",
            source: "LEAVE_APPROVAL",
            eventType: "USED",
            amount: 0.5,
          },
        ],
      },
      leaveBalance: {
        findMany: async () => [
          {
            id: "annual-balance-1",
            userId: "requester",
            fiscalYear: 2026,
            usedDays: new Prisma.Decimal(0),
            pendingDays: new Prisma.Decimal(0),
            remainingDays: new Prisma.Decimal(15),
          },
        ],
      },
      auditLog: {
        findMany: async () => [],
      },
    };

    const report = await findBirthdayAnnualDeductionRecoveryCandidates({
      prisma: prisma as never,
      leaveRequestId: "birthday-request-1",
    });

    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]).toMatchObject({
      leaveRequestId: "birthday-request-1",
      amount: 0.5,
      repairPossible: false,
      repairBlockReasons: ["USED_DAYS_BELOW_REPAIR_AMOUNT"],
      leaveBalance: {
        repairPossible: false,
        repairBlockReasons: ["USED_DAYS_BELOW_REPAIR_AMOUNT"],
        expectedUsedDays: -0.5,
        expectedRemainingDays: 15.5,
      },
    });
  });

  it("keeps birthday grant usage and avoids duplicate balance restoration on rerun", async () => {
    const birthdayRequest = {
      id: "birthday-request-1",
      userId: "requester",
      status: "APPROVED" as const,
      startDate: new Date("2026-05-29T00:00:00.000Z"),
      endDate: new Date("2026-05-29T00:00:00.000Z"),
      customLeaveType: { code: "BIRTHDAY_HALF_DAY" },
      grantUsages: [
        {
          leaveGrantId: "birthday-grant-1",
          amount: 0.5,
          unit: "DAY",
          leaveGrant: {
            source: "BIRTHDAY_AUTO" as const,
            leaveType: { code: "BIRTHDAY_HALF_DAY" },
          },
        },
      ],
    };
    const ledgers = [
      {
        id: "wrong-annual-used-ledger",
        leaveRequestId: "birthday-request-1",
        source: "LEAVE_APPROVAL",
        eventType: "USED",
        amount: 0.5,
      },
    ];
    const balance = {
      id: "annual-balance-1",
      userId: "requester",
      fiscalYear: 2026,
      usedDays: 2,
      pendingDays: 0,
      remainingDays: 13,
    };
    const auditLogs: Array<{ targetId: string | null }> = [];
    const delegates = {
      leaveRequest: {
        findMany: async () => [birthdayRequest],
        findUnique: async () => birthdayRequest,
      },
      leaveLedger: {
        findMany: async () =>
          ledgers.filter((ledger) => ledger.source === "LEAVE_APPROVAL"),
        updateMany: async () => {
          const wrongLedgers = ledgers.filter(
            (ledger) => ledger.source === "LEAVE_APPROVAL",
          );

          for (const ledger of wrongLedgers) {
            ledger.source = "BIRTHDAY_AUTO";
          }

          return { count: wrongLedgers.length };
        },
      },
      leaveBalance: {
        findMany: async () => [balance],
        updateMany: async () => {
          balance.usedDays -= 0.5;
          balance.remainingDays += 0.5;

          return { count: 1 };
        },
      },
      auditLog: {
        findMany: async () => auditLogs,
        create: async () => {
          auditLogs.push({ targetId: "birthday-request-1" });

          return { id: "audit-log-1" };
        },
      },
    };
    const prisma = {
      ...delegates,
      $transaction: async <T>(callback: (txClient: typeof delegates) => Promise<T>) =>
        callback(delegates),
    };

    const first = await runBirthdayAnnualDeductionRecovery({
      prisma: prisma as never,
      dryRun: false,
      leaveRequestId: "birthday-request-1",
    });
    const second = await runBirthdayAnnualDeductionRecovery({
      prisma: prisma as never,
      dryRun: false,
      leaveRequestId: "birthday-request-1",
    });

    expect(first.applied.leaveBalancesUpdated).toBe(1);
    expect(second.applied.leaveBalancesUpdated).toBe(0);
    expect(second.applied.skippedAlreadyRecovered).toBe(1);
    expect(balance).toMatchObject({
      usedDays: 1.5,
      remainingDays: 13.5,
    });
    expect(birthdayRequest.grantUsages).toEqual([
      expect.objectContaining({ leaveGrantId: "birthday-grant-1" }),
    ]);
    expect(ledgers[0].source).toBe("BIRTHDAY_AUTO");
  });

  it("parses a targeted leave operational recovery dry-run", () => {
    expect(
      parseLeaveOperationalRecoveryArgs([
        "--dry-run",
        "--leave-request-id=birthday-request-1",
      ]),
    ).toMatchObject({
      apply: false,
      leaveRequestId: "birthday-request-1",
      fromDate: null,
      toDate: null,
    });
    expect(() =>
      parseLeaveOperationalRecoveryArgs([
        "--dry-run",
        "--apply",
        "--leave-request-id=birthday-request-1",
      ]),
    ).toThrow(/either --dry-run or --apply/);
  });
});

