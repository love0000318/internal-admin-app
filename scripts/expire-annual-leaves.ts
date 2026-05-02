import { expireAnnualLeaves } from "../src/lib/leave/annual-promotion";
import { todayInSeoul } from "../src/lib/leave/calculate-business-days";
import type { DateOnly } from "../src/lib/leave/types";
import { JOB_NAMES } from "../src/lib/jobs/job-names";
import { runJobWithTracking } from "../src/lib/jobs/job-runner";
import { loadLocalEnv } from "./env";

function readOption(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found?.slice(prefix.length);
}

async function main() {
  loadLocalEnv();
  const date = (readOption("date") ?? todayInSeoul()) as DateOnly;
  const dryRun = process.argv.includes("--dry-run");
  let result!: Awaited<ReturnType<typeof expireAnnualLeaves>>;

  await runJobWithTracking(
    {
      jobName: JOB_NAMES.EXPIRE_ANNUAL_LEAVES,
      triggeredBy: "SYSTEM",
      dryRun,
    },
    async () => {
      result = await expireAnnualLeaves({ date, dryRun });

      return {
        checkedCount: result.checked,
        createdCount: result.expired,
        skippedCount: result.skipped,
        resultSummary: {
          date,
          expirationDate: result.expirationDate,
          checked: result.checked,
          expired: result.expired,
          skipped: result.skipped,
        },
      };
    },
  );

  console.log(dryRun ? "Annual leave expiration dry-run completed." : "Annual leave expiration completed.");
  console.log(`Date: ${date}`);
  console.log(`Expiration date: ${result.expirationDate ?? "not applicable"}`);
  console.log(`Checked: ${result.checked}`);
  console.log(`Expired: ${result.expired}`);
  console.log(`Skipped: ${result.skipped}`);

  if (dryRun) {
    for (const target of result.targets) {
      console.log(
        `[dry-run] ${target.name} ${target.email} expire=${target.remainingAmount}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
