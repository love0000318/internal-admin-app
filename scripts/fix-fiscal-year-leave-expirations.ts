import { getPrisma } from "@/lib/db/prisma";
import { JOB_NAMES } from "@/lib/jobs/job-names";
import { runJobWithTracking } from "@/lib/jobs/job-runner";
import { dateToDateOnly } from "@/lib/leave/calculate-business-days";
import {
  FISCAL_YEAR_LEDGER_SOURCES,
  getFiscalYearLeaveExpirationDate,
  getFiscalYearLeaveExpirationDateValue,
  isFiscalYearExpirationMismatch,
} from "@/lib/leave/fiscal-year-expiration";
import { loadLocalEnv } from "./env";

type FixArgs = {
  mode: "dry-run" | "apply";
  year?: number;
};

type Candidate = {
  id: string;
  userId: string;
  referenceYear: number;
  currentExpiresAt: string;
  nextExpiresAt: string;
};

type FixScanResult = {
  grantScannedCount: number;
  ledgerScannedCount: number;
  grantUpdateCandidates: Candidate[];
  ledgerUpdateCandidates: Candidate[];
  skippedBirthdayGrantCount: number;
  skippedInactiveGrantCount: number;
  skippedNonFiscalGrantCount: number;
  alreadyNormalCount: number;
};

function parseArgs(argv: string[]): FixArgs {
  const hasApply = argv.includes("--apply");
  const hasDryRun = argv.includes("--dry-run");

  if (hasApply && hasDryRun) {
    throw new Error("Use either --dry-run or --apply, not both.");
  }

  const yearArg = argv.find((arg) => arg.startsWith("--year="));
  const year = yearArg ? Number(yearArg.slice("--year=".length)) : undefined;

  if (year !== undefined && (!Number.isInteger(year) || year < 1900 || year > 3000)) {
    throw new Error("--year must be a valid year, for example --year=2026.");
  }

  return {
    mode: hasApply ? "apply" : "dry-run",
    year,
  };
}

function isBirthdayGrant(grant: {
  source: string;
  leaveType?: { code: string | null } | null;
}) {
  return grant.source === "BIRTHDAY_AUTO" || grant.leaveType?.code === "BIRTHDAY_HALF_DAY";
}

function isFiscalYearGrant(grant: {
  source: string;
  leaveType?: {
    category: string;
    deductsAnnualBalance: boolean;
    code: string | null;
  } | null;
}) {
  return (
    grant.source === "SYSTEM" ||
    grant.source === "MIGRATION" ||
    grant.leaveType?.category === "ANNUAL" ||
    grant.leaveType?.deductsAnnualBalance === true ||
    grant.leaveType?.code === "ANNUAL"
  );
}

async function scanFiscalYearLeaveExpirations(args: FixArgs): Promise<FixScanResult> {
  const prisma = getPrisma();
  const referenceYearWhere = args.year ?? { not: null };
  const grants = await prisma.leaveGrant.findMany({
    where: {
      referenceYear: referenceYearWhere,
      expiresAt: { not: null },
    },
    include: {
      leaveType: {
        select: {
          code: true,
          category: true,
          deductsAnnualBalance: true,
        },
      },
    },
  });
  const ledgers = await prisma.leaveLedger.findMany({
    where: {
      referenceYear: referenceYearWhere,
      expiresAt: { not: null },
      source: { in: [...FISCAL_YEAR_LEDGER_SOURCES] },
    },
    select: {
      id: true,
      userId: true,
      referenceYear: true,
      expiresAt: true,
    },
  });

  let skippedBirthdayGrantCount = 0;
  let skippedInactiveGrantCount = 0;
  let skippedNonFiscalGrantCount = 0;
  let alreadyNormalCount = 0;
  const grantUpdateCandidates: Candidate[] = [];

  for (const grant of grants) {
    if (isBirthdayGrant(grant)) {
      skippedBirthdayGrantCount += 1;
      continue;
    }

    if (grant.status !== "ACTIVE") {
      skippedInactiveGrantCount += 1;
      continue;
    }

    if (!isFiscalYearGrant(grant)) {
      skippedNonFiscalGrantCount += 1;
      continue;
    }

    if (!isFiscalYearExpirationMismatch({ referenceYear: grant.referenceYear, expiresAt: grant.expiresAt })) {
      alreadyNormalCount += 1;
      continue;
    }

    grantUpdateCandidates.push({
      id: grant.id,
      userId: grant.userId,
      referenceYear: grant.referenceYear!,
      currentExpiresAt: dateToDateOnly(grant.expiresAt!),
      nextExpiresAt: getFiscalYearLeaveExpirationDate(grant.referenceYear!),
    });
  }

  const ledgerUpdateCandidates = ledgers
    .filter((ledger) =>
      isFiscalYearExpirationMismatch({
        referenceYear: ledger.referenceYear,
        expiresAt: ledger.expiresAt,
      }),
    )
    .map((ledger) => ({
      id: ledger.id,
      userId: ledger.userId,
      referenceYear: ledger.referenceYear!,
      currentExpiresAt: dateToDateOnly(ledger.expiresAt!),
      nextExpiresAt: getFiscalYearLeaveExpirationDate(ledger.referenceYear!),
    }));

  return {
    grantScannedCount: grants.length,
    ledgerScannedCount: ledgers.length,
    grantUpdateCandidates,
    ledgerUpdateCandidates,
    skippedBirthdayGrantCount,
    skippedInactiveGrantCount,
    skippedNonFiscalGrantCount,
    alreadyNormalCount,
  };
}

async function applyFiscalYearLeaveExpirationFix(result: FixScanResult) {
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    for (const candidate of result.grantUpdateCandidates) {
      await tx.leaveGrant.update({
        where: { id: candidate.id },
        data: { expiresAt: getFiscalYearLeaveExpirationDateValue(candidate.referenceYear) },
      });
    }

    for (const candidate of result.ledgerUpdateCandidates) {
      await tx.leaveLedger.update({
        where: { id: candidate.id },
        data: { expiresAt: getFiscalYearLeaveExpirationDateValue(candidate.referenceYear) },
      });
    }
  });
}

function printSummary(args: FixArgs, result: FixScanResult) {
  const grantUpdateCount = result.grantUpdateCandidates.length;
  const ledgerUpdateCount = result.ledgerUpdateCandidates.length;

  console.log(
    args.mode === "apply"
      ? "Fiscal-year leave expiration fix completed."
      : "Fiscal-year leave expiration fix dry-run completed.",
  );
  console.log(`Mode: ${args.mode}`);
  console.log(`Target year: ${args.year ?? "all"}`);
  console.log(`Grant scanned: ${result.grantScannedCount}`);
  console.log(`Ledger scanned: ${result.ledgerScannedCount}`);
  console.log(`Grant update candidates: ${grantUpdateCount}`);
  console.log(`Ledger update candidates: ${ledgerUpdateCount}`);
  console.log(`Birthday half-day grants skipped: ${result.skippedBirthdayGrantCount}`);
  console.log(`Inactive grants skipped: ${result.skippedInactiveGrantCount}`);
  console.log(`Non fiscal-year grants skipped: ${result.skippedNonFiscalGrantCount}`);
  console.log(`Already normal grants: ${result.alreadyNormalCount}`);

  const preview = [...result.grantUpdateCandidates, ...result.ledgerUpdateCandidates].slice(0, 20);
  for (const candidate of preview) {
    console.log(
      `[candidate] userId=${candidate.userId} referenceYear=${candidate.referenceYear} ` +
        `${candidate.currentExpiresAt} -> ${candidate.nextExpiresAt}`,
    );
  }
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  let result!: FixScanResult;

  await runJobWithTracking(
    {
      jobName: JOB_NAMES.FIX_FISCAL_YEAR_LEAVE_EXPIRATIONS,
      triggeredBy: "SYSTEM",
      dryRun: args.mode === "dry-run",
    },
    async () => {
      result = await scanFiscalYearLeaveExpirations(args);

      if (args.mode === "apply") {
        await applyFiscalYearLeaveExpirationFix(result);
      }

      return {
        checkedCount: result.grantScannedCount + result.ledgerScannedCount,
        updatedCount:
          args.mode === "apply"
            ? result.grantUpdateCandidates.length + result.ledgerUpdateCandidates.length
            : 0,
        skippedCount:
          result.skippedBirthdayGrantCount +
          result.skippedInactiveGrantCount +
          result.skippedNonFiscalGrantCount +
          result.alreadyNormalCount,
        resultSummary: {
          mode: args.mode,
          targetYear: args.year ?? null,
          grantScannedCount: result.grantScannedCount,
          ledgerScannedCount: result.ledgerScannedCount,
          grantUpdateCandidateCount: result.grantUpdateCandidates.length,
          ledgerUpdateCandidateCount: result.ledgerUpdateCandidates.length,
          skippedBirthdayGrantCount: result.skippedBirthdayGrantCount,
          skippedInactiveGrantCount: result.skippedInactiveGrantCount,
          skippedNonFiscalGrantCount: result.skippedNonFiscalGrantCount,
          alreadyNormalCount: result.alreadyNormalCount,
        },
      };
    },
  );

  printSummary(args, result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
