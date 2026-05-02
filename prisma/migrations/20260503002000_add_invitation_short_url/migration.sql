-- Add internal short invitation URL support.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INVITATION_SHORT_URL_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INVITATION_SHORT_URL_CONSUMED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INVITATION_SHORT_URL_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INVITATION_REISSUED_WITH_SHORT_URL';

ALTER TABLE "Invitation"
  ADD COLUMN "shortTokenHash" TEXT,
  ADD COLUMN "shortTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "shortTokenConsumedAt" TIMESTAMP(3),
  ADD COLUMN "shortTokenRevokedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Invitation_shortTokenHash_key" ON "Invitation"("shortTokenHash");
CREATE INDEX "Invitation_shortTokenExpiresAt_idx" ON "Invitation"("shortTokenExpiresAt");
