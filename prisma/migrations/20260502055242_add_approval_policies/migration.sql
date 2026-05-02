-- CreateEnum
CREATE TYPE "ApprovalAppliesTo" AS ENUM ('LEAVE_REQUEST', 'LEAVE_CANCEL');

-- CreateEnum
CREATE TYPE "ApprovalMode" AS ENUM ('NONE', 'SINGLE', 'SEQUENTIAL');

-- CreateEnum
CREATE TYPE "ApproverRule" AS ENUM ('OWNER', 'TEAM_LEAD', 'TEAM_LEAD_OR_OWNER', 'CUSTOM_USER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'APPROVAL_POLICY_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'APPROVAL_POLICY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'APPROVAL_POLICY_DEACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_TYPE_APPROVAL_POLICY_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_REQUEST_AUTO_APPROVED';

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'APPROVAL_POLICY';

-- AlterTable
ALTER TABLE "LeaveTypeDefinition" ADD COLUMN     "approvalPolicyId" TEXT;

-- CreateTable
CREATE TABLE "ApprovalPolicy" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "appliesTo" "ApprovalAppliesTo" NOT NULL DEFAULT 'LEAVE_REQUEST',
    "leaveTypeId" TEXT,
    "approvalMode" "ApprovalMode" NOT NULL DEFAULT 'SINGLE',
    "approverRule" "ApproverRule" NOT NULL DEFAULT 'TEAM_LEAD_OR_OWNER',
    "customApproverUserId" TEXT,
    "requireCommentOnReject" BOOLEAN NOT NULL DEFAULT true,
    "requireCommentOnCancel" BOOLEAN NOT NULL DEFAULT true,
    "autoApproveIfNoApprover" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalPolicy_code_key" ON "ApprovalPolicy"("code");

-- CreateIndex
CREATE INDEX "ApprovalPolicy_leaveTypeId_idx" ON "ApprovalPolicy"("leaveTypeId");

-- CreateIndex
CREATE INDEX "ApprovalPolicy_customApproverUserId_idx" ON "ApprovalPolicy"("customApproverUserId");

-- CreateIndex
CREATE INDEX "ApprovalPolicy_isEnabled_idx" ON "ApprovalPolicy"("isEnabled");

-- CreateIndex
CREATE INDEX "LeaveTypeDefinition_approvalPolicyId_idx" ON "LeaveTypeDefinition"("approvalPolicyId");

-- AddForeignKey
ALTER TABLE "LeaveTypeDefinition" ADD CONSTRAINT "LeaveTypeDefinition_approvalPolicyId_fkey" FOREIGN KEY ("approvalPolicyId") REFERENCES "ApprovalPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveTypeDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_customApproverUserId_fkey" FOREIGN KEY ("customApproverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
