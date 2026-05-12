ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WORK_TASK_SYNC_RUN';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CLICKUP_DOC_SYNC_RUN';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WORK_TASK_LOCAL_STATE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WORK_TASK_CHANGE_REQUEST_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WORK_TASK_CHANGE_REQUEST_CHECKED';

ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'CLICKUP_TASK_MIRROR';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'CLICKUP_DOC_MIRROR';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'WORK_TASK_LOCAL_STATE';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'WORK_TASK_CHANGE_REQUEST';

CREATE TYPE "WorkTaskInternalStatus" AS ENUM (
  'PLANNED',
  'IN_PROGRESS',
  'HOTFIX',
  'DEPLOYED'
);

CREATE TYPE "WorkTaskChangeRequestStatus" AS ENUM (
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED',
  'ARCHIVED'
);

CREATE TABLE "ClickUpTaskMirror" (
  "id" TEXT NOT NULL,
  "clickUpTaskId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "descriptionSummary" TEXT,
  "clickUpStatus" TEXT,
  "clickUpAssignees" JSONB,
  "dueDate" DATE,
  "clickUpUrl" TEXT,
  "sourceListId" TEXT,
  "sourceListName" TEXT,
  "sourceFolderId" TEXT,
  "sourceFolderName" TEXT,
  "sourceSpaceId" TEXT,
  "sourceSpaceName" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClickUpTaskMirror_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkTaskLocalState" (
  "id" TEXT NOT NULL,
  "clickUpTaskMirrorId" TEXT NOT NULL,
  "internalStatus" "WorkTaskInternalStatus" NOT NULL DEFAULT 'PLANNED',
  "teamId" TEXT,
  "workDate" DATE,
  "memo" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkTaskLocalState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClickUpDocMirror" (
  "id" TEXT NOT NULL,
  "clickUpDocId" TEXT,
  "title" TEXT NOT NULL,
  "documentUrl" TEXT,
  "plainTextSummary" TEXT,
  "sourceSpaceId" TEXT,
  "sourceSpaceName" TEXT,
  "sourceFolderId" TEXT,
  "sourceFolderName" TEXT,
  "lastSyncedAt" TIMESTAMP(3),
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClickUpDocMirror_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkTaskDocumentLink" (
  "id" TEXT NOT NULL,
  "clickUpTaskMirrorId" TEXT NOT NULL,
  "clickUpDocMirrorId" TEXT NOT NULL,
  "linkedByUserId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkTaskDocumentLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkTaskChangeRequest" (
  "id" TEXT NOT NULL,
  "clickUpTaskMirrorId" TEXT NOT NULL,
  "clickUpDocMirrorId" TEXT,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "sourceDocumentUrl" TEXT,
  "authorOrSource" TEXT,
  "status" "WorkTaskChangeRequestStatus" NOT NULL DEFAULT 'OPEN',
  "checkedAt" TIMESTAMP(3),
  "checkedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkTaskChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkTaskActivity" (
  "id" TEXT NOT NULL,
  "clickUpTaskMirrorId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkTaskActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClickUpTaskMirror_clickUpTaskId_key" ON "ClickUpTaskMirror"("clickUpTaskId");
CREATE INDEX "ClickUpTaskMirror_clickUpStatus_idx" ON "ClickUpTaskMirror"("clickUpStatus");
CREATE INDEX "ClickUpTaskMirror_dueDate_idx" ON "ClickUpTaskMirror"("dueDate");
CREATE INDEX "ClickUpTaskMirror_lastSyncedAt_idx" ON "ClickUpTaskMirror"("lastSyncedAt");
CREATE INDEX "ClickUpTaskMirror_sourceListId_idx" ON "ClickUpTaskMirror"("sourceListId");

CREATE UNIQUE INDEX "WorkTaskLocalState_clickUpTaskMirrorId_key" ON "WorkTaskLocalState"("clickUpTaskMirrorId");
CREATE INDEX "WorkTaskLocalState_internalStatus_idx" ON "WorkTaskLocalState"("internalStatus");
CREATE INDEX "WorkTaskLocalState_teamId_idx" ON "WorkTaskLocalState"("teamId");
CREATE INDEX "WorkTaskLocalState_workDate_idx" ON "WorkTaskLocalState"("workDate");
CREATE INDEX "WorkTaskLocalState_updatedByUserId_idx" ON "WorkTaskLocalState"("updatedByUserId");

CREATE UNIQUE INDEX "ClickUpDocMirror_clickUpDocId_key" ON "ClickUpDocMirror"("clickUpDocId");
CREATE INDEX "ClickUpDocMirror_lastSyncedAt_idx" ON "ClickUpDocMirror"("lastSyncedAt");
CREATE INDEX "ClickUpDocMirror_sourceSpaceId_idx" ON "ClickUpDocMirror"("sourceSpaceId");
CREATE INDEX "ClickUpDocMirror_sourceFolderId_idx" ON "ClickUpDocMirror"("sourceFolderId");

CREATE UNIQUE INDEX "WorkTaskDocumentLink_clickUpTaskMirrorId_clickUpDocMirrorId_key"
  ON "WorkTaskDocumentLink"("clickUpTaskMirrorId", "clickUpDocMirrorId");
CREATE INDEX "WorkTaskDocumentLink_clickUpTaskMirrorId_idx" ON "WorkTaskDocumentLink"("clickUpTaskMirrorId");
CREATE INDEX "WorkTaskDocumentLink_clickUpDocMirrorId_idx" ON "WorkTaskDocumentLink"("clickUpDocMirrorId");
CREATE INDEX "WorkTaskDocumentLink_linkedByUserId_idx" ON "WorkTaskDocumentLink"("linkedByUserId");

CREATE INDEX "WorkTaskChangeRequest_clickUpTaskMirrorId_idx" ON "WorkTaskChangeRequest"("clickUpTaskMirrorId");
CREATE INDEX "WorkTaskChangeRequest_clickUpDocMirrorId_idx" ON "WorkTaskChangeRequest"("clickUpDocMirrorId");
CREATE INDEX "WorkTaskChangeRequest_status_idx" ON "WorkTaskChangeRequest"("status");
CREATE INDEX "WorkTaskChangeRequest_checkedByUserId_idx" ON "WorkTaskChangeRequest"("checkedByUserId");
CREATE INDEX "WorkTaskChangeRequest_createdAt_idx" ON "WorkTaskChangeRequest"("createdAt");

CREATE INDEX "WorkTaskActivity_clickUpTaskMirrorId_idx" ON "WorkTaskActivity"("clickUpTaskMirrorId");
CREATE INDEX "WorkTaskActivity_actorUserId_idx" ON "WorkTaskActivity"("actorUserId");
CREATE INDEX "WorkTaskActivity_type_idx" ON "WorkTaskActivity"("type");
CREATE INDEX "WorkTaskActivity_createdAt_idx" ON "WorkTaskActivity"("createdAt");

ALTER TABLE "WorkTaskLocalState"
  ADD CONSTRAINT "WorkTaskLocalState_clickUpTaskMirrorId_fkey"
  FOREIGN KEY ("clickUpTaskMirrorId") REFERENCES "ClickUpTaskMirror"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkTaskLocalState"
  ADD CONSTRAINT "WorkTaskLocalState_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkTaskLocalState"
  ADD CONSTRAINT "WorkTaskLocalState_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkTaskDocumentLink"
  ADD CONSTRAINT "WorkTaskDocumentLink_clickUpTaskMirrorId_fkey"
  FOREIGN KEY ("clickUpTaskMirrorId") REFERENCES "ClickUpTaskMirror"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkTaskDocumentLink"
  ADD CONSTRAINT "WorkTaskDocumentLink_clickUpDocMirrorId_fkey"
  FOREIGN KEY ("clickUpDocMirrorId") REFERENCES "ClickUpDocMirror"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkTaskDocumentLink"
  ADD CONSTRAINT "WorkTaskDocumentLink_linkedByUserId_fkey"
  FOREIGN KEY ("linkedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkTaskChangeRequest"
  ADD CONSTRAINT "WorkTaskChangeRequest_clickUpTaskMirrorId_fkey"
  FOREIGN KEY ("clickUpTaskMirrorId") REFERENCES "ClickUpTaskMirror"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkTaskChangeRequest"
  ADD CONSTRAINT "WorkTaskChangeRequest_clickUpDocMirrorId_fkey"
  FOREIGN KEY ("clickUpDocMirrorId") REFERENCES "ClickUpDocMirror"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkTaskChangeRequest"
  ADD CONSTRAINT "WorkTaskChangeRequest_checkedByUserId_fkey"
  FOREIGN KEY ("checkedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkTaskActivity"
  ADD CONSTRAINT "WorkTaskActivity_clickUpTaskMirrorId_fkey"
  FOREIGN KEY ("clickUpTaskMirrorId") REFERENCES "ClickUpTaskMirror"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkTaskActivity"
  ADD CONSTRAINT "WorkTaskActivity_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;


