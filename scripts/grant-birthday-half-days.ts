import { existsSync, readFileSync } from "node:fs";

import { JOB_NAMES } from "../src/lib/jobs/job-names";
import { runJobWithTracking } from "../src/lib/jobs/job-runner";
import { grantBirthdayHalfDaysForDate } from "../src/lib/leave/birthday-half-day";
import type { DateOnly } from "../src/lib/leave/types";

function loadLocalEnv() {
  if (process.env.DATABASE_URL || !existsSync(".env")) {
    return;
  }

  const lines = readFileSync(".env", "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    const rawValue = valueParts.join("=");
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

async function main() {
  loadLocalEnv();
  const dryRun = process.argv.includes("--dry-run");
  const dateArg = process.argv.find((arg) => arg.startsWith("--date="));
  const processedDate = dateArg?.slice("--date=".length);
  const jobRun = await runJobWithTracking(
    {
      jobName: JOB_NAMES.BIRTHDAY_HALF_DAY_GRANTS,
      triggeredBy: "SYSTEM",
      dryRun,
    },
    async () => {
      const result = await grantBirthdayHalfDaysForDate({
        dryRun,
        processedDate: processedDate as DateOnly | undefined,
      });

      return {
        checkedCount: result.activeUserCount,
        createdCount: result.grantedCount,
        skippedCount: result.activeUserCount - result.grantedCount,
        resultSummary: {
          processedDate: result.processedDate,
          dryRun: result.dryRun,
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
            usableFrom: grant.usableFrom,
            usableUntil: grant.usableUntil,
          })),
        },
      };
    },
  );
  const result = jobRun.resultSummary;

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
