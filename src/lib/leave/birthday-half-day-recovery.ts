import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { BIRTHDAY_HALF_DAY_CODE } from "@/lib/leave/birthday-half-day";
import { toNumber } from "@/lib/leave/balance";
import { dateToDateOnly } from "@/lib/leave/calculate-business-days";
import { roundLeaveAmount } from "@/lib/leave/ledger";
import type { DateOnly } from "@/lib/leave/types";

type RecoveryDb = PrismaClient;

const WRONG_ANNUAL_REQUEST_LEDGER_SOURCES = [
  "LEAVE_REQUEST",
  "LEAVE_APPROVAL",
  "LEAVE_AUTO_CONFIRM",
] as const;

type WrongAnnualLedgerSource = (typeof WRONG_ANNUAL_REQUEST_LEDGER_SOURCES)[number];
type RepairEventType = "PENDING_RELEASED" | "USED_RESTORED";

export type BirthdayAnnualDeductionRecoveryCandidate = {
  userId: string;
  leaveRequestId: string;
  leaveRequestStatus: string;
  fiscalYear: number;
  amount: number;
  repairEventType: RepairEventType;
  annualLedgerIds: string[];
  annualLedgerSources: WrongAnnualLedgerSource[];
  birthdayGrantIds: string[];
  leaveTypeCode: string | null;
  startDate: DateOnly;
  endDate: DateOnly;
  alreadyRecovered: boolean;
  leaveBalance: {
    id: string;
    usedDays: number;
    pendingDays: number;
    remainingDays: number;
    repairPossible: boolean;
  } | null;
};

export type BirthdayAnnualDeductionRecoveryResult = {
  checkedBirthdayRequests: number;
  candidates: BirthdayAnnualDeductionRecoveryCandidate[];
  applied: {
    annualLedgersReclassified: number;
    leaveBalancesUpdated: number;
    skippedAlreadyRecovered: number;
  };
};

function addDateOnlyDays(value: DateOnly, days: number): DateOnly {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10) as DateOnly;
}

function seoulDateOnlyStartInstant(value: DateOnly) {
  return new Date(`${value}T00:00:00.000+09:00`);
}

function createdAtWindowWhere({
  fromDate,
  toDate,
}: {
  fromDate?: DateOnly | null;
  toDate?: DateOnly | null;
}): Prisma.DateTimeFilter | undefined {
  if (!fromDate && !toDate) {
    return undefined;
  }

  return {
    ...(fromDate ? { gte: seoulDateOnlyStartInstant(fromDate) } : {}),
    ...(toDate ? { lt: seoulDateOnlyStartInstant(addDateOnlyDays(toDate, 1)) } : {}),
  };
}

function repairPossibleForBalance({
  eventType,
  amount,
  balance,
}: {
  eventType: RepairEventType;
  amount: number;
  balance: { usedDays: unknown; pendingDays: unknown };
}) {
  if (eventType === "USED_RESTORED") {
    return toNumber(balance.usedDays) + Number.EPSILON >= amount;
  }

  return toNumber(balance.pendingDays) + Number.EPSILON >= amount;
}

function balanceByUserYearKey(userId: string, fiscalYear: number) {
  return `${userId}:${fiscalYear}`;
}

export async function findBirthdayAnnualDeductionRecoveryCandidates({
  prisma,
  fromDate = null,
  toDate = null,
}: {
  prisma: RecoveryDb;
  fromDate?: DateOnly | null;
  toDate?: DateOnly | null;
}): Promise<Omit<BirthdayAnnualDeductionRecoveryResult, "applied">> {
  const createdAt = createdAtWindowWhere({ fromDate, toDate });
  const birthdayRequests = await prisma.leaveRequest.findMany({
    where: {
      requestKind: "CUSTOM_GRANT",
      ...(createdAt ? { createdAt } : {}),
      OR: [
        { customLeaveType: { code: BIRTHDAY_HALF_DAY_CODE } },
        {
          grantUsages: {
            some: {
              leaveGrant: {
                OR: [
                  { source: "BIRTHDAY_AUTO" },
                  { leaveType: { code: BIRTHDAY_HALF_DAY_CODE } },
                ],
              },
            },
          },
        },
      ],
    },
    include: {
      customLeaveType: {
        select: {
          code: true,
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
    orderBy: [{ createdAt: "asc" }],
  });
  const requestIds = birthdayRequests.map((request) => request.id);

  if (requestIds.length === 0) {
    return { checkedBirthdayRequests: 0, candidates: [] };
  }

  const wrongAnnualLedgers = await prisma.leaveLedger.findMany({
    where: {
      leaveRequestId: { in: requestIds },
      source: { in: [...WRONG_ANNUAL_REQUEST_LEDGER_SOURCES] },
      eventType: { in: ["PENDING", "USED"] },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const balances = await prisma.leaveBalance.findMany({
    where: {
      OR: birthdayRequests.map((request) => {
        const fiscalYear = Number(dateToDateOnly(request.startDate).slice(0, 4));

        return {
          userId: request.userId,
          fiscalYear,
        };
      }),
    },
  });
  const balancesByUserYear = new Map(
    balances.map((balance) => [
      balanceByUserYearKey(balance.userId, balance.fiscalYear),
      balance,
    ]),
  );
  const ledgersByRequestId = new Map<string, typeof wrongAnnualLedgers>();

  for (const ledger of wrongAnnualLedgers) {
    if (!ledger.leaveRequestId) {
      continue;
    }

    ledgersByRequestId.set(ledger.leaveRequestId, [
      ...(ledgersByRequestId.get(ledger.leaveRequestId) ?? []),
      ledger,
    ]);
  }

  const candidates: BirthdayAnnualDeductionRecoveryCandidate[] = [];

  for (const request of birthdayRequests) {
    const ledgers = ledgersByRequestId.get(request.id) ?? [];
    const usedLedgers = ledgers.filter((ledger) => ledger.eventType === "USED");
    const pendingLedgers = ledgers.filter((ledger) => ledger.eventType === "PENDING");
    const repairEventType: RepairEventType | null =
      request.status === "APPROVED" && usedLedgers.length > 0
        ? "USED_RESTORED"
        : request.status === "PENDING" && pendingLedgers.length > 0
          ? "PENDING_RELEASED"
          : null;

    if (!repairEventType) {
      continue;
    }

    const targetLedgers =
      repairEventType === "USED_RESTORED" ? usedLedgers : pendingLedgers;
    const amount = roundLeaveAmount(
      targetLedgers.reduce((sum, ledger) => sum + Math.abs(ledger.amount), 0),
    );

    if (amount <= 0) {
      continue;
    }

    const fiscalYear = Number(dateToDateOnly(request.startDate).slice(0, 4));
    const balance =
      balancesByUserYear.get(balanceByUserYearKey(request.userId, fiscalYear)) ?? null;

    candidates.push({
      userId: request.userId,
      leaveRequestId: request.id,
      leaveRequestStatus: request.status,
      fiscalYear,
      amount,
      repairEventType,
      annualLedgerIds: ledgers.map((ledger) => ledger.id),
      annualLedgerSources: [
        ...new Set(ledgers.map((ledger) => ledger.source as WrongAnnualLedgerSource)),
      ],
      birthdayGrantIds: [
        ...new Set(request.grantUsages.map((usage) => usage.leaveGrantId)),
      ],
      leaveTypeCode:
        request.customLeaveType?.code ??
        request.grantUsages.find((usage) => usage.leaveGrant.leaveType.code)
          ?.leaveGrant.leaveType.code ??
        null,
      startDate: dateToDateOnly(request.startDate),
      endDate: dateToDateOnly(request.endDate),
      alreadyRecovered: false,
      leaveBalance: balance
        ? {
            id: balance.id,
            usedDays: toNumber(balance.usedDays),
            pendingDays: toNumber(balance.pendingDays),
            remainingDays: toNumber(balance.remainingDays),
            repairPossible: repairPossibleForBalance({
              eventType: repairEventType,
              amount,
              balance,
            }),
          }
        : null,
    });
  }

  return {
    checkedBirthdayRequests: birthdayRequests.length,
    candidates,
  };
}

async function applyOneBirthdayAnnualDeductionRecovery({
  tx,
  candidate,
}: {
  tx: Prisma.TransactionClient;
  candidate: BirthdayAnnualDeductionRecoveryCandidate;
}) {
  const ledgerResult = await tx.leaveLedger.updateMany({
    where: {
      id: { in: candidate.annualLedgerIds },
      leaveRequestId: candidate.leaveRequestId,
      source: { in: [...WRONG_ANNUAL_REQUEST_LEDGER_SOURCES] },
      eventType: { in: ["PENDING", "USED"] },
    },
    data: {
      source: "BIRTHDAY_AUTO",
    },
  });

  if (ledgerResult.count === 0) {
    return {
      annualLedgersReclassified: 0,
      leaveBalanceUpdated: 0,
      skippedAlreadyRecovered: 1,
    };
  }

  const balanceUpdate =
    candidate.repairEventType === "USED_RESTORED"
      ? {
          usedDays: { decrement: candidate.amount },
          remainingDays: { increment: candidate.amount },
        }
      : {
          pendingDays: { decrement: candidate.amount },
          remainingDays: { increment: candidate.amount },
        };
  const balanceGuard =
    candidate.repairEventType === "USED_RESTORED"
      ? { usedDays: { gte: candidate.amount } }
      : { pendingDays: { gte: candidate.amount } };
  const leaveBalanceResult = await tx.leaveBalance.updateMany({
    where: {
      userId: candidate.userId,
      fiscalYear: candidate.fiscalYear,
      ...balanceGuard,
    },
    data: balanceUpdate,
  });

  return {
    annualLedgersReclassified: ledgerResult.count,
    leaveBalanceUpdated: leaveBalanceResult.count,
    skippedAlreadyRecovered: 0,
  };
}

export async function runBirthdayAnnualDeductionRecovery({
  prisma,
  dryRun = true,
  fromDate = null,
  toDate = null,
}: {
  prisma: RecoveryDb;
  dryRun?: boolean;
  fromDate?: DateOnly | null;
  toDate?: DateOnly | null;
}): Promise<BirthdayAnnualDeductionRecoveryResult> {
  const scan = await findBirthdayAnnualDeductionRecoveryCandidates({
    prisma,
    fromDate,
    toDate,
  });
  const result: BirthdayAnnualDeductionRecoveryResult = {
    ...scan,
    applied: {
      annualLedgersReclassified: 0,
      leaveBalancesUpdated: 0,
      skippedAlreadyRecovered: 0,
    },
  };

  if (dryRun) {
    return result;
  }

  for (const candidate of scan.candidates) {
    if (candidate.alreadyRecovered) {
      continue;
    }

    const applied = await prisma.$transaction((tx) =>
      applyOneBirthdayAnnualDeductionRecovery({ tx, candidate }),
    );

    result.applied.annualLedgersReclassified += applied.annualLedgersReclassified;
    result.applied.leaveBalancesUpdated += applied.leaveBalanceUpdated;
    result.applied.skippedAlreadyRecovered += applied.skippedAlreadyRecovered;
  }

  return result;
}
