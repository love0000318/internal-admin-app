import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  dateOnlyToDate,
  dateToDateOnly,
  formatDateOnly,
  todayInSeoul,
} from "@/lib/leave/calculate-business-days";
import { recordLeaveGrantCreatedLedger } from "@/lib/leave/ledger";
import type { DateOnly } from "@/lib/leave/types";

export const BIRTHDAY_HALF_DAY_CODE = "BIRTHDAY_HALF_DAY";
export const BIRTHDAY_HALF_DAY_REASON = "생일 반차 자동 지급";

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
  grantedCount: number;
  skippedCount: number;
  disabled: boolean;
  grants: Array<{
    userId: string;
    leaveGrantId: string;
    birthdayDate: DateOnly;
    usableFrom: DateOnly;
    usableUntil: DateOnly;
  }>;
  skipped: Array<{
    userId: string;
    reason: string;
    birthdayDate?: DateOnly;
  }>;
};

function addDays(value: DateOnly, days: number): DateOnly {
  const date = dateOnlyToDate(value);
  date.setUTCDate(date.getUTCDate() + days);

  return formatDateOnly(date);
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function monthDay(value: DateOnly) {
  const [, month, day] = value.split("-").map(Number);

  return { month, day };
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
  birthdayDate: DateOnly,
  usableDaysFromBirthday = 7,
) {
  return {
    usableFrom: birthdayDate,
    usableUntil: addDays(birthdayDate, usableDaysFromBirthday),
  };
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
      usableDaysFromBirthday: 7,
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
      message: `생일을 맞아 0.5일 반차가 지급되었습니다. ${usableFrom}부터 ${usableUntil}까지 사용할 수 있습니다.`,
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
}: {
  prisma?: PrismaClient;
  processedDate?: DateOnly;
} = {}): Promise<BirthdayGrantJobResult> {
  const policy = await getBirthdayPolicy(prisma);
  const result: BirthdayGrantJobResult = {
    processedDate,
    grantedCount: 0,
    skippedCount: 0,
    disabled: !policy?.isEnabled,
    grants: [],
    skipped: [],
  };

  if (!policy?.isEnabled) {
    return result;
  }

  const [users, holidays, systemOwner] = await Promise.all([
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      include: { profile: true },
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

  for (const user of users) {
    const birthDate = user.birthDate ?? user.profile?.birthday ?? null;

    if (!birthDate) {
      result.skippedCount += 1;
      result.skipped.push({ userId: user.id, reason: "NO_BIRTH_DATE" });
      continue;
    }

    for (const year of candidateYears) {
      const birthdayDate = calculateBirthdayDateForYear(birthDate, year);
      const { usableFrom, usableUntil } = calculateBirthdayHalfDayUsableRange(
        birthdayDate,
        policy.usableDaysFromBirthday,
      );
      const { nominalGrantDate, actualGrantDate } =
        calculateBirthdayHalfDayGrantDate({
          birthdayDate,
          grantDaysBefore: policy.grantDaysBefore,
          companyHolidays: holidayDates,
          adjustGrantDateToPreviousBusinessDay:
            policy.adjustGrantDateToPreviousBusinessDay,
        });

      if (actualGrantDate !== processedDate) {
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
        result.skippedCount += 1;
        result.skipped.push({
          userId: user.id,
          reason: "ALREADY_GRANTED",
          birthdayDate,
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
