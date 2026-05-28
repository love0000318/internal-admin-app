import { JOB_NAMES } from "../src/lib/jobs/job-names";
import { runJobWithTracking } from "../src/lib/jobs/job-runner";
import { grantBirthdayHalfDaysForDate } from "../src/lib/leave/birthday-half-day";
import type { DateOnly } from "../src/lib/leave/types";
import { loadLocalEnv } from "./env";

type BirthdayGrantScriptArgs = {
  dryRun: boolean;
  apply: boolean;
  processedDate?: DateOnly;
  includePastDue: boolean;
};

function readDateArg(arg: string) {
  const value = arg.slice("--date=".length);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Invalid --date. Use YYYY-MM-DD.");
  }

  return value as DateOnly;
}

export function parseBirthdayGrantScriptArgs(
  argv: string[],
): BirthdayGrantScriptArgs {
  const apply = argv.includes("--apply");
  const requestedDryRun = argv.includes("--dry-run");
  const exactDate = argv.includes("--exact-date");
  const recoverMissing = argv.includes("--recover-missing");

  if (apply && requestedDryRun) {
    throw new Error("Use either --dry-run or --apply, not both.");
  }

  if (exactDate && recoverMissing) {
    throw new Error("Use either --exact-date or --recover-missing, not both.");
  }

  const dateArg = argv.find((arg) => arg.startsWith("--date="));

  return {
    dryRun: !apply,
    apply,
    processedDate: dateArg ? readDateArg(dateArg) : undefined,
    includePastDue: !exactDate,
  };
}

async function main() {
  loadLocalEnv();
  const args = parseBirthdayGrantScriptArgs(process.argv.slice(2));
  const jobRun = await runJobWithTracking(
    {
      jobName: JOB_NAMES.BIRTHDAY_HALF_DAY_GRANTS,
      triggeredBy: "SYSTEM",
      dryRun: args.dryRun,
    },
    async () => {
      const result = await grantBirthdayHalfDaysForDate({
        dryRun: args.dryRun,
        processedDate: args.processedDate,
        includePastDue: args.includePastDue,
      });

      return {
        checkedCount: result.activeUserCount,
        createdCount: result.grantedCount,
        skippedCount: result.skippedCount,
        resultSummary: {
          processedDate: result.processedDate,
          dryRun: result.dryRun,
          mode: result.mode,
          activeUserCount: result.activeUserCount,
          dueCount: result.dueCount,
          missingBirthDateCount: result.missingBirthDateCount,
          alreadyGrantedCount: result.alreadyGrantedCount,
          grantedCount: result.grantedCount,
          skippedCount: result.skippedCount,
          disabled: result.disabled,
          grantCandidates: result.grants.map((grant) => ({
            userId: grant.userId,
            birthdayDate: grant.birthdayDate,
            nominalGrantDate: grant.nominalGrantDate,
            actualGrantDate: grant.actualGrantDate,
            usableFrom: grant.usableFrom,
            usableUntil: grant.usableUntil,
          })),
        },
      };
    },
  );
  const result = jobRun.resultSummary;

  console.log(`Mode: ${args.dryRun ? "dry-run" : "apply"}`);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Birthday half-day grant job failed.",
    );
    process.exitCode = 1;
  });
}
