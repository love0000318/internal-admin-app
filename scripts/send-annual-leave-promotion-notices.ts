import { sendDueAnnualLeavePromotionNotices } from "../src/lib/leave/annual-promotion";
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
  const result = await sendDueAnnualLeavePromotionNotices({ date });

  console.log("Annual leave promotion notices sent.");
  console.log(`Date: ${date}`);
  console.log(`Due notices checked: ${result.checked}`);
  console.log(`Notifications sent: ${result.sent}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
