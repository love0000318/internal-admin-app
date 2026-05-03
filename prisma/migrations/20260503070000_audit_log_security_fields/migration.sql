DO $$ BEGIN
  CREATE TYPE "AuditCategory" AS ENUM (
    'GENERAL',
    'AUTH',
    'INVITATION',
    'HR',
    'LEAVE',
    'ATTENDANCE',
    'SECURITY',
    'REPORT',
    'JOB',
    'FILE',
    'POLICY'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AuditSeverity" AS ENUM (
    'INFO',
    'WARNING',
    'HIGH',
    'CRITICAL'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'AUDIT_LOG_EXPORTED';

ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS "category" "AuditCategory" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO';

CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_category_idx" ON "AuditLog"("category");
CREATE INDEX IF NOT EXISTS "AuditLog_severity_idx" ON "AuditLog"("severity");
