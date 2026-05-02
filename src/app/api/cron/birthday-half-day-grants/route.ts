import { NextResponse } from "next/server";

import { assertCronRequestAuthorized } from "@/lib/jobs/cron";
import { JOB_NAMES } from "@/lib/jobs/job-names";
import { runJobWithTracking } from "@/lib/jobs/job-runner";
import { grantBirthdayHalfDaysForDate } from "@/lib/leave/birthday-half-day";
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
  const processedDate = (url.searchParams.get("date") ?? todayInSeoul()) as DateOnly;
  const dryRun = url.searchParams.get("dryRun") === "true";

  const jobRun = await runJobWithTracking(
    {
      jobName: JOB_NAMES.BIRTHDAY_HALF_DAY_GRANTS,
      triggeredBy: "CRON",
      dryRun,
    },
    async () => {
      const result = await grantBirthdayHalfDaysForDate({
        processedDate,
        dryRun,
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
        },
      };
    },
  );

  return NextResponse.json({
    ok: true,
    date: processedDate,
    dryRun,
    checkedCount: jobRun.checkedCount ?? 0,
    grantedCount: jobRun.createdCount ?? 0,
    skippedCount: jobRun.skippedCount ?? 0,
  });
}

export const GET = POST;
