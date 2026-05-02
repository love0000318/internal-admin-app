-- Connect granted custom leaves to leave requests without changing legacy requests.

CREATE TYPE "LeaveRequestKind" AS ENUM ('LEGACY', 'ANNUAL', 'CUSTOM_GRANT');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CUSTOM_LEAVE_REQUEST_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CUSTOM_LEAVE_REQUEST_WITHDRAWN';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CUSTOM_LEAVE_REQUEST_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CUSTOM_LEAVE_REQUEST_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CUSTOM_LEAVE_REQUEST_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_GRANT_PENDING_AMOUNT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'LEAVE_GRANT_USED_AMOUNT_UPDATED';

ALTER TABLE "LeaveRequest"
  ADD COLUMN "requestKind" "LeaveRequestKind" NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "leaveTypeId" TEXT;

ALTER TABLE "LeaveRequest"
  ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey"
  FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveTypeDefinition"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "LeaveRequestGrantUsage" (
  "id" TEXT NOT NULL,
  "leaveRequestId" TEXT NOT NULL,
  "leaveGrantId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "unit" "LeaveGrantUnit" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeaveRequestGrantUsage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LeaveRequestGrantUsage"
  ADD CONSTRAINT "LeaveRequestGrantUsage_leaveRequestId_fkey"
  FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveRequestGrantUsage"
  ADD CONSTRAINT "LeaveRequestGrantUsage_leaveGrantId_fkey"
  FOREIGN KEY ("leaveGrantId") REFERENCES "LeaveGrant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "LeaveRequest_requestKind_idx" ON "LeaveRequest"("requestKind");
CREATE INDEX "LeaveRequest_leaveTypeId_idx" ON "LeaveRequest"("leaveTypeId");
CREATE INDEX "LeaveRequestGrantUsage_leaveRequestId_idx" ON "LeaveRequestGrantUsage"("leaveRequestId");
CREATE INDEX "LeaveRequestGrantUsage_leaveGrantId_idx" ON "LeaveRequestGrantUsage"("leaveGrantId");
