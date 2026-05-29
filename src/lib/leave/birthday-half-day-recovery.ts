import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { BIRTHDAY_HALF_DAY_CODE } from "@/lib/leave/birthday-half-day";
import { toNumber } from "@/lib/leave/balance";
import { dateToDateOnly } from "@/lib/leave/calculate-business-days";
import { roundLeaveAmount } from "@/lib/leave/ledger";
import type { DateOnly } from "@/lib/leave/types";

type RecoveryDb = PrismaClient | Prisma.TransactionClient;

const WRONG_ANNUAL_REQUEST_LEDGER_SOURCES = [
  "LEAVE_REQUEST",
  "LEAVE_APPROVAL",
  "LEAVE_AUTO_CONFIRM",
] as const;

type WrongAnnualLedgerSource = (typeof WRONG_ANNUAL_REQUEST_LEDGER_SOURCES)[number];
type RepairEventType = "PENDING_RELEASED" | "USED_RESTORED";

export type BirthdayAnnualDeductionRecoveryBlockReason =
  | "NOT_BIRTHDAY_HALF_DAY_REQUEST"
  | "NO_BIRTHDAY_GRANT_USAGE"
  | "NO_WRONG_ANNUAL_LEDGER"
  | "NO_TARGET_LEDGER_FOR_STATUS"
  | "ZERO_REPAIR_AMOUNT"
  | "ALREADY_RECOVERED"
  | "LEAVE_BALANCE_NOT_FOUND"
  | "LEAVE_BALANCE_NOT_UNIQUE"
  | "USED_DAYS_BELOW_REPAIR_AMOUNT"
  | "PENDING_DAYS_BELOW_REPAIR_AMOUNT"
  | "UNSUPPORTED_LEAVE_REQUEST_STATUS";

type BirthdayRecoveryRequest = {
  id: string;
  userId: string;
  status: string;
  startDate: Date;
  endDate: Date;
  customLeaveType?: {
    code?: string | null;
  } | null;
  grantUsages: Array<{
    leaveGrantId: string;
    amount?: number;
    unit?: string;
    leaveGrant?: {
      source?: string | null;
      leaveType?: {
        code?: string | null;
      } | null;
    } | null;
  }>;
};

type BirthdayRecoveryLedger = {
  id: string;
  leaveRequestId: string | null;
  source: string;
  eventType: string;
  amount: number;
  createdAt?: Date;
};

type BirthdayRecoveryBalance = {
  id: string;
  userId: string;
  fiscalYear: number;
  usedDays: unknown;
  pendingDays: unknown;
  remainingDays: unknown | null;
};

export type BirthdayAnnualDeductionRecoveryCandidate = {
  userId: string;
  leaveRequestId: string;
  leaveRequestStatus: string;
  fiscalYear: number;
  amount: number;
  repairEventType: RepairEventType | null;
  annualLedgerIds: string[];
  targetAnnualLedgerIds: string[];
  annualLedgerSources: WrongAnnualLedgerSource[];
  birthdayGrantId: string | null;
  birthdayGrantIds: string[];
  leaveTypeCode: string | null;
  startDate: DateOnly;
  endDate: DateOnly;
  alreadyRecovered: boolean;
  repairPossible: boolean;
  repairBlockReasons: BirthdayAnnualDeductionRecoveryBlockReason[];
  leaveBalanceMatchCount: number;
  leaveBalance: {
    id: string;
    usedDays: number;
    pendingDays: number;
    remainingDays: number | null;
    expectedUsedDays: number;
    expectedPendingDays: number;
    expectedRemainingDays: number | null;
    repairPossible: boolean;
    repairBlockReasons: BirthdayAnnualDeductionRecoveryBlockReason[];
  } | null;
};

export type BirthdayAnnualDeductionRecoveryResult = {
  checkedBirthdayRequests: number;
  candidates: BirthdayAnnualDeductionRecoveryCandidate[];
  applied: {
    annualLedgersReclassified: number;
    leaveBalancesUpdated: number;
    skippedAlreadyRecovered: number;
    skippedNotRepairable: number;
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

function toNullableNumber(value: unknown | null) {
  return value === null || value === undefined ? null : toNumber(value);
}

function uniqueBlockReasons(
  reasons: BirthdayAnnualDeductionRecoveryBlockReason[],
) {
  return [...new Set(reasons)];
}

function balanceByUserYearKey(userId: string, fiscalYear: number) {
  return `${userId}:${fiscalYear}`;
}

function isWrongAnnualLedgerSource(source: string): source is WrongAnnualLedgerSource {
  return WRONG_ANNUAL_REQUEST_LEDGER_SOURCES.includes(source as WrongAnnualLedgerSource);
}

function isBirthdayGrantUsage(usage: BirthdayRecoveryRequest["grantUsages"][number]) {
  return (
    usage.leaveGrant?.source === "BIRTHDAY_AUTO" ||
    usage.leaveGrant?.leaveType?.code === BIRTHDAY_HALF_DAY_CODE
  );
}

function birthdayGrantIdsForRequest(request: BirthdayRecoveryRequest) {
  return [...new Set(request.grantUsages.filter(isBirthdayGrantUsage).map((usage) => usage.leaveGrantId))];
}

function isBirthdayHalfDayRequest(request: BirthdayRecoveryRequest) {
  return (
    request.customLeaveType?.code === BIRTHDAY_HALF_DAY_CODE ||
    birthdayGrantIdsForRequest(request).length > 0
  );
}

function leaveTypeCodeForRequest(request: BirthdayRecoveryRequest) {
  return (
    request.customLeaveType?.code ??
    request.grantUsages.find((usage) => usage.leaveGrant?.leaveType?.code)?.leaveGrant?.leaveType?.code ??
    null
  );
}

function targetLedgersForRepair({
  repairEventType,
  usedLedgers,
  pendingLedgers,
}: {
  repairEventType: RepairEventType | null;
  usedLedgers: BirthdayRecoveryLedger[];
  pendingLedgers: BirthdayRecoveryLedger[];
}) {
  if (repairEventType === "USED_RESTORED") {
    return usedLedgers;
  }

  if (repairEventType === "PENDING_RELEASED") {
    return pendingLedgers;
  }

  return [];
}

function resolveRepairEventType({
  request,
  usedLedgers,
  pendingLedgers,
}: {
  request: BirthdayRecoveryRequest;
  usedLedgers: BirthdayRecoveryLedger[];
  pendingLedgers: BirthdayRecoveryLedger[];
}): RepairEventType | null {
  if (request.status === "APPROVED" && usedLedgers.length > 0) {
    return "USED_RESTORED";
  }

  if (request.status === "PENDING" && pendingLedgers.length > 0) {
    return "PENDING_RELEASED";
  }

  return null;
}

function balanceRepairSnapshot({
  eventType,
  amount,
  balance,
}: {
  eventType: RepairEventType | null;
  amount: number;
  balance: BirthdayRecoveryBalance;
}) {
  const usedDays = toNumber(balance.usedDays);
  const pendingDays = toNumber(balance.pendingDays);
  const remainingDays = toNullableNumber(balance.remainingDays);
  const blockReasons: BirthdayAnnualDeductionRecoveryBlockReason[] = [];

  if (eventType === "USED_RESTORED" && usedDays + Number.EPSILON < amount) {
    blockReasons.push("USED_DAYS_BELOW_REPAIR_AMOUNT");
  }

  if (eventType === "PENDING_RELEASED" && pendingDays + Number.EPSILON < amount) {
    blockReasons.push("PENDING_DAYS_BELOW_REPAIR_AMOUNT");
  }

  const expectedUsedDays =
    eventType === "USED_RESTORED" ? roundLeaveAmount(usedDays - amount) : usedDays;
  const expectedPendingDays =
    eventType === "PENDING_RELEASED" ? roundLeaveAmount(pendingDays - amount) : pendingDays;
  const expectedRemainingDays =
    remainingDays === null ? null : roundLeaveAmount(remainingDays + amount);

  return {
    id: balance.id,
    usedDays,
    pendingDays,
    remainingDays,
    expectedUsedDays,
    expectedPendingDays,
    expectedRemainingDays,
    repairPossible: eventType !== null && amount > 0 && blockReasons.length === 0,
    repairBlockReasons: uniqueBlockReasons(blockReasons),
  };
}

function buildRecoveryCandidate({
  request,
  wrongAnnualLedgers,
  balanceMatches,
  alreadyRecovered,
}: {
  request: BirthdayRecoveryRequest;
  wrongAnnualLedgers: BirthdayRecoveryLedger[];
  balanceMatches: BirthdayRecoveryBalance[];
  alreadyRecovered: boolean;
}): BirthdayAnnualDeductionRecoveryCandidate {
  const usedLedgers = wrongAnnualLedgers.filter((ledger) => ledger.eventType === "USED");
  const pendingLedgers = wrongAnnualLedgers.filter((ledger) => ledger.eventType === "PENDING");
  const repairEventType = resolveRepairEventType({
    request,
    usedLedgers,
    pendingLedgers,
  });
  const targetAnnualLedgers = targetLedgersForRepair({
    repairEventType,
    usedLedgers,
    pendingLedgers,
  });
  const amount = roundLeaveAmount(
    targetAnnualLedgers.reduce((sum, ledger) => sum + Math.abs(ledger.amount), 0),
  );
  const fiscalYear = Number(dateToDateOnly(request.startDate).slice(0, 4));
  const birthdayGrantIds = birthdayGrantIdsForRequest(request);
  const blockReasons: BirthdayAnnualDeductionRecoveryBlockReason[] = [];

  if (!isBirthdayHalfDayRequest(request)) {
    blockReasons.push("NOT_BIRTHDAY_HALF_DAY_REQUEST");
  }

  if (birthdayGrantIds.length === 0) {
    blockReasons.push("NO_BIRTHDAY_GRANT_USAGE");
  }

  if (wrongAnnualLedgers.length === 0) {
    blockReasons.push("NO_WRONG_ANNUAL_LEDGER");
  }

  if (wrongAnnualLedgers.length > 0 && !repairEventType) {
    blockReasons.push(
      request.status === "APPROVED" || request.status === "PENDING"
        ? "NO_TARGET_LEDGER_FOR_STATUS"
        : "UNSUPPORTED_LEAVE_REQUEST_STATUS",
    );
  }

  if (repairEventType && amount <= 0) {
    blockReasons.push("ZERO_REPAIR_AMOUNT");
  }

  if (alreadyRecovered) {
    blockReasons.push("ALREADY_RECOVERED");
  }

  if (balanceMatches.length === 0) {
    blockReasons.push("LEAVE_BALANCE_NOT_FOUND");
  }

  if (balanceMatches.length > 1) {
    blockReasons.push("LEAVE_BALANCE_NOT_UNIQUE");
  }

  const leaveBalance =
    balanceMatches.length === 1
      ? balanceRepairSnapshot({
          eventType: repairEventType,
          amount,
          balance: balanceMatches[0],
        })
      : null;

  if (leaveBalance && !leaveBalance.repairPossible) {
    blockReasons.push(...leaveBalance.repairBlockReasons);
  }

  return {
    userId: request.userId,
    leaveRequestId: request.id,
    leaveRequestStatus: request.status,
    fiscalYear,
    amount,
    repairEventType,
    annualLedgerIds: wrongAnnualLedgers.map((ledger) => ledger.id),
    targetAnnualLedgerIds: targetAnnualLedgers.map((ledger) => ledger.id),
    annualLedgerSources: [
      ...new Set(
        wrongAnnualLedgers
          .map((ledger) => ledger.source)
          .filter(isWrongAnnualLedgerSource),
      ),
    ],
    birthdayGrantId: birthdayGrantIds[0] ?? null,
    birthdayGrantIds,
    leaveTypeCode: leaveTypeCodeForRequest(request),
    startDate: dateToDateOnly(request.startDate),
    endDate: dateToDateOnly(request.endDate),
    alreadyRecovered,
    repairPossible: blockReasons.length === 0,
    repairBlockReasons: uniqueBlockReasons(blockReasons),
    leaveBalanceMatchCount: balanceMatches.length,
    leaveBalance,
  };
}

async function findAlreadyRecoveredRequestIds({
  prisma,
  requestIds,
}: {
  prisma: RecoveryDb;
  requestIds: string[];
}) {
  if (requestIds.length === 0) {
    return new Set<string>();
  }

  const auditLog = (
    prisma as RecoveryDb & {
      auditLog?: {
        findMany: RecoveryDb["auditLog"]["findMany"];
      };
    }
  ).auditLog;

  if (!auditLog) {
    return new Set<string>();
  }

  const logs = await auditLog.findMany({
    where: {
      action: "LEAVE_LEDGER_REBUILT",
      targetType: "LEAVE_REQUEST",
      targetId: { in: requestIds },
      metadata: {
        path: ["recoveryType"],
        equals: "BIRTHDAY_ANNUAL_DEDUCTION",
      },
    },
    select: {
      targetId: true,
    },
  });

  return new Set(logs.map((log) => log.targetId).filter((targetId): targetId is string => Boolean(targetId)));
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function findBirthdayAnnualDeductionRecoveryCandidates({
  prisma,
  fromDate = null,
  toDate = null,
  leaveRequestId = null,
}: {
  prisma: RecoveryDb;
  fromDate?: DateOnly | null;
  toDate?: DateOnly | null;
  leaveRequestId?: string | null;
}): Promise<Omit<BirthdayAnnualDeductionRecoveryResult, "applied">> {
  const createdAt = createdAtWindowWhere({ fromDate, toDate });
  const includeNonRepairableTarget = Boolean(leaveRequestId);
  const birthdayRequests = (await prisma.leaveRequest.findMany({
    where: {
      requestKind: "CUSTOM_GRANT",
      ...(leaveRequestId ? { id: leaveRequestId } : {}),
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
  })) as BirthdayRecoveryRequest[];
  const requestIds = birthdayRequests.map((request) => request.id);

  if (requestIds.length === 0) {
    return { checkedBirthdayRequests: 0, candidates: [] };
  }

  const wrongAnnualLedgers = (await prisma.leaveLedger.findMany({
    where: {
      leaveRequestId: { in: requestIds },
      source: { in: [...WRONG_ANNUAL_REQUEST_LEDGER_SOURCES] },
      eventType: { in: ["PENDING", "USED"] },
    },
    orderBy: [{ createdAt: "asc" }],
  })) as BirthdayRecoveryLedger[];

  const balances = (await prisma.leaveBalance.findMany({
    where: {
      OR: birthdayRequests.map((request) => {
        const fiscalYear = Number(dateToDateOnly(request.startDate).slice(0, 4));

        return {
          userId: request.userId,
          fiscalYear,
        };
      }),
    },
  })) as BirthdayRecoveryBalance[];
  const alreadyRecoveredRequestIds = await findAlreadyRecoveredRequestIds({
    prisma,
    requestIds,
  });
  const balancesByUserYear = new Map<string, BirthdayRecoveryBalance[]>();

  for (const balance of balances) {
    const key = balanceByUserYearKey(balance.userId, balance.fiscalYear);
    balancesByUserYear.set(key, [...(balancesByUserYear.get(key) ?? []), balance]);
  }

  const ledgersByRequestId = new Map<string, BirthdayRecoveryLedger[]>();

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
    const fiscalYear = Number(dateToDateOnly(request.startDate).slice(0, 4));
    const ledgers = ledgersByRequestId.get(request.id) ?? [];
    const balanceMatches =
      balancesByUserYear.get(balanceByUserYearKey(request.userId, fiscalYear)) ?? [];
    const candidate = buildRecoveryCandidate({
      request,
      wrongAnnualLedgers: ledgers,
      balanceMatches,
      alreadyRecovered: alreadyRecoveredRequestIds.has(request.id),
    });

    if (
      !includeNonRepairableTarget &&
      (candidate.annualLedgerIds.length === 0 ||
        !candidate.repairEventType ||
        candidate.amount <= 0)
    ) {
      continue;
    }

    candidates.push(candidate);
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
  const request = (await tx.leaveRequest.findUnique({
    where: { id: candidate.leaveRequestId },
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
  })) as BirthdayRecoveryRequest | null;

  if (!request) {
    return {
      annualLedgersReclassified: 0,
      leaveBalanceUpdated: 0,
      skippedAlreadyRecovered: 0,
      skippedNotRepairable: 1,
    };
  }

  const [wrongAnnualLedgers, balances, alreadyRecoveredRequestIds] = await Promise.all([
    tx.leaveLedger.findMany({
      where: {
        leaveRequestId: request.id,
        source: { in: [...WRONG_ANNUAL_REQUEST_LEDGER_SOURCES] },
        eventType: { in: ["PENDING", "USED"] },
      },
      orderBy: [{ createdAt: "asc" }],
    }) as Promise<BirthdayRecoveryLedger[]>,
    tx.leaveBalance.findMany({
      where: {
        userId: request.userId,
        fiscalYear: Number(dateToDateOnly(request.startDate).slice(0, 4)),
      },
    }) as Promise<BirthdayRecoveryBalance[]>,
    findAlreadyRecoveredRequestIds({
      prisma: tx,
      requestIds: [request.id],
    }),
  ]);
  const freshCandidate = buildRecoveryCandidate({
    request,
    wrongAnnualLedgers,
    balanceMatches: balances,
    alreadyRecovered: alreadyRecoveredRequestIds.has(request.id),
  });

  if (freshCandidate.alreadyRecovered) {
    return {
      annualLedgersReclassified: 0,
      leaveBalanceUpdated: 0,
      skippedAlreadyRecovered: 1,
      skippedNotRepairable: 0,
    };
  }

  if (!freshCandidate.repairPossible || !freshCandidate.leaveBalance || !freshCandidate.repairEventType) {
    return {
      annualLedgersReclassified: 0,
      leaveBalanceUpdated: 0,
      skippedAlreadyRecovered: 0,
      skippedNotRepairable: 1,
    };
  }

  const ledgerResult = await tx.leaveLedger.updateMany({
    where: {
      id: { in: freshCandidate.annualLedgerIds },
      leaveRequestId: freshCandidate.leaveRequestId,
      source: { in: [...WRONG_ANNUAL_REQUEST_LEDGER_SOURCES] },
      eventType: { in: ["PENDING", "USED"] },
    },
    data: {
      source: "BIRTHDAY_AUTO",
    },
  });

  if (ledgerResult.count !== freshCandidate.annualLedgerIds.length) {
    throw new Error("BIRTHDAY_ANNUAL_RECOVERY_LEDGER_UPDATE_COUNT_MISMATCH");
  }

  const balanceUpdate: Prisma.LeaveBalanceUpdateManyMutationInput =
    freshCandidate.repairEventType === "USED_RESTORED"
      ? {
          usedDays: { decrement: freshCandidate.amount },
        }
      : {
          pendingDays: { decrement: freshCandidate.amount },
        };

  if (freshCandidate.leaveBalance.remainingDays !== null) {
    balanceUpdate.remainingDays = { increment: freshCandidate.amount };
  }

  const balanceGuard =
    freshCandidate.repairEventType === "USED_RESTORED"
      ? { usedDays: { gte: freshCandidate.amount } }
      : { pendingDays: { gte: freshCandidate.amount } };
  const leaveBalanceResult = await tx.leaveBalance.updateMany({
    where: {
      id: freshCandidate.leaveBalance.id,
      userId: freshCandidate.userId,
      fiscalYear: freshCandidate.fiscalYear,
      ...balanceGuard,
    },
    data: balanceUpdate,
  });

  if (leaveBalanceResult.count !== 1) {
    throw new Error("BIRTHDAY_ANNUAL_RECOVERY_BALANCE_UPDATE_COUNT_MISMATCH");
  }

  await tx.auditLog.create({
    data: {
      actorId: null,
      actorUserId: null,
      targetUserId: freshCandidate.userId,
      action: "LEAVE_LEDGER_REBUILT",
      category: "LEAVE",
      severity: "WARNING",
      targetType: "LEAVE_REQUEST",
      targetId: freshCandidate.leaveRequestId,
      metadata: toJsonValue({
        recoveryType: "BIRTHDAY_ANNUAL_DEDUCTION",
        leaveRequestId: freshCandidate.leaveRequestId,
        requesterId: freshCandidate.userId,
        fiscalYear: freshCandidate.fiscalYear,
        amount: freshCandidate.amount,
        repairEventType: freshCandidate.repairEventType,
        annualLedgerIds: freshCandidate.annualLedgerIds,
        targetAnnualLedgerIds: freshCandidate.targetAnnualLedgerIds,
        birthdayGrantIds: freshCandidate.birthdayGrantIds,
        leaveBalanceId: freshCandidate.leaveBalance.id,
        before: {
          usedDays: freshCandidate.leaveBalance.usedDays,
          pendingDays: freshCandidate.leaveBalance.pendingDays,
          remainingDays: freshCandidate.leaveBalance.remainingDays,
        },
        after: {
          usedDays: freshCandidate.leaveBalance.expectedUsedDays,
          pendingDays: freshCandidate.leaveBalance.expectedPendingDays,
          remainingDays: freshCandidate.leaveBalance.expectedRemainingDays,
        },
        reclassifiedSource: "BIRTHDAY_AUTO",
      }),
    },
  });

  return {
    annualLedgersReclassified: ledgerResult.count,
    leaveBalanceUpdated: leaveBalanceResult.count,
    skippedAlreadyRecovered: 0,
    skippedNotRepairable: 0,
  };
}

export async function runBirthdayAnnualDeductionRecovery({
  prisma,
  dryRun = true,
  fromDate = null,
  toDate = null,
  leaveRequestId = null,
}: {
  prisma: RecoveryDb;
  dryRun?: boolean;
  fromDate?: DateOnly | null;
  toDate?: DateOnly | null;
  leaveRequestId?: string | null;
}): Promise<BirthdayAnnualDeductionRecoveryResult> {
  const scan = await findBirthdayAnnualDeductionRecoveryCandidates({
    prisma,
    fromDate,
    toDate,
    leaveRequestId,
  });
  const result: BirthdayAnnualDeductionRecoveryResult = {
    ...scan,
    applied: {
      annualLedgersReclassified: 0,
      leaveBalancesUpdated: 0,
      skippedAlreadyRecovered: 0,
      skippedNotRepairable: 0,
    },
  };

  if (dryRun) {
    return result;
  }

  for (const candidate of scan.candidates) {
    if (candidate.alreadyRecovered) {
      result.applied.skippedAlreadyRecovered += 1;
      continue;
    }

    if (!candidate.repairPossible) {
      result.applied.skippedNotRepairable += 1;
      continue;
    }

    const applied = await prisma.$transaction((tx) =>
      applyOneBirthdayAnnualDeductionRecovery({ tx, candidate }),
    );

    result.applied.annualLedgersReclassified += applied.annualLedgersReclassified;
    result.applied.leaveBalancesUpdated += applied.leaveBalanceUpdated;
    result.applied.skippedAlreadyRecovered += applied.skippedAlreadyRecovered;
    result.applied.skippedNotRepairable += applied.skippedNotRepairable;
  }

  return result;
}
