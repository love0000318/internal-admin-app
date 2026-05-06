CREATE TYPE "WorkTaskStatus" AS ENUM (
  'DRAFT',
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'DONE',
  'CANCELLED'
);

CREATE TYPE "WorkTaskPriority" AS ENUM (
  'LOW',
  'NORMAL',
  'HIGH',
  'CRITICAL'
);

ALTER TABLE "User"
  ADD COLUMN "isTestAccount" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "testScenario" TEXT,
  ADD COLUMN "testExpiresAt" TIMESTAMP(3);

CREATE INDEX "User_isTestAccount_idx" ON "User"("isTestAccount");

CREATE TABLE "WorkTask" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "WorkTaskStatus" NOT NULL DEFAULT 'DRAFT',
  "priority" "WorkTaskPriority" NOT NULL DEFAULT 'NORMAL',
  "createdByUserId" TEXT NOT NULL,
  "assigneeUserId" TEXT,
  "dueDate" DATE,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkTask_status_idx" ON "WorkTask"("status");
CREATE INDEX "WorkTask_priority_idx" ON "WorkTask"("priority");
CREATE INDEX "WorkTask_createdByUserId_idx" ON "WorkTask"("createdByUserId");
CREATE INDEX "WorkTask_assigneeUserId_idx" ON "WorkTask"("assigneeUserId");
CREATE INDEX "WorkTask_dueDate_idx" ON "WorkTask"("dueDate");
CREATE INDEX "WorkTask_isArchived_idx" ON "WorkTask"("isArchived");

ALTER TABLE "WorkTask"
  ADD CONSTRAINT "WorkTask_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkTask"
  ADD CONSTRAINT "WorkTask_assigneeUserId_fkey"
  FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
