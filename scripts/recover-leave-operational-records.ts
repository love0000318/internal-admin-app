import { getPrisma } from "@/lib/db/prisma";
import { todayInSeoul } from "@/lib/leave/calculate-business-days";
import { runJobWithTracking } from "@/lib/jobs/job-runner";
import {
  normalizeLeaveOperationalRecoveryDateWindow,
  runLeaveOperationalRecovery,
} from "@/lib/leave/operational-recovery";
import type { DateOnly } from "@/lib/leave/types";
import { loadLocalEnv } from "./env";

function addDateOnlyDays(value: DateOnly, days: number): DateOnly {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10) as DateOnly;
}

function parseArgs(argv: string[]) {
  const args = {
    apply: false,
    all: false,
    fromDate: null as string | null,
    toDate: null as string | null,
    notificationScanLimit: 1000,
  };

  for (const arg of argv) {
    if (arg === "--apply") {
      args.apply = true;
      continue;
    }

    if (arg === "--all") {
      args.all = true;
      continue;
    }

    if (arg.startsWith("--from-date=")) {
      args.fromDate = arg.slice("--from-date=".length);
      continue;
    }

    if (arg.startsWith("--to-date=")) {
      args.toDate = arg.slice("--to-date=".length);
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

  if (args.all && (args.fromDate || args.toDate)) {
    throw new Error("Use either --all or --from-date/--to-date, not both.");
  }

  if (!args.all && !args.fromDate && !args.toDate) {
    const today = todayInSeoul();
    args.fromDate = addDateOnlyDays(today, -1);
    args.toDate = today;
  }

  normalizeLeaveOperationalRecoveryDateWindow({
    fromDate: args.fromDate,
    toDate: args.toDate,
  });

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
        fromDate: args.all ? null : (args.fromDate as DateOnly | null),
        toDate: args.all ? null : (args.toDate as DateOnly | null),
      });

      reportSummary = {
        dryRun: report.dryRun,
        window: report.window,
        checked: report.checked,
        missingApprovalNotifications: report.missingApprovalNotifications.length,
        missingRequesterNotifications: report.missingRequesterNotifications.length,
        notificationLinkRepairs: report.notificationLinkRepairs.length,
        autoApprovalCandidates: report.autoApprovalCandidates.length,
        requestableGrantOptionIssues: report.requestableGrantOptionIssues.length,
        birthdayGrantOptionIssues: report.birthdayGrantOptionIssues.length,
        birthdayAnnualDeductionRepairs:
          report.birthdayAnnualDeductionRepairs.length,
        calendarVisibilityIssues: report.calendarVisibilityIssues.length,
        calendarEligibleApprovedLeaveRequests:
          report.calendarEligibleApprovedLeaveRequestIds.length,
        koreanNotificationRepairs: report.koreanNotificationRepairs.length,
        birthdayAnnualDeductionRepairDetails:
          report.birthdayAnnualDeductionRepairs.map((item) => ({
            userId: item.userId,
            leaveRequestId: item.leaveRequestId,
            leaveRequestStatus: item.leaveRequestStatus,
            fiscalYear: item.fiscalYear,
            amount: item.amount,
            repairEventType: item.repairEventType,
            annualLedgerIds: item.annualLedgerIds,
            annualLedgerSources: item.annualLedgerSources,
            birthdayGrantIds: item.birthdayGrantIds,
            leaveTypeCode: item.leaveTypeCode,
            startDate: item.startDate,
            endDate: item.endDate,
            leaveBalanceRepairPossible: item.leaveBalance?.repairPossible ?? false,
          })),
        applied: report.applied,
        skipped: report.skipped,
        leaveRequestIds: {
          missingApprovalNotifications: [
            ...new Set(report.missingApprovalNotifications.map((item) => item.leaveRequestId)),
          ],
          missingRequesterNotifications: report.missingRequesterNotifications.map(
            (item) => item.leaveRequestId,
          ),
          notificationLinkRepairs: report.notificationLinkRepairs.map(
            (item) => item.leaveRequestId,
          ),
          requestableGrantOptionIssues: report.requestableGrantOptionIssues.map(
            (item) => item.leaveGrantId,
          ),
          birthdayGrantOptionIssues: report.birthdayGrantOptionIssues.map(
            (item) => item.leaveGrantId,
          ),
          birthdayAnnualDeductionRepairs:
            report.birthdayAnnualDeductionRepairs.map(
              (item) => item.leaveRequestId,
            ),
          calendarVisibilityIssues: report.calendarVisibilityIssues.map(
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
        updatedCount:
          report.applied.notificationLinksUpdated +
          report.applied.koreanNotificationsUpdated +
          report.applied.birthdayAnnualDeductionLedgersReclassified +
          report.applied.birthdayAnnualLeaveBalancesUpdated,
        skippedCount:
          report.skipped.autoApprovalRequestIds.length +
          report.skipped.birthdayAnnualDeductionAlreadyRecovered,
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

