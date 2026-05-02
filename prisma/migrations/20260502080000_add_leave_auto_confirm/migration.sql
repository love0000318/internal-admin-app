-- CreateEnum
CREATE TYPE "AutoConfirmTiming" AS ENUM ('ON_START_DATE', 'AFTER_START_DATE');

-- CreateEnum
CREATE TYPE "LeaveApprovalSource" AS ENUM ('MANUAL', 'AUTO_START_DATE');

-- AlterEnum
ALTER TYPE "LeaveLedgerSource" ADD VALUE 'LEAVE_AUTO_CONFIRM';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'LEAVE_AUTO_CONFIRMED';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'LEAVE_REQUEST_AUTO_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'AUTO_CONFIRM_PENDING_LEAVES_RUN';
ALTER TYPE "AuditAction" ADD VALUE 'AUTO_CONFIRM_PENDING_LEAVES_DRY_RUN';

-- AlterTable
ALTER TABLE "ApprovalPolicy" ADD COLUMN "autoConfirmWhenStartDatePassed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ApprovalPolicy" ADD COLUMN "autoConfirmTiming" "AutoConfirmTiming" NOT NULL DEFAULT 'ON_START_DATE';

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN "autoConfirmedAt" TIMESTAMP(3);
ALTER TABLE "LeaveRequest" ADD COLUMN "autoConfirmReason" TEXT;
ALTER TABLE "LeaveRequest" ADD COLUMN "approvalSource" "LeaveApprovalSource" DEFAULT 'MANUAL';
