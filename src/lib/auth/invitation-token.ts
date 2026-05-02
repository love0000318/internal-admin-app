import { createHmac, randomBytes, timingSafeEqual } from "crypto";

import type { InvitationTokenPayload } from "@/lib/auth/types";

const DEV_INVITATION_SECRET =
  "dev-only-internal-ops-invitation-secret-change-before-production";

export const INVITATION_TOKEN_BYTES = 32;
export const INVITATION_TOKEN_TTL_DAYS = 14;

function getInvitationSecret() {
  const secret = process.env.INVITATION_TOKEN_SECRET ?? process.env.APP_SECRET;

  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("INVITATION_TOKEN_SECRET or APP_SECRET is required.");
  }

  return secret ?? DEV_INVITATION_SECRET;
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getInvitationTokenTtlDays() {
  return getPositiveIntegerEnv(
    "INVITATION_EXPIRES_IN_DAYS",
    INVITATION_TOKEN_TTL_DAYS,
  );
}

export function createInvitationToken(): string {
  return randomBytes(INVITATION_TOKEN_BYTES).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHmac("sha256", getInvitationSecret())
    .update(`invite:${token}`)
    .digest("hex");
}

export function verifyInvitationToken(
  rawToken: string,
  expectedHash: string,
): boolean {
  const actualHash = hashInvitationToken(rawToken);
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createInvitationTokenPayload(
  now = new Date(),
): InvitationTokenPayload {
  const rawToken = createInvitationToken();
  const expiresAt = new Date(
    now.getTime() + getInvitationTokenTtlDays() * 24 * 60 * 60 * 1000,
  );

  return {
    rawToken,
    tokenHash: hashInvitationToken(rawToken),
    expiresAt,
  };
}

export function isInvitationExpired(
  expiresAt: Date,
  now = new Date(),
): boolean {
  return expiresAt.getTime() <= now.getTime();
}
