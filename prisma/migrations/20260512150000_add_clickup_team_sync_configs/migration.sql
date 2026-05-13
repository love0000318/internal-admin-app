ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CLICKUP_TEAM_SYNC_CONFIG_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CLICKUP_TEAM_SYNC_CONFIG_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WORK_TASK_RELATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WORK_TASK_RELATION_DELETED';

ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'CLICKUP_TEAM_SYNC_CONFIG';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'WORK_TASK_RELATION';

CREATE TYPE "WorkTaskRelationType" AS ENUM (
  'RELATED',
  'BLOCKED_BY',
  'FOLLOW_UP',
  'DUPLICATE',
  'REFERENCE'
);

CREATE TABLE "ClickUpTeamSyncConfig" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "clickUpWorkspaceId" TEXT,
  "clickUpSpaceId" TEXT,
  "clickUpFolderId" TEXT,
  "clickUpListId" TEXT,
  "clickUpListName" TEXT,
  "syncScope" TEXT NOT NULL DEFAULT 'TASKS_AND_DOCS',
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "lastTaskSyncedAt" TIMESTAMP(3),
  "lastDocsSyncedAt" TIMESTAMP(3),
  "lastSyncStatus" TEXT,
  "lastSyncMessage" TEXT,
  "note" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClickUpTeamSyncConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkTaskRelation" (
  "id" TEXT NOT NULL,
  "parentTaskMirrorId" TEXT NOT NULL,
  "relatedTaskMirrorId" TEXT NOT NULL,
  "relationType" "WorkTaskRelationType" NOT NULL DEFAULT 'RELATED',
  "note" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkTaskRelation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ClickUpTaskMirror"
  ADD COLUMN "sourceTeamId" TEXT,
  ADD COLUMN "sourceTeamName" TEXT,
  ADD COLUMN "clickUpSourceConfigId" TEXT,
  ADD COLUMN "sourceWorkspaceId" TEXT;

ALTER TABLE "ClickUpDocMirror"
  ADD COLUMN "sourceTeamId" TEXT,
  ADD COLUMN "sourceTeamName" TEXT,
  ADD COLUMN "clickUpSourceConfigId" TEXT,
  ADD COLUMN "sourceWorkspaceId" TEXT;

CREATE UNIQUE INDEX "ClickUpTeamSyncConfig_teamId_key" ON "ClickUpTeamSyncConfig"("teamId");
CREATE INDEX "ClickUpTeamSyncConfig_teamId_idx" ON "ClickUpTeamSyncConfig"("teamId");
CREATE INDEX "ClickUpTeamSyncConfig_isEnabled_idx" ON "ClickUpTeamSyncConfig"("isEnabled");
CREATE INDEX "ClickUpTeamSyncConfig_workspace_idx" ON "ClickUpTeamSyncConfig"("clickUpWorkspaceId");
CREATE INDEX "ClickUpTeamSyncConfig_space_idx" ON "ClickUpTeamSyncConfig"("clickUpSpaceId");
CREATE INDEX "ClickUpTeamSyncConfig_folder_idx" ON "ClickUpTeamSyncConfig"("clickUpFolderId");
CREATE INDEX "ClickUpTeamSyncConfig_list_idx" ON "ClickUpTeamSyncConfig"("clickUpListId");
CREATE INDEX "ClickUpTeamSyncConfig_updatedBy_idx" ON "ClickUpTeamSyncConfig"("updatedByUserId");

CREATE INDEX "ClickUpTaskMirror_sourceTeamId_idx" ON "ClickUpTaskMirror"("sourceTeamId");
CREATE INDEX "ClickUpTaskMirror_sourceConfig_idx" ON "ClickUpTaskMirror"("clickUpSourceConfigId");
CREATE INDEX "ClickUpTaskMirror_sourceWorkspace_idx" ON "ClickUpTaskMirror"("sourceWorkspaceId");

CREATE INDEX "ClickUpDocMirror_sourceTeamId_idx" ON "ClickUpDocMirror"("sourceTeamId");
CREATE INDEX "ClickUpDocMirror_sourceConfig_idx" ON "ClickUpDocMirror"("clickUpSourceConfigId");
CREATE INDEX "ClickUpDocMirror_sourceWorkspace_idx" ON "ClickUpDocMirror"("sourceWorkspaceId");

CREATE UNIQUE INDEX "WorkTaskRelation_parent_related_type_key"
  ON "WorkTaskRelation"("parentTaskMirrorId", "relatedTaskMirrorId", "relationType");
CREATE INDEX "WorkTaskRelation_parent_idx" ON "WorkTaskRelation"("parentTaskMirrorId");
CREATE INDEX "WorkTaskRelation_related_idx" ON "WorkTaskRelation"("relatedTaskMirrorId");
CREATE INDEX "WorkTaskRelation_type_idx" ON "WorkTaskRelation"("relationType");
CREATE INDEX "WorkTaskRelation_createdBy_idx" ON "WorkTaskRelation"("createdByUserId");
CREATE INDEX "WorkTaskRelation_createdAt_idx" ON "WorkTaskRelation"("createdAt");

ALTER TABLE "ClickUpTeamSyncConfig"
  ADD CONSTRAINT "ClickUpTeamSyncConfig_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClickUpTeamSyncConfig"
  ADD CONSTRAINT "ClickUpTeamSyncConfig_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClickUpTaskMirror"
  ADD CONSTRAINT "ClickUpTaskMirror_sourceTeamId_fkey"
  FOREIGN KEY ("sourceTeamId") REFERENCES "Team"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClickUpTaskMirror"
  ADD CONSTRAINT "ClickUpTaskMirror_clickUpSourceConfigId_fkey"
  FOREIGN KEY ("clickUpSourceConfigId") REFERENCES "ClickUpTeamSyncConfig"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClickUpDocMirror"
  ADD CONSTRAINT "ClickUpDocMirror_sourceTeamId_fkey"
  FOREIGN KEY ("sourceTeamId") REFERENCES "Team"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClickUpDocMirror"
  ADD CONSTRAINT "ClickUpDocMirror_clickUpSourceConfigId_fkey"
  FOREIGN KEY ("clickUpSourceConfigId") REFERENCES "ClickUpTeamSyncConfig"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkTaskRelation"
  ADD CONSTRAINT "WorkTaskRelation_parentTaskMirrorId_fkey"
  FOREIGN KEY ("parentTaskMirrorId") REFERENCES "ClickUpTaskMirror"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkTaskRelation"
  ADD CONSTRAINT "WorkTaskRelation_relatedTaskMirrorId_fkey"
  FOREIGN KEY ("relatedTaskMirrorId") REFERENCES "ClickUpTaskMirror"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkTaskRelation"
  ADD CONSTRAINT "WorkTaskRelation_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
