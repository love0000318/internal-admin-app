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
import {
  BIRTHDAY_HALF_DAY_CODE,
  resolveBirthdayHalfDayUsableRangeFromGrantMetadata,
} from "@/lib/leave/birthday-half-day";
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

type RequestableLeaveGrantCandidate = Pick<
  LeaveGrant,
  | "source"
  | "status"
  | "remainingAmount"
  | "effectiveFrom"
  | "expiresAt"
  | "metadata"
> & {
  leaveType: Pick<LeaveTypeDefinition, "category" | "code" | "isEnabled">;
};

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

export function resolveLeaveGrantUsableRange(
  grant: Pick<LeaveGrant, "source" | "effectiveFrom" | "expiresAt" | "metadata"> & {
    leaveType: Pick<LeaveTypeDefinition, "code">;
  },
) {
  const birthdayRange = isBirthdayHalfDayGrant(grant)
    ? resolveBirthdayHalfDayUsableRangeFromGrantMetadata(grant.metadata)
    : null;

  return (
    birthdayRange ?? {
      usableFrom: asDateOnly(grant.effectiveFrom),
      usableUntil: grant.expiresAt ? asDateOnly(grant.expiresAt) : null,
    }
  );
}

export function isBirthdayHalfDayGrant(
  grant: Pick<LeaveGrant, "source"> & {
    leaveType: Pick<LeaveTypeDefinition, "code">;
  },
) {
  return (
    grant.source === "BIRTHDAY_AUTO" ||
    grant.leaveType.code === BIRTHDAY_HALF_DAY_CODE
  );
}

export function isRequestableLeaveGrantType(
  grant: Pick<LeaveGrant, "source"> & {
    leaveType: Pick<LeaveTypeDefinition, "category" | "code" | "isEnabled">;
  },
) {
  if (!grant.leaveType.isEnabled) {
    return false;
  }

  return grant.leaveType.category === "CUSTOM" || isBirthdayHalfDayGrant(grant);
}

export function isLeaveGrantUsableOnDate(
  grant: RequestableLeaveGrantCandidate,
  date: DateOnly,
) {
  const { usableFrom, usableUntil } = resolveLeaveGrantUsableRange(grant);

  return (
    grant.status === "ACTIVE" &&
    grant.remainingAmount > 0 &&
    compareDateOnly(usableFrom, date) <= 0 &&
    (!usableUntil || compareDateOnly(usableUntil, date) >= 0) &&
    isRequestableLeaveGrantType(grant)
  );
}

export function isLeaveGrantRequestCandidateVisible(
  grant: RequestableLeaveGrantCandidate,
  asOfDate: DateOnly,
) {
  const { usableUntil } = resolveLeaveGrantUsableRange(grant);

  return (
    grant.status === "ACTIVE" &&
    grant.remainingAmount > 0 &&
    (!usableUntil || compareDateOnly(usableUntil, asOfDate) >= 0) &&
    isRequestableLeaveGrantType(grant)
  );
}

export function filterRequestableLeaveGrantsForDate<
  TGrant extends RequestableLeaveGrantCandidate,
>(grants: TGrant[], date: DateOnly) {
  return grants.filter((grant) => isLeaveGrantUsableOnDate(grant, date));
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
  grant: Pick<LeaveGrant, "source" | "effectiveFrom" | "expiresAt" | "metadata"> & {
    leaveType: Pick<LeaveTypeDefinition, "code">;
  };
  startDate: DateOnly;
  endDate: DateOnly;
}) {
  const { usableFrom, usableUntil } = resolveLeaveGrantUsableRange(grant);

  if (compareDateOnly(startDate, usableFrom) < 0) {
    throw new CustomLeaveRequestError("outside-grant-range");
  }

  if (usableUntil && compareDateOnly(endDate, usableUntil) > 0) {
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
  attachmentPolicy,
}: {
  grant: LeaveGrantWithType | null;
  userId: string;
  usageUnit: CustomLeaveUsageUnit;
  amount: number;
  startDate: DateOnly;
  endDate: DateOnly;
  attachmentUrl?: string | null;
  attachmentPolicy?: AttachmentPolicy;
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

  if (!isRequestableLeaveGrantType(grant)) {
    throw new CustomLeaveRequestError("disabled-policy");
  }

  if (
    isBirthdayHalfDayGrant(grant) &&
    (usageUnit !== "HALF_DAY" || Math.abs(amount - 0.5) > Number.EPSILON)
  ) {
    throw new CustomLeaveRequestError("unit-not-allowed");
  }

  assertLeaveTypeUnitAllowed({ leaveType: grant.leaveType, usageUnit });
  assertLeaveGrantDateInUsableRange({ grant, startDate, endDate });
  assertLeaveGrantHasEnoughRemaining({ remainingAmount: grant.remainingAmount, amount });
  assertAttachmentPolicySatisfied({
    attachmentPolicy: attachmentPolicy ?? grant.leaveType.attachmentPolicy,
    attachmentUrl,
  });
}

export async function listRequestableLeaveGrants(
  userId: string,
  date: DateOnly | null = todayInSeoul(),
  prisma: PrismaClient = getPrisma(),
) {
  const asOfDate = date ?? todayInSeoul();
  const dateValue = date ? dateOnlyToDate(asOfDate) : null;

  const grants = await prisma.leaveGrant.findMany({
    where: {
      userId,
      status: "ACTIVE",
      remainingAmount: { gt: 0 },
      ...(dateValue
        ? { OR: [{ expiresAt: null }, { expiresAt: { gte: dateValue } }] }
        : {}),
      leaveType: {
        isEnabled: true,
      },
    },
    include: { leaveType: true },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
  });

  return date
    ? filterRequestableLeaveGrantsForDate(grants, date)
    : grants.filter((grant) => isRequestableLeaveGrantType(grant));
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
