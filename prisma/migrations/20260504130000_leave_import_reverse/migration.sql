-- Add leave import reverse tracking and reverse adjustment source.
ALTER TYPE "LeaveImportStatus" ADD VALUE IF NOT EXISTS 'REVERSED';
ALTER TYPE "LeaveLedgerSource" ADD VALUE IF NOT EXISTS 'IMPORT_REVERSE_ADJUSTMENT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_BALANCE_IMPORT_TEMPLATE_DOWNLOADED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_BALANCE_IMPORT_VIEWED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_BALANCE_IMPORT_REVERSE_BLOCKED';

ALTER TABLE "LeaveImportBatch"
  ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reversedByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "reverseReason" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LeaveImportBatch_reversedByUserId_fkey'
  ) THEN
    ALTER TABLE "LeaveImportBatch"
      ADD CONSTRAINT "LeaveImportBatch_reversedByUserId_fkey"
      FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "LeaveImportBatch_reversedAt_idx" ON "LeaveImportBatch"("reversedAt");
CREATE INDEX IF NOT EXISTS "LeaveImportBatch_reversedByUserId_idx" ON "LeaveImportBatch"("reversedByUserId");
