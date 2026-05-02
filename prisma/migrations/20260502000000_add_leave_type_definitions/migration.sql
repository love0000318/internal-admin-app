-- CreateEnum
CREATE TYPE "LeaveCategory" AS ENUM ('ANNUAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "LeaveGrantMethod" AS ENUM ('ON_REQUEST', 'AFTER_ANNUAL_EXHAUSTED', 'ON_HIRE_DATE', 'MANUAL', 'RECURRING', 'ON_TENURE');

-- CreateEnum
CREATE TYPE "LeaveGrantUnit" AS ENUM ('DAY', 'HOUR', 'MINUTE');

-- CreateEnum
CREATE TYPE "LeaveUsageMode" AS ENUM ('USE_ALL_AT_ONCE', 'SPLIT_ALLOWED');

-- CreateEnum
CREATE TYPE "LeaveUsageUnit" AS ENUM ('FULL_DAY', 'HALF_DAY', 'HOUR', 'MINUTE');

-- CreateEnum
CREATE TYPE "UnusedRemainderHandling" AS ENUM ('KEEP_REMAINING', 'EXPIRE_REMAINING');

-- CreateEnum
CREATE TYPE "AttachmentPolicy" AS ENUM ('NOT_REQUIRED', 'REQUIRED_BEFORE_REQUEST', 'REQUIRED_AFTER_REQUEST', 'OPTIONAL');

-- CreateEnum
CREATE TYPE "LeaveVisibility" AS ENUM ('PUBLIC_AS_LEAVE', 'PUBLIC_WITH_TYPE', 'PRIVATE_TO_APPROVERS');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_TYPE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_TYPE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_TYPE_DEACTIVATED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_TYPE_REACTIVATED';

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'LEAVE_TYPE';

-- CreateTable
CREATE TABLE "LeaveTypeDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "LeaveCategory" NOT NULL,
    "isSystemRequired" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "paidRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "grantMethod" "LeaveGrantMethod" NOT NULL DEFAULT 'MANUAL',
    "grantAmount" DOUBLE PRECISION,
    "grantUnit" "LeaveGrantUnit" NOT NULL DEFAULT 'DAY',
    "usageMode" "LeaveUsageMode" NOT NULL DEFAULT 'SPLIT_ALLOWED',
    "allowedUnits" TEXT NOT NULL,
    "unusedRemainderHandling" "UnusedRemainderHandling" NOT NULL DEFAULT 'KEEP_REMAINING',
    "deductsAnnualBalance" BOOLEAN NOT NULL DEFAULT false,
    "attachmentPolicy" "AttachmentPolicy" NOT NULL DEFAULT 'NOT_REQUIRED',
    "attachmentDescription" TEXT,
    "includeHolidayInDeduction" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "LeaveVisibility" NOT NULL DEFAULT 'PUBLIC_WITH_TYPE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveTypeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaveTypeDefinition_code_key" ON "LeaveTypeDefinition"("code");

-- CreateIndex
CREATE INDEX "LeaveTypeDefinition_category_idx" ON "LeaveTypeDefinition"("category");

-- CreateIndex
CREATE INDEX "LeaveTypeDefinition_isEnabled_idx" ON "LeaveTypeDefinition"("isEnabled");

-- CreateIndex
CREATE INDEX "LeaveTypeDefinition_isSystemRequired_idx" ON "LeaveTypeDefinition"("isSystemRequired");
