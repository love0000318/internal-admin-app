-- CreateEnum
CREATE TYPE "AttendanceRecordStatus" AS ENUM ('NORMAL', 'MISSING_CHECK_IN', 'MISSING_CHECK_OUT', 'LATE', 'EARLY_LEAVE', 'ABSENT', 'ON_LEAVE', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "AttendanceChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceMonthlyCloseStatus" AS ENUM ('DRAFT', 'CLOSED', 'REOPENED');

-- AlterEnum
ALTER TYPE "StepUpPurpose" ADD VALUE 'ATTENDANCE_MONTHLY_CLOSE';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_RECORD_CLOCK_IN';
ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_RECORD_CLOCK_OUT';
ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_CHANGE_REQUEST_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_CHANGE_REQUEST_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_CHANGE_REQUEST_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_CHANGE_REQUEST_BLOCKED';
ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_MONTHLY_CLOSE_CLOSED';
ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_MONTHLY_CLOSE_REOPENED';
ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_MONTHLY_CLOSE_BLOCKED';

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'ATTENDANCE_POLICY';
ALTER TYPE "AuditTargetType" ADD VALUE 'ATTENDANCE_RECORD';
ALTER TYPE "AuditTargetType" ADD VALUE 'ATTENDANCE_CHANGE_REQUEST';
ALTER TYPE "AuditTargetType" ADD VALUE 'ATTENDANCE_MONTHLY_CLOSE';

-- CreateTable
CREATE TABLE "AttendancePolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default attendance policy',
    "workStartTime" TEXT NOT NULL DEFAULT '09:00',
    "workEndTime" TEXT NOT NULL DEFAULT '18:00',
    "lateGraceMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyLeaveGraceMinutes" INTEGER NOT NULL DEFAULT 0,
    "workWeekdays" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "status" "AttendanceRecordStatus" NOT NULL DEFAULT 'NORMAL',
    "source" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "requestedCheckInAt" TIMESTAMP(3),
    "requestedCheckOutAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" "AttendanceChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewerMemo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceMonthlyClose" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "AttendanceMonthlyCloseStatus" NOT NULL DEFAULT 'DRAFT',
    "closedByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "reopenedByUserId" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceMonthlyClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendancePolicy_isActive_idx" ON "AttendancePolicy"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_userId_workDate_key" ON "AttendanceRecord"("userId", "workDate");
CREATE INDEX "AttendanceRecord_userId_idx" ON "AttendanceRecord"("userId");
CREATE INDEX "AttendanceRecord_workDate_idx" ON "AttendanceRecord"("workDate");
CREATE INDEX "AttendanceRecord_status_idx" ON "AttendanceRecord"("status");

-- CreateIndex
CREATE INDEX "AttendanceChangeRequest_userId_idx" ON "AttendanceChangeRequest"("userId");
CREATE INDEX "AttendanceChangeRequest_workDate_idx" ON "AttendanceChangeRequest"("workDate");
CREATE INDEX "AttendanceChangeRequest_status_idx" ON "AttendanceChangeRequest"("status");
CREATE INDEX "AttendanceChangeRequest_reviewedByUserId_idx" ON "AttendanceChangeRequest"("reviewedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceMonthlyClose_year_month_key" ON "AttendanceMonthlyClose"("year", "month");
CREATE INDEX "AttendanceMonthlyClose_status_idx" ON "AttendanceMonthlyClose"("status");
CREATE INDEX "AttendanceMonthlyClose_closedByUserId_idx" ON "AttendanceMonthlyClose"("closedByUserId");
CREATE INDEX "AttendanceMonthlyClose_reopenedByUserId_idx" ON "AttendanceMonthlyClose"("reopenedByUserId");

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceChangeRequest" ADD CONSTRAINT "AttendanceChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceChangeRequest" ADD CONSTRAINT "AttendanceChangeRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceMonthlyClose" ADD CONSTRAINT "AttendanceMonthlyClose_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceMonthlyClose" ADD CONSTRAINT "AttendanceMonthlyClose_reopenedByUserId_fkey" FOREIGN KEY ("reopenedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
