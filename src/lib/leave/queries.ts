import type { PrismaClient } from "@/generated/prisma/client";
import {
  calculateLeaveBalanceForUser,
  isBirthdayHalfDayBalanceRequest,
  toNumber,
} from "@/lib/leave/balance";
import {
  dateToDateOnly,
  todayInSeoul,
} from "@/lib/leave/calculate-business-days";
import type {
  DateOnly,
  LeavePolicy,
  LeaveRequestForBalance,
  LeaveType,
} from "@/lib/leave/types";
import { LEAVE_TYPES } from "@/lib/leave/types";
import { calculateLeaveLedgerBalance } from "@/lib/leave/ledger";
import { getPrisma } from "@/lib/db/prisma";

export const DEFAULT_LEAVE_POLICIES = [
  {
    type: "ANNUAL" as const,
    name: "연차",
    description: "일반 연차",
    deductsAnnual: true,
    deductsAnnualBalance: true,
    requiresAttachment: false,
    isEnabled: true,
    approvalRequired: true,
  },
  {
    type: "HALF_DAY" as const,
    name: "반차",
    description: "오전/오후 반차",
    deductsAnnual: true,
    deductsAnnualBalance: true,
    requiresAttachment: false,
    isEnabled: true,
    approvalRequired: true,
    maxDaysPerRequest: 0.5,
    minRequestDays: 0.5,
    maxRequestDays: 0.5,
  },
  {
    type: "RESERVE_FORCES" as const,
    name: "예비군",
    description: "예비군 휴가",
    deductsAnnual: false,
    deductsAnnualBalance: false,
    requiresAttachment: true,
    isEnabled: true,
    approvalRequired: true,
  },
  {
    type: "SICK" as const,
    name: "병가",
    description: "병가",
    deductsAnnual: false,
    deductsAnnualBalance: false,
    requiresAttachment: true,
    isEnabled: true,
    approvalRequired: true,
  },
  {
    type: "BEREAVEMENT" as const,
    name: "경조사",
    description: "경조사 휴가",
    deductsAnnual: false,
    deductsAnnualBalance: false,
    requiresAttachment: true,
    isEnabled: true,
    approvalRequired: true,
  },
];

export async function ensureDefaultLeavePolicies(prisma = getPrisma()) {
  for (const policy of DEFAULT_LEAVE_POLICIES) {
    const existing = await prisma.leavePolicy.findUnique({
      where: { type: policy.type },
    });

    if (!existing) {
      await prisma.leavePolicy.create({ data: policy });
    }
  }
}

type DbLeavePolicy = Awaited<
  ReturnType<PrismaClient["leavePolicy"]["findFirstOrThrow"]>
>;

export function normalizeLeavePolicy(policy: DbLeavePolicy): LeavePolicy {
  return {
    id: policy.id,
    type: policy.type,
    name: policy.name,
    description: policy.description,
    isEnabled: policy.isEnabled,
    deductsAnnual: policy.deductsAnnual,
    deductsAnnualBalance: policy.deductsAnnualBalance,
    minRequestDays: policy.minRequestDays ? toNumber(policy.minRequestDays) : null,
    maxRequestDays: policy.maxRequestDays ? toNumber(policy.maxRequestDays) : null,
    maxDaysPerRequest: policy.maxDaysPerRequest
      ? toNumber(policy.maxDaysPerRequest)
      : null,
    maxDaysPerYear: policy.maxDaysPerYear ? toNumber(policy.maxDaysPerYear) : null,
    requestWindowStartOffsetDays: policy.requestWindowStartOffsetDays,
    requestWindowEndOffsetDays: policy.requestWindowEndOffsetDays,
    requiresAttachment: policy.requiresAttachment,
    approvalRequired: policy.approvalRequired,
  };
}

export async function listLeavePolicies(prisma = getPrisma()) {
  await ensureDefaultLeavePolicies(prisma);

  const policies = await prisma.leavePolicy.findMany({
    orderBy: { type: "asc" },
  });

  return policies.map(normalizeLeavePolicy);
}

export async function getLeavePolicyMap(prisma = getPrisma()) {
  const policies = await listLeavePolicies(prisma);

  return Object.fromEntries(
    LEAVE_TYPES.map((type) => [
      type,
      policies.find((policy) => policy.type === type) ??
        normalizeLeavePolicy({
          ...DEFAULT_LEAVE_POLICIES.find((policy) => policy.type === type)!,
          id: type,
          maxDaysPerRequest: null,
          minRequestDays: null,
          maxRequestDays: null,
          maxDaysPerYear: null,
          requestWindowStartOffsetDays: null,
          requestWindowEndOffsetDays: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as DbLeavePolicy),
    ]),
  ) as Record<LeaveType, LeavePolicy>;
}

export async function listEnabledCompanyHolidayDateOnlys(
  startDate?: DateOnly,
  endDate?: DateOnly,
  prisma = getPrisma(),
) {
  const holidays = await prisma.companyHoliday.findMany({
    where: {
      isEnabled: true,
      ...(startDate || endDate
        ? {
            date: {
              ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000Z`) } : {}),
              ...(endDate ? { lte: new Date(`${endDate}T00:00:00.000Z`) } : {}),
            },
          }
        : {}),
    },
    orderBy: { date: "asc" },
  });

  return holidays.map((holiday) => dateToDateOnly(holiday.date));
}

export async function getUserLeaveBalance({
  userId,
  year,
  asOfDate = todayInSeoul(),
  prisma = getPrisma(),
}: {
  userId: string;
  year: number;
  asOfDate?: DateOnly;
  prisma?: PrismaClient;
}) {
  const [user, policies, adjustments, leaveRequests] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        team: true,
      },
    }),
    getLeavePolicyMap(prisma),
    prisma.leaveAdjustment.findMany({
      where: { userId, fiscalYear: year },
    }),
    prisma.leaveRequest.findMany({
      where: {
        userId,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: {
          gte: new Date(`${year}-01-01T00:00:00.000Z`),
          lte: new Date(`${year}-12-31T00:00:00.000Z`),
        },
      },
      include: {
        customLeaveType: {
          select: {
            code: true,
            category: true,
            deductsAnnualBalance: true,
          },
        },
        grantUsages: {
          include: {
            leaveGrant: {
              include: {
                leaveType: {
                  select: {
                    code: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  if (!user) {
    throw new Error("User not found.");
  }

  const hireDate = user.hireDate ?? user.profile?.hireDate ?? null;
  const includeUnderOneYearFiscalProratedLeave =
    user.status === "ACTIVE" && user.role !== "EXTERNAL_PARTNER";
  const balance = calculateLeaveBalanceForUser({
    hireDate: hireDate ? dateToDateOnly(hireDate) : null,
    asOfDate,
    fiscalYear: year,
    includeUnderOneYearFiscalProratedLeave,
    adjustments: adjustments.map((adjustment) => ({
      days: toNumber(adjustment.days),
    })),
    leaveRequests: leaveRequests.map((request) => ({
      type: request.type,
      status: request.status,
      dayCount: toNumber(request.dayCount),
      requestKind: request.requestKind,
      customLeaveType: request.customLeaveType,
      grantUsages: request.grantUsages,
    })) satisfies LeaveRequestForBalance[],
    policies,
  });
  const annualLedgerEntries = await prisma.leaveLedger.findMany({
    where: {
      userId,
      referenceYear: year,
      OR: [
        { source: { in: ["ANNUAL_AUTO", "MANUAL_ADJUSTMENT"] } },
        {
          source: {
            in: [
              "LEAVE_REQUEST",
              "LEAVE_APPROVAL",
              "LEAVE_AUTO_CONFIRM",
              "LEAVE_REJECTION",
              "LEAVE_WITHDRAWAL",
              "LEAVE_CANCELLATION",
            ],
          },
          OR: [
            { metadata: { path: ["leaveType"], equals: "ANNUAL" } },
            { metadata: { path: ["leaveType"], equals: "HALF_DAY" } },
          ],
        },
      ],
    },
    include: {
      leaveRequest: {
        include: {
          customLeaveType: {
            select: {
              code: true,
              category: true,
              deductsAnnualBalance: true,
            },
          },
          grantUsages: {
            include: {
              leaveGrant: {
                include: {
                  leaveType: {
                    select: {
                      code: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
      leaveGrant: {
        include: {
          leaveType: {
            select: {
              code: true,
            },
          },
        },
      },
    },
  });
  const annualLedgerEntriesForBalance = annualLedgerEntries.filter((entry) => {
    if (
      entry.leaveRequest &&
      isBirthdayHalfDayBalanceRequest({
        requestKind: entry.leaveRequest.requestKind,
        customLeaveType: entry.leaveRequest.customLeaveType,
        grantUsages: entry.leaveRequest.grantUsages,
      })
    ) {
      return false;
    }

    if (
      entry.leaveGrant?.source === "BIRTHDAY_AUTO" ||
      entry.leaveGrant?.leaveType.code === "BIRTHDAY_HALF_DAY"
    ) {
      return false;
    }

    return true;
  });
  const hasAnnualLedgerGrant = annualLedgerEntries.some(
    (entry) => entry.source === "ANNUAL_AUTO",
  );
  const ledgerBalance = hasAnnualLedgerGrant
    ? calculateLeaveLedgerBalance(
        annualLedgerEntriesForBalance.map((entry) => ({
          eventType: entry.eventType,
          amount: entry.amount,
          metadata: entry.metadata,
        })),
      )
    : null;

  return {
    user,
    year,
    ...(ledgerBalance
      ? {
          annualEntitled: ledgerBalance.grantedAmount,
          monthlyAccruedDays: 0,
          underOneYearProratedAnnualDays: 0,
          manualGranted: ledgerBalance.adjustedAmount,
          grantedDays: ledgerBalance.grantedAmount + ledgerBalance.adjustedAmount,
          usedDays: ledgerBalance.usedAmount,
          pendingDays: ledgerBalance.pendingAmount,
          remainingDays: ledgerBalance.remainingAmount,
        }
      : balance),
  };
}
