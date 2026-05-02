"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { JOB_NAMES, isManualJobName } from "@/lib/jobs/job-names";
import { runJobWithTracking } from "@/lib/jobs/job-runner";
import { autoConfirmPendingLeaveRequestsForDate } from "@/lib/leave/auto-confirm";
import { requireOwner } from "@/lib/rbac/server-guards";

export async function runManualJob(formData: FormData) {
  const actor = await requireOwner();
  const jobName = formData.get("jobName");
  const dryRun = formData.get("dryRun") !== "false";

  if (typeof jobName !== "string" || !isManualJobName(jobName)) {
    redirect("/admin/jobs?error=invalid-job");
  }

  if (!dryRun) {
    redirect("/admin/jobs?error=unsafe-job");
  }

  await getPrisma().auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "JOB_RUN_MANUALLY_TRIGGERED",
      targetType: "JOB_RUN",
      targetId: jobName,
      metadata: {
        jobName,
        dryRun,
      } satisfies Prisma.JsonObject,
    },
  });

  const jobRun = await runJobWithTracking(
    {
      jobName,
      triggeredBy: "MANUAL",
      triggeredByUserId: actor.id,
      dryRun,
    },
    () => runSupportedDryRun(jobName),
  );

  revalidatePath("/admin/jobs");
  redirect(`/admin/jobs/${jobRun.id}`);
}

async function runSupportedDryRun(jobName: string) {
  const prisma = getPrisma();

  if (jobName === JOB_NAMES.LEAVE_LEDGER_VALIDATE) {
    const [users, ledgers, grants] = await Promise.all([
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.leaveLedger.count(),
      prisma.leaveGrant.count(),
    ]);

    return {
      status: "SUCCESS" as const,
      checkedCount: users + ledgers + grants,
      resultSummary: {
        usersChecked: users,
        ledgerEntriesChecked: ledgers,
        grantsChecked: grants,
        note: "상세 정합성 검증은 CLI leave:ledger:validate에서 수행합니다.",
      },
    };
  }

  if (jobName === JOB_NAMES.SCHEDULE_ANNUAL_PROMOTION_NOTICES) {
    const [activeUsers, scheduledNotices] = await Promise.all([
      prisma.user.count({ where: { status: "ACTIVE", role: { not: "EXTERNAL_PARTNER" } } }),
      prisma.annualLeavePromotionNotice.count({ where: { status: "SCHEDULED" } }),
    ]);

    return {
      status: "SUCCESS" as const,
      checkedCount: activeUsers,
      skippedCount: scheduledNotices,
      resultSummary: {
        activeUsers,
        existingScheduledNotices: scheduledNotices,
        dryRun: true,
      },
    };
  }

  if (jobName === JOB_NAMES.EXPIRE_ANNUAL_LEAVES) {
    const pendingExpirationCandidates = await prisma.leaveLedger.count({
      where: {
        eventType: { in: ["GRANTED", "ADJUSTED"] },
        expiresAt: { lt: new Date() },
      },
    });

    return {
      status: "SUCCESS" as const,
      checkedCount: pendingExpirationCandidates,
      resultSummary: {
        expiredGrantOrAdjustmentLedgerEntries: pendingExpirationCandidates,
        dryRun: true,
      },
    };
  }

  if (
    jobName === JOB_NAMES.AUTO_CONFIRM_PAST_START_LEAVES ||
    jobName === JOB_NAMES.AUTO_CONFIRM_PENDING_LEAVES
  ) {
    const result = await autoConfirmPendingLeaveRequestsForDate({ dryRun: true, prisma });

    return {
      status: result.failedCount > 0 ? ("PARTIAL" as const) : ("SUCCESS" as const),
      checkedCount: result.checkedCount,
      createdCount: result.autoConfirmedCount,
      skippedCount: result.skippedCount,
      failedCount: result.failedCount,
      resultSummary: {
        autoConfirmCandidates: result.autoConfirmedCount,
        skippedReasons: result.skippedReasons,
        dryRun: true,
      },
    };
  }

  if (jobName === JOB_NAMES.BIRTHDAY_HALF_DAY_GRANTS) {
    const [usersWithBirthDate, birthdayGrants] = await Promise.all([
      prisma.user.count({ where: { status: "ACTIVE", birthDate: { not: null } } }),
      prisma.leaveGrant.count({ where: { source: "BIRTHDAY_AUTO" } }),
    ]);

    return {
      status: "SUCCESS" as const,
      checkedCount: usersWithBirthDate,
      skippedCount: birthdayGrants,
      resultSummary: {
        activeUsersWithBirthDate: usersWithBirthDate,
        existingBirthdayGrants: birthdayGrants,
        dryRun: true,
      },
    };
  }

  if (jobName === JOB_NAMES.ATTACHMENTS_CHECK) {
    const [attachments, missingFileKey, deleted] = await Promise.all([
      prisma.leaveAttachment.count(),
      prisma.leaveAttachment.count({ where: { fileKey: null, deletedAt: null } }),
      prisma.leaveAttachment.count({ where: { deletedAt: { not: null } } }),
    ]);

    return {
      status: "SUCCESS" as const,
      checkedCount: attachments,
      skippedCount: deleted,
      resultSummary: {
        attachments,
        recordsWithoutFileKey: missingFileKey,
        deletedRecords: deleted,
        note: "private path는 화면과 JobRun summary에 저장하지 않습니다.",
      },
    };
  }

  throw new Error("Unsupported manual job");
}
