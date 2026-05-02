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
import type { DateOnly } from "@/lib/leave/types";

type PromotionDb = PrismaClient | Prisma.TransactionClient;

export type AnnualPromotionCandidate = {
  userId: string;
  name: string;
  email: string;
  teamName: string | null;
  title: string | null;
  hireDate: Date | null;
  referenceYear: number;
  noticeType: "ANNUAL_USE_PLAN_REQUEST" | "MONTHLY_FIRST_NOTICE" | "MONTHLY_SECOND_NOTICE";
  scheduledDate: DateOnly;
  expirationDate: DateOnly;
  remainingAmount: number;
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

    const base = {
      userId: user.id,
      name: user.name,
      email: user.email,
      teamName: user.team?.name ?? null,
      title: user.title ?? user.profile?.jobTitle ?? null,
      hireDate,
      referenceYear: year,
      remainingAmount: balance.remainingAmount,
    };

    if (completedYears(hireDate, fiscalRange.end) >= 1) {
      candidates.push({
        ...base,
        noticeType: "ANNUAL_USE_PLAN_REQUEST",
        scheduledDate: calculateAnnualPromotionNoticeDate({
          expirationDate: annualExpiration,
          monthsBefore: policy.annualPromotionMonthsBeforeExpiration,
        }),
        expirationDate: annualExpiration,
      });
    } else {
      candidates.push({
        ...base,
        noticeType: "MONTHLY_FIRST_NOTICE",
        scheduledDate: calculateMonthlyFirstPromotionNoticeDate({
          expirationDate: monthlyExpiration,
          monthsBefore: policy.monthlyPromotionFirstMonthsBeforeExpiration,
        }),
        expirationDate: monthlyExpiration,
      });
      candidates.push({
        ...base,
        noticeType: "MONTHLY_SECOND_NOTICE",
        scheduledDate: calculateMonthlySecondPromotionNoticeDate({
          expirationDate: monthlyExpiration,
          monthsBefore: policy.monthlyPromotionSecondMonthsBeforeExpiration,
        }),
        expirationDate: monthlyExpiration,
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
    return { year, candidates, created, skipped };
  }

  for (const candidate of candidates) {
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
        }),
      },
    });
    created += 1;
  }

  return { year, candidates, created, skipped };
}

function notificationMessage(noticeType: string) {
  switch (noticeType) {
    case "MONTHLY_FIRST_NOTICE":
      return {
        title: "월차 사용계획을 확인해 주세요.",
        message: "소멸 예정 월차가 있습니다. 사용계획을 확인해 주세요.",
      };
    case "MONTHLY_SECOND_NOTICE":
      return {
        title: "월차 소멸 예정일이 가까워졌습니다.",
        message: "소멸 예정 월차가 있습니다. 사용 여부를 확인해 주세요.",
      };
    case "USE_PLAN_REMINDER":
      return {
        title: "예정된 연차 사용일이 다가옵니다.",
        message: "제출한 연차 사용계획일이 10일 앞으로 다가왔습니다.",
      };
    default:
      return {
        title: "연차 사용계획을 제출해 주세요.",
        message:
          "소멸 예정 연차가 있습니다. 남은 연차 사용계획을 확인하고 제출해 주세요.",
      };
  }
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

  for (const notice of dueNotices) {
    const content = notificationMessage(notice.noticeType);
    await prisma.notification.create({
      data: {
        userId: notice.userId,
        type:
          notice.noticeType === "USE_PLAN_REMINDER"
            ? "ANNUAL_LEAVE_USE_PLAN_REMINDER"
            : "ANNUAL_LEAVE_PROMOTION",
        title: content.title,
        message: content.message,
        linkUrl: "/leaves/me/use-plan",
        metadata: {
          annualLeavePromotionNoticeId: notice.id,
          noticeType: notice.noticeType,
          referenceYear: notice.referenceYear,
        },
      },
    });
    await prisma.annualLeavePromotionNotice.update({
      where: { id: notice.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: {
        action: "ANNUAL_LEAVE_PROMOTION_NOTICE_SENT",
        targetType: "ANNUAL_LEAVE_PROMOTION_NOTICE",
        targetId: notice.id,
        targetUserId: notice.userId,
        metadata: {
          userId: notice.userId,
          referenceYear: notice.referenceYear,
          noticeType: notice.noticeType,
          scheduledDate: dateToDateOnly(notice.scheduledDate),
        },
      },
    });
    sent += 1;
  }

  return { checked: dueNotices.length, sent };
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
    include: { items: { orderBy: { plannedDate: "asc" } } },
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
    const plannedDate = dateToDateOnly(item.plannedDate);
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
        remainingAmount: item.amount,
        unit: item.unit,
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
