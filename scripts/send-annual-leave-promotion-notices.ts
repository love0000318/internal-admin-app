import { sendDueAnnualLeavePromotionNotices } from "../src/lib/leave/annual-promotion";
import { JOB_NAMES } from "../src/lib/jobs/job-names";
import { runJobWithTracking } from "../src/lib/jobs/job-runner";
import { todayInSeoul } from "../src/lib/leave/calculate-business-days";
import type { DateOnly } from "../src/lib/leave/types";
import { loadLocalEnv } from "./env";

function readOption(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found?.slice(prefix.length);
}

async function main() {
  loadLocalEnv();
  const date = (readOption("date") ?? todayInSeoul()) as DateOnly;
  let result!: Awaited<ReturnType<typeof sendDueAnnualLeavePromotionNotices>>;

  await runJobWithTracking(
    {
      jobName: JOB_NAMES.SEND_ANNUAL_PROMOTION_NOTICES,
      triggeredBy: "SYSTEM",
      dryRun: false,
    },
    async () => {
      result = await sendDueAnnualLeavePromotionNotices({ date });

      return {
        checkedCount: result.checked,
        createdCount: result.sent,
        skippedCount: result.skipped,
        resultSummary: {
          date,
          checked: result.checked,
          sent: result.sent,
          skipped: result.skipped,
        },
      };
    },
  );

  console.log("Annual leave promotion notices sent.");
  console.log(`Date: ${date}`);
  console.log(`Due notices checked: ${result.checked}`);
  console.log(`Notifications sent: ${result.sent}`);
  console.log(`Skipped: ${result.skipped}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
