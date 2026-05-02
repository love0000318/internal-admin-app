-- CreateEnum
CREATE TYPE "LeaveGrantStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LeaveGrantSource" AS ENUM ('MANUAL', 'BULK_MANUAL', 'SYSTEM', 'MIGRATION');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_GRANT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_GRANT_BULK_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_GRANT_REVOKED';

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'LEAVE_GRANT';

-- CreateTable
CREATE TABLE "LeaveGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "grantedAmount" DOUBLE PRECISION NOT NULL,
    "usedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pendingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingAmount" DOUBLE PRECISION NOT NULL,
    "unit" "LeaveGrantUnit" NOT NULL,
    "status" "LeaveGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" DATE NOT NULL,
    "expiresAt" DATE,
    "grantedByUserId" TEXT NOT NULL,
    "revokedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "reason" TEXT NOT NULL,
    "source" "LeaveGrantSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveGrant_userId_idx" ON "LeaveGrant"("userId");

-- CreateIndex
CREATE INDEX "LeaveGrant_leaveTypeId_idx" ON "LeaveGrant"("leaveTypeId");

-- CreateIndex
CREATE INDEX "LeaveGrant_status_idx" ON "LeaveGrant"("status");

-- CreateIndex
CREATE INDEX "LeaveGrant_effectiveFrom_idx" ON "LeaveGrant"("effectiveFrom");

-- CreateIndex
CREATE INDEX "LeaveGrant_expiresAt_idx" ON "LeaveGrant"("expiresAt");

-- AddForeignKey
ALTER TABLE "LeaveGrant" ADD CONSTRAINT "LeaveGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveGrant" ADD CONSTRAINT "LeaveGrant_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveTypeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveGrant" ADD CONSTRAINT "LeaveGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveGrant" ADD CONSTRAINT "LeaveGrant_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
