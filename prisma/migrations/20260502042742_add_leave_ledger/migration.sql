-- CreateEnum
CREATE TYPE "LeaveLedgerEventType" AS ENUM ('GRANTED', 'PENDING', 'PENDING_RELEASED', 'USED', 'USED_RESTORED', 'EXPIRED', 'ADJUSTED', 'CANCELLED', 'REJECTED', 'WITHDRAWN', 'CARRIED_OVER', 'REVOKED');

-- CreateEnum
CREATE TYPE "LeaveLedgerSource" AS ENUM ('ANNUAL_AUTO', 'MANUAL_ADJUSTMENT', 'CUSTOM_GRANT', 'BIRTHDAY_AUTO', 'LEAVE_REQUEST', 'LEAVE_APPROVAL', 'LEAVE_REJECTION', 'LEAVE_WITHDRAWAL', 'LEAVE_CANCELLATION', 'SYSTEM_MIGRATION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_LEDGER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_LEDGER_REBUILT';
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_LEDGER_VALIDATED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_LEDGER_INCONSISTENCY_FOUND';

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'LEAVE_LEDGER';

-- CreateTable
CREATE TABLE "LeaveLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaveTypeId" TEXT,
    "leaveGrantId" TEXT,
    "leaveRequestId" TEXT,
    "leaveAdjustmentId" TEXT,
    "eventType" "LeaveLedgerEventType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "unit" "LeaveGrantUnit" NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "expiresAt" DATE,
    "referenceYear" INTEGER,
    "referenceDate" DATE,
    "source" "LeaveLedgerSource" NOT NULL,
    "idempotencyKey" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaveLedger_idempotencyKey_key" ON "LeaveLedger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LeaveLedger_userId_idx" ON "LeaveLedger"("userId");

-- CreateIndex
CREATE INDEX "LeaveLedger_leaveTypeId_idx" ON "LeaveLedger"("leaveTypeId");

-- CreateIndex
CREATE INDEX "LeaveLedger_leaveGrantId_idx" ON "LeaveLedger"("leaveGrantId");

-- CreateIndex
CREATE INDEX "LeaveLedger_leaveRequestId_idx" ON "LeaveLedger"("leaveRequestId");

-- CreateIndex
CREATE INDEX "LeaveLedger_leaveAdjustmentId_idx" ON "LeaveLedger"("leaveAdjustmentId");

-- CreateIndex
CREATE INDEX "LeaveLedger_eventType_idx" ON "LeaveLedger"("eventType");

-- CreateIndex
CREATE INDEX "LeaveLedger_effectiveDate_idx" ON "LeaveLedger"("effectiveDate");

-- CreateIndex
CREATE INDEX "LeaveLedger_referenceYear_idx" ON "LeaveLedger"("referenceYear");

-- AddForeignKey
ALTER TABLE "LeaveLedger" ADD CONSTRAINT "LeaveLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveLedger" ADD CONSTRAINT "LeaveLedger_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveLedger" ADD CONSTRAINT "LeaveLedger_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveTypeDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveLedger" ADD CONSTRAINT "LeaveLedger_leaveGrantId_fkey" FOREIGN KEY ("leaveGrantId") REFERENCES "LeaveGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveLedger" ADD CONSTRAINT "LeaveLedger_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveLedger" ADD CONSTRAINT "LeaveLedger_leaveAdjustmentId_fkey" FOREIGN KEY ("leaveAdjustmentId") REFERENCES "LeaveAdjustment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
