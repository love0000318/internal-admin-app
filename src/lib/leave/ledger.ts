import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { toNumber } from "@/lib/leave/balance";
import { dateOnlyToDate, dateToDateOnly, todayInSeoul } from "@/lib/leave/calculate-business-days";
import { calculateAnnualEntitlement } from "@/lib/leave/calculate-entitlement";
import { getFiscalYearLeaveExpirationDateValue } from "@/lib/leave/fiscal-year-expiration";
import type { DateOnly } from "@/lib/leave/types";

export type LeaveLedgerEventType =
  | "GRANTED"
  | "PENDING"
  | "PENDING_RELEASED"
  | "USED"
  | "USED_RESTORED"
  | "EXPIRED"
  | "ADJUSTED"
  | "CANCELLED"
  | "REJECTED"
  | "WITHDRAWN"
  | "CARRIED_OVER"
  | "REVOKED";

export type LeaveLedgerSource =
  | "ANNUAL_AUTO"
  | "MANUAL_ADJUSTMENT"
  | "CUSTOM_GRANT"
  | "BIRTHDAY_AUTO"
  | "LEAVE_REQUEST"
  | "LEAVE_APPROVAL"
  | "LEAVE_AUTO_CONFIRM"
  | "LEAVE_REJECTION"
  | "LEAVE_WITHDRAWAL"
  | "LEAVE_CANCELLATION"
  | "IMPORT_MONTHLY_ANNUAL_USAGE"
  | "IMPORT_DETAILED_LEAVE_USAGE"
  | "IMPORT_RECONCILIATION_ADJUSTMENT"
  | "IMPORT_REVERSE_ADJUSTMENT"
  | "SYSTEM_MIGRATION";

export type LeaveLedgerUnit = "DAY" | "HOUR" | "MINUTE";

export type LeaveLedgerEntryForBalance = {
  eventType: LeaveLedgerEventType;
  amount: number;
  metadata?: unknown;
};

export type LeaveLedgerBalance = {
  grantedAmount: number;
  adjustedAmount: number;
  pendingAmount: number;
  usedAmount: number;
  expiredAmount: number;
  revokedAmount: number;
  remainingAmount: number;
};

type LedgerDb = PrismaClient | Prisma.TransactionClient;
const BIRTHDAY_HALF_DAY_LEDGER_CODE = "BIRTHDAY_HALF_DAY";

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readSignedAdjustment(entry: LeaveLedgerEntryForBalance) {
  if (entry.metadata && typeof entry.metadata === "object") {
    const metadata = entry.metadata as Record<string, unknown>;
    if (typeof metadata.signedAmount === "number") {
      return metadata.signedAmount;
    }
    if (metadata.adjustmentDirection === "DECREASE") {
      return -Math.abs(entry.amount);
    }
  }

  return entry.amount;
}

export function calculateLeaveLedgerBalance(
  entries: LeaveLedgerEntryForBalance[],
): LeaveLedgerBalance {
  const balance: LeaveLedgerBalance = {
    grantedAmount: 0,
    adjustedAmount: 0,
    pendingAmount: 0,
    usedAmount: 0,
    expiredAmount: 0,
    revokedAmount: 0,
    remainingAmount: 0,
  };

  for (const entry of entries) {
    const amount = Math.abs(entry.amount);

    switch (entry.eventType) {
      case "GRANTED":
      case "CARRIED_OVER":
        balance.grantedAmount += amount;
        balance.remainingAmount += amount;
        break;
      case "ADJUSTED": {
        const signedAmount = readSignedAdjustment(entry);
        balance.adjustedAmount += signedAmount;
        balance.remainingAmount += signedAmount;
        break;
      }
      case "PENDING":
        balance.pendingAmount += amount;
        balance.remainingAmount -= amount;
        break;
      case "PENDING_RELEASED":
      case "REJECTED":
      case "WITHDRAWN":
        balance.pendingAmount -= amount;
        balance.remainingAmount += amount;
        break;
      case "USED":
        balance.usedAmount += amount;
        balance.pendingAmount -= amount;
        break;
      case "USED_RESTORED":
      case "CANCELLED":
        balance.usedAmount -= amount;
        balance.remainingAmount += amount;
        break;
      case "EXPIRED":
        balance.expiredAmount += amount;
        balance.remainingAmount -= amount;
        break;
      case "REVOKED":
        balance.revokedAmount += amount;
        balance.remainingAmount -= amount;
        break;
      default:
        entry.eventType satisfies never;
    }
  }

  return {
    grantedAmount: roundLeaveAmount(balance.grantedAmount),
    adjustedAmount: roundLeaveAmount(balance.adjustedAmount),
    pendingAmount: roundLeaveAmount(balance.pendingAmount),
    usedAmount: roundLeaveAmount(balance.usedAmount),
    expiredAmount: roundLeaveAmount(balance.expiredAmount),
    revokedAmount: roundLeaveAmount(balance.revokedAmount),
    remainingAmount: roundLeaveAmount(balance.remainingAmount),
  };
}

export function roundLeaveAmount(value: number) {
  return Math.round(value * 1000) / 1000;
}

export async function createLeaveLedgerEntry({
  tx,
  userId,
  leaveTypeId = null,
  leaveGrantId = null,
  leaveRequestId = null,
  leaveAdjustmentId = null,
  eventType,
  amount,
  unit = "DAY",
  effectiveDate,
  expiresAt = null,
  referenceYear = null,
  referenceDate = null,
  source,
  idempotencyKey,
  reason = null,
  metadata = null,
  createdByUserId = null,
}: {
  tx: LedgerDb;
  userId: string;
  leaveTypeId?: string | null;
  leaveGrantId?: string | null;
  leaveRequestId?: string | null;
  leaveAdjustmentId?: string | null;
  eventType: LeaveLedgerEventType;
  amount: number;
  unit?: LeaveLedgerUnit;
  effectiveDate: Date;
  expiresAt?: Date | null;
  referenceYear?: number | null;
  referenceDate?: Date | null;
  source: LeaveLedgerSource;
  idempotencyKey?: string | null;
  reason?: string | null;
  metadata?: unknown;
  createdByUserId?: string | null;
}) {
  if (amount <= 0) {
    return null;
  }

  if (idempotencyKey) {
    const existing = await tx.leaveLedger.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      return existing;
    }
  }

  const ledger = await tx.leaveLedger.create({
    data: {
      userId,
      leaveTypeId,
      leaveGrantId,
      leaveRequestId,
      leaveAdjustmentId,
      eventType,
      amount: roundLeaveAmount(amount),
      unit,
      effectiveDate,
      expiresAt,
      referenceYear,
      referenceDate,
      source,
      idempotencyKey,
      reason,
      metadata: metadata ? toJsonValue(metadata) : Prisma.JsonNull,
      createdByUserId,
    },
  });

  await tx.auditLog.create({
    data: {
      actorId: createdByUserId,
      actorUserId: createdByUserId,
      targetUserId: userId,
      action: "LEAVE_LEDGER_CREATED",
      targetType: "LEAVE_LEDGER",
      targetId: ledger.id,
      metadata: toJsonValue({
        leaveLedgerId: ledger.id,
        userId,
        eventType,
        amount: roundLeaveAmount(amount),
        unit,
        source,
        referenceYear,
        relatedRequestId: leaveRequestId,
        relatedGrantId: leaveGrantId,
        relatedAdjustmentId: leaveAdjustmentId,
      }),
    },
  });

  return ledger;
}

export async function recordAnnualAutoLedger({
  tx,
  userId,
  hireDate,
  year,
}: {
  tx: LedgerDb;
  userId: string;
  hireDate: Date | null;
  year: number;
}) {
  const asOfDate = `${year}-12-31` as DateOnly;
  const amount = calculateAnnualEntitlement({
    hireDate: hireDate ? dateToDateOnly(hireDate) : null,
    asOfDate,
  });

  return createLeaveLedgerEntry({
    tx,
    userId,
    eventType: "GRANTED",
    amount,
    effectiveDate: dateOnlyToDate(`${year}-01-01` as DateOnly),
    expiresAt: getFiscalYearLeaveExpirationDateValue(year),
    referenceYear: year,
    source: "ANNUAL_AUTO",
    idempotencyKey: `annual:${userId}:${year}`,
    reason: "Annual entitlement",
    metadata: { year, hireDate: hireDate ? dateToDateOnly(hireDate) : null },
  });
}

export async function recordLeaveAdjustmentLedger({
  tx,
  adjustment,
  createdByUserId,
}: {
  tx: LedgerDb;
  adjustment: {
    id: string;
    userId: string;
    fiscalYear: number;
    days: unknown;
    amount?: unknown;
    reason: string;
    createdAt: Date;
  };
  createdByUserId?: string | null;
}) {
  const signedAmount = toNumber(adjustment.amount ?? adjustment.days);

  return createLeaveLedgerEntry({
    tx,
    userId: adjustment.userId,
    leaveAdjustmentId: adjustment.id,
    eventType: "ADJUSTED",
    amount: Math.abs(signedAmount),
    effectiveDate: dateOnlyToDate(`${adjustment.fiscalYear}-01-01` as DateOnly),
    expiresAt: getFiscalYearLeaveExpirationDateValue(adjustment.fiscalYear),
    referenceYear: adjustment.fiscalYear,
    source: "MANUAL_ADJUSTMENT",
    idempotencyKey: `adjustment:${adjustment.id}`,
    reason: adjustment.reason,
    metadata: {
      signedAmount,
      adjustmentDirection: signedAmount < 0 ? "DECREASE" : "INCREASE",
    },
    createdByUserId,
  });
}

export async function recordLeaveGrantCreatedLedger({
  tx,
  grant,
}: {
  tx: LedgerDb;
  grant: {
    id: string;
    userId: string;
    leaveTypeId: string;
    grantedAmount: number;
    unit: LeaveLedgerUnit;
    effectiveFrom: Date;
    expiresAt: Date | null;
    referenceYear: number | null;
    referenceDate: Date | null;
    source: string;
    reason: string;
    grantedByUserId: string;
  };
}) {
  return createLeaveLedgerEntry({
    tx,
    userId: grant.userId,
    leaveTypeId: grant.leaveTypeId,
    leaveGrantId: grant.id,
    eventType: "GRANTED",
    amount: grant.grantedAmount,
    unit: grant.unit,
    effectiveDate: grant.effectiveFrom,
    expiresAt: grant.expiresAt,
    referenceYear: grant.referenceYear,
    referenceDate: grant.referenceDate,
    source: grant.source === "BIRTHDAY_AUTO" ? "BIRTHDAY_AUTO" : "CUSTOM_GRANT",
    idempotencyKey: `grant:${grant.id}`,
    reason: grant.reason,
    metadata: { leaveGrantSource: grant.source },
    createdByUserId: grant.grantedByUserId,
  });
}

export async function recordLeaveGrantRevokedLedger({
  tx,
  grant,
  actorId,
}: {
  tx: LedgerDb;
  grant: {
    id: string;
    userId: string;
    leaveTypeId: string;
    remainingAmount: number;
    unit: LeaveLedgerUnit;
    revokedAt: Date | null;
    revokeReason: string | null;
  };
  actorId: string;
}) {
  return createLeaveLedgerEntry({
    tx,
    userId: grant.userId,
    leaveTypeId: grant.leaveTypeId,
    leaveGrantId: grant.id,
    eventType: "REVOKED",
    amount: grant.remainingAmount,
    unit: grant.unit,
    effectiveDate: grant.revokedAt ?? new Date(),
    source: "CUSTOM_GRANT",
    idempotencyKey: `revoke:${grant.id}`,
    reason: grant.revokeReason,
    createdByUserId: actorId,
  });
}

type GrantUsageForLedger = {
  leaveGrantId: string;
  amount: number;
  unit: string;
  leaveGrantSource?: string | null;
  leaveTypeCode?: string | null;
  leaveGrant?: {
    source?: string | null;
    leaveType?: {
      code?: string | null;
    } | null;
  } | null;
};

type LeaveRequestForLedger = {
  id: string;
  userId: string;
  leaveTypeId: string | null;
  dayCount: unknown;
  startDate: Date;
  endDate: Date;
  requestKind: string;
  type: string;
  customLeaveType?: {
    code?: string | null;
  } | null;
  grantUsages?: GrantUsageForLedger[];
};

function primaryGrantUsage(leaveRequest: { grantUsages?: GrantUsageForLedger[] }) {
  return leaveRequest.grantUsages?.[0] ?? null;
}

function leaveRequestAmount(leaveRequest: { dayCount: unknown }) {
  return toNumber(leaveRequest.dayCount);
}

function isBirthdayHalfDayLedgerRequest(
  leaveRequest: Pick<LeaveRequestForLedger, "customLeaveType" | "grantUsages">,
) {
  return (
    leaveRequest.customLeaveType?.code === BIRTHDAY_HALF_DAY_LEDGER_CODE ||
    leaveRequest.grantUsages?.some((usage) => {
      return (
        usage.leaveGrantSource === "BIRTHDAY_AUTO" ||
        usage.leaveTypeCode === BIRTHDAY_HALF_DAY_LEDGER_CODE ||
        usage.leaveGrant?.source === "BIRTHDAY_AUTO" ||
        usage.leaveGrant?.leaveType?.code === BIRTHDAY_HALF_DAY_LEDGER_CODE
      );
    }) === true
  );
}

function requestLedgerSource(
  leaveRequest: LeaveRequestForLedger,
  fallbackSource: LeaveLedgerSource,
) {
  if (isBirthdayHalfDayLedgerRequest(leaveRequest)) {
    return "BIRTHDAY_AUTO";
  }

  if (leaveRequest.requestKind === "CUSTOM_GRANT") {
    return "CUSTOM_GRANT";
  }

  return fallbackSource;
}

export async function recordLeaveRequestPendingLedger({
  tx,
  leaveRequest,
}: {
  tx: LedgerDb;
  leaveRequest: LeaveRequestForLedger;
}) {
  const usage = primaryGrantUsage(leaveRequest);

  return createLeaveLedgerEntry({
    tx,
    userId: leaveRequest.userId,
    leaveTypeId: leaveRequest.leaveTypeId,
    leaveGrantId: usage?.leaveGrantId ?? null,
    leaveRequestId: leaveRequest.id,
    eventType: "PENDING",
    amount: leaveRequestAmount(leaveRequest),
    unit: (usage?.unit as LeaveLedgerUnit | undefined) ?? "DAY",
    effectiveDate: leaveRequest.startDate,
    referenceYear: Number(dateToDateOnly(leaveRequest.startDate).slice(0, 4)),
    source: requestLedgerSource(leaveRequest, "LEAVE_REQUEST"),
    idempotencyKey: `request-pending:${leaveRequest.id}`,
    reason: "Leave request submitted",
    metadata: {
      requestKind: leaveRequest.requestKind,
      leaveType: leaveRequest.type,
      customLeaveTypeCode:
        leaveRequest.customLeaveType?.code ??
        usage?.leaveTypeCode ??
        usage?.leaveGrant?.leaveType?.code ??
        null,
      startDate: dateToDateOnly(leaveRequest.startDate),
      endDate: dateToDateOnly(leaveRequest.endDate),
    },
  });
}

export async function recordLeaveRequestWithdrawnLedger({
  tx,
  leaveRequest,
  actorId,
}: {
  tx: LedgerDb;
  leaveRequest: LeaveRequestForLedger;
  actorId: string;
}) {
  return createRequestTransitionLedger({
    tx,
    leaveRequest,
    actorId,
    eventType: "WITHDRAWN",
    source: "LEAVE_WITHDRAWAL",
    keyPrefix: "request-withdrawn",
    reason: "Leave request withdrawn",
  });
}

export async function recordLeaveRequestApprovedLedger({
  tx,
  leaveRequest,
  actorId,
}: {
  tx: LedgerDb;
  leaveRequest: LeaveRequestForLedger;
  actorId: string | null;
}) {
  return createRequestTransitionLedger({
    tx,
    leaveRequest,
    actorId,
    eventType: "USED",
    source: "LEAVE_APPROVAL",
    keyPrefix: "request-approved",
    reason: "Leave request approved",
  });
}

export async function recordLeaveRequestAutoConfirmedLedger({
  tx,
  leaveRequest,
}: {
  tx: LedgerDb;
  leaveRequest: LeaveRequestForLedger;
}) {
  const usage = primaryGrantUsage(leaveRequest);

  return createLeaveLedgerEntry({
    tx,
    userId: leaveRequest.userId,
    leaveTypeId: leaveRequest.leaveTypeId,
    leaveGrantId: usage?.leaveGrantId ?? null,
    leaveRequestId: leaveRequest.id,
    eventType: "USED",
    amount: leaveRequestAmount(leaveRequest),
    unit: (usage?.unit as LeaveLedgerUnit | undefined) ?? "DAY",
    effectiveDate: new Date(),
    referenceYear: Number(dateToDateOnly(leaveRequest.startDate).slice(0, 4)),
    source: requestLedgerSource(leaveRequest, "LEAVE_AUTO_CONFIRM"),
    idempotencyKey: `auto-confirm-used:${leaveRequest.id}`,
    reason: "Leave request auto-confirmed after start date",
    metadata: {
      approvalSource: "AUTO_START_DATE",
      requestKind: leaveRequest.requestKind,
      leaveType: leaveRequest.type,
      customLeaveTypeCode:
        leaveRequest.customLeaveType?.code ??
        usage?.leaveTypeCode ??
        usage?.leaveGrant?.leaveType?.code ??
        null,
      startDate: dateToDateOnly(leaveRequest.startDate),
      endDate: dateToDateOnly(leaveRequest.endDate),
    },
  });
}

export async function recordLeaveRequestRejectedLedger({
  tx,
  leaveRequest,
  actorId,
}: {
  tx: LedgerDb;
  leaveRequest: LeaveRequestForLedger;
  actorId: string;
}) {
  return createRequestTransitionLedger({
    tx,
    leaveRequest,
    actorId,
    eventType: "REJECTED",
    source: "LEAVE_REJECTION",
    keyPrefix: "request-rejected",
    reason: "Leave request rejected",
  });
}

export async function recordLeaveRequestCancelledLedger({
  tx,
  leaveRequest,
  actorId,
}: {
  tx: LedgerDb;
  leaveRequest: LeaveRequestForLedger;
  actorId: string;
}) {
  return createRequestTransitionLedger({
    tx,
    leaveRequest,
    actorId,
    eventType: "CANCELLED",
    source: "LEAVE_CANCELLATION",
    keyPrefix: "request-cancelled",
    reason: "Approved leave cancelled",
  });
}

async function createRequestTransitionLedger({
  tx,
  leaveRequest,
  actorId,
  eventType,
  source,
  keyPrefix,
  reason,
}: {
  tx: LedgerDb;
  leaveRequest: LeaveRequestForLedger;
  actorId: string | null;
  eventType: LeaveLedgerEventType;
  source: LeaveLedgerSource;
  keyPrefix: string;
  reason: string;
}) {
  const usage = primaryGrantUsage(leaveRequest);

  return createLeaveLedgerEntry({
    tx,
    userId: leaveRequest.userId,
    leaveTypeId: leaveRequest.leaveTypeId,
    leaveGrantId: usage?.leaveGrantId ?? null,
    leaveRequestId: leaveRequest.id,
    eventType,
    amount: leaveRequestAmount(leaveRequest),
    unit: (usage?.unit as LeaveLedgerUnit | undefined) ?? "DAY",
    effectiveDate: new Date(),
    referenceYear: Number(dateToDateOnly(leaveRequest.startDate).slice(0, 4)),
    source: requestLedgerSource(leaveRequest, source),
    idempotencyKey: `${keyPrefix}:${leaveRequest.id}`,
    reason,
    metadata: {
      requestKind: leaveRequest.requestKind,
      leaveType: leaveRequest.type,
      customLeaveTypeCode:
        leaveRequest.customLeaveType?.code ??
        usage?.leaveTypeCode ??
        usage?.leaveGrant?.leaveType?.code ??
        null,
      startDate: dateToDateOnly(leaveRequest.startDate),
      endDate: dateToDateOnly(leaveRequest.endDate),
    },
    createdByUserId: actorId,
  });
}

export async function getUserLedgerBalance({
  userId,
  year,
  prisma = getPrisma(),
}: {
  userId: string;
  year?: number;
  prisma?: LedgerDb;
}) {
  const entries = await prisma.leaveLedger.findMany({
    where: {
      userId,
      ...(year ? { referenceYear: year } : {}),
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

export async function listUserLeaveLedger({
  userId,
  take = 50,
  prisma = getPrisma(),
}: {
  userId: string;
  take?: number;
  prisma?: LedgerDb;
}) {
  return prisma.leaveLedger.findMany({
    where: { userId },
    include: {
      leaveType: true,
      leaveGrant: true,
      leaveRequest: true,
      leaveAdjustment: true,
      createdByUser: true,
    },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    take,
  });
}

export async function recordCurrentYearAnnualAutoLedgers(prisma = getPrisma()) {
  const year = Number(todayInSeoul().slice(0, 4));
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    include: {
      profile: true,
      employmentProfile: true,
    },
  });

  for (const user of users) {
    const hireDate =
      user.employmentProfile?.hireDate ??
      user.profile?.hireDate ??
      user.hireDate ??
      null;
    await recordAnnualAutoLedger({ tx: prisma, userId: user.id, hireDate, year });
  }
}
