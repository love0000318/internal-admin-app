ALTER TYPE "AnnualLeavePromotionNoticeType" ADD VALUE IF NOT EXISTS 'ANNUAL_SECOND_NOTICE';

ALTER TABLE "AnnualLeavePromotionNotice"
ADD COLUMN IF NOT EXISTS "policyVersion" TEXT,
ADD COLUMN IF NOT EXISTS "legalBasis" TEXT,
ADD COLUMN IF NOT EXISTS "noticeContent" JSONB,
ADD COLUMN IF NOT EXISTS "availableFrom" DATE,
ADD COLUMN IF NOT EXISTS "availableUntil" DATE,
ADD COLUMN IF NOT EXISTS "submissionDeadline" DATE,
ADD COLUMN IF NOT EXISTS "displayedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "isRenotice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "adminConfirmedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "adminConfirmedByUserId" TEXT,
ADD COLUMN IF NOT EXISTS "notificationId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "AnnualLeavePromotionNotice_notificationId_key"
ON "AnnualLeavePromotionNotice"("notificationId");

CREATE INDEX IF NOT EXISTS "AnnualLeavePromotionNotice_readAt_idx"
ON "AnnualLeavePromotionNotice"("readAt");

CREATE INDEX IF NOT EXISTS "AnnualLeavePromotionNotice_submittedAt_idx"
ON "AnnualLeavePromotionNotice"("submittedAt");

CREATE INDEX IF NOT EXISTS "AnnualLeavePromotionNotice_adminConfirmedAt_idx"
ON "AnnualLeavePromotionNotice"("adminConfirmedAt");
