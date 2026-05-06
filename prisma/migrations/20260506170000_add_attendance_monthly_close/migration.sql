CREATE TYPE "AttendanceStatus" AS ENUM (
  'NORMAL',
  'LATE',
  'EARLY_LEAVE',
  'ABSENT',
  'ON_LEAVE',
  'MISSING_CHECK_IN',
  'MISSING_CHECK_OUT',
  'HOLIDAY'
);

CREATE TYPE "AttendanceChangeRequestStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

CREATE TYPE "AttendanceMonthlyCloseStatus" AS ENUM (
  'DRAFT',
  'CLOSED',
  'REOPENED'
);

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ATTENDANCE_MONTHLY_SUMMARY_VIEWED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ATTENDANCE_MONTH_CLOSED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ATTENDANCE_MONTH_CLOSE_BLOCKED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ATTENDANCE_MONTH_REOPENED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ATTENDANCE_MONTH_REOPEN_BLOCKED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CHANGE_REQUEST_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CHANGE_REQUEST_BLOCKED_BY_MONTH_CLOSE';

ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_RECORD';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_CHANGE_REQUEST';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'ATTENDANCE_MONTHLY_CLOSE';

CREATE TABLE "AttendancePolicy" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "workStartMinutes" INTEGER NOT NULL DEFAULT 540,
  "workEndMinutes" INTEGER NOT NULL DEFAULT 1080,
  "workDaysCsv" TEXT NOT NULL DEFAULT '1,2,3,4,5',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendancePolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceRecord" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workDate" DATE NOT NULL,
  "checkInAt" TIMESTAMP(3),
  "checkOutAt" TIMESTAMP(3),
  "workedMinutes" INTEGER,
  "status" "AttendanceStatus" NOT NULL DEFAULT 'NORMAL',
  "lateMinutes" INTEGER NOT NULL DEFAULT 0,
  "earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
  "memo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceChangeRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workDate" DATE NOT NULL,
  "status" "AttendanceChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedCheckInAt" TIMESTAMP(3),
  "requestedCheckOutAt" TIMESTAMP(3),
  "reason" TEXT,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewComment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceChangeRequest_pkey" PRIMARY KEY ("id")
);

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

CREATE INDEX "AttendancePolicy_isDefault_idx" ON "AttendancePolicy"("isDefault");
CREATE UNIQUE INDEX "AttendanceRecord_userId_workDate_key" ON "AttendanceRecord"("userId", "workDate");
CREATE INDEX "AttendanceRecord_workDate_idx" ON "AttendanceRecord"("workDate");
CREATE INDEX "AttendanceRecord_status_idx" ON "AttendanceRecord"("status");
CREATE INDEX "AttendanceRecord_userId_workDate_idx" ON "AttendanceRecord"("userId", "workDate");
CREATE INDEX "AttendanceChangeRequest_userId_workDate_idx" ON "AttendanceChangeRequest"("userId", "workDate");
CREATE INDEX "AttendanceChangeRequest_status_idx" ON "AttendanceChangeRequest"("status");
CREATE INDEX "AttendanceChangeRequest_workDate_idx" ON "AttendanceChangeRequest"("workDate");
CREATE INDEX "AttendanceChangeRequest_reviewedByUserId_idx" ON "AttendanceChangeRequest"("reviewedByUserId");
CREATE UNIQUE INDEX "AttendanceMonthlyClose_year_month_key" ON "AttendanceMonthlyClose"("year", "month");
CREATE INDEX "AttendanceMonthlyClose_year_month_idx" ON "AttendanceMonthlyClose"("year", "month");
CREATE INDEX "AttendanceMonthlyClose_status_idx" ON "AttendanceMonthlyClose"("status");
CREATE INDEX "AttendanceMonthlyClose_closedByUserId_idx" ON "AttendanceMonthlyClose"("closedByUserId");
CREATE INDEX "AttendanceMonthlyClose_reopenedByUserId_idx" ON "AttendanceMonthlyClose"("reopenedByUserId");

ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceChangeRequest" ADD CONSTRAINT "AttendanceChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceChangeRequest" ADD CONSTRAINT "AttendanceChangeRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceMonthlyClose" ADD CONSTRAINT "AttendanceMonthlyClose_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceMonthlyClose" ADD CONSTRAINT "AttendanceMonthlyClose_reopenedByUserId_fkey" FOREIGN KEY ("reopenedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
