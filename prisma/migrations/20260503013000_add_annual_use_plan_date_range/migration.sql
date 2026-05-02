-- Add date-range based annual leave use plan fields while preserving
-- the legacy plannedDate/amount columns for existing submitted plans.
CREATE TYPE "AnnualLeaveUsePlanUsageType" AS ENUM ('FULL_DAY', 'AM_HALF_DAY', 'PM_HALF_DAY');

ALTER TABLE "AnnualLeaveUsePlanItem"
  ADD COLUMN "plannedStartDate" DATE,
  ADD COLUMN "plannedEndDate" DATE,
  ADD COLUMN "usageType" "AnnualLeaveUsePlanUsageType",
  ADD COLUMN "calculatedAmount" DOUBLE PRECISION;

CREATE INDEX "AnnualLeaveUsePlanItem_plannedStartDate_idx"
  ON "AnnualLeaveUsePlanItem"("plannedStartDate");
