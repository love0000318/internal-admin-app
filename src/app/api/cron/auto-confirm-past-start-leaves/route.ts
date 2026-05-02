import { NextResponse } from "next/server";

import { assertCronRequestAuthorized } from "@/lib/jobs/cron";
import { JOB_NAMES } from "@/lib/jobs/job-names";
import { runJobWithTracking } from "@/lib/jobs/job-runner";
import { autoConfirmPendingLeaveRequestsForDate } from "@/lib/leave/auto-confirm";
import { todayInSeoul } from "@/lib/leave/calculate-business-days";
import type { DateOnly } from "@/lib/leave/types";

export async function POST(request: Request) {
  try {
    assertCronRequestAuthorized(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "cron-unauthorized";
    return NextResponse.json({ ok: false, error: message }, { status: 401 });
  }

  const url = new URL(request.url);
  const date = (url.searchParams.get("date") ?? todayInSeoul()) as DateOnly;
  const dryRun = url.searchParams.get("dryRun") === "true";

  const jobRun = await runJobWithTracking(
    {
      jobName: JOB_NAMES.AUTO_CONFIRM_PAST_START_LEAVES,
      triggeredBy: "CRON",
      dryRun,
    },
    async () => {
      const result = await autoConfirmPendingLeaveRequestsForDate({ date, dryRun });

      return {
        status: result.failedCount > 0 ? "PARTIAL" : "SUCCESS",
        checkedCount: result.checkedCount,
        createdCount: result.autoConfirmedCount,
        skippedCount: result.skippedCount,
        failedCount: result.failedCount,
        resultSummary: {
          date,
          dryRun,
          autoConfirmedCount: result.autoConfirmedCount,
          skippedReasons: result.skippedReasons,
        },
      };
    },
  );

  return NextResponse.json({
    ok: true,
    date,
    dryRun,
    checkedCount: jobRun.checkedCount ?? 0,
    autoConfirmedCount: jobRun.createdCount ?? 0,
    skippedCount: jobRun.skippedCount ?? 0,
    failedCount: jobRun.failedCount ?? 0,
  });
}

export const GET = POST;
