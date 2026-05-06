import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export const CLEANUP_TARGETS = [
  "sessions",
  "invitations",
  "verification-codes",
  "notifications",
  "job-runs",
  "imports",
  "files",
] as const;

export type CleanupTarget = (typeof CLEANUP_TARGETS)[number];

export type CleanupOnly = CleanupTarget | "all";

export type CleanupMode = "dry-run" | "apply";

export type CleanupOptions = {
  mode: CleanupMode;
  only: CleanupOnly;
  olderThanDays?: number;
  limit: number;
  verbose: boolean;
  now?: Date;
};

export type CleanupPlanItem = {
  target: CleanupTarget;
  retentionDays: number;
  action: "delete" | "update" | "inspect-only";
  protected: boolean;
  description: string;
};

export type CleanupPlan = {
  mode: CleanupMode;
  only: CleanupOnly;
  limit: number;
  items: CleanupPlanItem[];
  protectedTables: string[];
};

export type CleanupResultItem = CleanupPlanItem & {
  candidateCount: number;
  affectedCount: number;
};

export type CleanupResult = {
  dryRun: boolean;
  applied: boolean;
  generatedAt: string;
  items: CleanupResultItem[];
  warnings: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const PROTECTED_BUSINESS_TABLES = [
  "LeaveRequest",
  "LeaveLedger",
  "LeaveGrant",
  "LeaveAdjustment",
  "AttendanceRecord",
  "AttendanceMonthlyClose",
  "AuditLog",
] as const;

const DEFAULT_RETENTION_DAYS: Record<CleanupTarget, number> = {
  sessions: 30,
  invitations: 90,
  "verification-codes": 30,
  notifications: 180,
  "job-runs": 90,
  imports: 90,
  files: 30,
};

export function isCleanupOnly(value: string): value is CleanupOnly {
  return value === "all" || CLEANUP_TARGETS.some((target) => target === value);
}

export function cutoffDate(now: Date, olderThanDays: number) {
  return new Date(now.getTime() - olderThanDays * DAY_MS);
}

export function buildCleanupPlan(options: CleanupOptions): CleanupPlan {
  const selectedTargets =
    options.only === "all"
      ? CLEANUP_TARGETS
      : CLEANUP_TARGETS.filter((target) => target === options.only);

  return {
    mode: options.mode,
    only: options.only,
    limit: options.limit,
    protectedTables: [...PROTECTED_BUSINESS_TABLES],
    items: selectedTargets.map((target) => ({
      target,
      retentionDays: options.olderThanDays ?? DEFAULT_RETENTION_DAYS[target],
      action: target === "verification-codes" ? "update" : target === "files" ? "inspect-only" : "delete",
      protected: false,
      description: describeTarget(target),
    })),
  };
}

export function assertOperationalCleanupApplyAllowed(
  options: Pick<CleanupOptions, "mode">,
  env: Record<string, string | undefined>,
) {
  if (options.mode !== "apply") {
    return;
  }

  if (env.CONFIRM_OPERATIONAL_CLEANUP !== "true") {
    throw new Error(
      "Refusing to apply cleanup without CONFIRM_OPERATIONAL_CLEANUP=true.",
    );
  }
}

function describeTarget(target: CleanupTarget) {
  switch (target) {
    case "sessions":
      return "Expired or old revoked sessions";
    case "invitations":
      return "Old terminal invitations that were not accepted";
    case "verification-codes":
      return "Consumed, revoked, or expired invitation verification code hashes";
    case "notifications":
      return "Old read LOW/NORMAL notifications";
    case "job-runs":
      return "Old successful or partial job run records";
    case "imports":
      return "Old unapplied import preview batches";
    case "files":
      return "Temporary/orphan file candidates; inspect-only in this MVP";
  }
}

function assertNoProtectedTarget(plan: CleanupPlan) {
  const protectedTargets = plan.items.filter((item) => item.protected);

  if (protectedTargets.length > 0) {
    throw new Error(
      `Protected business table cleanup is not allowed: ${protectedTargets
        .map((item) => item.target)
        .join(", ")}`,
    );
  }
}

function resultItem(
  item: CleanupPlanItem,
  candidateCount: number,
  affectedCount: number,
): CleanupResultItem {
  return { ...item, candidateCount, affectedCount };
}

export async function runOperationalCleanup(
  prisma: PrismaClient,
  options: CleanupOptions,
): Promise<CleanupResult> {
  const now = options.now ?? new Date();
  const plan = buildCleanupPlan(options);
  const warnings: string[] = [];
  const items: CleanupResultItem[] = [];

  assertNoProtectedTarget(plan);

  for (const item of plan.items) {
    const cutoff = cutoffDate(now, item.retentionDays);

    if (item.target === "sessions") {
      const where: Prisma.SessionWhereInput = {
        OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
      };
      const candidateCount = await prisma.session.count({ where });
      const ids = await prisma.session.findMany({
        where,
        select: { id: true },
        take: options.limit,
        orderBy: { expiresAt: "asc" },
      });
      const affectedCount =
        options.mode === "apply" && ids.length > 0
          ? (await prisma.session.deleteMany({ where: { id: { in: ids.map((row) => row.id) } } })).count
          : 0;
      items.push(resultItem(item, candidateCount, affectedCount));
      continue;
    }

    if (item.target === "invitations") {
      const where: Prisma.InvitationWhereInput = {
        status: { in: ["EXPIRED", "CANCELLED", "REVOKED"] },
        updatedAt: { lt: cutoff },
        acceptedUserId: null,
        acceptedAt: null,
        usedAt: null,
      };
      const candidateCount = await prisma.invitation.count({ where });
      const ids = await prisma.invitation.findMany({
        where,
        select: { id: true },
        take: options.limit,
        orderBy: { updatedAt: "asc" },
      });
      const affectedCount =
        options.mode === "apply" && ids.length > 0
          ? (await prisma.invitation.deleteMany({ where: { id: { in: ids.map((row) => row.id) } } })).count
          : 0;
      items.push(resultItem(item, candidateCount, affectedCount));
      continue;
    }

    if (item.target === "verification-codes") {
      const where: Prisma.InvitationWhereInput = {
        verificationCodeHash: { not: null },
        OR: [
          { verificationCodeConsumedAt: { lt: cutoff } },
          { verificationCodeRevokedAt: { lt: cutoff } },
          { verificationCodeExpiresAt: { lt: cutoff } },
        ],
      };
      const candidateCount = await prisma.invitation.count({ where });
      const ids = await prisma.invitation.findMany({
        where,
        select: { id: true },
        take: options.limit,
        orderBy: { updatedAt: "asc" },
      });
      const affectedCount =
        options.mode === "apply" && ids.length > 0
          ? (
              await prisma.invitation.updateMany({
                where: { id: { in: ids.map((row) => row.id) } },
                data: {
                  verificationCodeHash: null,
                  verificationCodeExpiresAt: null,
                  verificationCodeConsumedAt: null,
                  verificationCodeRevokedAt: null,
                  verificationCodeAttemptCount: 0,
                },
              })
            ).count
          : 0;
      items.push(resultItem(item, candidateCount, affectedCount));
      continue;
    }

    if (item.target === "notifications") {
      const where: Prisma.NotificationWhereInput = {
        readAt: { not: null },
        createdAt: { lt: cutoff },
        priority: { in: ["LOW", "NORMAL"] },
      };
      const candidateCount = await prisma.notification.count({ where });
      const ids = await prisma.notification.findMany({
        where,
        select: { id: true },
        take: options.limit,
        orderBy: { createdAt: "asc" },
      });
      const affectedCount =
        options.mode === "apply" && ids.length > 0
          ? (await prisma.notification.deleteMany({ where: { id: { in: ids.map((row) => row.id) } } })).count
          : 0;
      items.push(resultItem(item, candidateCount, affectedCount));
      continue;
    }

    if (item.target === "job-runs") {
      const successCutoff = cutoff;
      const failedCutoff = cutoffDate(now, Math.max(item.retentionDays, 180));
      const where: Prisma.JobRunWhereInput = {
        OR: [
          {
            status: { in: ["SUCCESS", "PARTIAL"] },
            startedAt: { lt: successCutoff },
          },
          {
            status: "FAILED",
            startedAt: { lt: failedCutoff },
          },
        ],
      };
      const candidateCount = await prisma.jobRun.count({ where });
      const ids = await prisma.jobRun.findMany({
        where,
        select: { id: true },
        take: options.limit,
        orderBy: { startedAt: "asc" },
      });
      const affectedCount =
        options.mode === "apply" && ids.length > 0
          ? (await prisma.jobRun.deleteMany({ where: { id: { in: ids.map((row) => row.id) } } })).count
          : 0;
      items.push(resultItem(item, candidateCount, affectedCount));
      continue;
    }

    if (item.target === "imports") {
      const where: Prisma.LeaveImportBatchWhereInput = {
        status: { in: ["PARSED", "VALIDATED", "FAILED", "CANCELLED"] },
        appliedAt: null,
        createdAt: { lt: cutoff },
      };
      const candidateCount = await prisma.leaveImportBatch.count({ where });
      const ids = await prisma.leaveImportBatch.findMany({
        where,
        select: { id: true },
        take: options.limit,
        orderBy: { createdAt: "asc" },
      });
      const affectedCount =
        options.mode === "apply" && ids.length > 0
          ? (await prisma.leaveImportBatch.deleteMany({ where: { id: { in: ids.map((row) => row.id) } } })).count
          : 0;
      items.push(resultItem(item, candidateCount, affectedCount));
      continue;
    }

    warnings.push("File cleanup is inspect-only; no file deletion was attempted.");
    items.push(resultItem(item, 0, 0));
  }

  return {
    dryRun: options.mode === "dry-run",
    applied: options.mode === "apply",
    generatedAt: now.toISOString(),
    items,
    warnings,
  };
}
