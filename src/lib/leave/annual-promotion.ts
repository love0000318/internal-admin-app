import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  calculateAnnualLeaveExpirationDate,
  calculateAnnualLeavePromotionSchedule,
  calculateFiscalYearDateRange,
  calculateMonthlyLeaveExpirationDate,
  getActiveAnnualLeavePolicy,
} from "@/lib/leave/annual-policy";
import {
  compareDateOnly,
  dateOnlyToDate,
  dateToDateOnly,
  todayInSeoul,
} from "@/lib/leave/calculate-business-days";
import {
  calculateLeaveLedgerBalance,
  createLeaveLedgerEntry,
  roundLeaveAmount,
} from "@/lib/leave/ledger";
import {
  calculateAnnualUsePlanItemAmount,
  halfDayPeriodToUsageType,
  usageTypeToHalfDayPeriod,
  type AnnualUsePlanUsageType,
} from "@/lib/leave/annual-use-plan-calculator";
import type { DateOnly } from "@/lib/leave/types";
import {
  ANNUAL_USE_PLAN_LINK_URL,
  ANNUAL_LEAVE_PROMOTION_LEGAL_BASIS,
  ANNUAL_LEAVE_PROMOTION_LEGAL_REVIEW_NOTE,
  ANNUAL_LEAVE_PROMOTION_POLICY_VERSION,
  USE_PLAN_NOTICE_TYPES,
  buildAnnualUsePlanNoticeContent,
  createAnnualUsePlanRequestNotification,
  hasBrokenAnnualUsePlanNoticeText,
  skipAnnualUsePlanNoticeBecauseSubmitted,
} from "@/lib/notifications/annual-use-plan-notifications";

type PromotionDb = PrismaClient | Prisma.TransactionClient;

export type AnnualPromotionCandidate = {
  userId: string;
  name: string;
  email: string;
  teamName: string | null;
  title: string | null;
  hireDate: Date | null;
  referenceYear: number;
  noticeType:
    | "ANNUAL_USE_PLAN_REQUEST"
    | "ANNUAL_SECOND_NOTICE"
    | "MONTHLY_FIRST_NOTICE"
    | "MONTHLY_SECOND_NOTICE";
  scheduledDate: DateOnly;
  availableFrom: DateOnly;
  expirationDate: DateOnly;
  submissionDeadline: DateOnly;
  remainingAmount: number;
  isRenotice: boolean;
  usePlanStatus: "DRAFT" | "SUBMITTED" | "CANCELLED" | null;
  usePlanSubmittedAt: Date | null;
};

export type AnnualPromotionReadinessIssueCode =
  | "MISSING_SCHEDULED_NOTICE"
  | "SENT_NOTICE_MISSING_NOTIFICATION"
  | "INVALID_NOTIFICATION_LINK"
  | "BROKEN_KOREAN_NOTIFICATION_TEXT"
  | "SUBMITTED_PLAN_NOT_LINKED_TO_NOTICE";

export type AnnualPromotionReadinessIssue = {
  code: AnnualPromotionReadinessIssueCode;
  userId?: string;
  noticeId?: string;
  notificationId?: string;
  referenceYear: number;
  noticeType?: string;
  scheduledDate?: DateOnly;
};

function addDays(value: DateOnly, days: number): DateOnly {
  const date = dateOnlyToDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateToDateOnly(date);
}

function completedYears(hireDate: Date, asOf: DateOnly) {
  const hire = dateToDateOnly(hireDate);
  const [hireYear, hireMonth, hireDay] = hire.split("-").map(Number);
  const [year, month, day] = asOf.split("-").map(Number);
  let years = year - hireYear;

  if (month < hireMonth || (month === hireMonth && day < hireDay)) {
    years -= 1;
  }

  return Math.max(0, years);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function calculateAnnualPromotionNoticeDate({
  expirationDate,
  monthsBefore,
}: {
  expirationDate: DateOnly;
  monthsBefore: number;
}) {
  return calculateAnnualLeavePromotionSchedule({
    expirationDate,
    policy: {
      promotionEnabled: true,
      annualPromotionMonthsBeforeExpiration: monthsBefore,
      monthlyPromotionFirstMonthsBeforeExpiration: 0,
      monthlyPromotionSecondMonthsBeforeExpiration: 0,
    },
  })[0].scheduledDate;
}

export function calculateAnnualSecondPromotionNoticeDate({
  expirationDate,
}: {
  expirationDate: DateOnly;
}) {
  return calculateAnnualLeavePromotionSchedule({
    expirationDate,
    policy: {
      promotionEnabled: true,
      annualPromotionMonthsBeforeExpiration: 2,
      monthlyPromotionFirstMonthsBeforeExpiration: 0,
      monthlyPromotionSecondMonthsBeforeExpiration: 0,
    },
  })[0].scheduledDate;
}

function submissionDeadlineForNotice({
  noticeType,
  scheduledDate,
  expirationDate,
}: {
  noticeType: AnnualPromotionCandidate["noticeType"];
  scheduledDate: DateOnly;
  expirationDate: DateOnly;
}) {
  if (noticeType === "ANNUAL_USE_PLAN_REQUEST" || noticeType === "MONTHLY_FIRST_NOTICE") {
    return addDays(scheduledDate, 10);
  }

  return expirationDate;
}

export function calculateMonthlyFirstPromotionNoticeDate({
  expirationDate,
  monthsBefore,
}: {
  expirationDate: DateOnly;
  monthsBefore: number;
}) {
  return calculateAnnualLeavePromotionSchedule({
    expirationDate,
    policy: {
      promotionEnabled: true,
      annualPromotionMonthsBeforeExpiration: 0,
      monthlyPromotionFirstMonthsBeforeExpiration: monthsBefore,
      monthlyPromotionSecondMonthsBeforeExpiration: 0,
    },
  })[1].scheduledDate;
}

export function calculateMonthlySecondPromotionNoticeDate({
  expirationDate,
  monthsBefore,
}: {
  expirationDate: DateOnly;
  monthsBefore: number;
}) {
  return calculateAnnualLeavePromotionSchedule({
    expirationDate,
    policy: {
      promotionEnabled: true,
      annualPromotionMonthsBeforeExpiration: 0,
      monthlyPromotionFirstMonthsBeforeExpiration: 0,
      monthlyPromotionSecondMonthsBeforeExpiration: monthsBefore,
    },
  })[2].scheduledDate;
}

export function calculateUsePlanReminderDate({
  plannedDate,
  daysBefore,
}: {
  plannedDate: DateOnly;
  daysBefore: number;
}) {
  return addDays(plannedDate, -daysBefore);
}

async function getAnnualLedgerBalance({
  prisma,
  userId,
  year,
}: {
  prisma: PromotionDb;
  userId: string;
  year: number;
}) {
  const entries = await prisma.leaveLedger.findMany({
    where: {
      userId,
      referenceYear: year,
      leaveGrantId: null,
    },
  });

  return calculateLeaveLedgerBalance(
    entries.map((entry) => ({
      eventType: entry.eventType,
      amount: entry.amount,
      metadata: entry.metadata,
    })),
  );
}

export async function findAnnualPromotionCandidates({
  year = Number(todayInSeoul().slice(0, 4)),
  prisma = getPrisma(),
}: {
  year?: number;
  prisma?: PromotionDb;
} = {}) {
  const policy = await getActiveAnnualLeavePolicy(prisma);

  if (!policy.promotionEnabled || !policy.expirationEnabled) {
    return [];
  }

  const fiscalRange = calculateFiscalYearDateRange(policy, year);
  const annualExpiration = calculateAnnualLeaveExpirationDate({
    fiscalYearEnd: fiscalRange.end,
    policy,
  });
  const monthlyExpiration = calculateMonthlyLeaveExpirationDate({
    grantedDate: fiscalRange.end,
    policy,
  });

  if (!annualExpiration || !monthlyExpiration) {
    return [];
  }

  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: { in: ["OWNER", "LEAD", "MANAGER"] },
    },
    include: {
      team: true,
      profile: true,
      employmentProfile: true,
    },
    orderBy: { name: "asc" },
  });
  const candidates: AnnualPromotionCandidate[] = [];

  for (const user of users) {
    if (user.employmentProfile?.retirementDate) {
      continue;
    }

    const hireDate =
      user.employmentProfile?.hireDate ?? user.profile?.hireDate ?? user.hireDate ?? null;

    if (!hireDate) {
      continue;
    }

    const balance = await getAnnualLedgerBalance({ prisma, userId: user.id, year });

    if (balance.remainingAmount <= 0) {
      continue;
    }

    const usePlan = await prisma.annualLeaveUsePlan.findUnique({
      where: {
        userId_referenceYear: {
          userId: user.id,
          referenceYear: year,
        },
      },
      select: {
        status: true,
        submittedAt: true,
      },
    });

    const base = {
      userId: user.id,
      name: user.name,
      email: user.email,
      teamName: user.team?.name ?? null,
      title: user.title ?? user.profile?.jobTitle ?? null,
      hireDate,
      referenceYear: year,
      remainingAmount: balance.remainingAmount,
      usePlanStatus: usePlan?.status ?? null,
      usePlanSubmittedAt: usePlan?.submittedAt ?? null,
    };

    if (completedYears(hireDate, fiscalRange.end) >= 1) {
      const firstScheduledDate = calculateAnnualPromotionNoticeDate({
        expirationDate: annualExpiration,
        monthsBefore: policy.annualPromotionMonthsBeforeExpiration,
      });
      const secondScheduledDate = calculateAnnualSecondPromotionNoticeDate({
        expirationDate: annualExpiration,
      });

      candidates.push({
        ...base,
        noticeType: "ANNUAL_USE_PLAN_REQUEST",
        scheduledDate: firstScheduledDate,
        availableFrom: fiscalRange.start,
        expirationDate: annualExpiration,
        submissionDeadline: submissionDeadlineForNotice({
          noticeType: "ANNUAL_USE_PLAN_REQUEST",
          scheduledDate: firstScheduledDate,
          expirationDate: annualExpiration,
        }),
        isRenotice: false,
      });
      candidates.push({
        ...base,
        noticeType: "ANNUAL_SECOND_NOTICE",
        scheduledDate: secondScheduledDate,
        availableFrom: fiscalRange.start,
        expirationDate: annualExpiration,
        submissionDeadline: submissionDeadlineForNotice({
          noticeType: "ANNUAL_SECOND_NOTICE",
          scheduledDate: secondScheduledDate,
          expirationDate: annualExpiration,
        }),
        isRenotice: true,
      });
    } else {
      const availableFrom = dateToDateOnly(hireDate);
      const firstScheduledDate = calculateMonthlyFirstPromotionNoticeDate({
        expirationDate: monthlyExpiration,
        monthsBefore: policy.monthlyPromotionFirstMonthsBeforeExpiration,
      });
      const secondScheduledDate = calculateMonthlySecondPromotionNoticeDate({
        expirationDate: monthlyExpiration,
        monthsBefore: policy.monthlyPromotionSecondMonthsBeforeExpiration,
      });

      candidates.push({
        ...base,
        noticeType: "MONTHLY_FIRST_NOTICE",
        scheduledDate: firstScheduledDate,
        availableFrom,
        expirationDate: monthlyExpiration,
        submissionDeadline: submissionDeadlineForNotice({
          noticeType: "MONTHLY_FIRST_NOTICE",
          scheduledDate: firstScheduledDate,
          expirationDate: monthlyExpiration,
        }),
        isRenotice: false,
      });
      candidates.push({
        ...base,
        noticeType: "MONTHLY_SECOND_NOTICE",
        scheduledDate: secondScheduledDate,
        availableFrom,
        expirationDate: monthlyExpiration,
        submissionDeadline: submissionDeadlineForNotice({
          noticeType: "MONTHLY_SECOND_NOTICE",
          scheduledDate: secondScheduledDate,
          expirationDate: monthlyExpiration,
        }),
        isRenotice: true,
      });
    }
  }

  return candidates;
}

export async function scheduleAnnualLeavePromotionNotices({
  year = Number(todayInSeoul().slice(0, 4)),
  dryRun = false,
  prisma = getPrisma(),
}: {
  year?: number;
  dryRun?: boolean;
  prisma?: PromotionDb;
} = {}) {
  const candidates = await findAnnualPromotionCandidates({ year, prisma });
  let created = 0;
  let skipped = 0;

  if (dryRun) {
    return {
      year,
      candidates,
      created,
      skipped: candidates.filter((candidate) => candidate.usePlanStatus === "SUBMITTED")
        .length,
    };
  }

  for (const candidate of candidates) {
    if (candidate.usePlanStatus === "SUBMITTED") {
      skipped += 1;
      continue;
    }

    const existing = await prisma.annualLeavePromotionNotice.findUnique({
      where: {
        userId_referenceYear_noticeType_scheduledDate: {
          userId: candidate.userId,
          referenceYear: candidate.referenceYear,
          noticeType: candidate.noticeType,
          scheduledDate: dateOnlyToDate(candidate.scheduledDate),
        },
      },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    const notice = await prisma.annualLeavePromotionNotice.create({
      data: {
        userId: candidate.userId,
        referenceYear: candidate.referenceYear,
        noticeType: candidate.noticeType,
        scheduledDate: dateOnlyToDate(candidate.scheduledDate),
        expirationDate: dateOnlyToDate(candidate.expirationDate),
        remainingAmount: candidate.remainingAmount,
        unit: "DAY",
        policyVersion: ANNUAL_LEAVE_PROMOTION_POLICY_VERSION,
        legalBasis: ANNUAL_LEAVE_PROMOTION_LEGAL_BASIS,
        availableFrom: dateOnlyToDate(candidate.availableFrom),
        availableUntil: dateOnlyToDate(candidate.expirationDate),
        submissionDeadline: dateOnlyToDate(candidate.submissionDeadline),
        isRenotice: candidate.isRenotice,
        noticeContent: buildAnnualUsePlanNoticeContent({
          id: "__scheduled__",
          userId: candidate.userId,
          referenceYear: candidate.referenceYear,
          noticeType: candidate.noticeType,
          scheduledDate: dateOnlyToDate(candidate.scheduledDate),
          expirationDate: dateOnlyToDate(candidate.expirationDate),
          remainingAmount: candidate.remainingAmount,
          unit: "DAY",
          availableFrom: dateOnlyToDate(candidate.availableFrom),
          availableUntil: dateOnlyToDate(candidate.expirationDate),
          submissionDeadline: dateOnlyToDate(candidate.submissionDeadline),
          policyVersion: ANNUAL_LEAVE_PROMOTION_POLICY_VERSION,
          legalBasis: ANNUAL_LEAVE_PROMOTION_LEGAL_BASIS,
          isRenotice: candidate.isRenotice,
        }),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "ANNUAL_LEAVE_PROMOTION_NOTICE_SCHEDULED",
        targetType: "ANNUAL_LEAVE_PROMOTION_NOTICE",
        targetId: notice.id,
        targetUserId: candidate.userId,
        metadata: toJsonValue({
          userId: candidate.userId,
          referenceYear: candidate.referenceYear,
          noticeType: candidate.noticeType,
          scheduledDate: candidate.scheduledDate,
          expirationDate: candidate.expirationDate,
          remainingAmount: candidate.remainingAmount,
          availableFrom: candidate.availableFrom,
          availableUntil: candidate.expirationDate,
          submissionDeadline: candidate.submissionDeadline,
          policyVersion: ANNUAL_LEAVE_PROMOTION_POLICY_VERSION,
          legalBasis: ANNUAL_LEAVE_PROMOTION_LEGAL_BASIS,
          legalReviewNote: ANNUAL_LEAVE_PROMOTION_LEGAL_REVIEW_NOTE,
          isRenotice: candidate.isRenotice,
        }),
      },
    });
    created += 1;
  }

  return { year, candidates, created, skipped };
}

export async function sendDueAnnualLeavePromotionNotices({
  date = todayInSeoul(),
  prisma = getPrisma(),
}: {
  date?: DateOnly;
  prisma?: PromotionDb;
} = {}) {
  const dueNotices = await prisma.annualLeavePromotionNotice.findMany({
    where: {
      status: "SCHEDULED",
      scheduledDate: { lte: dateOnlyToDate(date) },
    },
    include: { user: true },
    orderBy: { scheduledDate: "asc" },
  });
  let sent = 0;
  let skipped = 0;

  for (const notice of dueNotices) {
    if (notice.noticeType !== "USE_PLAN_REMINDER") {
      const existingPlan = await prisma.annualLeaveUsePlan.findUnique({
        where: {
          userId_referenceYear: {
            userId: notice.userId,
            referenceYear: notice.referenceYear,
          },
        },
      });

      if (existingPlan?.status === "SUBMITTED") {
        await skipAnnualUsePlanNoticeBecauseSubmitted({
          notice,
          usePlan: existingPlan,
          prisma,
        });
        skipped += 1;
        continue;
      }
    }

    await createAnnualUsePlanRequestNotification({
      notice: {
        id: notice.id,
        userId: notice.userId,
        referenceYear: notice.referenceYear,
        noticeType: notice.noticeType,
        scheduledDate: notice.scheduledDate,
        expirationDate: notice.expirationDate,
        remainingAmount: notice.remainingAmount,
        unit: notice.unit,
        availableFrom: notice.availableFrom,
        availableUntil: notice.availableUntil,
        submissionDeadline: notice.submissionDeadline,
        policyVersion: notice.policyVersion,
        legalBasis: notice.legalBasis,
        isRenotice: notice.isRenotice,
      },
      prisma,
    });
    sent += 1;
  }

  return { checked: dueNotices.length, sent, skipped };
}

function annualPromotionNoticeKey({
  userId,
  referenceYear,
  noticeType,
  scheduledDate,
}: {
  userId: string;
  referenceYear: number;
  noticeType: string;
  scheduledDate: Date | DateOnly;
}) {
  const dateOnly =
    scheduledDate instanceof Date ? dateToDateOnly(scheduledDate) : scheduledDate;

  return `${userId}:${referenceYear}:${noticeType}:${dateOnly}`;
}

export async function collectAnnualPromotionReadinessDiagnostics({
  year = Number(todayInSeoul().slice(0, 4)),
  prisma = getPrisma(),
}: {
  year?: number;
  prisma?: PromotionDb;
} = {}) {
  const [candidates, notices, plans] = await Promise.all([
    findAnnualPromotionCandidates({ year, prisma }),
    prisma.annualLeavePromotionNotice.findMany({
      where: { referenceYear: year },
      select: {
        id: true,
        userId: true,
        referenceYear: true,
        noticeType: true,
        status: true,
        scheduledDate: true,
        expirationDate: true,
        remainingAmount: true,
        unit: true,
        annualLeaveUsePlanId: true,
        policyVersion: true,
        legalBasis: true,
        availableFrom: true,
        availableUntil: true,
        submissionDeadline: true,
        submittedAt: true,
        notificationId: true,
        isRenotice: true,
      },
    }),
    prisma.annualLeaveUsePlan.findMany({
      where: { referenceYear: year },
      select: {
        id: true,
        userId: true,
        referenceYear: true,
        status: true,
        submittedAt: true,
      },
    }),
  ]);
  const notificationIds = notices
    .map((notice) => notice.notificationId)
    .filter((value): value is string => Boolean(value));
  const notifications =
    notificationIds.length > 0
      ? await prisma.notification.findMany({
          where: { id: { in: notificationIds } },
          select: {
            id: true,
            userId: true,
            title: true,
            message: true,
            linkUrl: true,
          },
        })
      : [];
  const noticeKeySet = new Set(
    notices.map((notice) =>
      annualPromotionNoticeKey({
        userId: notice.userId,
        referenceYear: notice.referenceYear,
        noticeType: notice.noticeType,
        scheduledDate: notice.scheduledDate,
      }),
    ),
  );
  const notificationById = new Map(
    notifications.map((notification) => [notification.id, notification]),
  );
  const submittedPlanByUserId = new Map(
    plans
      .filter((plan) => plan.status === "SUBMITTED")
      .map((plan) => [plan.userId, plan]),
  );
  const issues: AnnualPromotionReadinessIssue[] = [];

  for (const candidate of candidates) {
    if (candidate.usePlanStatus === "SUBMITTED") {
      continue;
    }

    const key = annualPromotionNoticeKey({
      userId: candidate.userId,
      referenceYear: candidate.referenceYear,
      noticeType: candidate.noticeType,
      scheduledDate: candidate.scheduledDate,
    });

    if (!noticeKeySet.has(key)) {
      issues.push({
        code: "MISSING_SCHEDULED_NOTICE",
        userId: candidate.userId,
        referenceYear: candidate.referenceYear,
        noticeType: candidate.noticeType,
        scheduledDate: candidate.scheduledDate,
      });
    }
  }

  for (const notice of notices) {
    const notification = notice.notificationId
      ? notificationById.get(notice.notificationId)
      : null;

    if (notice.status === "SENT" && !notification) {
      issues.push({
        code: "SENT_NOTICE_MISSING_NOTIFICATION",
        userId: notice.userId,
        noticeId: notice.id,
        referenceYear: notice.referenceYear,
        noticeType: notice.noticeType,
        scheduledDate: dateToDateOnly(notice.scheduledDate),
      });
    }

    if (notification && notification.linkUrl !== ANNUAL_USE_PLAN_LINK_URL) {
      issues.push({
        code: "INVALID_NOTIFICATION_LINK",
        userId: notice.userId,
        noticeId: notice.id,
        notificationId: notification.id,
        referenceYear: notice.referenceYear,
        noticeType: notice.noticeType,
        scheduledDate: dateToDateOnly(notice.scheduledDate),
      });
    }

    if (
      notification &&
      (hasBrokenAnnualUsePlanNoticeText(notification.title) ||
        hasBrokenAnnualUsePlanNoticeText(notification.message))
    ) {
      issues.push({
        code: "BROKEN_KOREAN_NOTIFICATION_TEXT",
        userId: notice.userId,
        noticeId: notice.id,
        notificationId: notification.id,
        referenceYear: notice.referenceYear,
        noticeType: notice.noticeType,
        scheduledDate: dateToDateOnly(notice.scheduledDate),
      });
    }

    const submittedPlan = submittedPlanByUserId.get(notice.userId);
    if (
      submittedPlan &&
      USE_PLAN_NOTICE_TYPES.includes(notice.noticeType) &&
      (notice.annualLeaveUsePlanId !== submittedPlan.id || !notice.submittedAt)
    ) {
      issues.push({
        code: "SUBMITTED_PLAN_NOT_LINKED_TO_NOTICE",
        userId: notice.userId,
        noticeId: notice.id,
        referenceYear: notice.referenceYear,
        noticeType: notice.noticeType,
        scheduledDate: dateToDateOnly(notice.scheduledDate),
      });
    }
  }

  return {
    year,
    candidates,
    notices,
    plans,
    notifications,
    issues,
  };
}

function noticeToNotificationInput(
  notice: Awaited<
    ReturnType<typeof collectAnnualPromotionReadinessDiagnostics>
  >["notices"][number],
) {
  return {
    id: notice.id,
    userId: notice.userId,
    referenceYear: notice.referenceYear,
    noticeType: notice.noticeType,
    scheduledDate: notice.scheduledDate,
    expirationDate: notice.expirationDate,
    remainingAmount: notice.remainingAmount,
    unit: notice.unit,
    availableFrom: notice.availableFrom,
    availableUntil: notice.availableUntil,
    submissionDeadline: notice.submissionDeadline,
    policyVersion: notice.policyVersion,
    legalBasis: notice.legalBasis,
    isRenotice: notice.isRenotice,
  };
}

export async function auditAnnualLeavePromotionReadiness({
  year = Number(todayInSeoul().slice(0, 4)),
  apply = false,
  prisma = getPrisma(),
}: {
  year?: number;
  apply?: boolean;
  prisma?: PromotionDb;
} = {}) {
  let diagnostics = await collectAnnualPromotionReadinessDiagnostics({
    year,
    prisma,
  });
  const applied = {
    createdScheduledNotices: 0,
    skippedScheduledNotices: 0,
    createdMissingNotifications: 0,
    repairedNotificationTexts: 0,
    linkedSubmittedNotices: 0,
    cancelledSubmittedRenotices: 0,
  };

  if (apply) {
    const scheduleResult = await scheduleAnnualLeavePromotionNotices({
      year,
      dryRun: false,
      prisma,
    });
    applied.createdScheduledNotices = scheduleResult.created;
    applied.skippedScheduledNotices = scheduleResult.skipped;

    diagnostics = await collectAnnualPromotionReadinessDiagnostics({
      year,
      prisma,
    });

    const noticeById = new Map(diagnostics.notices.map((notice) => [notice.id, notice]));
    const notificationRepairNoticeIds = new Set(
      diagnostics.issues
        .filter(
          (issue) =>
            issue.noticeId &&
            (issue.code === "INVALID_NOTIFICATION_LINK" ||
              issue.code === "BROKEN_KOREAN_NOTIFICATION_TEXT"),
        )
        .map((issue) => issue.noticeId as string),
    );

    for (const issue of diagnostics.issues) {
      if (issue.code !== "SENT_NOTICE_MISSING_NOTIFICATION" || !issue.noticeId) {
        continue;
      }

      const notice = noticeById.get(issue.noticeId);
      if (!notice) {
        continue;
      }

      await createAnnualUsePlanRequestNotification({
        notice: noticeToNotificationInput(notice),
        prisma,
      });
      applied.createdMissingNotifications += 1;
    }

    for (const noticeId of notificationRepairNoticeIds) {
      const notice = noticeById.get(noticeId);
      if (!notice?.notificationId) {
        continue;
      }

      const content = buildAnnualUsePlanNoticeContent(
        noticeToNotificationInput(notice),
      );
      const contentRecord = content as Record<string, unknown>;
      await prisma.notification.update({
        where: { id: notice.notificationId },
        data: {
          title: String(contentRecord.title),
          message: String(contentRecord.message),
          linkUrl: ANNUAL_USE_PLAN_LINK_URL,
        },
      });
      await prisma.annualLeavePromotionNotice.update({
        where: { id: notice.id },
        data: { noticeContent: content },
      });
      applied.repairedNotificationTexts += 1;
    }

    const submittedPlans = diagnostics.plans.filter(
      (plan) => plan.status === "SUBMITTED",
    );

    for (const plan of submittedPlans) {
      const submittedAt = plan.submittedAt ?? new Date();
      const linked = await prisma.annualLeavePromotionNotice.updateMany({
        where: {
          userId: plan.userId,
          referenceYear: plan.referenceYear,
          noticeType: { in: USE_PLAN_NOTICE_TYPES },
          OR: [
            { annualLeaveUsePlanId: { not: plan.id } },
            { annualLeaveUsePlanId: null },
            { submittedAt: null },
          ],
        },
        data: {
          annualLeaveUsePlanId: plan.id,
          submittedAt,
        },
      });
      const cancelled = await prisma.annualLeavePromotionNotice.updateMany({
        where: {
          userId: plan.userId,
          referenceYear: plan.referenceYear,
          noticeType: { in: ["ANNUAL_SECOND_NOTICE", "MONTHLY_SECOND_NOTICE"] },
          status: "SCHEDULED",
        },
        data: {
          status: "CANCELLED",
          cancelledAt: submittedAt,
          annualLeaveUsePlanId: plan.id,
          submittedAt,
        },
      });

      applied.linkedSubmittedNotices += linked.count;
      applied.cancelledSubmittedRenotices += cancelled.count;
    }

    diagnostics = await collectAnnualPromotionReadinessDiagnostics({
      year,
      prisma,
    });
  }

  return {
    ...diagnostics,
    apply,
    applied,
  };
}

export async function getUsePlanContext({
  userId,
  year = Number(todayInSeoul().slice(0, 4)),
  prisma = getPrisma(),
}: {
  userId: string;
  year?: number;
  prisma?: PromotionDb;
}) {
  const policy = await getActiveAnnualLeavePolicy(prisma);
  const fiscalRange = calculateFiscalYearDateRange(policy, year);
  const expirationDate = calculateAnnualLeaveExpirationDate({
    fiscalYearEnd: fiscalRange.end,
    policy,
  });
  const balance = await getAnnualLedgerBalance({ prisma, userId, year });
  const plan = await prisma.annualLeaveUsePlan.findUnique({
    where: {
      userId_referenceYear: {
        userId,
        referenceYear: year,
      },
    },
    include: { items: { orderBy: [{ plannedStartDate: "asc" }, { plannedDate: "asc" }] } },
  });

  return {
    year,
    policy,
    fiscalRange,
    expirationDate,
    expiringAmount: Math.max(0, balance.remainingAmount),
    plan,
  };
}

export function validateUsePlanItems({
  items,
  maxAmount,
  today = todayInSeoul(),
}: {
  items: Array<{
    plannedDate: DateOnly;
    amount: number;
    halfDayPeriod: "AM" | "PM" | null;
    memo?: string | null;
  }>;
  maxAmount: number;
  today?: DateOnly;
}) {
  if (items.length === 0) {
    throw new Error("사용계획 항목을 1개 이상 입력해 주세요.");
  }

  const seen = new Set<string>();
  let total = 0;

  for (const item of items) {
    if (compareDateOnly(item.plannedDate, today) < 0) {
      throw new Error("과거 날짜는 사용계획으로 제출할 수 없습니다.");
    }

    if (item.amount <= 0) {
      throw new Error("사용 수량은 0보다 커야 합니다.");
    }

    if (Math.round(item.amount * 2) / 2 !== item.amount) {
      throw new Error("사용 수량은 반차 단위로 입력해 주세요.");
    }

    const key = `${item.plannedDate}:${item.halfDayPeriod ?? "FULL"}`;
    if (seen.has(key)) {
      throw new Error("같은 날짜와 반차 구분을 중복 입력할 수 없습니다.");
    }

    seen.add(key);
    total += item.amount;
  }

  const roundedTotal = roundLeaveAmount(total);

  if (roundedTotal > maxAmount) {
    throw new Error("사용계획 총 수량이 소멸 예정 연차보다 클 수 없습니다.");
  }

  return roundedTotal;
}

type UsePlanValidationInput = {
  plannedDate?: DateOnly;
  amount?: number;
  halfDayPeriod?: "AM" | "PM" | null;
  plannedStartDate?: DateOnly;
  plannedEndDate?: DateOnly;
  usageType?: AnnualUsePlanUsageType;
  memo?: string | null;
};

export function validateAnnualUsePlanItems({
  items,
  maxAmount,
  today = todayInSeoul(),
  companyHolidays = [],
}: {
  items: UsePlanValidationInput[];
  maxAmount: number;
  today?: DateOnly;
  companyHolidays?: DateOnly[];
}) {
  if (items.length === 0) {
    throw new Error("사용계획 항목을 1개 이상 입력해 주세요.");
  }

  const seen = new Set<string>();
  let total = 0;
  const normalizedItems: Array<{
    plannedDate: DateOnly;
    plannedStartDate: DateOnly;
    plannedEndDate: DateOnly;
    usageType: AnnualUsePlanUsageType;
    calculatedAmount: number;
    amount: number;
    halfDayPeriod: "AM" | "PM" | null;
    memo?: string | null;
    countedDates: DateOnly[];
    excludedDates: DateOnly[];
  }> = [];

  for (const item of items) {
    const plannedStartDate = item.plannedStartDate ?? item.plannedDate;
    const plannedEndDate = item.plannedEndDate ?? item.plannedDate;
    const usageType =
      item.usageType ?? halfDayPeriodToUsageType(item.halfDayPeriod ?? null);

    if (!plannedStartDate || !plannedEndDate) {
      throw new Error("사용계획 시작일과 종료일을 입력해 주세요.");
    }

    if (compareDateOnly(plannedStartDate, today) < 0) {
      throw new Error("과거 날짜는 사용계획으로 제출할 수 없습니다.");
    }

    const calculation = calculateAnnualUsePlanItemAmount({
      startDate: plannedStartDate,
      endDate: plannedEndDate,
      usageType,
      companyHolidays,
    });
    const amount =
      item.plannedStartDate || item.plannedEndDate || item.usageType
        ? calculation.amount
        : (item.amount ?? calculation.amount);

    if (amount <= 0) {
      throw new Error("사용 수량은 0보다 커야 합니다.");
    }

    if (Math.round(amount * 2) / 2 !== amount) {
      throw new Error("사용 수량은 반차 단위로 입력해 주세요.");
    }

    for (const countedDate of calculation.countedDates) {
      if (seen.has(countedDate)) {
        throw new Error("같은 날짜에는 하나의 사용계획만 입력할 수 있습니다.");
      }
      seen.add(countedDate);
    }

    total += amount;
    normalizedItems.push({
      plannedDate: plannedStartDate,
      plannedStartDate,
      plannedEndDate,
      usageType,
      calculatedAmount: amount,
      amount,
      halfDayPeriod: usageTypeToHalfDayPeriod(usageType),
      memo: item.memo ?? null,
      countedDates: calculation.countedDates,
      excludedDates: calculation.excludedDates,
    });
  }

  const roundedTotal = roundLeaveAmount(total);

  if (roundedTotal > maxAmount) {
    throw new Error("사용계획 총 수량이 소멸 예정 연차보다 클 수 없습니다.");
  }

  return { totalPlannedAmount: roundedTotal, items: normalizedItems };
}

export async function scheduleUsePlanReminderNotices({
  usePlanId,
  prisma = getPrisma(),
}: {
  usePlanId: string;
  prisma?: PromotionDb;
}) {
  const policy = await getActiveAnnualLeavePolicy(prisma);

  if (!policy.memberReminderEnabled) {
    return 0;
  }

  const plan = await prisma.annualLeaveUsePlan.findUnique({
    where: { id: usePlanId },
    include: { items: true },
  });

  if (!plan || plan.status !== "SUBMITTED") {
    return 0;
  }

  let created = 0;

  for (const item of plan.items) {
    const plannedDate = dateToDateOnly(item.plannedStartDate ?? item.plannedDate);
    const scheduledDate = calculateUsePlanReminderDate({
      plannedDate,
      daysBefore: policy.usePlanReminderDaysBefore,
    });
    const existing = await prisma.annualLeavePromotionNotice.findUnique({
      where: {
        userId_referenceYear_noticeType_scheduledDate: {
          userId: plan.userId,
          referenceYear: plan.referenceYear,
          noticeType: "USE_PLAN_REMINDER",
          scheduledDate: dateOnlyToDate(scheduledDate),
        },
      },
    });

    if (existing) {
      continue;
    }

    await prisma.annualLeavePromotionNotice.create({
      data: {
        userId: plan.userId,
        referenceYear: plan.referenceYear,
        noticeType: "USE_PLAN_REMINDER",
        scheduledDate: dateOnlyToDate(scheduledDate),
        annualLeaveUsePlanId: plan.id,
        remainingAmount: item.calculatedAmount ?? item.amount,
        unit: item.unit,
        policyVersion: ANNUAL_LEAVE_PROMOTION_POLICY_VERSION,
        legalBasis: ANNUAL_LEAVE_PROMOTION_LEGAL_BASIS,
        availableFrom: dateOnlyToDate(plannedDate),
        availableUntil: dateOnlyToDate(plannedDate),
        submissionDeadline: dateOnlyToDate(plannedDate),
        isRenotice: false,
        noticeContent: buildAnnualUsePlanNoticeContent({
          id: "__scheduled_reminder__",
          userId: plan.userId,
          referenceYear: plan.referenceYear,
          noticeType: "USE_PLAN_REMINDER",
          scheduledDate: dateOnlyToDate(scheduledDate),
          expirationDate: null,
          remainingAmount: item.calculatedAmount ?? item.amount,
          unit: item.unit,
          availableFrom: dateOnlyToDate(plannedDate),
          availableUntil: dateOnlyToDate(plannedDate),
          submissionDeadline: dateOnlyToDate(plannedDate),
          policyVersion: ANNUAL_LEAVE_PROMOTION_POLICY_VERSION,
          legalBasis: ANNUAL_LEAVE_PROMOTION_LEGAL_BASIS,
          isRenotice: false,
        }),
      },
    });
    created += 1;
  }

  return created;
}

export async function expireAnnualLeaves({
  date = todayInSeoul(),
  dryRun = false,
  prisma = getPrisma(),
}: {
  date?: DateOnly;
  dryRun?: boolean;
  prisma?: PromotionDb;
} = {}) {
  const policy = await getActiveAnnualLeavePolicy(prisma);
  const year = Number(date.slice(0, 4));
  const fiscalRange = calculateFiscalYearDateRange(policy, year);
  const expirationDate = calculateAnnualLeaveExpirationDate({
    fiscalYearEnd: fiscalRange.end,
    policy,
  });

  if (!expirationDate || compareDateOnly(expirationDate, date) > 0) {
    return { checked: 0, expired: 0, skipped: 0, expirationDate, targets: [] };
  }

  const candidates = await findAnnualPromotionCandidates({ year, prisma });
  const targets = candidates.filter(
    (candidate, index, all) =>
      candidate.remainingAmount > 0 &&
      all.findIndex((item) => item.userId === candidate.userId) === index,
  );

  if (dryRun) {
    return {
      checked: candidates.length,
      expired: targets.length,
      skipped: 0,
      expirationDate,
      targets,
    };
  }

  let expired = 0;
  let skipped = 0;

  for (const target of targets) {
    const idempotencyKey = `expire:${target.userId}:annual:${target.referenceYear}:${target.expirationDate}`;
    const existing = await prisma.leaveLedger.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    const ledger = await createLeaveLedgerEntry({
      tx: prisma,
      userId: target.userId,
      eventType: "EXPIRED",
      amount: target.remainingAmount,
      unit: "DAY",
      effectiveDate: dateOnlyToDate(date),
      referenceYear: target.referenceYear,
      referenceDate: dateOnlyToDate(target.expirationDate),
      source: "ANNUAL_AUTO",
      idempotencyKey,
      reason: "Annual leave expired",
      metadata: {
        referenceYear: target.referenceYear,
        expirationDate: target.expirationDate,
        remainingBeforeExpiration: target.remainingAmount,
        expiredAmount: target.remainingAmount,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "ANNUAL_LEAVE_EXPIRED",
        targetType: "LEAVE_LEDGER",
        targetId: ledger?.id ?? null,
        targetUserId: target.userId,
        metadata: {
          userId: target.userId,
          referenceYear: target.referenceYear,
          expirationDate: target.expirationDate,
          expiredAmount: target.remainingAmount,
        },
      },
    });
    expired += 1;
  }

  await prisma.annualLeaveExpirationRun.create({
    data: {
      processedDate: dateOnlyToDate(date),
      status: "SUCCESS",
      checkedCount: candidates.length,
      expiredCount: expired,
      skippedCount: skipped,
    },
  });

  return { checked: candidates.length, expired, skipped, expirationDate, targets };
}
