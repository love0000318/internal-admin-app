import { JOB_NAMES } from "@/lib/jobs/job-names";
import { runJobWithTracking } from "@/lib/jobs/job-runner";
import { autoConfirmPendingLeaveRequestsForDate } from "@/lib/leave/auto-confirm";
import { todayInSeoul } from "@/lib/leave/calculate-business-days";
import type { DateOnly } from "@/lib/leave/types";
import { loadLocalEnv } from "./env";

function parseArgs(argv: string[]) {
  const args = {
    date: todayInSeoul(),
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (arg.startsWith("--date=")) {
      args.date = arg.slice("--date=".length) as DateOnly;
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error("Invalid --date. Use YYYY-MM-DD.");
  }

  return args;
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const jobRun = await runJobWithTracking(
    {
      jobName: JOB_NAMES.AUTO_CONFIRM_PAST_START_LEAVES,
      triggeredBy: "SYSTEM",
      dryRun: args.dryRun,
    },
    async () => {
      const result = await autoConfirmPendingLeaveRequestsForDate({
        date: args.date,
        dryRun: args.dryRun,
      });

      return {
        status: result.failedCount > 0 ? "PARTIAL" : "SUCCESS",
        checkedCount: result.checkedCount,
        createdCount: result.autoConfirmedCount,
        skippedCount: result.skippedCount,
        failedCount: result.failedCount,
        resultSummary: {
          date: args.date,
          dryRun: args.dryRun,
          autoConfirmedCount: result.autoConfirmedCount,
          skippedReasons: result.skippedReasons,
          failedCount: result.failedCount,
        },
      };
    },
  );

  console.log("Auto confirm past-start leaves completed.");
  console.log(`Date: ${args.date}`);
  console.log(`Dry run: ${args.dryRun ? "yes" : "no"}`);
  console.log(`Checked: ${jobRun.checkedCount ?? 0}`);
  console.log(`Auto confirmed: ${jobRun.createdCount ?? 0}`);
  console.log(`Skipped: ${jobRun.skippedCount ?? 0}`);
  console.log(`Failed: ${jobRun.failedCount ?? 0}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
