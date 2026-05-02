import type {
  AttachmentPolicy,
  HalfDayPeriod,
  LeaveGrant,
  LeaveTypeDefinition,
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  calculateBusinessLeaveDays,
  compareDateOnly,
  dateOnlyToDate,
  dateToDateOnly,
  parseDateOnly,
  todayInSeoul,
} from "@/lib/leave/calculate-business-days";
import { deserializeAllowedUnits } from "@/lib/leave/leave-types";
import type { DateOnly } from "@/lib/leave/types";

export type CustomLeaveUsageUnit = "FULL_DAY" | "HALF_DAY";

export type LeaveGrantWithType = LeaveGrant & {
  leaveType: LeaveTypeDefinition;
};

export class CustomLeaveRequestError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function calendarDayCount(startDate: DateOnly, endDate: DateOnly) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (start.getTime() > end.getTime()) {
    throw new CustomLeaveRequestError("invalid-date");
  }

  return Math.floor((end.getTime() - start.getTime()) / ONE_DAY_MS) + 1;
}

function asDateOnly(value: Date | string) {
  return typeof value === "string" ? (value as DateOnly) : dateToDateOnly(value);
}

export function calculateCustomLeaveRequestAmount({
  usageUnit,
  startDate,
  endDate,
  halfDayPeriod,
  companyHolidays = [],
  includeHolidayInDeduction = false,
}: {
  usageUnit: CustomLeaveUsageUnit;
  startDate: DateOnly;
  endDate: DateOnly;
  halfDayPeriod?: HalfDayPeriod | null;
  companyHolidays?: DateOnly[];
  includeHolidayInDeduction?: boolean;
}) {
  if (usageUnit === "HALF_DAY") {
    if (startDate !== endDate) {
      throw new CustomLeaveRequestError("invalid-date");
    }

    if (halfDayPeriod !== "AM" && halfDayPeriod !== "PM") {
      throw new CustomLeaveRequestError("half-day-required");
    }

    return 0.5;
  }

  if (usageUnit === "FULL_DAY") {
    return includeHolidayInDeduction
      ? calendarDayCount(startDate, endDate)
      : calculateBusinessLeaveDays({
          type: "ANNUAL",
          startDate,
          endDate,
          halfDayPeriod: null,
          companyHolidays,
        });
  }

  throw new CustomLeaveRequestError("unsupported-unit");
}

export function assertLeaveGrantDateInUsableRange({
  grant,
  startDate,
  endDate,
}: {
  grant: Pick<LeaveGrant, "effectiveFrom" | "expiresAt">;
  startDate: DateOnly;
  endDate: DateOnly;
}) {
  const effectiveFrom = asDateOnly(grant.effectiveFrom);
  const expiresAt = grant.expiresAt ? asDateOnly(grant.expiresAt) : null;

  if (compareDateOnly(startDate, effectiveFrom) < 0) {
    throw new CustomLeaveRequestError("outside-grant-range");
  }

  if (expiresAt && compareDateOnly(endDate, expiresAt) > 0) {
    throw new CustomLeaveRequestError("outside-grant-range");
  }
}

export function assertLeaveTypeUnitAllowed({
  leaveType,
  usageUnit,
}: {
  leaveType: Pick<LeaveTypeDefinition, "allowedUnits">;
  usageUnit: CustomLeaveUsageUnit;
}) {
  const allowedUnits = deserializeAllowedUnits(leaveType.allowedUnits);

  if (!allowedUnits.includes(usageUnit)) {
    throw new CustomLeaveRequestError("unit-not-allowed");
  }
}

export function assertAttachmentPolicySatisfied({
  attachmentPolicy,
  attachmentUrl,
}: {
  attachmentPolicy: AttachmentPolicy;
  attachmentUrl?: string | null;
}) {
  if (attachmentPolicy === "REQUIRED_BEFORE_REQUEST" && !attachmentUrl) {
    throw new CustomLeaveRequestError("attachment-required");
  }
}

export function assertLeaveGrantHasEnoughRemaining({
  remainingAmount,
  amount,
}: {
  remainingAmount: number;
  amount: number;
}) {
  if (remainingAmount + Number.EPSILON < amount) {
    throw new CustomLeaveRequestError("grant-balance");
  }
}

export function assertCustomLeaveGrantRequestAllowed({
  grant,
  userId,
  usageUnit,
  amount,
  startDate,
  endDate,
  attachmentUrl,
}: {
  grant: LeaveGrantWithType | null;
  userId: string;
  usageUnit: CustomLeaveUsageUnit;
  amount: number;
  startDate: DateOnly;
  endDate: DateOnly;
  attachmentUrl?: string | null;
}) {
  if (!grant) {
    throw new CustomLeaveRequestError("grant-not-found");
  }

  if (grant.userId !== userId) {
    throw new CustomLeaveRequestError("forbidden");
  }

  if (grant.status !== "ACTIVE") {
    throw new CustomLeaveRequestError("grant-inactive");
  }

  if (grant.leaveType.category !== "CUSTOM" || !grant.leaveType.isEnabled) {
    throw new CustomLeaveRequestError("disabled-policy");
  }

  assertLeaveTypeUnitAllowed({ leaveType: grant.leaveType, usageUnit });
  assertLeaveGrantDateInUsableRange({ grant, startDate, endDate });
  assertLeaveGrantHasEnoughRemaining({ remainingAmount: grant.remainingAmount, amount });
  assertAttachmentPolicySatisfied({
    attachmentPolicy: grant.leaveType.attachmentPolicy,
    attachmentUrl,
  });
}

export async function listRequestableLeaveGrants(
  userId: string,
  date: DateOnly = todayInSeoul(),
  prisma: PrismaClient = getPrisma(),
) {
  const dateValue = dateOnlyToDate(date);

  return prisma.leaveGrant.findMany({
    where: {
      userId,
      status: "ACTIVE",
      remainingAmount: { gt: 0 },
      effectiveFrom: { lte: dateValue },
      OR: [{ expiresAt: null }, { expiresAt: { gte: dateValue } }],
      leaveType: {
        category: "CUSTOM",
        isEnabled: true,
      },
    },
    include: { leaveType: true },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
  });
}

export async function getRequestableLeaveGrantDetail(
  grantId: string,
  userId: string,
  prisma: PrismaClient = getPrisma(),
) {
  return prisma.leaveGrant.findFirst({
    where: {
      id: grantId,
      userId,
    },
    include: {
      leaveType: {
        include: {
          approvalPolicy: {
            include: { customApprover: true },
          },
        },
      },
    },
  });
}

export async function reserveLeaveGrantAmountForPendingRequest({
  tx,
  leaveGrantId,
  amount,
}: {
  tx: Prisma.TransactionClient;
  leaveGrantId: string;
  amount: number;
}) {
  const result = await tx.leaveGrant.updateMany({
    where: {
      id: leaveGrantId,
      status: "ACTIVE",
      remainingAmount: { gte: amount },
    },
    data: {
      pendingAmount: { increment: amount },
      remainingAmount: { decrement: amount },
    },
  });

  if (result.count !== 1) {
    throw new CustomLeaveRequestError("grant-balance");
  }
}

export async function releaseLeaveGrantPendingAmount({
  tx,
  leaveGrantId,
  amount,
}: {
  tx: Prisma.TransactionClient;
  leaveGrantId: string;
  amount: number;
}) {
  const result = await tx.leaveGrant.updateMany({
    where: {
      id: leaveGrantId,
      pendingAmount: { gte: amount },
    },
    data: {
      pendingAmount: { decrement: amount },
      remainingAmount: { increment: amount },
    },
  });

  if (result.count !== 1) {
    throw new CustomLeaveRequestError("grant-state");
  }
}

export async function convertLeaveGrantPendingToUsed({
  tx,
  leaveGrantId,
  amount,
}: {
  tx: Prisma.TransactionClient;
  leaveGrantId: string;
  amount: number;
}) {
  const result = await tx.leaveGrant.updateMany({
    where: {
      id: leaveGrantId,
      pendingAmount: { gte: amount },
    },
    data: {
      pendingAmount: { decrement: amount },
      usedAmount: { increment: amount },
    },
  });

  if (result.count !== 1) {
    throw new CustomLeaveRequestError("grant-state");
  }
}

export async function restoreLeaveGrantUsedAmount({
  tx,
  leaveGrantId,
  amount,
}: {
  tx: Prisma.TransactionClient;
  leaveGrantId: string;
  amount: number;
}) {
  const result = await tx.leaveGrant.updateMany({
    where: {
      id: leaveGrantId,
      usedAmount: { gte: amount },
    },
    data: {
      usedAmount: { decrement: amount },
      remainingAmount: { increment: amount },
    },
  });

  if (result.count !== 1) {
    throw new CustomLeaveRequestError("grant-state");
  }
}
