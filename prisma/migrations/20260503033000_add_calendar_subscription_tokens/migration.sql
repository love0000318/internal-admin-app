CREATE TYPE "CalendarSubscriptionScope" AS ENUM ('ME', 'TEAM', 'MANAGED_TEAMS', 'ALL_COMPANY');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CALENDAR_SUBSCRIPTION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CALENDAR_SUBSCRIPTION_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CALENDAR_SUBSCRIPTION_REGENERATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CALENDAR_SUBSCRIPTION_ACCESSED';

ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'CALENDAR_SUBSCRIPTION';

CREATE TABLE "CalendarSubscriptionToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "scope" "CalendarSubscriptionScope" NOT NULL,
  "teamId" TEXT,
  "name" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CalendarSubscriptionToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarSubscriptionToken_tokenHash_key" ON "CalendarSubscriptionToken"("tokenHash");
CREATE INDEX "CalendarSubscriptionToken_userId_idx" ON "CalendarSubscriptionToken"("userId");
CREATE INDEX "CalendarSubscriptionToken_scope_idx" ON "CalendarSubscriptionToken"("scope");
CREATE INDEX "CalendarSubscriptionToken_teamId_idx" ON "CalendarSubscriptionToken"("teamId");
CREATE INDEX "CalendarSubscriptionToken_revokedAt_idx" ON "CalendarSubscriptionToken"("revokedAt");

ALTER TABLE "CalendarSubscriptionToken"
  ADD CONSTRAINT "CalendarSubscriptionToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarSubscriptionToken"
  ADD CONSTRAINT "CalendarSubscriptionToken_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
