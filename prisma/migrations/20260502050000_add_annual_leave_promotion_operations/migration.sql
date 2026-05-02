-- CreateEnum
CREATE TYPE "AnnualLeaveUsePlanStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobRunStatus" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL');

-- AlterEnum
ALTER TYPE "AnnualLeavePromotionNoticeStatus" ADD VALUE 'SKIPPED';

-- AlterEnum
ALTER TYPE "AnnualLeavePromotionNoticeType" ADD VALUE 'USE_PLAN_REMINDER';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'ANNUAL_LEAVE_USE_PLAN_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ANNUAL_LEAVE_USE_PLAN_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ANNUAL_LEAVE_USE_PLAN_SUBMITTED';
ALTER TYPE "AuditAction" ADD VALUE 'ANNUAL_LEAVE_USE_PLAN_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE 'ANNUAL_LEAVE_EXPIRATION_DRY_RUN';
ALTER TYPE "AuditAction" ADD VALUE 'ANNUAL_LEAVE_MAINTENANCE_RUN';

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'ANNUAL_LEAVE_USE_PLAN';
ALTER TYPE "AuditTargetType" ADD VALUE 'ANNUAL_LEAVE_EXPIRATION_RUN';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ANNUAL_LEAVE_PROMOTION';
ALTER TYPE "NotificationType" ADD VALUE 'ANNUAL_LEAVE_USE_PLAN_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'ANNUAL_LEAVE_EXPIRED';

-- DropIndex
DROP INDEX "AnnualLeavePromotionNotice_userId_referenceYear_noticeType_key";

-- AlterTable
ALTER TABLE "AnnualLeavePromotionNotice"
ADD COLUMN "annualLeaveUsePlanId" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "expirationDate" DATE,
ADD COLUMN "remainingAmount" DOUBLE PRECISION,
ADD COLUMN "unit" "LeaveGrantUnit" NOT NULL DEFAULT 'DAY';

-- CreateTable
CREATE TABLE "AnnualLeaveUsePlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "referenceYear" INTEGER NOT NULL,
    "status" "AnnualLeaveUsePlanStatus" NOT NULL DEFAULT 'DRAFT',
    "totalPlannedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" "LeaveGrantUnit" NOT NULL DEFAULT 'DAY',
    "submittedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnnualLeaveUsePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnualLeaveUsePlanItem" (
    "id" TEXT NOT NULL,
    "usePlanId" TEXT NOT NULL,
    "plannedDate" DATE NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "unit" "LeaveGrantUnit" NOT NULL DEFAULT 'DAY',
    "halfDayPeriod" "HalfDayPeriod",
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AnnualLeaveUsePlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnualLeaveExpirationRun" (
    "id" TEXT NOT NULL,
    "processedDate" DATE NOT NULL,
    "processedBy" TEXT,
    "status" "JobRunStatus" NOT NULL,
    "checkedCount" INTEGER NOT NULL DEFAULT 0,
    "expiredCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnnualLeaveExpirationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnnualLeaveUsePlan_userId_idx" ON "AnnualLeaveUsePlan"("userId");
CREATE INDEX "AnnualLeaveUsePlan_referenceYear_idx" ON "AnnualLeaveUsePlan"("referenceYear");
CREATE INDEX "AnnualLeaveUsePlan_status_idx" ON "AnnualLeaveUsePlan"("status");
CREATE UNIQUE INDEX "AnnualLeaveUsePlan_userId_referenceYear_key" ON "AnnualLeaveUsePlan"("userId", "referenceYear");
CREATE INDEX "AnnualLeaveUsePlanItem_usePlanId_idx" ON "AnnualLeaveUsePlanItem"("usePlanId");
CREATE INDEX "AnnualLeaveUsePlanItem_plannedDate_idx" ON "AnnualLeaveUsePlanItem"("plannedDate");
CREATE UNIQUE INDEX "AnnualLeaveUsePlanItem_usePlanId_plannedDate_halfDayPeriod_key" ON "AnnualLeaveUsePlanItem"("usePlanId", "plannedDate", "halfDayPeriod");
CREATE INDEX "AnnualLeaveExpirationRun_processedDate_idx" ON "AnnualLeaveExpirationRun"("processedDate");
CREATE INDEX "AnnualLeaveExpirationRun_status_idx" ON "AnnualLeaveExpirationRun"("status");
CREATE INDEX "AnnualLeavePromotionNotice_noticeType_idx" ON "AnnualLeavePromotionNotice"("noticeType");
CREATE INDEX "AnnualLeavePromotionNotice_status_idx" ON "AnnualLeavePromotionNotice"("status");
CREATE INDEX "AnnualLeavePromotionNotice_annualLeaveUsePlanId_idx" ON "AnnualLeavePromotionNotice"("annualLeaveUsePlanId");
CREATE UNIQUE INDEX "AnnualLeavePromotionNotice_userId_referenceYear_noticeType_scheduledDate_key" ON "AnnualLeavePromotionNotice"("userId", "referenceYear", "noticeType", "scheduledDate");

-- AddForeignKey
ALTER TABLE "AnnualLeavePromotionNotice" ADD CONSTRAINT "AnnualLeavePromotionNotice_annualLeaveUsePlanId_fkey" FOREIGN KEY ("annualLeaveUsePlanId") REFERENCES "AnnualLeaveUsePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnnualLeaveUsePlan" ADD CONSTRAINT "AnnualLeaveUsePlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnnualLeaveUsePlanItem" ADD CONSTRAINT "AnnualLeaveUsePlanItem_usePlanId_fkey" FOREIGN KEY ("usePlanId") REFERENCES "AnnualLeaveUsePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
