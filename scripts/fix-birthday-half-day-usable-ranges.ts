import { Prisma } from "../src/generated/prisma/client";
import { getPrisma } from "../src/lib/db/prisma";
import { JOB_NAMES } from "../src/lib/jobs/job-names";
import { runJobWithTracking } from "../src/lib/jobs/job-runner";
import {
  BIRTHDAY_HALF_DAY_CODE,
  resolveBirthdayHalfDayActualGrantDateFromMetadata,
  resolveBirthdayHalfDayUsableRangeFromGrantMetadata,
} from "../src/lib/leave/birthday-half-day";
import {
  compareDateOnly,
  dateOnlyToDate,
  dateToDateOnly,
  todayInSeoul,
} from "../src/lib/leave/calculate-business-days";
import type { DateOnly } from "../src/lib/leave/types";
import { loadLocalEnv } from "./env";

type FixMode = "dry-run" | "apply";

type FixArgs = {
  mode: FixMode;
  userId?: string;
  referenceYear?: number;
  asOfDate: DateOnly;
};

type RepairCandidate = {
  leaveGrantId: string;
  userId: string;
  referenceYear: number | null;
  birthdayDate: DateOnly | null;
  actualGrantDate: DateOnly;
  currentUsableFrom: DateOnly;
  currentUsableUntil: DateOnly | null;
  nextUsableFrom: DateOnly;
  nextUsableUntil: DateOnly;
  expiredUnderPolicy: boolean;
  notificationIds: string[];
};

type ScanResult = {
  scannedCount: number;
  updateCandidates: RepairCandidate[];
  skippedUsedCount: number;
  skippedPendingCount: number;
  skippedInactiveCount: number;
  skippedMissingActualGrantDateCount: number;
  alreadyNormalCount: number;
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readDateOnlyMetadata(
  metadata: unknown,
  key: string,
): DateOnly | null {
  if (!isRecord(metadata)) {
    return null;
  }

  const value = metadata[key];

  return typeof value === "string" && DATE_ONLY_PATTERN.test(value)
    ? (value as DateOnly)
    : null;
}

function readStringMetadata(metadata: unknown, key: string) {
  if (!isRecord(metadata)) {
    return null;
  }

  const value = metadata[key];

  return typeof value === "string" ? value : null;
}

function readDateArg(value: string, flag: string) {
  if (!DATE_ONLY_PATTERN.test(value)) {
    throw new Error(`Invalid ${flag}. Use YYYY-MM-DD.`);
  }

  return value as DateOnly;
}

export function parseBirthdayHalfDayRangeFixArgs(argv: string[]): FixArgs {
  const hasApply = argv.includes("--apply");
  const hasDryRun = argv.includes("--dry-run");

  if (hasApply && hasDryRun) {
    throw new Error("Use either --dry-run or --apply, not both.");
  }

  const userIdArg = argv.find((arg) => arg.startsWith("--user-id="));
  const yearArg = argv.find((arg) => arg.startsWith("--year="));
  const asOfDateArg = argv.find((arg) => arg.startsWith("--as-of-date="));
  const referenceYear = yearArg ? Number(yearArg.slice("--year=".length)) : undefined;

  if (
    referenceYear !== undefined &&
    (!Number.isInteger(referenceYear) || referenceYear < 1900 || referenceYear > 3000)
  ) {
    throw new Error("--year must be a valid year, for example --year=2026.");
  }

  return {
    mode: hasApply ? "apply" : "dry-run",
    userId: userIdArg ? userIdArg.slice("--user-id=".length) : undefined,
    referenceYear,
    asOfDate: asOfDateArg
      ? readDateArg(asOfDateArg.slice("--as-of-date=".length), "--as-of-date")
      : todayInSeoul(),
  };
}

function grantMetadataNeedsUpdate(
  metadata: unknown,
  candidate: Pick<RepairCandidate, "nextUsableFrom" | "nextUsableUntil">,
) {
  return (
    readDateOnlyMetadata(metadata, "usableFrom") !== candidate.nextUsableFrom ||
    readDateOnlyMetadata(metadata, "usableUntil") !== candidate.nextUsableUntil ||
    readStringMetadata(metadata, "usableRangeBasis") !== "ACTUAL_GRANT_DATE"
  );
}

function buildCorrectedGrantMetadata(
  metadata: unknown,
  candidate: RepairCandidate,
) {
  const nextMetadata = isRecord(metadata) ? { ...metadata } : {};

  nextMetadata.actualGrantDate = candidate.actualGrantDate;
  nextMetadata.usableFrom = candidate.nextUsableFrom;
  nextMetadata.usableUntil = candidate.nextUsableUntil;
  nextMetadata.usableRangeBasis = "ACTUAL_GRANT_DATE";

  return toJsonValue(nextMetadata);
}

function buildCorrectedNotificationMetadata(
  metadata: unknown,
  candidate: RepairCandidate,
) {
  const nextMetadata = isRecord(metadata) ? { ...metadata } : {};

  nextMetadata.leaveGrantId = candidate.leaveGrantId;
  nextMetadata.birthdayDate = candidate.birthdayDate;
  nextMetadata.actualGrantDate = candidate.actualGrantDate;
  nextMetadata.usableFrom = candidate.nextUsableFrom;
  nextMetadata.usableUntil = candidate.nextUsableUntil;
  nextMetadata.usableRangeBasis = "ACTUAL_GRANT_DATE";

  return toJsonValue(nextMetadata);
}

function buildCorrectedNotificationMessage(candidate: RepairCandidate) {
  return `생일을 맞아 사용할 수 있는 반차가 지급되었습니다. 사용 가능 기간: ${candidate.nextUsableFrom} ~ ${candidate.nextUsableUntil}`;
}

async function scanBirthdayHalfDayRangeFixes(
  args: FixArgs,
): Promise<ScanResult> {
  const prisma = getPrisma();
  const grants = await prisma.leaveGrant.findMany({
    where: {
      ...(args.userId ? { userId: args.userId } : {}),
      ...(args.referenceYear ? { referenceYear: args.referenceYear } : {}),
      OR: [
        { source: "BIRTHDAY_AUTO" },
        { leaveType: { code: BIRTHDAY_HALF_DAY_CODE } },
      ],
    },
    include: {
      leaveType: {
        select: { code: true, name: true },
      },
    },
    orderBy: [{ referenceYear: "asc" }, { createdAt: "asc" }],
  });
  const result: ScanResult = {
    scannedCount: grants.length,
    updateCandidates: [],
    skippedUsedCount: 0,
    skippedPendingCount: 0,
    skippedInactiveCount: 0,
    skippedMissingActualGrantDateCount: 0,
    alreadyNormalCount: 0,
  };

  for (const grant of grants) {
    if (grant.status !== "ACTIVE") {
      result.skippedInactiveCount += 1;
      continue;
    }

    if (grant.usedAmount > 0) {
      result.skippedUsedCount += 1;
      continue;
    }

    if (grant.pendingAmount > 0) {
      result.skippedPendingCount += 1;
      continue;
    }

    const actualGrantDate =
      resolveBirthdayHalfDayActualGrantDateFromMetadata(grant.metadata);
    const usableRange = resolveBirthdayHalfDayUsableRangeFromGrantMetadata(
      grant.metadata,
    );

    if (!actualGrantDate || !usableRange) {
      result.skippedMissingActualGrantDateCount += 1;
      continue;
    }

    const candidate: RepairCandidate = {
      leaveGrantId: grant.id,
      userId: grant.userId,
      referenceYear: grant.referenceYear,
      birthdayDate:
        readDateOnlyMetadata(grant.metadata, "birthdayDate") ??
        (grant.referenceDate ? dateToDateOnly(grant.referenceDate) : null),
      actualGrantDate,
      currentUsableFrom: dateToDateOnly(grant.effectiveFrom),
      currentUsableUntil: grant.expiresAt ? dateToDateOnly(grant.expiresAt) : null,
      nextUsableFrom: usableRange.usableFrom,
      nextUsableUntil: usableRange.usableUntil,
      expiredUnderPolicy: compareDateOnly(usableRange.usableUntil, args.asOfDate) < 0,
      notificationIds: [],
    };
    const grantRangeMatches =
      candidate.currentUsableFrom === candidate.nextUsableFrom &&
      candidate.currentUsableUntil === candidate.nextUsableUntil;

    if (grantRangeMatches && !grantMetadataNeedsUpdate(grant.metadata, candidate)) {
      result.alreadyNormalCount += 1;
      continue;
    }

    const notifications = await prisma.notification.findMany({
      where: {
        userId: grant.userId,
        type: "LEAVE_GRANTED",
      },
      select: {
        id: true,
        metadata: true,
      },
    });

    candidate.notificationIds = notifications
      .filter(
        (notification) =>
          readStringMetadata(notification.metadata, "leaveGrantId") === grant.id,
      )
      .map((notification) => notification.id);

    result.updateCandidates.push(candidate);
  }

  return result;
}

async function applyBirthdayHalfDayRangeFixes(
  candidates: RepairCandidate[],
) {
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    for (const candidate of candidates) {
      const before = await tx.leaveGrant.findUnique({
        where: { id: candidate.leaveGrantId },
        select: { metadata: true },
      });

      await tx.leaveGrant.update({
        where: { id: candidate.leaveGrantId },
        data: {
          effectiveFrom: dateOnlyToDate(candidate.nextUsableFrom),
          expiresAt: dateOnlyToDate(candidate.nextUsableUntil),
          metadata: buildCorrectedGrantMetadata(before?.metadata, candidate),
        },
      });

      for (const notificationId of candidate.notificationIds) {
        const notification = await tx.notification.findUnique({
          where: { id: notificationId },
          select: { metadata: true },
        });

        await tx.notification.update({
          where: { id: notificationId },
          data: {
            message: buildCorrectedNotificationMessage(candidate),
            metadata: buildCorrectedNotificationMetadata(
              notification?.metadata,
              candidate,
            ),
          },
        });
      }
    }
  });
}

function printSummary(args: FixArgs, result: ScanResult) {
  console.log(
    args.mode === "apply"
      ? "Birthday half-day usable range fix completed."
      : "Birthday half-day usable range fix dry-run completed.",
  );
  console.log(`Mode: ${args.mode}`);
  console.log(`As-of date: ${args.asOfDate}`);
  console.log(`Target user: ${args.userId ?? "all"}`);
  console.log(`Target year: ${args.referenceYear ?? "all"}`);
  console.log(`Scanned grants: ${result.scannedCount}`);
  console.log(`Update candidates: ${result.updateCandidates.length}`);
  console.log(`Skipped used grants: ${result.skippedUsedCount}`);
  console.log(`Skipped pending grants: ${result.skippedPendingCount}`);
  console.log(`Skipped inactive grants: ${result.skippedInactiveCount}`);
  console.log(
    `Skipped missing actualGrantDate: ${result.skippedMissingActualGrantDateCount}`,
  );
  console.log(`Already normal grants: ${result.alreadyNormalCount}`);
  console.log(
    `Expired under corrected policy: ${
      result.updateCandidates.filter((candidate) => candidate.expiredUnderPolicy)
        .length
    }`,
  );

  for (const candidate of result.updateCandidates.slice(0, 20)) {
    console.log(
      `[candidate] leaveGrantId=${candidate.leaveGrantId} userId=${candidate.userId} ` +
        `birthdayDate=${candidate.birthdayDate ?? "-"} actualGrantDate=${candidate.actualGrantDate} ` +
        `${candidate.currentUsableFrom}~${candidate.currentUsableUntil ?? "-"} -> ` +
        `${candidate.nextUsableFrom}~${candidate.nextUsableUntil} ` +
        `notifications=${candidate.notificationIds.length}`,
    );
  }
}

async function main() {
  loadLocalEnv();
  const args = parseBirthdayHalfDayRangeFixArgs(process.argv.slice(2));
  let result!: ScanResult;

  await runJobWithTracking(
    {
      jobName: JOB_NAMES.FIX_BIRTHDAY_HALF_DAY_USABLE_RANGES,
      triggeredBy: "SYSTEM",
      dryRun: args.mode === "dry-run",
    },
    async () => {
      result = await scanBirthdayHalfDayRangeFixes(args);

      if (args.mode === "apply") {
        await applyBirthdayHalfDayRangeFixes(result.updateCandidates);
      }

      return {
        checkedCount: result.scannedCount,
        updatedCount:
          args.mode === "apply" ? result.updateCandidates.length : 0,
        skippedCount:
          result.skippedUsedCount +
          result.skippedPendingCount +
          result.skippedInactiveCount +
          result.skippedMissingActualGrantDateCount +
          result.alreadyNormalCount,
        resultSummary: {
          mode: args.mode,
          asOfDate: args.asOfDate,
          targetUserId: args.userId ?? null,
          targetYear: args.referenceYear ?? null,
          scannedCount: result.scannedCount,
          updateCandidateCount: result.updateCandidates.length,
          skippedUsedCount: result.skippedUsedCount,
          skippedPendingCount: result.skippedPendingCount,
          skippedInactiveCount: result.skippedInactiveCount,
          skippedMissingActualGrantDateCount:
            result.skippedMissingActualGrantDateCount,
          alreadyNormalCount: result.alreadyNormalCount,
          expiredUnderPolicyCount: result.updateCandidates.filter(
            (candidate) => candidate.expiredUnderPolicy,
          ).length,
        },
      };
    },
  );

  printSummary(args, result);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Birthday half-day usable range fix failed.",
    );
    process.exitCode = 1;
  });
}
