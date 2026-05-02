import { scheduleAnnualLeavePromotionNotices } from "../src/lib/leave/annual-promotion";
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
  const year = Number(readOption("year") ?? new Date().getFullYear());
  const dryRun = process.argv.includes("--dry-run");
  let result!: Awaited<ReturnType<typeof scheduleAnnualLeavePromotionNotices>>;

  await runJobWithTracking(
    {
      jobName: JOB_NAMES.SCHEDULE_ANNUAL_PROMOTION_NOTICES,
      triggeredBy: "SYSTEM",
      dryRun,
    },
    async () => {
      result = await scheduleAnnualLeavePromotionNotices({ year, dryRun });

      return {
        checkedCount: result.candidates.length,
        createdCount: result.created,
        skippedCount: result.skipped,
        resultSummary: {
          year: result.year,
          candidates: result.candidates.length,
          created: result.created,
          skipped: result.skipped,
        },
      };
    },
  );

  console.log("Annual leave promotion notices scheduled.");
  console.log(`Year: ${result.year}`);
  console.log(`Candidates: ${result.candidates.length}`);
  console.log(`Created: ${result.created}`);
  console.log(`Skipped: ${result.skipped}`);

  if (dryRun) {
    for (const candidate of result.candidates) {
      console.log(
        `[dry-run] ${candidate.name} ${candidate.noticeType} ${candidate.scheduledDate} remaining=${candidate.remainingAmount}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
