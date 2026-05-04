ALTER TYPE "LeaveLedgerSource" ADD VALUE IF NOT EXISTS 'IMPORT_MONTHLY_ANNUAL_USAGE';
ALTER TYPE "LeaveLedgerSource" ADD VALUE IF NOT EXISTS 'IMPORT_DETAILED_LEAVE_USAGE';

DO $$ BEGIN
  CREATE TYPE "LeaveImportType" AS ENUM ('MONTHLY_ANNUAL_USAGE', 'DETAILED_LEAVE_USAGE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "LeaveImportStatus" AS ENUM ('PARSED', 'VALIDATED', 'APPLIED', 'CANCELLED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "LeaveImportMatchStatus" AS ENUM ('MATCHED', 'MULTIPLE_MATCHES', 'UNMATCHED', 'ERROR');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "LeaveImportMappedStatus" AS ENUM ('PENDING', 'APPROVED', 'CANCELLED', 'UNKNOWN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_IMPORT_FILE_UPLOADED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_IMPORT_PARSED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_IMPORT_VALIDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_IMPORT_VALIDATION_RUN';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_IMPORT_APPLY_STARTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_IMPORT_APPLY_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_IMPORT_APPLY_FAILED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_IMPORT_RECONCILIATION_RUN';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_IMPORT_APPLIED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_IMPORT_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_IMPORT_ROW_MANUALLY_MATCHED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_IMPORT_BLOCKED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_IMPORT_REVERSE_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_IMPORT_REVERSED';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'LEAVE_IMPORT_BATCH';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'LEAVE_IMPORT_ROW';

ALTER TABLE "LeaveRequest"
  ADD COLUMN IF NOT EXISTS "importBatchId" TEXT,
  ADD COLUMN IF NOT EXISTS "importRowId" TEXT,
  ADD COLUMN IF NOT EXISTS "importedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isImported" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "LeaveRequest_importRowId_key" ON "LeaveRequest"("importRowId");
CREATE INDEX IF NOT EXISTS "LeaveRequest_importBatchId_idx" ON "LeaveRequest"("importBatchId");
CREATE INDEX IF NOT EXISTS "LeaveRequest_isImported_idx" ON "LeaveRequest"("isImported");

CREATE TABLE IF NOT EXISTS "LeaveImportBatch" (
  "id" TEXT NOT NULL,
  "importType" "LeaveImportType" NOT NULL,
  "status" "LeaveImportStatus" NOT NULL DEFAULT 'PARSED',
  "originalFileName" TEXT NOT NULL,
  "fileSize" INTEGER,
  "fileHash" TEXT,
  "uploadedByUserId" TEXT NOT NULL,
  "targetYear" INTEGER,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "matchedCount" INTEGER NOT NULL DEFAULT 0,
  "unmatchedCount" INTEGER NOT NULL DEFAULT 0,
  "warningCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "appliedAt" TIMESTAMP(3),
  "appliedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeaveImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LeaveImportRow" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "matchedUserId" TEXT,
  "matchStatus" "LeaveImportMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
  "employeeNumber" TEXT,
  "name" TEXT,
  "companyName" TEXT,
  "teamName" TEXT,
  "hireDate" DATE,
  "leaveTypeRaw" TEXT,
  "mappedLeaveTypeId" TEXT,
  "mappedLeaveTypeCode" TEXT,
  "startDate" DATE,
  "endDate" DATE,
  "amountDays" DOUBLE PRECISION,
  "amountHoursText" TEXT,
  "statusRaw" TEXT,
  "mappedStatus" "LeaveImportMappedStatus",
  "evidenceStatusRaw" TEXT,
  "remainingAnnualDays" DOUBLE PRECISION,
  "monthlyUsageJson" JSONB,
  "rawJson" JSONB,
  "warnings" JSONB,
  "errors" JSONB,
  "applied" BOOLEAN NOT NULL DEFAULT false,
  "appliedLeaveRequestId" TEXT,
  "appliedLedgerIds" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeaveImportRow_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "LeaveImportBatch"
    ADD CONSTRAINT "LeaveImportBatch_uploadedByUserId_fkey"
    FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "LeaveImportBatch"
    ADD CONSTRAINT "LeaveImportBatch_appliedByUserId_fkey"
    FOREIGN KEY ("appliedByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "LeaveImportRow"
    ADD CONSTRAINT "LeaveImportRow_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "LeaveImportBatch"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "LeaveImportRow"
    ADD CONSTRAINT "LeaveImportRow_matchedUserId_fkey"
    FOREIGN KEY ("matchedUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "LeaveImportBatch_importType_idx" ON "LeaveImportBatch"("importType");
CREATE INDEX IF NOT EXISTS "LeaveImportBatch_status_idx" ON "LeaveImportBatch"("status");
CREATE INDEX IF NOT EXISTS "LeaveImportBatch_createdAt_idx" ON "LeaveImportBatch"("createdAt");
CREATE INDEX IF NOT EXISTS "LeaveImportBatch_fileHash_idx" ON "LeaveImportBatch"("fileHash");
CREATE INDEX IF NOT EXISTS "LeaveImportRow_batchId_idx" ON "LeaveImportRow"("batchId");
CREATE INDEX IF NOT EXISTS "LeaveImportRow_matchedUserId_idx" ON "LeaveImportRow"("matchedUserId");
CREATE INDEX IF NOT EXISTS "LeaveImportRow_matchStatus_idx" ON "LeaveImportRow"("matchStatus");
CREATE INDEX IF NOT EXISTS "LeaveImportRow_mappedStatus_idx" ON "LeaveImportRow"("mappedStatus");
CREATE INDEX IF NOT EXISTS "LeaveImportRow_applied_idx" ON "LeaveImportRow"("applied");
