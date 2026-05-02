import { existsSync, readFileSync } from "node:fs";

import { JOB_NAMES } from "../src/lib/jobs/job-names";
import { runJobWithTracking } from "../src/lib/jobs/job-runner";
import { grantBirthdayHalfDaysForDate } from "../src/lib/leave/birthday-half-day";

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
  const jobRun = await runJobWithTracking(
    {
      jobName: JOB_NAMES.BIRTHDAY_HALF_DAY_GRANTS,
      triggeredBy: "SYSTEM",
      dryRun,
    },
    async () => {
      const result = await grantBirthdayHalfDaysForDate();

      return {
        checkedCount: result.grantedCount + result.skippedCount,
        createdCount: result.grantedCount,
        skippedCount: result.skippedCount,
        resultSummary: {
          processedDate: result.processedDate,
          grantedCount: result.grantedCount,
          skippedCount: result.skippedCount,
          disabled: result.disabled,
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
