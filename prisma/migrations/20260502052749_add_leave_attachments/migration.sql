-- CreateEnum
CREATE TYPE "LeaveAttachmentType" AS ENUM ('EVIDENCE', 'MEDICAL', 'RESERVE_FORCES', 'FAMILY_EVENT', 'HEALTH_CHECKUP', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveAttachmentStatus" AS ENUM ('REQUIRED', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'RESUBMISSION_REQUESTED', 'DELETED');

-- CreateEnum
CREATE TYPE "LeaveRequestAttachmentStatus" AS ENUM ('NOT_REQUIRED', 'OPTIONAL', 'REQUIRED_NOT_SUBMITTED', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'RESUBMISSION_REQUESTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_ATTACHMENT_UPLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_ATTACHMENT_DOWNLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_ATTACHMENT_ACCEPTED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_ATTACHMENT_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_ATTACHMENT_RESUBMISSION_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_ATTACHMENT_DELETED';

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'LEAVE_ATTACHMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'LEAVE_ATTACHMENT_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'LEAVE_ATTACHMENT_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'LEAVE_ATTACHMENT_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'LEAVE_ATTACHMENT_RESUBMISSION_REQUESTED';

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "attachmentStatus" "LeaveRequestAttachmentStatus" NOT NULL DEFAULT 'NOT_REQUIRED';

-- CreateTable
CREATE TABLE "LeaveAttachment" (
    "id" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalFileName" TEXT,
    "fileKey" TEXT,
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "attachmentType" "LeaveAttachmentType" NOT NULL DEFAULT 'EVIDENCE',
    "status" "LeaveAttachmentStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewComment" TEXT,
    "metadata" JSONB,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveAttachment_leaveRequestId_idx" ON "LeaveAttachment"("leaveRequestId");

-- CreateIndex
CREATE INDEX "LeaveAttachment_uploadedByUserId_idx" ON "LeaveAttachment"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "LeaveAttachment_reviewedByUserId_idx" ON "LeaveAttachment"("reviewedByUserId");

-- CreateIndex
CREATE INDEX "LeaveAttachment_deletedByUserId_idx" ON "LeaveAttachment"("deletedByUserId");

-- CreateIndex
CREATE INDEX "LeaveAttachment_status_idx" ON "LeaveAttachment"("status");

-- CreateIndex
CREATE INDEX "LeaveRequest_attachmentStatus_idx" ON "LeaveRequest"("attachmentStatus");

-- AddForeignKey
ALTER TABLE "LeaveAttachment" ADD CONSTRAINT "LeaveAttachment_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveAttachment" ADD CONSTRAINT "LeaveAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveAttachment" ADD CONSTRAINT "LeaveAttachment_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveAttachment" ADD CONSTRAINT "LeaveAttachment_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
