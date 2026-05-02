-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_REQUEST_APPROVER_RESOLVED';

-- AlterTable
ALTER TABLE "ApprovalPolicy" ADD COLUMN     "requireAttachmentAcceptedBeforeApproval" BOOLEAN NOT NULL DEFAULT false;
