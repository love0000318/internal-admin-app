import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  collectAnnualPromotionReadinessDiagnostics,
  findAnnualPromotionCandidates,
  scheduleAnnualLeavePromotionNotices,
  sendDueAnnualLeavePromotionNotices,
  calculateAnnualPromotionNoticeDate,
  calculateAnnualSecondPromotionNoticeDate,
  calculateMonthlyFirstPromotionNoticeDate,
  calculateMonthlySecondPromotionNoticeDate,
  calculateUsePlanReminderDate,
  validateAnnualUsePlanItems,
  validateUsePlanItems,
} from "@/lib/leave/annual-promotion";
import { parseAnnualUsePlanFormItems } from "@/lib/leave/annual-use-plan-form-data";
import { calculateAnnualUsePlanItemAmount } from "@/lib/leave/annual-use-plan-calculator";
import {
  ANNUAL_USE_PLAN_LINK_URL,
  ANNUAL_LEAVE_PROMOTION_LEGAL_REVIEW_NOTE,
  buildAnnualUsePlanNoticeContent,
  hasBrokenAnnualUsePlanNoticeText,
} from "@/lib/notifications/annual-use-plan-notifications";

const promotionPolicy = {
  promotionEnabled: true,
  expirationEnabled: true,
  fiscalYearStartMonth: 1,
  fiscalYearStartDay: 1,
  annualPromotionMonthsBeforeExpiration: 6,
  monthlyPromotionFirstMonthsBeforeExpiration: 3,
  monthlyPromotionSecondMonthsBeforeExpiration: 1,
  memberReminderEnabled: true,
  usePlanReminderDaysBefore: 10,
};

const promotionUsers = [
  {
    id: "user-submitted",
    name: "제출자",
    email: "submitted@example.com",
    role: "MANAGER",
    status: "ACTIVE",
    title: "매니저",
    hireDate: new Date("2024-01-01T00:00:00.000Z"),
    team: { name: "운영팀" },
    profile: null,
    employmentProfile: null,
  },
  {
    id: "user-open",
    name: "미제출자",
    email: "open@example.com",
    role: "MANAGER",
    status: "ACTIVE",
    title: null,
    hireDate: new Date("2024-01-01T00:00:00.000Z"),
    team: { name: "운영팀" },
    profile: null,
    employmentProfile: null,
  },
  {
    id: "user-zero",
    name: "잔여없음",
    email: "zero@example.com",
    role: "MANAGER",
    status: "ACTIVE",
    title: null,
    hireDate: new Date("2024-01-01T00:00:00.000Z"),
    team: { name: "운영팀" },
    profile: null,
    employmentProfile: null,
  },
];

type FindLedgerArgs = { where: { userId: string } };
type FindUsePlanArgs = {
  where: { userId_referenceYear: { userId: string; referenceYear: number } };
};
type CreateNoticeArgs = { data: Record<string, unknown> };

function createAnnualPromotionPrismaMock() {
  const createdNotices: Record<string, unknown>[] = [];
  const plans = new Map([
    [
      "user-submitted",
      {
        id: "plan-submitted",
        userId: "user-submitted",
        referenceYear: 2027,
        status: "SUBMITTED",
        submittedAt: new Date("2027-06-20T00:00:00.000Z"),
      },
    ],
  ]);

  return {
    prisma: {
      annualLeavePolicy: {
        findFirst: vi.fn(async () => promotionPolicy),
      },
      user: {
        findMany: vi.fn(async () => promotionUsers),
      },
      leaveLedger: {
        findMany: vi.fn(async (args: FindLedgerArgs) => {
          if (args.where.userId === "user-zero") {
            return [
              { eventType: "GRANTED", amount: 1, metadata: null },
              { eventType: "EXPIRED", amount: 1, metadata: null },
            ];
          }

          return [{ eventType: "GRANTED", amount: 3, metadata: null }];
        }),
        findUnique: vi.fn(async () => null),
      },
      annualLeaveUsePlan: {
        findUnique: vi.fn(async (args: FindUsePlanArgs) => {
          return plans.get(args.where.userId_referenceYear.userId) ?? null;
        }),
      },
      annualLeavePromotionNotice: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async (args: CreateNoticeArgs) => {
          const notice = {
            id: `notice-${createdNotices.length + 1}`,
            ...args.data,
          };
          createdNotices.push(notice);
          return notice;
        }),
      },
      auditLog: {
        create: vi.fn(async () => ({})),
      },
    },
    createdNotices,
  };
}

function dueNotice(overrides: Record<string, unknown>) {
  return {
    id: "notice-open",
    userId: "user-open",
    referenceYear: 2027,
    noticeType: "ANNUAL_USE_PLAN_REQUEST",
    status: "SCHEDULED",
    scheduledDate: new Date("2027-06-30T00:00:00.000Z"),
    expirationDate: new Date("2027-12-31T00:00:00.000Z"),
    remainingAmount: 3,
    unit: "DAY",
    availableFrom: new Date("2027-01-01T00:00:00.000Z"),
    availableUntil: new Date("2027-12-31T00:00:00.000Z"),
    submissionDeadline: new Date("2027-07-10T00:00:00.000Z"),
    policyVersion: "KR-LSA-60-61-2025-10-23",
    legalBasis: "근로기준법 제60조 및 제61조",
    isRenotice: false,
    user: { id: "user-open" },
    ...overrides,
  };
}

describe("annual leave promotion operations", () => {
  it("calculates annual and monthly promotion notice dates", () => {
    expect(
      calculateAnnualPromotionNoticeDate({
        expirationDate: "2027-12-31",
        monthsBefore: 6,
      }),
    ).toBe("2027-06-30");
    expect(
      calculateAnnualSecondPromotionNoticeDate({
        expirationDate: "2027-12-31",
      }),
    ).toBe("2027-10-31");
    expect(
      calculateMonthlyFirstPromotionNoticeDate({
        expirationDate: "2027-12-31",
        monthsBefore: 3,
      }),
    ).toBe("2027-09-30");
    expect(
      calculateMonthlySecondPromotionNoticeDate({
        expirationDate: "2027-12-31",
        monthsBefore: 1,
      }),
    ).toBe("2027-11-30");
  });

  it("builds legal-evidence content without asserting web notice is statutory written notice", () => {
    const content = buildAnnualUsePlanNoticeContent({
      id: "notice-1",
      userId: "user-1",
      referenceYear: 2027,
      noticeType: "ANNUAL_USE_PLAN_REQUEST",
      scheduledDate: new Date("2027-06-30T00:00:00.000Z"),
      expirationDate: new Date("2027-12-31T00:00:00.000Z"),
      remainingAmount: 3.5,
      unit: "DAY",
      availableFrom: new Date("2027-01-01T00:00:00.000Z"),
      availableUntil: new Date("2027-12-31T00:00:00.000Z"),
      submissionDeadline: new Date("2027-07-10T00:00:00.000Z"),
      policyVersion: "KR-LSA-60-61-2025-10-23",
      legalBasis: "근로기준법 제60조 및 제61조",
      isRenotice: false,
    }) as Record<string, unknown>;

    expect(content).toMatchObject({
      noticeType: "ANNUAL_USE_PLAN_REQUEST",
      remainingAmount: 3.5,
      submissionDeadline: "2027-07-10",
      legalReviewNote: ANNUAL_LEAVE_PROMOTION_LEGAL_REVIEW_NOTE,
    });
  });

  it("calculates promotion candidates by remaining annual balance and submitted-plan status", async () => {
    const { prisma } = createAnnualPromotionPrismaMock();

    const candidates = await findAnnualPromotionCandidates({
      year: 2027,
      prisma: prisma as never,
    });

    expect(candidates).toHaveLength(4);
    expect(candidates.map((candidate) => candidate.userId)).toEqual([
      "user-submitted",
      "user-submitted",
      "user-open",
      "user-open",
    ]);
    expect(candidates.find((candidate) => candidate.userId === "user-zero")).toBeUndefined();
    expect(
      candidates
        .filter((candidate) => candidate.userId === "user-submitted")
        .every((candidate) => candidate.usePlanStatus === "SUBMITTED"),
    ).toBe(true);
    expect(
      candidates
        .filter((candidate) => candidate.userId === "user-open")
        .every((candidate) => candidate.usePlanStatus === null),
    ).toBe(true);
  });

  it("does not create new promotion notice schedules for submitted use plans", async () => {
    const { prisma, createdNotices } = createAnnualPromotionPrismaMock();

    const result = await scheduleAnnualLeavePromotionNotices({
      year: 2027,
      prisma: prisma as never,
    });

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(2);
    expect(createdNotices).toHaveLength(2);
    expect(createdNotices.map((notice) => notice.userId)).toEqual([
      "user-open",
      "user-open",
    ]);
  });

  it("creates request notifications and skips due notices after use-plan submission", async () => {
    const notifications: Record<string, unknown>[] = [];
    const updates: Record<string, unknown>[] = [];
    const prisma = {
      annualLeavePromotionNotice: {
        findMany: vi.fn(async () => [
          dueNotice({ id: "notice-submitted", userId: "user-submitted" }),
          dueNotice({ id: "notice-open", userId: "user-open" }),
        ]),
        update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push({ id: args.where.id, ...args.data });
          return { id: args.where.id, ...args.data };
        }),
      },
      annualLeaveUsePlan: {
        findUnique: vi.fn(async (args: FindUsePlanArgs) => {
          if (args.where.userId_referenceYear.userId === "user-submitted") {
            return {
              id: "plan-submitted",
              status: "SUBMITTED",
              submittedAt: new Date("2027-06-20T00:00:00.000Z"),
            };
          }

          return null;
        }),
      },
      notification: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async (args: { data: Record<string, unknown> }) => {
          const notification = {
            id: `notification-${notifications.length + 1}`,
            ...args.data,
          };
          notifications.push(notification);
          return notification;
        }),
      },
      auditLog: {
        create: vi.fn(async () => ({})),
      },
    };

    const result = await sendDueAnnualLeavePromotionNotices({
      date: "2027-07-01",
      prisma: prisma as never,
    });

    expect(result).toMatchObject({ checked: 2, sent: 1, skipped: 1 });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      userId: "user-open",
      title: "연차 사용계획 제출 요청",
      linkUrl: ANNUAL_USE_PLAN_LINK_URL,
    });
    expect(String(notifications[0].message)).not.toMatch(/�|[占筌獄]|[利泥湲諛痍]/);
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "notice-submitted", status: "SKIPPED" }),
        expect.objectContaining({ id: "notice-open", status: "SENT" }),
      ]),
    );
  });

  it("diagnoses missing schedules, bad links, broken Korean, and unlinked submissions", async () => {
    const submittedPlan = {
      id: "plan-submitted",
      userId: "user-submitted",
      referenceYear: 2027,
      status: "SUBMITTED",
      submittedAt: new Date("2027-06-20T00:00:00.000Z"),
    };
    const prisma = {
      annualLeavePolicy: {
        findFirst: vi.fn(async () => promotionPolicy),
      },
      user: {
        findMany: vi.fn(async () => promotionUsers.slice(0, 2)),
      },
      leaveLedger: {
        findMany: vi.fn(async () => [
          { eventType: "GRANTED", amount: 3, metadata: null },
        ]),
      },
      annualLeaveUsePlan: {
        findUnique: vi.fn(async (args: FindUsePlanArgs) => {
          return args.where.userId_referenceYear.userId === "user-submitted"
            ? submittedPlan
            : null;
        }),
        findMany: vi.fn(async () => [submittedPlan]),
      },
      annualLeavePromotionNotice: {
        findMany: vi.fn(async () => [
          dueNotice({
            id: "notice-open-first",
            userId: "user-open",
            status: "SENT",
            notificationId: null,
          }),
          dueNotice({
            id: "notice-submitted-first",
            userId: "user-submitted",
            status: "SENT",
            notificationId: "notification-bad",
            annualLeaveUsePlanId: null,
            submittedAt: null,
          }),
        ]),
      },
      notification: {
        findMany: vi.fn(async () => [
          {
            id: "notification-bad",
            userId: "user-submitted",
            title: "占쏙옙 사용계획",
            message: "깨진 본문 �",
            linkUrl: "/wrong",
          },
        ]),
      },
    };

    const diagnostics = await collectAnnualPromotionReadinessDiagnostics({
      year: 2027,
      prisma: prisma as never,
    });

    expect(diagnostics.issues.map((issue) => issue.code).sort()).toEqual([
      "BROKEN_KOREAN_NOTIFICATION_TEXT",
      "INVALID_NOTIFICATION_LINK",
      "MISSING_SCHEDULED_NOTICE",
      "SENT_NOTICE_MISSING_NOTIFICATION",
      "SUBMITTED_PLAN_NOT_LINKED_TO_NOTICE",
    ]);
    expect(hasBrokenAnnualUsePlanNoticeText("깨진 본문 �")).toBe(true);
    expect(hasBrokenAnnualUsePlanNoticeText("연차 사용계획 제출 요청")).toBe(false);
  });

  it("calculates use-plan reminder dates", () => {
    expect(
      calculateUsePlanReminderDate({
        plannedDate: "2026-07-20",
        daysBefore: 10,
      }),
    ).toBe("2026-07-10");
  });

  it("validates use plan total amount and duplicate dates", () => {
    expect(
      validateUsePlanItems({
        today: "2026-05-01",
        maxAmount: 2,
        items: [
          {
            plannedDate: "2026-07-01",
            amount: 0.5,
            halfDayPeriod: "AM",
          },
          {
            plannedDate: "2026-08-01",
            amount: 1,
            halfDayPeriod: null,
          },
        ],
      }),
    ).toBe(1.5);

    expect(() =>
      validateUsePlanItems({
        today: "2026-05-01",
        maxAmount: 1,
        items: [
          {
            plannedDate: "2026-07-01",
            amount: 0.5,
            halfDayPeriod: "AM",
          },
          {
            plannedDate: "2026-07-01",
            amount: 0.5,
            halfDayPeriod: "AM",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects past dates and over-planning", () => {
    expect(() =>
      validateUsePlanItems({
        today: "2026-05-01",
        maxAmount: 2,
        items: [
          {
            plannedDate: "2026-04-30",
            amount: 0.5,
            halfDayPeriod: null,
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      validateUsePlanItems({
        today: "2026-05-01",
        maxAmount: 1,
        items: [
          {
            plannedDate: "2026-07-01",
            amount: 1.5,
            halfDayPeriod: null,
          },
        ],
      }),
    ).toThrow();
  });

  it("calculates date-range use plan amounts", () => {
    expect(
      calculateAnnualUsePlanItemAmount({
        startDate: "2026-07-01",
        endDate: "2026-07-01",
        usageType: "FULL_DAY",
      }).amount,
    ).toBe(1);

    expect(
      calculateAnnualUsePlanItemAmount({
        startDate: "2026-07-06",
        endDate: "2026-07-08",
        usageType: "FULL_DAY",
      }).amount,
    ).toBe(3);

    expect(
      calculateAnnualUsePlanItemAmount({
        startDate: "2026-07-03",
        endDate: "2026-07-06",
        usageType: "FULL_DAY",
      }).amount,
    ).toBe(2);

    expect(
      calculateAnnualUsePlanItemAmount({
        startDate: "2026-05-04",
        endDate: "2026-05-06",
        usageType: "FULL_DAY",
        companyHolidays: ["2026-05-05"],
      }),
    ).toMatchObject({
      amount: 2,
      countedDates: ["2026-05-04", "2026-05-06"],
      excludedDates: ["2026-05-05"],
    });
  });

  it("calculates and validates half-day use plans", () => {
    expect(
      calculateAnnualUsePlanItemAmount({
        startDate: "2026-07-01",
        endDate: "2026-07-01",
        usageType: "AM_HALF_DAY",
      }).amount,
    ).toBe(0.5);

    expect(
      calculateAnnualUsePlanItemAmount({
        startDate: "2026-07-01",
        endDate: "2026-07-01",
        usageType: "PM_HALF_DAY",
      }).amount,
    ).toBe(0.5);

    expect(() =>
      calculateAnnualUsePlanItemAmount({
        startDate: "2026-07-01",
        endDate: "2026-07-02",
        usageType: "AM_HALF_DAY",
      }),
    ).toThrow();
  });

  it("normalizes range use plans and rejects duplicate counted dates", () => {
    const result = validateAnnualUsePlanItems({
      today: "2026-05-01",
      maxAmount: 5,
      items: [
        {
          plannedStartDate: "2026-07-01",
          plannedEndDate: "2026-07-03",
          usageType: "FULL_DAY",
        },
        {
          plannedStartDate: "2026-07-06",
          plannedEndDate: "2026-07-06",
          usageType: "PM_HALF_DAY",
        },
      ],
    });

    expect(result.totalPlannedAmount).toBe(3.5);
    expect(result.items[0]).toMatchObject({
      plannedDate: "2026-07-01",
      plannedStartDate: "2026-07-01",
      plannedEndDate: "2026-07-03",
      calculatedAmount: 3,
      halfDayPeriod: null,
    });
    expect(result.items[1]).toMatchObject({
      calculatedAmount: 0.5,
      halfDayPeriod: "PM",
    });

    expect(() =>
      validateAnnualUsePlanItems({
        today: "2026-05-01",
        maxAmount: 5,
        items: [
          {
            plannedStartDate: "2026-07-01",
            plannedEndDate: "2026-07-02",
            usageType: "FULL_DAY",
          },
          {
            plannedStartDate: "2026-07-02",
            plannedEndDate: "2026-07-02",
            usageType: "AM_HALF_DAY",
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      validateAnnualUsePlanItems({
        today: "2026-05-01",
        maxAmount: 1,
        items: [
          {
            plannedStartDate: "2026-07-01",
            plannedEndDate: "2026-07-03",
            usageType: "FULL_DAY",
          },
        ],
      }),
    ).toThrow();
  });

  it("parses annual use plan form rows beyond the original five-row draft", () => {
    const formData = new FormData();

    for (let index = 0; index < 7; index += 1) {
      formData.append("itemIndex", String(index));
      formData.set(`plannedStartDate_${index}`, `2026-07-${String(index + 1).padStart(2, "0")}`);
      formData.set(`plannedEndDate_${index}`, `2026-07-${String(index + 1).padStart(2, "0")}`);
      formData.set(`usageType_${index}`, "FULL_DAY");
      formData.set(`memo_${index}`, `plan-${index + 1}`);
    }

    expect(parseAnnualUsePlanFormItems(formData)).toHaveLength(7);
  });

  it("ignores empty rows and rejects partially filled annual use plan rows", () => {
    const formData = new FormData();
    formData.append("itemIndex", "0");
    formData.append("itemIndex", "1");
    formData.set("plannedStartDate_0", "2026-07-01");
    formData.set("plannedEndDate_0", "2026-07-01");
    formData.set("usageType_0", "FULL_DAY");
    formData.set("memo_1", "missing dates");

    expect(() => parseAnnualUsePlanFormItems(formData)).toThrow();

    formData.set("memo_1", "");
    expect(parseAnnualUsePlanFormItems(formData)).toHaveLength(1);
  });

  it("keeps annual use plan validation capped by the provided remaining balance", () => {
    expect(() =>
      validateAnnualUsePlanItems({
        today: "2026-05-01",
        maxAmount: 17,
        items: [
          {
            plannedStartDate: "2026-07-01",
            plannedEndDate: "2026-07-24",
            usageType: "FULL_DAY",
          },
        ],
      }),
    ).toThrow();
  });

  it("derives use plan availability from canonical remaining balance", () => {
    const canonicalRemainingDays = 17;
    const planAvailableAmount = Math.max(0, canonicalRemainingDays);

    expect(planAvailableAmount).toBe(17);

    expect(
      validateAnnualUsePlanItems({
        today: "2026-05-01",
        maxAmount: planAvailableAmount,
        items: [
          {
            plannedStartDate: "2026-07-01",
            plannedEndDate: "2026-07-23",
            usageType: "FULL_DAY",
          },
        ],
      }).totalPlannedAmount,
    ).toBe(17);
  });

  it("keeps use-plan page and submit action wired to getUserLeaveBalance remainingDays", () => {
    const pageSource = readFileSync(
      "src/app/(app)/leaves/me/use-plan/page.tsx",
      "utf8",
    );
    const actionSource = readFileSync(
      "src/app/(app)/leaves/me/use-plan/actions.ts",
      "utf8",
    );

    expect(pageSource).toContain("getUserLeaveBalance");
    expect(actionSource).toContain("getUserLeaveBalance");
    expect(pageSource).toContain("Math.max(0, balance.remainingDays)");
    expect(actionSource).toContain("Math.max(0, balance.remainingDays)");
    expect(actionSource).not.toContain("maxAmount: context.expiringAmount");
  });
});
