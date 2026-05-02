-- CreateEnum
CREATE TYPE "AnnualGrantBasis" AS ENUM ('HIRE_DATE', 'FISCAL_YEAR');

-- CreateEnum
CREATE TYPE "AnnualLeaveUsageUnit" AS ENUM ('DAY', 'HALF_DAY', 'HOUR');

-- CreateEnum
CREATE TYPE "MonthlyLeaveGrantRule" AS ENUM ('MONTHLY_FULL_ATTENDANCE', 'FRONTLOAD_ON_HIRE', 'DISABLED');

-- CreateEnum
CREATE TYPE "FirstFiscalYearGrantRule" AS ENUM ('NEEDS_CONFIRMATION', 'PRORATED_BY_HIRE_DATE', 'GRANT_REMAINING_MONTHS', 'COMPANY_CUSTOM');

-- CreateEnum
CREATE TYPE "AnnualLeavePromotionNoticeType" AS ENUM ('ANNUAL_USE_PLAN_REQUEST', 'MONTHLY_FIRST_NOTICE', 'MONTHLY_SECOND_NOTICE');

-- CreateEnum
CREATE TYPE "AnnualLeavePromotionNoticeStatus" AS ENUM ('SCHEDULED', 'SENT', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ANNUAL_LEAVE_POLICY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ANNUAL_LEAVE_GRANTED';
ALTER TYPE "AuditAction" ADD VALUE 'MONTHLY_LEAVE_GRANTED';
ALTER TYPE "AuditAction" ADD VALUE 'ANNUAL_LEAVE_EXPIRED';
ALTER TYPE "AuditAction" ADD VALUE 'ANNUAL_LEAVE_PROMOTION_NOTICE_SCHEDULED';
ALTER TYPE "AuditAction" ADD VALUE 'ANNUAL_LEAVE_PROMOTION_NOTICE_SENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditTargetType" ADD VALUE 'ANNUAL_LEAVE_POLICY';
ALTER TYPE "AuditTargetType" ADD VALUE 'ANNUAL_LEAVE_PROMOTION_NOTICE';

-- CreateTable
CREATE TABLE "AnnualLeavePolicy" (
    "id" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "grantBasis" "AnnualGrantBasis" NOT NULL DEFAULT 'FISCAL_YEAR',
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "fiscalYearStartDay" INTEGER NOT NULL DEFAULT 1,
    "usageUnit" "AnnualLeaveUsageUnit" NOT NULL DEFAULT 'HALF_DAY',
    "allowAdvanceUse" BOOLEAN NOT NULL DEFAULT false,
    "approvalOnRequest" BOOLEAN NOT NULL DEFAULT true,
    "approvalOnCancel" BOOLEAN NOT NULL DEFAULT false,
    "monthlyLeaveEnabled" BOOLEAN NOT NULL DEFAULT true,
    "monthlyLeaveAmount" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "monthlyLeaveGrantRule" "MonthlyLeaveGrantRule" NOT NULL DEFAULT 'MONTHLY_FULL_ATTENDANCE',
    "firstFiscalYearGrantRule" "FirstFiscalYearGrantRule" NOT NULL DEFAULT 'NEEDS_CONFIRMATION',
    "annualLeaveEnabled" BOOLEAN NOT NULL DEFAULT true,
    "baseAnnualDays" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "maxAnnualDays" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "additionalGrantEnabled" BOOLEAN NOT NULL DEFAULT true,
    "expirationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "annualExpirationMonths" INTEGER NOT NULL DEFAULT 12,
    "monthlyExpirationMonths" INTEGER NOT NULL DEFAULT 12,
    "carryOverAllowed" BOOLEAN NOT NULL DEFAULT false,
    "promotionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "promotionApproverUserId" TEXT,
    "memberReminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "managerReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "usePlanReminderDaysBefore" INTEGER NOT NULL DEFAULT 10,
    "annualPromotionMonthsBeforeExpiration" INTEGER NOT NULL DEFAULT 6,
    "monthlyPromotionFirstMonthsBeforeExpiration" INTEGER NOT NULL DEFAULT 3,
    "monthlyPromotionSecondMonthsBeforeExpiration" INTEGER NOT NULL DEFAULT 1,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnualLeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnualLeavePromotionNotice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "referenceYear" INTEGER NOT NULL,
    "noticeType" "AnnualLeavePromotionNoticeType" NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "AnnualLeavePromotionNoticeStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnualLeavePromotionNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnnualLeavePolicy_isEnabled_idx" ON "AnnualLeavePolicy"("isEnabled");

-- CreateIndex
CREATE INDEX "AnnualLeavePolicy_promotionApproverUserId_idx" ON "AnnualLeavePolicy"("promotionApproverUserId");

-- CreateIndex
CREATE INDEX "AnnualLeavePromotionNotice_userId_idx" ON "AnnualLeavePromotionNotice"("userId");

-- CreateIndex
CREATE INDEX "AnnualLeavePromotionNotice_referenceYear_idx" ON "AnnualLeavePromotionNotice"("referenceYear");

-- CreateIndex
CREATE INDEX "AnnualLeavePromotionNotice_scheduledDate_idx" ON "AnnualLeavePromotionNotice"("scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualLeavePromotionNotice_userId_referenceYear_noticeType_key" ON "AnnualLeavePromotionNotice"("userId", "referenceYear", "noticeType");

-- AddForeignKey
ALTER TABLE "AnnualLeavePolicy" ADD CONSTRAINT "AnnualLeavePolicy_promotionApproverUserId_fkey" FOREIGN KEY ("promotionApproverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualLeavePromotionNotice" ADD CONSTRAINT "AnnualLeavePromotionNotice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
