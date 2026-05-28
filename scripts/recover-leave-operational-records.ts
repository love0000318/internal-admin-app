import { getPrisma } from "@/lib/db/prisma";
import { runJobWithTracking } from "@/lib/jobs/job-runner";
import { runLeaveOperationalRecovery } from "@/lib/leave/operational-recovery";
import { loadLocalEnv } from "./env";

function parseArgs(argv: string[]) {
  const args = {
    apply: false,
    notificationScanLimit: 1000,
  };

  for (const arg of argv) {
    if (arg === "--apply") {
      args.apply = true;
      continue;
    }

    if (arg.startsWith("--notification-scan-limit=")) {
      const value = Number(arg.slice("--notification-scan-limit=".length));

      if (!Number.isInteger(value) || value < 1) {
        throw new Error("Invalid --notification-scan-limit. Use a positive integer.");
      }

      args.notificationScanLimit = value;
    }
  }

  return args;
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const dryRun = !args.apply;
  const prisma = getPrisma();
  let reportSummary: Record<string, unknown> = {};
  const jobRun = await runJobWithTracking(
    {
      jobName: "leave-operational-recovery",
      triggeredBy: "SYSTEM",
      dryRun,
    },
    async () => {
      const report = await runLeaveOperationalRecovery({
        prisma,
        dryRun,
        notificationScanLimit: args.notificationScanLimit,
      });

      reportSummary = {
        dryRun: report.dryRun,
        checked: report.checked,
        missingApprovalNotifications: report.missingApprovalNotifications.length,
        missingRequesterNotifications: report.missingRequesterNotifications.length,
        autoApprovalCandidates: report.autoApprovalCandidates.length,
        calendarEligibleApprovedLeaveRequests:
          report.calendarEligibleApprovedLeaveRequestIds.length,
        koreanNotificationRepairs: report.koreanNotificationRepairs.length,
        applied: report.applied,
        skipped: report.skipped,
        leaveRequestIds: {
          missingApprovalNotifications: [
            ...new Set(report.missingApprovalNotifications.map((item) => item.leaveRequestId)),
          ],
          missingRequesterNotifications: report.missingRequesterNotifications.map(
            (item) => item.leaveRequestId,
          ),
          autoApprovalCandidates: report.autoApprovalCandidates.map(
            (item) => item.leaveRequestId,
          ),
          koreanNotificationRepairs: report.koreanNotificationRepairs.map(
            (item) => item.leaveRequestId,
          ),
        },
      };

      return {
        status:
          report.skipped.autoApprovalRequestIds.length > 0 ? ("PARTIAL" as const) : ("SUCCESS" as const),
        checkedCount:
          report.checked.pendingLeaveRequests +
          report.checked.approvedLeaveRequests +
          report.checked.leaveNotifications,
        createdCount:
          report.applied.approvalNotificationsCreated +
          report.applied.requesterNotificationsCreated +
          report.applied.autoApprovedRequests,
        updatedCount: report.applied.koreanNotificationsUpdated,
        skippedCount: report.skipped.autoApprovalRequestIds.length,
        failedCount: 0,
        resultSummary: reportSummary,
      };
    },
  );

  console.log("Leave operational recovery completed.");
  console.log(`Mode: ${dryRun ? "dry-run" : "apply"}`);
  console.log(`JobRun ID: ${jobRun.id}`);
  console.log(JSON.stringify(reportSummary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Leave operational recovery failed.");
  process.exitCode = 1;
});

