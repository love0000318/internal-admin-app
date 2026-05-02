import { createHmac, randomInt, timingSafeEqual } from "crypto";

import { getInvitationTokenTtlDays } from "@/lib/auth/invitation-token";
import { getPrisma } from "@/lib/db/prisma";

const DEV_INVITATION_SHORT_TOKEN_SECRET =
  "dev-only-internal-ops-invitation-short-token-secret-change-before-production";
const DEFAULT_SHORT_TOKEN_LENGTH = 8;
const EASY_READ_ALPHANUMERIC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export type InvitationShortTokenRecord = {
  shortTokenHash: string | null;
  shortTokenExpiresAt: Date | null;
  shortTokenConsumedAt: Date | null;
  shortTokenRevokedAt: Date | null;
};

export type InvitationShortTokenValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: "missing" | "invalid" | "expired" | "consumed" | "revoked";
    };

function getInvitationShortTokenSecret() {
  const secret =
    process.env.INVITATION_SHORT_TOKEN_SECRET ??
    process.env.INVITATION_TOKEN_SECRET ??
    process.env.APP_SECRET;

  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error(
      "INVITATION_SHORT_TOKEN_SECRET, INVITATION_TOKEN_SECRET, or APP_SECRET is required.",
    );
  }

  return secret ?? DEV_INVITATION_SHORT_TOKEN_SECRET;
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeInvitationShortToken(token: string) {
  return token.trim().replace(/\s+/g, "").toUpperCase();
}

export function getInvitationShortTokenLength() {
  return getPositiveIntegerEnv(
    "INVITATION_SHORT_TOKEN_LENGTH",
    DEFAULT_SHORT_TOKEN_LENGTH,
  );
}

export function getInvitationShortTokenTtlDays() {
  return getPositiveIntegerEnv(
    "INVITATION_SHORT_TOKEN_EXPIRES_IN_DAYS",
    getInvitationTokenTtlDays(),
  );
}

export function generateInvitationShortToken() {
  const length = getInvitationShortTokenLength();
  let token = "";

  for (let index = 0; index < length; index += 1) {
    token += EASY_READ_ALPHANUMERIC[
      randomInt(0, EASY_READ_ALPHANUMERIC.length)
    ];
  }

  return token;
}

export function isInvitationShortTokenFormat(token: string) {
  const normalized = normalizeInvitationShortToken(token);
  return (
    normalized.length >= 8 &&
    normalized.length <= 32 &&
    /^[A-Z2-9]+$/.test(normalized) &&
    !/[O0I1L]/.test(normalized)
  );
}

export function hashInvitationShortToken(token: string) {
  return createHmac("sha256", getInvitationShortTokenSecret())
    .update(`invitation-short-token:${normalizeInvitationShortToken(token)}`)
    .digest("hex");
}

export function verifyInvitationShortTokenHash(
  token: string,
  expectedHash: string,
) {
  if (!isInvitationShortTokenFormat(token)) {
    return false;
  }

  const actualHash = hashInvitationShortToken(token);
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createInvitationShortTokenPayload(now = new Date()) {
  const rawShortToken = generateInvitationShortToken();
  const expiresAt = new Date(
    now.getTime() + getInvitationShortTokenTtlDays() * 24 * 60 * 60 * 1000,
  );

  return {
    rawShortToken,
    shortTokenHash: hashInvitationShortToken(rawShortToken),
    expiresAt,
  };
}

export async function createUniqueInvitationShortTokenPayload(now = new Date()) {
  const prisma = getPrisma();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const payload = createInvitationShortTokenPayload(now);
    const duplicate = await prisma.invitation.findUnique({
      where: {
        shortTokenHash: payload.shortTokenHash,
      },
      select: {
        id: true,
      },
    });

    if (!duplicate) {
      return payload;
    }
  }

  throw new Error("Failed to create a unique invitation short token.");
}

export function validateInvitationShortTokenRecord(
  invitation: InvitationShortTokenRecord,
  now = new Date(),
): InvitationShortTokenValidationResult {
  if (!invitation.shortTokenHash || !invitation.shortTokenExpiresAt) {
    return { ok: false, reason: "missing" };
  }

  if (invitation.shortTokenConsumedAt) {
    return { ok: false, reason: "consumed" };
  }

  if (invitation.shortTokenRevokedAt) {
    return { ok: false, reason: "revoked" };
  }

  if (invitation.shortTokenExpiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true };
}

export async function verifyInvitationShortToken(token: string) {
  if (!isInvitationShortTokenFormat(token)) {
    return null;
  }

  const invitation = await getPrisma().invitation.findUnique({
    where: {
      shortTokenHash: hashInvitationShortToken(token),
    },
    include: {
      team: true,
      employeePrejoinProfile: true,
    },
  });

  if (!invitation || invitation.status !== "PENDING") {
    return null;
  }

  const validation = validateInvitationShortTokenRecord(invitation);

  return validation.ok ? invitation : null;
}
