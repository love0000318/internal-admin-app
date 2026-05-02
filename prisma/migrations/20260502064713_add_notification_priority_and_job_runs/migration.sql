-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "JobTriggeredBy" AS ENUM ('SYSTEM', 'MANUAL', 'CRON');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'JOB_RUN_STARTED';
ALTER TYPE "AuditAction" ADD VALUE 'JOB_RUN_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE 'JOB_RUN_FAILED';
ALTER TYPE "AuditAction" ADD VALUE 'JOB_RUN_MANUALLY_TRIGGERED';
ALTER TYPE "AuditAction" ADD VALUE 'CRON_JOB_TRIGGERED';
ALTER TYPE "AuditAction" ADD VALUE 'NOTIFICATION_MARKED_READ';
ALTER TYPE "AuditAction" ADD VALUE 'ALL_NOTIFICATIONS_MARKED_READ';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditTargetType" ADD VALUE 'JOB_RUN';
ALTER TYPE "AuditTargetType" ADD VALUE 'NOTIFICATION';

-- AlterEnum
ALTER TYPE "JobRunStatus" ADD VALUE 'RUNNING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'LEAVE_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'HR_PROFILE_CONFIRMATION_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE 'HR_PROFILE_CHANGE_REQUEST_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'HR_PROFILE_CHANGE_REQUEST_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'HR_PROFILE_CHANGE_REQUEST_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'INVITATION_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'ONBOARDING_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'REPORT_EXPORTED';
ALTER TYPE "NotificationType" ADD VALUE 'JOB_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'JOB_FAILED';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" "JobRunStatus" NOT NULL DEFAULT 'RUNNING',
    "triggeredBy" "JobTriggeredBy" NOT NULL,
    "triggeredByUserId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "checkedCount" INTEGER,
    "createdCount" INTEGER,
    "updatedCount" INTEGER,
    "skippedCount" INTEGER,
    "failedCount" INTEGER,
    "resultSummary" JSONB,
    "errorSummary" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobRun_jobName_idx" ON "JobRun"("jobName");

-- CreateIndex
CREATE INDEX "JobRun_status_idx" ON "JobRun"("status");

-- CreateIndex
CREATE INDEX "JobRun_triggeredBy_idx" ON "JobRun"("triggeredBy");

-- CreateIndex
CREATE INDEX "JobRun_startedAt_idx" ON "JobRun"("startedAt");

-- CreateIndex
CREATE INDEX "Notification_priority_idx" ON "Notification"("priority");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
