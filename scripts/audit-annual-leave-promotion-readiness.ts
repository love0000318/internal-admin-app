import { auditAnnualLeavePromotionReadiness } from "../src/lib/leave/annual-promotion";
import { JOB_NAMES } from "../src/lib/jobs/job-names";
import { runJobWithTracking } from "../src/lib/jobs/job-runner";
import { sanitizeJobError } from "../src/lib/jobs/sanitize";
import { loadLocalEnv } from "./env";

function readOption(name: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found?.slice(prefix.length);
}

function countIssues(
  issues: Awaited<ReturnType<typeof auditAnnualLeavePromotionReadiness>>["issues"],
) {
  return issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.code] = (counts[issue.code] ?? 0) + 1;
    return counts;
  }, {});
}

async function main() {
  loadLocalEnv();
  const year = Number(readOption("year") ?? new Date().getFullYear());
  const apply = process.argv.includes("--apply");
  let result!: Awaited<ReturnType<typeof auditAnnualLeavePromotionReadiness>>;

  await runJobWithTracking(
    {
      jobName: JOB_NAMES.AUDIT_ANNUAL_PROMOTION_READINESS,
      triggeredBy: "SYSTEM",
      dryRun: !apply,
    },
    async () => {
      result = await auditAnnualLeavePromotionReadiness({ year, apply });
      const issueCounts = countIssues(result.issues);

      return {
        status: result.issues.length > 0 ? "PARTIAL" : "SUCCESS",
        checkedCount:
          result.candidates.length + result.notices.length + result.notifications.length,
        createdCount:
          result.applied.createdScheduledNotices +
          result.applied.createdMissingNotifications,
        updatedCount:
          result.applied.repairedNotificationTexts +
          result.applied.linkedSubmittedNotices +
          result.applied.cancelledSubmittedRenotices,
        skippedCount: result.applied.skippedScheduledNotices,
        resultSummary: {
          year: result.year,
          apply: result.apply,
          candidateNoticeCount: result.candidates.length,
          noticeRecordCount: result.notices.length,
          notificationCount: result.notifications.length,
          issueCount: result.issues.length,
          issueCounts,
          applied: result.applied,
        },
      };
    },
  );

  const issueCounts = countIssues(result.issues);

  console.log("Annual leave promotion readiness audit completed.");
  console.log(`Year: ${result.year}`);
  console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`Candidate notices: ${result.candidates.length}`);
  console.log(`Notice records: ${result.notices.length}`);
  console.log(`Notifications: ${result.notifications.length}`);
  console.log(`Issues: ${result.issues.length}`);
  console.log(`Issue counts: ${JSON.stringify(issueCounts)}`);

  if (apply) {
    console.log(`Applied: ${JSON.stringify(result.applied)}`);
  } else {
    for (const issue of result.issues.slice(0, 50)) {
      console.log(
        `[dry-run] ${issue.code} user=${issue.userId ?? "-"} notice=${
          issue.noticeId ?? "-"
        } notification=${issue.notificationId ?? "-"} type=${
          issue.noticeType ?? "-"
        } scheduled=${issue.scheduledDate ?? "-"}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(sanitizeJobError(error));
  process.exit(1);
});
