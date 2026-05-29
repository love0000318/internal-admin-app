import { describe, expect, it, vi } from "vitest";

import { isAuditRequiredAction } from "@/lib/audit/audit-log";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  calculateBirthdayDateForYear,
  calculateBirthdayHalfDayGrantDate,
  calculateBirthdayHalfDayNominalGrantDate,
  calculateBirthdayHalfDayUsableRange,
  calculatePreviousBusinessDay,
  grantBirthdayHalfDaysForDate,
  normalizeBirthdayPolicyInput,
  resolveBirthdayLeaveBirthDate,
  shouldGrantBirthdayHalfDayToday,
} from "@/lib/leave/birthday-half-day";
import type { DateOnly } from "@/lib/leave/types";
import { parseBirthdayGrantScriptArgs } from "../scripts/grant-birthday-half-days";
import { parseBirthdayHalfDayRangeFixArgs } from "../scripts/fix-birthday-half-day-usable-ranges";

function utcDate(value: DateOnly) {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

type MockUser = {
  id: string;
  name: string;
  status: "ACTIVE" | "DEACTIVATED" | "DELETED";
  birthDate: Date | null;
  profile?: { birthDate?: Date | null; birthday?: Date | null } | null;
  linkedPrejoinProfiles?: Array<{ birthDate?: Date | null }>;
};

type MockLeaveGrant = {
  id: string;
  userId: string;
  leaveTypeId: string;
  referenceYear: number | null;
  source: string;
} & Record<string, unknown>;

type MockLeaveGrantCreateData = {
  userId: string;
  leaveTypeId: string;
  referenceYear: number | null;
  source: string;
} & Record<string, unknown>;

function createBirthdayGrantPrismaMock({
  users,
  existingGrants = [],
  grantDaysBefore = 7,
  notifyEmployee = false,
}: {
  users: MockUser[];
  existingGrants?: Array<{
    id: string;
    userId: string;
    leaveTypeId: string;
    referenceYear: number;
    source: "BIRTHDAY_AUTO";
  }>;
  grantDaysBefore?: number;
  notifyEmployee?: boolean;
}) {
  const leaveGrants: MockLeaveGrant[] = [...existingGrants];
  const leaveLedgers: Array<Record<string, unknown>> = [];
  const auditLogs: Array<Record<string, unknown>> = [];
  const notifications: Array<Record<string, unknown>> = [];
  const leaveTypeId = "birthday-half-day-type";

  const prisma = {
    birthdayLeavePolicy: {
      findFirst: vi.fn(async () => ({
        id: "birthday-policy",
        isEnabled: true,
        leaveTypeId,
        grantAmount: 0.5,
        grantUnit: "DAY",
        grantDaysBefore,
        usableDaysFromBirthday: 7,
        adjustGrantDateToPreviousBusinessDay: false,
        notifyEmployee,
      })),
    },
    leaveTypeDefinition: {
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn(async (args?: { where?: { status?: string } }) =>
        users
          .filter((user) => !args?.where?.status || user.status === args.where.status)
          .map((user) => ({
            ...user,
            profile: user.profile ?? null,
            linkedPrejoinProfiles: user.linkedPrejoinProfiles ?? [],
          })),
      ),
      findFirst: vi.fn(async () => ({ id: "owner-user" })),
    },
    companyHoliday: {
      findMany: vi.fn(async () => []),
    },
    leaveGrant: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: {
            userId: string;
            leaveTypeId: string;
            referenceYear: number;
            source: string;
          };
        }) => {
        return (
          leaveGrants.find(
            (grant) =>
              grant.userId === where.userId &&
              grant.leaveTypeId === where.leaveTypeId &&
              grant.referenceYear === where.referenceYear &&
              grant.source === where.source,
            ) ?? null
        );
        },
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: MockLeaveGrantCreateData;
        }) => {
        const grant: MockLeaveGrant = {
          id: `grant-${leaveGrants.length + 1}`,
          ...data,
        };
        leaveGrants.push(grant);
        return grant;
        },
      ),
    },
    leaveLedger: {
      findUnique: vi.fn(
        async ({ where }: { where: { idempotencyKey?: string | null } }) => {
        return (
          leaveLedgers.find(
            (ledger) => ledger.idempotencyKey === where.idempotencyKey,
          ) ?? null
        );
        },
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const ledger = { id: `ledger-${leaveLedgers.length + 1}`, ...data };
        leaveLedgers.push(ledger);
        return ledger;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const auditLog = { id: `audit-${auditLogs.length + 1}`, ...data };
        auditLogs.push(auditLog);
        return auditLog;
      }),
    },
    notification: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const notification = {
          id: `notification-${notifications.length + 1}`,
          ...data,
        };
        notifications.push(notification);
        return notification;
      }),
    },
  };

  return {
    prisma: prisma as unknown as PrismaClient,
    leaveTypeId,
    leaveGrants,
    leaveLedgers,
    auditLogs,
    notifications,
  };
}

describe("birthday half-day helpers", () => {
  it("calculates birthday date for target year and handles Feb 29 in common years", () => {
    expect(calculateBirthdayDateForYear("1995-03-12", 2026)).toBe("2026-03-12");
    expect(calculateBirthdayDateForYear("1996-02-29", 2026)).toBe("2026-02-28");
    expect(calculateBirthdayDateForYear("1996-02-29", 2028)).toBe("2028-02-29");
  });

  it("calculates usable range from actual grant date and nominal grant date", () => {
    expect(calculateBirthdayHalfDayUsableRange("2026-05-28", 7)).toEqual({
      usableFrom: "2026-05-28",
      usableUntil: "2026-06-04",
    });
    expect(calculateBirthdayHalfDayUsableRange("2026-06-04", 7)).not.toEqual({
      usableFrom: "2026-05-28",
      usableUntil: "2026-06-04",
    });
    expect(calculateBirthdayHalfDayNominalGrantDate("2026-03-12", 1)).toBe(
      "2026-03-11",
    );
  });

  it("moves weekend grant dates to the previous business day", () => {
    expect(calculatePreviousBusinessDay("2026-03-15")).toBe("2026-03-13");
    expect(calculatePreviousBusinessDay("2026-03-14")).toBe("2026-03-13");
  });

  it("moves company holidays and consecutive holidays to the previous business day", () => {
    expect(calculatePreviousBusinessDay("2026-03-11", ["2026-03-11"])).toBe(
      "2026-03-10",
    );
    expect(
      calculatePreviousBusinessDay("2026-03-13", [
        "2026-03-13",
        "2026-03-12",
        "2026-03-11",
      ]),
    ).toBe("2026-03-10");
  });

  it("calculates actual grant date with weekend and holiday adjustment", () => {
    expect(
      calculateBirthdayHalfDayGrantDate({
        birthdayDate: "2026-03-16",
        grantDaysBefore: 1,
      }),
    ).toEqual({
      nominalGrantDate: "2026-03-15",
      actualGrantDate: "2026-03-13",
    });
    expect(
      calculateBirthdayHalfDayGrantDate({
        birthdayDate: "2026-03-12",
        grantDaysBefore: 1,
        companyHolidays: ["2026-03-11"],
      }),
    ).toEqual({
      nominalGrantDate: "2026-03-11",
      actualGrantDate: "2026-03-10",
    });
  });

  it("checks whether a birthday grant should run today", () => {
    expect(
      shouldGrantBirthdayHalfDayToday({
        birthDate: "1995-03-16",
        year: 2026,
        today: "2026-03-13",
      }),
    ).toBe(true);
    expect(
      shouldGrantBirthdayHalfDayToday({
        birthDate: "1995-03-16",
        year: 2026,
        today: "2026-03-15",
      }),
    ).toBe(false);
  });

  it("uses the configured days-before offset for birthday grant dates", () => {
    expect(
      shouldGrantBirthdayHalfDayToday({
        birthDate: "1995-06-10",
        year: 2026,
        today: "2026-06-03",
        grantDaysBefore: 7,
      }),
    ).toBe(true);
    expect(
      shouldGrantBirthdayHalfDayToday({
        birthDate: "1995-06-10",
        year: 2026,
        today: "2026-06-10",
        grantDaysBefore: 7,
      }),
    ).toBe(false);
  });

  it("resolves birthday source with HR profile priority and fallbacks", () => {
    const profileBirthDate = new Date(Date.UTC(1995, 2, 12));
    const userBirthDate = new Date(Date.UTC(1996, 3, 13));
    const prejoinBirthDate = new Date(Date.UTC(1997, 4, 14));
    const legacyBirthday = new Date(Date.UTC(1998, 5, 15));

    expect(
      resolveBirthdayLeaveBirthDate({
        birthDate: userBirthDate,
        profile: { birthDate: profileBirthDate, birthday: legacyBirthday },
        linkedPrejoinProfiles: [{ birthDate: prejoinBirthDate }],
      }),
    ).toBe(profileBirthDate);
    expect(
      resolveBirthdayLeaveBirthDate({
        birthDate: userBirthDate,
        profile: { birthDate: null, birthday: legacyBirthday },
        linkedPrejoinProfiles: [{ birthDate: prejoinBirthDate }],
      }),
    ).toBe(userBirthDate);
    expect(
      resolveBirthdayLeaveBirthDate({
        birthDate: null,
        profile: { birthDate: null, birthday: null },
        linkedPrejoinProfiles: [{ birthDate: prejoinBirthDate }],
      }),
    ).toBe(prejoinBirthDate);
    expect(
      resolveBirthdayLeaveBirthDate({
        birthDate: null,
        profile: { birthDate: null, birthday: legacyBirthday },
        linkedPrejoinProfiles: [],
      }),
    ).toBe(legacyBirthday);
  });

  it("validates policy input and audit coverage", () => {
    expect(
      normalizeBirthdayPolicyInput({
        isEnabled: true,
        grantAmount: 0.5,
        grantDaysBefore: 1,
        usableDaysFromBirthday: 7,
        adjustGrantDateToPreviousBusinessDay: true,
        notifyEmployee: true,
      }),
    ).toMatchObject({ grantAmount: 0.5, grantDaysBefore: 1 });
    expect(() =>
      normalizeBirthdayPolicyInput({
        isEnabled: true,
        grantAmount: 0,
        grantDaysBefore: 1,
        usableDaysFromBirthday: 7,
        adjustGrantDateToPreviousBusinessDay: true,
        notifyEmployee: true,
      }),
    ).toThrow();
    expect(isAuditRequiredAction("BIRTHDAY_LEAVE_POLICY_UPDATED")).toBe(true);
    expect(isAuditRequiredAction("BIRTHDAY_HALF_DAY_GRANTED")).toBe(true);
    expect(isAuditRequiredAction("BIRTHDAY_HALF_DAY_NOTIFICATION_CREATED")).toBe(
      true,
    );
  });
});

describe("birthday half-day grant job", () => {
  it("finds missed current-year grants in dry-run after the policy grant date", async () => {
    const { prisma, leaveGrants } = createBirthdayGrantPrismaMock({
      users: [
        {
          id: "user-due",
          name: "Due User",
          status: "ACTIVE",
          birthDate: utcDate("1995-06-10"),
        },
      ],
    });

    const result = await grantBirthdayHalfDaysForDate({
      prisma,
      processedDate: "2026-06-05",
      dryRun: true,
      includePastDue: true,
    });

    expect(result.mode).toBe("due-through-date");
    expect(result.dueCount).toBe(1);
    expect(result.expiredCount).toBe(0);
    expect(result.grants).toEqual([
      expect.objectContaining({
        userId: "user-due",
        birthdayDate: "2026-06-10",
        nominalGrantDate: "2026-06-03",
        actualGrantDate: "2026-06-03",
        usableFrom: "2026-06-03",
        usableUntil: "2026-06-10",
      }),
    ]);
    expect(leaveGrants).toHaveLength(0);
  });

  it("reports past missed grants as expired instead of due after usable period ends", async () => {
    const { prisma, leaveGrants } = createBirthdayGrantPrismaMock({
      users: [
        {
          id: "user-expired",
          name: "Expired User",
          status: "ACTIVE",
          birthDate: utcDate("1995-01-18"),
        },
      ],
    });

    const result = await grantBirthdayHalfDaysForDate({
      prisma,
      processedDate: "2026-05-29",
      dryRun: true,
      includePastDue: true,
    });

    expect(result.dueCount).toBe(0);
    expect(result.expiredCount).toBe(1);
    expect(result.grants).toHaveLength(0);
    expect(result.expiredCandidates).toEqual([
      expect.objectContaining({
        userId: "user-expired",
        birthdayDate: "2026-01-18",
        actualGrantDate: "2026-01-11",
        usableFrom: "2026-01-11",
        usableUntil: "2026-01-18",
      }),
    ]);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        userId: "user-expired",
        reason: "EXPIRED",
        birthdayDate: "2026-01-18",
      }),
    ]);
    expect(leaveGrants).toHaveLength(0);
  });

  it("does not grant before the configured grant date", async () => {
    const { prisma } = createBirthdayGrantPrismaMock({
      users: [
        {
          id: "user-future",
          name: "Future User",
          status: "ACTIVE",
          birthDate: utcDate("1995-06-10"),
        },
      ],
    });

    const result = await grantBirthdayHalfDaysForDate({
      prisma,
      processedDate: "2026-06-02",
      dryRun: true,
      includePastDue: true,
    });

    expect(result.dueCount).toBe(0);
    expect(result.grants).toHaveLength(0);
  });

  it("does not create grants for expired missed birthdays in apply mode", async () => {
    const { prisma, leaveGrants, leaveLedgers, auditLogs } =
      createBirthdayGrantPrismaMock({
        users: [
          {
            id: "user-expired-apply",
            name: "Expired Apply User",
            status: "ACTIVE",
            birthDate: utcDate("1995-01-18"),
          },
        ],
      });

    const result = await grantBirthdayHalfDaysForDate({
      prisma,
      processedDate: "2026-05-29",
      dryRun: false,
      includePastDue: true,
    });

    expect(result.dueCount).toBe(0);
    expect(result.expiredCount).toBe(1);
    expect(result.grantedCount).toBe(0);
    expect(leaveGrants).toHaveLength(0);
    expect(leaveLedgers).toHaveLength(0);
    expect(auditLogs).toHaveLength(0);
  });

  it("creates grant, ledger, and audit records when apply mode runs", async () => {
    const { prisma, leaveGrants, leaveLedgers, auditLogs } =
      createBirthdayGrantPrismaMock({
        users: [
          {
            id: "user-apply",
            name: "Apply User",
            status: "ACTIVE",
            birthDate: utcDate("1995-06-10"),
          },
        ],
      });

    const result = await grantBirthdayHalfDaysForDate({
      prisma,
      processedDate: "2026-06-05",
      dryRun: false,
      includePastDue: true,
    });

    expect(result.grantedCount).toBe(1);
    expect(leaveGrants).toHaveLength(1);
    expect(leaveGrants[0]).toMatchObject({
      userId: "user-apply",
      referenceYear: 2026,
      source: "BIRTHDAY_AUTO",
      grantedAmount: 0.5,
      effectiveFrom: utcDate("2026-06-03"),
      expiresAt: utcDate("2026-06-10"),
    });
    expect(leaveLedgers).toHaveLength(1);
    expect(auditLogs.map((log) => log.action)).toEqual(
      expect.arrayContaining([
        "LEAVE_LEDGER_CREATED",
        "BIRTHDAY_HALF_DAY_GRANTED",
      ]),
    );
  });

  it("creates grant notifications with the actual grant-date usable range", async () => {
    const { prisma, notifications } = createBirthdayGrantPrismaMock({
      notifyEmployee: true,
      users: [
        {
          id: "user-notified",
          name: "Notified User",
          status: "ACTIVE",
          birthDate: utcDate("1995-06-04"),
        },
      ],
    });

    await grantBirthdayHalfDaysForDate({
      prisma,
      processedDate: "2026-05-28",
      dryRun: false,
      includePastDue: false,
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      userId: "user-notified",
      type: "LEAVE_GRANTED",
    });
    expect(notifications[0].message).toContain("2026-05-28 ~ 2026-06-04");
    expect(notifications[0].metadata).toMatchObject({
      usableFrom: "2026-05-28",
      usableUntil: "2026-06-04",
    });
  });

  it("skips users that already have a birthday grant for the reference year", async () => {
    const { prisma, leaveGrants } = createBirthdayGrantPrismaMock({
      users: [
        {
          id: "user-existing",
          name: "Existing User",
          status: "ACTIVE",
          birthDate: utcDate("1995-06-10"),
        },
      ],
      existingGrants: [
        {
          id: "existing-grant",
          userId: "user-existing",
          leaveTypeId: "birthday-half-day-type",
          referenceYear: 2026,
          source: "BIRTHDAY_AUTO",
        },
      ],
    });

    const result = await grantBirthdayHalfDaysForDate({
      prisma,
      processedDate: "2026-06-05",
      dryRun: false,
      includePastDue: true,
    });

    expect(result.alreadyGrantedCount).toBe(1);
    expect(result.dueCount).toBe(0);
    expect(result.grantedCount).toBe(0);
    expect(leaveGrants).toHaveLength(1);
  });

  it("excludes inactive and deleted users under the existing active-user policy", async () => {
    const { prisma, leaveGrants } = createBirthdayGrantPrismaMock({
      users: [
        {
          id: "user-inactive",
          name: "Inactive User",
          status: "DEACTIVATED",
          birthDate: utcDate("1995-06-10"),
        },
        {
          id: "user-deleted",
          name: "Deleted User",
          status: "DELETED",
          birthDate: utcDate("1995-06-10"),
        },
      ],
    });

    const result = await grantBirthdayHalfDaysForDate({
      prisma,
      processedDate: "2026-06-05",
      dryRun: false,
      includePastDue: true,
    });

    expect(result.activeUserCount).toBe(0);
    expect(result.grantedCount).toBe(0);
    expect(leaveGrants).toHaveLength(0);
  });
});

describe("birthday half-day grant script args", () => {
  it("defaults to dry-run recovery and requires --apply for writes", () => {
    expect(parseBirthdayGrantScriptArgs([])).toMatchObject({
      dryRun: true,
      apply: false,
      includePastDue: true,
    });
    expect(
      parseBirthdayGrantScriptArgs(["--apply", "--date=2026-06-05"]),
    ).toMatchObject({
      dryRun: false,
      apply: true,
      processedDate: "2026-06-05",
      includePastDue: true,
    });
    expect(parseBirthdayGrantScriptArgs(["--dry-run", "--exact-date"])).toMatchObject({
      dryRun: true,
      apply: false,
      includePastDue: false,
    });
    expect(() => parseBirthdayGrantScriptArgs(["--dry-run", "--apply"])).toThrow();
  });
});

describe("birthday half-day range repair script args", () => {
  it("defaults to dry-run and requires --apply for range repairs", () => {
    expect(parseBirthdayHalfDayRangeFixArgs(["--as-of-date=2026-05-29"])).toMatchObject({
      mode: "dry-run",
      asOfDate: "2026-05-29",
    });
    expect(
      parseBirthdayHalfDayRangeFixArgs([
        "--apply",
        "--user-id=cmoqq369t000004joneto18fr",
        "--year=2026",
        "--as-of-date=2026-05-29",
      ]),
    ).toMatchObject({
      mode: "apply",
      userId: "cmoqq369t000004joneto18fr",
      referenceYear: 2026,
      asOfDate: "2026-05-29",
    });
    expect(() =>
      parseBirthdayHalfDayRangeFixArgs(["--dry-run", "--apply"]),
    ).toThrow();
  });
});
