import { Prisma, type JobTriggeredBy } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  dispatchSlackMessage,
} from "@/lib/external-notifications/dispatch-external-notification";
import {
  isSlackNotificationsEnabled,
  shouldNotifySlackJobFailures,
} from "@/lib/external-notifications/config";
import { createNotification } from "@/lib/notifications/notifications";
import { sanitizeJobError, sanitizeJobSummary } from "@/lib/jobs/sanitize";
import { sanitizeAuditMetadata } from "@/lib/security/sanitize";

export type JobRunResult = {
  status?: "SUCCESS" | "PARTIAL";
  checkedCount?: number;
  createdCount?: number;
  updatedCount?: number;
  skippedCount?: number;
  failedCount?: number;
  resultSummary?: Record<string, unknown>;
};

export type RunJobWithTrackingParams = {
  jobName: string;
  triggeredBy: JobTriggeredBy;
  triggeredByUserId?: string | null;
  dryRun?: boolean;
};

export async function startJobRun(params: RunJobWithTrackingParams) {
  const prisma = getPrisma();
  const jobRun = await prisma.jobRun.create({
    data: {
      jobName: params.jobName,
      triggeredBy: params.triggeredBy,
      triggeredByUserId: params.triggeredByUserId ?? null,
      dryRun: params.dryRun ?? false,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: params.triggeredByUserId ?? null,
      actorUserId: params.triggeredByUserId ?? null,
      action: "JOB_RUN_STARTED",
      targetType: "JOB_RUN",
      targetId: jobRun.id,
      metadata: sanitizeAuditMetadata({
        jobRunId: jobRun.id,
        jobName: params.jobName,
        triggeredBy: params.triggeredBy,
        dryRun: params.dryRun ?? false,
      }),
    },
  });

  return jobRun;
}

export async function completeJobRun(jobRunId: string, result: JobRunResult) {
  const prisma = getPrisma();
  const jobRun = await prisma.jobRun.update({
    where: { id: jobRunId },
    data: {
      status: result.status ?? "SUCCESS",
      finishedAt: new Date(),
      checkedCount: result.checkedCount,
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      skippedCount: result.skippedCount,
      failedCount: result.failedCount,
      resultSummary: sanitizeJobSummary(result.resultSummary ?? {}) as Prisma.InputJsonValue,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: jobRun.triggeredByUserId,
      actorUserId: jobRun.triggeredByUserId,
      action: "JOB_RUN_COMPLETED",
      targetType: "JOB_RUN",
      targetId: jobRun.id,
      metadata: sanitizeAuditMetadata({
        jobRunId: jobRun.id,
        jobName: jobRun.jobName,
        status: jobRun.status,
        dryRun: jobRun.dryRun,
      }),
    },
  });

  if (jobRun.triggeredByUserId && jobRun.triggeredBy === "MANUAL") {
    await createNotification({
      userId: jobRun.triggeredByUserId,
      type: "JOB_COMPLETED",
      priority: "NORMAL",
      title: "수동 작업이 완료되었습니다.",
      message: `${jobRun.jobName} 작업이 완료되었습니다.`,
      linkUrl: `/admin/jobs/${jobRun.id}`,
      metadata: {
        deduplicationKey: `job-completed:${jobRun.id}`,
        jobRunId: jobRun.id,
        jobName: jobRun.jobName,
      },
    });
  }

  return jobRun;
}

export async function failJobRun(jobRunId: string, error: unknown) {
  const prisma = getPrisma();
  const errorSummary = sanitizeJobError(error);
  const jobRun = await prisma.jobRun.update({
    where: { id: jobRunId },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      failedCount: 1,
      errorSummary,
    },
  });
  const owners = await prisma.user.findMany({
    where: { role: "OWNER", status: "ACTIVE" },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId: jobRun.triggeredByUserId,
      actorUserId: jobRun.triggeredByUserId,
      action: "JOB_RUN_FAILED",
      targetType: "JOB_RUN",
      targetId: jobRun.id,
      metadata: sanitizeAuditMetadata({
        jobRunId: jobRun.id,
        jobName: jobRun.jobName,
        status: jobRun.status,
        dryRun: jobRun.dryRun,
        errorSummary,
      }),
    },
  });

  await Promise.all(
    owners.map((owner) =>
      createNotification({
        userId: owner.id,
        type: "JOB_FAILED",
        priority: "HIGH",
        title: "자동 작업 실행에 실패했습니다.",
        message: `${jobRun.jobName} 작업이 실패했습니다. 작업 이력을 확인해 주세요.`,
        linkUrl: `/admin/jobs/${jobRun.id}`,
        metadata: {
          deduplicationKey: `job-failed:${jobRun.id}`,
          jobRunId: jobRun.id,
          jobName: jobRun.jobName,
        },
      }),
    ),
  );

  if (isSlackNotificationsEnabled() && shouldNotifySlackJobFailures()) {
    await dispatchSlackMessage({
      type: "JOB_FAILED",
      text: [
        "[운영 알림] 자동 작업 실패",
        "",
        `작업명: ${jobRun.jobName}`,
        `상태: ${jobRun.status}`,
        `실행 방식: ${jobRun.triggeredBy}`,
        "",
        "관리자 화면에서 확인해 주세요.",
      ].join("\n"),
      context: {
        jobRunId: jobRun.id,
        jobName: jobRun.jobName,
        status: jobRun.status,
      },
    });
  }

  return jobRun;
}

export async function runJobWithTracking(
  params: RunJobWithTrackingParams,
  callback: () => Promise<JobRunResult>,
) {
  const jobRun = await startJobRun(params);

  try {
    const result = await callback();
    return completeJobRun(jobRun.id, result);
  } catch (error) {
    await failJobRun(jobRun.id, error);
    throw error;
  }
}

export async function listJobRuns(filters: {
  jobName?: string;
  status?: string;
  triggeredBy?: string;
  dryRun?: string;
}) {
  return getPrisma().jobRun.findMany({
    where: {
      ...(filters.jobName ? { jobName: filters.jobName } : {}),
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.triggeredBy ? { triggeredBy: filters.triggeredBy as never } : {}),
      ...(filters.dryRun === "true"
        ? { dryRun: true }
        : filters.dryRun === "false"
          ? { dryRun: false }
          : {}),
    },
    include: { triggeredByUser: true },
    orderBy: { startedAt: "desc" },
    take: 100,
  });
}

export async function getJobRunDetail(jobRunId: string) {
  return getPrisma().jobRun.findUnique({
    where: { id: jobRunId },
    include: { triggeredByUser: true },
  });
}
