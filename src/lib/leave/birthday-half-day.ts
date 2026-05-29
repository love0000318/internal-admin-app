import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  compareDateOnly,
  dateOnlyToDate,
  dateToDateOnly,
  formatDateOnly,
  todayInSeoul,
} from "@/lib/leave/calculate-business-days";
import { recordLeaveGrantCreatedLedger } from "@/lib/leave/ledger";
import type { DateOnly } from "@/lib/leave/types";

export const BIRTHDAY_HALF_DAY_CODE = "BIRTHDAY_HALF_DAY";
export const BIRTHDAY_HALF_DAY_REASON = "생일 반차 자동 지급";
export const BIRTHDAY_HALF_DAY_DEFAULT_USABLE_DAYS = 7;

export type BirthdayGrantMode = "exact-date" | "due-through-date";

type BirthdayPolicy = {
  id: string;
  isEnabled: boolean;
  leaveTypeId: string;
  grantAmount: number;
  grantUnit: "DAY" | "HOUR" | "MINUTE";
  grantDaysBefore: number;
  usableDaysFromBirthday: number;
  adjustGrantDateToPreviousBusinessDay: boolean;
  notifyEmployee: boolean;
};

export type BirthdayGrantJobResult = {
  processedDate: DateOnly;
  dryRun: boolean;
  mode: BirthdayGrantMode;
  activeUserCount: number;
  dueCount: number;
  expiredCount: number;
  missingBirthDateCount: number;
  alreadyGrantedCount: number;
  grantedCount: number;
  skippedCount: number;
  disabled: boolean;
  grants: Array<{
    userId: string;
    leaveGrantId?: string;
    birthdayDate: DateOnly;
    nominalGrantDate: DateOnly;
    actualGrantDate: DateOnly;
    usableFrom: DateOnly;
    usableUntil: DateOnly;
  }>;
  expiredCandidates: Array<{
    userId: string;
    birthdayDate: DateOnly;
    nominalGrantDate: DateOnly;
    actualGrantDate: DateOnly;
    usableFrom: DateOnly;
    usableUntil: DateOnly;
  }>;
  skipped: Array<{
    userId: string;
    reason: string;
    birthdayDate?: DateOnly;
    actualGrantDate?: DateOnly;
    usableUntil?: DateOnly;
  }>;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function addDays(value: DateOnly, days: number): DateOnly {
  const date = dateOnlyToDate(value);
  date.setUTCDate(date.getUTCDate() + days);

  return formatDateOnly(date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isDateOnlyString(value: unknown): value is DateOnly {
  return typeof value === "string" && DATE_ONLY_PATTERN.test(value);
}

function dateOnlyDiffInDays(startDate: DateOnly, endDate: DateOnly) {
  return Math.round(
    (dateOnlyToDate(endDate).getTime() - dateOnlyToDate(startDate).getTime()) /
      ONE_DAY_MS,
  );
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function monthDay(value: DateOnly) {
  const [, month, day] = value.split("-").map(Number);

  return { month, day };
}

export function resolveBirthdayLeaveBirthDate(user: {
  birthDate?: Date | null;
  profile?: {
    birthDate?: Date | null;
    birthday?: Date | null;
  } | null;
  linkedPrejoinProfiles?: Array<{ birthDate?: Date | null }> | null;
}) {
  return (
    user.profile?.birthDate ??
    user.birthDate ??
    user.linkedPrejoinProfiles?.find((profile) => profile.birthDate)?.birthDate ??
    user.profile?.birthday ??
    null
  );
}

export function calculateBirthdayDateForYear(
  birthDate: Date | DateOnly,
  year: number,
): DateOnly {
  const source = typeof birthDate === "string" ? birthDate : dateToDateOnly(birthDate);
  const { month, day } = monthDay(source);
  const normalizedDay = month === 2 && day === 29 && !isLeapYear(year) ? 28 : day;

  return `${year}-${String(month).padStart(2, "0")}-${String(normalizedDay).padStart(
    2,
    "0",
  )}` as DateOnly;
}

export function calculateBirthdayHalfDayUsableRange(
  actualGrantDate: DateOnly,
  usableDaysFromGrantDate = BIRTHDAY_HALF_DAY_DEFAULT_USABLE_DAYS,
) {
  return {
    usableFrom: actualGrantDate,
    usableUntil: addDays(actualGrantDate, usableDaysFromGrantDate),
  };
}

export function resolveBirthdayHalfDayActualGrantDateFromMetadata(
  metadata: unknown,
): DateOnly | null {
  if (!isRecord(metadata)) {
    return null;
  }

  return isDateOnlyString(metadata.actualGrantDate)
    ? metadata.actualGrantDate
    : null;
}

export function resolveBirthdayHalfDayUsableDaysFromMetadata(
  metadata: unknown,
  fallbackDays = BIRTHDAY_HALF_DAY_DEFAULT_USABLE_DAYS,
) {
  if (!isRecord(metadata)) {
    return fallbackDays;
  }

  if (
    isDateOnlyString(metadata.usableFrom) &&
    isDateOnlyString(metadata.usableUntil)
  ) {
    const diff = dateOnlyDiffInDays(metadata.usableFrom, metadata.usableUntil);

    if (Number.isInteger(diff) && diff >= 0 && diff <= 366) {
      return diff;
    }
  }

  return fallbackDays;
}

export function resolveBirthdayHalfDayUsableRangeFromGrantMetadata(
  metadata: unknown,
  fallbackDays = BIRTHDAY_HALF_DAY_DEFAULT_USABLE_DAYS,
) {
  const actualGrantDate = resolveBirthdayHalfDayActualGrantDateFromMetadata(metadata);

  if (!actualGrantDate) {
    return null;
  }

  return calculateBirthdayHalfDayUsableRange(
    actualGrantDate,
    resolveBirthdayHalfDayUsableDaysFromMetadata(metadata, fallbackDays),
  );
}

export function calculateBirthdayHalfDayNominalGrantDate(
  birthdayDate: DateOnly,
  grantDaysBefore = 1,
) {
  return addDays(birthdayDate, -grantDaysBefore);
}

function isWeekend(value: DateOnly) {
  const day = dateOnlyToDate(value).getUTCDay();

  return day === 0 || day === 6;
}

export function calculatePreviousBusinessDay(
  value: DateOnly,
  companyHolidays: DateOnly[] = [],
) {
  const holidays = new Set(companyHolidays);
  let current = value;

  while (isWeekend(current) || holidays.has(current)) {
    current = addDays(current, -1);
  }

  return current;
}

export function calculateBirthdayHalfDayGrantDate({
  birthdayDate,
  grantDaysBefore = 1,
  companyHolidays = [],
  adjustGrantDateToPreviousBusinessDay = true,
}: {
  birthdayDate: DateOnly;
  grantDaysBefore?: number;
  companyHolidays?: DateOnly[];
  adjustGrantDateToPreviousBusinessDay?: boolean;
}) {
  const nominalGrantDate = calculateBirthdayHalfDayNominalGrantDate(
    birthdayDate,
    grantDaysBefore,
  );
  const actualGrantDate = adjustGrantDateToPreviousBusinessDay
    ? calculatePreviousBusinessDay(nominalGrantDate, companyHolidays)
    : nominalGrantDate;

  return { nominalGrantDate, actualGrantDate };
}

export function shouldGrantBirthdayHalfDayToday({
  birthDate,
  year,
  today,
  companyHolidays = [],
  grantDaysBefore = 1,
  adjustGrantDateToPreviousBusinessDay = true,
}: {
  birthDate: Date | DateOnly;
  year: number;
  today: DateOnly;
  companyHolidays?: DateOnly[];
  grantDaysBefore?: number;
  adjustGrantDateToPreviousBusinessDay?: boolean;
}) {
  const birthdayDate = calculateBirthdayDateForYear(birthDate, year);
  const { actualGrantDate } = calculateBirthdayHalfDayGrantDate({
    birthdayDate,
    grantDaysBefore,
    companyHolidays,
    adjustGrantDateToPreviousBusinessDay,
  });

  return actualGrantDate === today;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function getBirthdayPolicy(prisma: PrismaClient) {
  const policy = await prisma.birthdayLeavePolicy.findFirst({
    include: { leaveType: true },
    orderBy: { createdAt: "asc" },
  });

  if (policy) {
    return policy;
  }

  const leaveType = await prisma.leaveTypeDefinition.findUnique({
    where: { code: BIRTHDAY_HALF_DAY_CODE },
  });

  if (!leaveType) {
    return null;
  }

  return prisma.birthdayLeavePolicy.create({
    data: {
      leaveTypeId: leaveType.id,
      isEnabled: true,
      grantAmount: 0.5,
      grantUnit: "DAY",
      grantDaysBefore: 1,
      usableDaysFromBirthday: BIRTHDAY_HALF_DAY_DEFAULT_USABLE_DAYS,
      adjustGrantDateToPreviousBusinessDay: true,
      notifyEmployee: true,
    },
    include: { leaveType: true },
  });
}

async function createGrantNotification({
  prisma,
  userId,
  leaveGrantId,
  birthdayDate,
  usableFrom,
  usableUntil,
}: {
  prisma: PrismaClient;
  userId: string;
  leaveGrantId: string;
  birthdayDate: DateOnly;
  usableFrom: DateOnly;
  usableUntil: DateOnly;
}) {
  const notification = await prisma.notification.create({
    data: {
      userId,
      type: "LEAVE_GRANTED",
      title: "생일 반차가 지급되었습니다.",
      message: `생일을 맞아 사용할 수 있는 반차가 지급되었습니다. 사용 가능 기간: ${usableFrom} ~ ${usableUntil}`,
      linkUrl: "/leaves/me",
      metadata: toJsonValue({
        leaveGrantId,
        birthdayDate,
        usableFrom,
        usableUntil,
      }),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "BIRTHDAY_HALF_DAY_NOTIFICATION_CREATED",
      targetType: "LEAVE_GRANT",
      targetId: leaveGrantId,
      targetUserId: userId,
      metadata: toJsonValue({
        notificationId: notification.id,
        leaveGrantId,
        userId,
      }),
    },
  });
}

export async function grantBirthdayHalfDaysForDate({
  prisma = getPrisma(),
  processedDate = todayInSeoul(),
  dryRun = false,
  includePastDue = false,
}: {
  prisma?: PrismaClient;
  processedDate?: DateOnly;
  dryRun?: boolean;
  includePastDue?: boolean;
} = {}): Promise<BirthdayGrantJobResult> {
  const policy = await getBirthdayPolicy(prisma);
  const mode: BirthdayGrantMode = includePastDue ? "due-through-date" : "exact-date";
  const result: BirthdayGrantJobResult = {
    processedDate,
    dryRun,
    mode,
    activeUserCount: 0,
    dueCount: 0,
    expiredCount: 0,
    missingBirthDateCount: 0,
    alreadyGrantedCount: 0,
    grantedCount: 0,
    skippedCount: 0,
    disabled: !policy?.isEnabled,
    grants: [],
    expiredCandidates: [],
    skipped: [],
  };

  if (!policy?.isEnabled) {
    return result;
  }

  const [users, holidays, systemOwner] = await Promise.all([
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      include: {
        profile: true,
        linkedPrejoinProfiles: {
          select: { birthDate: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.companyHoliday.findMany({
      where: { isEnabled: true },
      select: { date: true },
    }),
    prisma.user.findFirst({
      where: { role: "OWNER", status: "ACTIVE" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const holidayDates = holidays.map((holiday) => dateToDateOnly(holiday.date));
  const processedYear = Number(processedDate.slice(0, 4));
  const candidateYears = [processedYear, processedYear + 1];
  result.activeUserCount = users.length;

  for (const user of users) {
    const birthDate = resolveBirthdayLeaveBirthDate(user);

    if (!birthDate) {
      result.missingBirthDateCount += 1;
      result.skippedCount += 1;
      result.skipped.push({ userId: user.id, reason: "NO_BIRTH_DATE" });
      continue;
    }

    for (const year of candidateYears) {
      const birthdayDate = calculateBirthdayDateForYear(birthDate, year);
      const { nominalGrantDate, actualGrantDate } =
        calculateBirthdayHalfDayGrantDate({
          birthdayDate,
          grantDaysBefore: policy.grantDaysBefore,
          companyHolidays: holidayDates,
          adjustGrantDateToPreviousBusinessDay:
            policy.adjustGrantDateToPreviousBusinessDay,
        });
      const { usableFrom, usableUntil } = calculateBirthdayHalfDayUsableRange(
        actualGrantDate,
        policy.usableDaysFromBirthday,
      );

      const grantIsDue = includePastDue
        ? compareDateOnly(actualGrantDate, processedDate) <= 0
        : actualGrantDate === processedDate;

      if (!grantIsDue) {
        continue;
      }

      const existing = await prisma.leaveGrant.findFirst({
        where: {
          userId: user.id,
          leaveTypeId: policy.leaveTypeId,
          referenceYear: year,
          source: "BIRTHDAY_AUTO",
        },
      });

      if (existing) {
        result.alreadyGrantedCount += 1;
        result.skippedCount += 1;
        result.skipped.push({
          userId: user.id,
          reason: "ALREADY_GRANTED",
          birthdayDate,
        });
        continue;
      }

      const grantWindowExpired = compareDateOnly(usableUntil, processedDate) < 0;

      if (grantWindowExpired) {
        result.expiredCount += 1;
        result.skippedCount += 1;
        result.expiredCandidates.push({
          userId: user.id,
          birthdayDate,
          nominalGrantDate,
          actualGrantDate,
          usableFrom,
          usableUntil,
        });
        result.skipped.push({
          userId: user.id,
          reason: "EXPIRED",
          birthdayDate,
          actualGrantDate,
          usableUntil,
        });
        continue;
      }

      result.dueCount += 1;

      if (dryRun) {
        result.grants.push({
          userId: user.id,
          birthdayDate,
          nominalGrantDate,
          actualGrantDate,
          usableFrom,
          usableUntil,
        });
        continue;
      }

      const grant = await prisma.leaveGrant.create({
        data: {
          userId: user.id,
          leaveTypeId: policy.leaveTypeId,
          grantedAmount: policy.grantAmount,
          usedAmount: 0,
          pendingAmount: 0,
          remainingAmount: policy.grantAmount,
          unit: policy.grantUnit,
          status: "ACTIVE",
          effectiveFrom: dateOnlyToDate(usableFrom),
          expiresAt: dateOnlyToDate(usableUntil),
          grantedByUserId: systemOwner?.id ?? user.id,
          reason: BIRTHDAY_HALF_DAY_REASON,
          source: "BIRTHDAY_AUTO",
          referenceYear: year,
          referenceDate: dateOnlyToDate(birthdayDate),
          metadata: toJsonValue({
            birthdayDate,
            nominalGrantDate,
            actualGrantDate,
            usableFrom,
            usableUntil,
            usableRangeBasis: "ACTUAL_GRANT_DATE",
          }),
        },
      });

      await recordLeaveGrantCreatedLedger({ tx: prisma, grant });

      await prisma.auditLog.create({
        data: {
          action: "BIRTHDAY_HALF_DAY_GRANTED",
          targetType: "LEAVE_GRANT",
          targetId: grant.id,
          targetUserId: user.id,
          metadata: toJsonValue({
            userId: user.id,
            leaveGrantId: grant.id,
            leaveTypeId: policy.leaveTypeId,
            birthdayDate,
            nominalGrantDate,
            actualGrantDate,
            usableFrom,
            usableUntil,
            grantAmount: policy.grantAmount,
          }),
        },
      });

      if (policy.notifyEmployee) {
        await createGrantNotification({
          prisma,
          userId: user.id,
          leaveGrantId: grant.id,
          birthdayDate,
          usableFrom,
          usableUntil,
        });
      }

      result.grantedCount += 1;
      result.grants.push({
        userId: user.id,
        leaveGrantId: grant.id,
        birthdayDate,
        nominalGrantDate,
        actualGrantDate,
        usableFrom,
        usableUntil,
      });
    }
  }

  return result;
}

export function normalizeBirthdayPolicyInput(input: {
  isEnabled: boolean;
  grantAmount: number;
  grantDaysBefore: number;
  usableDaysFromBirthday: number;
  adjustGrantDateToPreviousBusinessDay: boolean;
  notifyEmployee: boolean;
}): Omit<BirthdayPolicy, "id" | "leaveTypeId" | "grantUnit"> {
  if (!Number.isFinite(input.grantAmount) || input.grantAmount <= 0) {
    throw new Error("생일 반차 지급 수량은 0보다 커야 합니다.");
  }

  if (!Number.isInteger(input.grantDaysBefore) || input.grantDaysBefore < 0) {
    throw new Error("생일 며칠 전 지급할지 확인해 주세요.");
  }

  if (
    !Number.isInteger(input.usableDaysFromBirthday) ||
    input.usableDaysFromBirthday < 0
  ) {
    throw new Error("사용 가능 기간을 확인해 주세요.");
  }

  return {
    isEnabled: input.isEnabled,
    grantAmount: input.grantAmount,
    grantDaysBefore: input.grantDaysBefore,
    usableDaysFromBirthday: input.usableDaysFromBirthday,
    adjustGrantDateToPreviousBusinessDay:
      input.adjustGrantDateToPreviousBusinessDay,
    notifyEmployee: input.notifyEmployee,
  };
}
