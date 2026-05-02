-- AlterEnum
ALTER TYPE "LeaveGrantMethod" ADD VALUE 'SYSTEM';

-- AlterEnum
ALTER TYPE "LeaveGrantSource" ADD VALUE 'BIRTHDAY_AUTO';

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LEAVE_GRANTED', 'LEAVE_APPROVED', 'LEAVE_REJECTED', 'LEAVE_CANCELLED', 'SYSTEM');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'BIRTHDAY_LEAVE_POLICY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'BIRTHDAY_HALF_DAY_GRANTED';
ALTER TYPE "AuditAction" ADD VALUE 'BIRTHDAY_HALF_DAY_GRANT_SKIPPED';
ALTER TYPE "AuditAction" ADD VALUE 'BIRTHDAY_HALF_DAY_NOTIFICATION_CREATED';

-- AlterTable
ALTER TABLE "LeaveGrant" ADD COLUMN "referenceYear" INTEGER;
ALTER TABLE "LeaveGrant" ADD COLUMN "referenceDate" DATE;
ALTER TABLE "LeaveGrant" ADD COLUMN "metadata" JSONB;

-- CreateTable
CREATE TABLE "BirthdayLeavePolicy" (
    "id" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "leaveTypeId" TEXT NOT NULL,
    "grantAmount" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "grantUnit" "LeaveGrantUnit" NOT NULL DEFAULT 'DAY',
    "grantDaysBefore" INTEGER NOT NULL DEFAULT 1,
    "usableDaysFromBirthday" INTEGER NOT NULL DEFAULT 7,
    "adjustGrantDateToPreviousBusinessDay" BOOLEAN NOT NULL DEFAULT true,
    "notifyEmployee" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BirthdayLeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "linkUrl" TEXT,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveGrant_referenceYear_idx" ON "LeaveGrant"("referenceYear");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveGrant_userId_leaveTypeId_referenceYear_source_key" ON "LeaveGrant"("userId", "leaveTypeId", "referenceYear", "source");

-- CreateIndex
CREATE INDEX "BirthdayLeavePolicy_leaveTypeId_idx" ON "BirthdayLeavePolicy"("leaveTypeId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE INDEX "Notification_readAt_idx" ON "Notification"("readAt");

-- AddForeignKey
ALTER TABLE "BirthdayLeavePolicy" ADD CONSTRAINT "BirthdayLeavePolicy_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveTypeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
