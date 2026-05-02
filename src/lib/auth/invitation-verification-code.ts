import { createHmac, randomInt, timingSafeEqual } from "crypto";

import { getInvitationTokenTtlDays } from "@/lib/auth/invitation-token";
import { getPrisma } from "@/lib/db/prisma";

const DEV_INVITATION_CODE_SECRET =
  "dev-only-internal-ops-invitation-code-secret-change-before-production";
const DEFAULT_CODE_LENGTH = 8;
const DEFAULT_MAX_ATTEMPTS = 5;
const DIGITS = "23456789";
const EASY_READ_ALPHANUMERIC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type InvitationVerificationCodeRecord = {
  verificationCodeHash: string | null;
  verificationCodeExpiresAt: Date | null;
  verificationCodeConsumedAt: Date | null;
  verificationCodeRevokedAt: Date | null;
  verificationCodeAttemptCount: number;
  verificationCodeMaxAttempts: number;
};

export type InvitationVerificationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "missing"
        | "expired"
        | "consumed"
        | "revoked"
        | "locked"
        | "mismatch";
    };

function getInvitationCodeSecret() {
  const secret =
    process.env.INVITATION_VERIFICATION_CODE_SECRET ??
    process.env.INVITATION_TOKEN_SECRET ??
    process.env.APP_SECRET;

  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error(
      "INVITATION_VERIFICATION_CODE_SECRET, INVITATION_TOKEN_SECRET, or APP_SECRET is required.",
    );
  }

  return secret ?? DEV_INVITATION_CODE_SECRET;
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeInvitationVerificationCode(code: string) {
  return code.trim().replace(/\s+/g, "").toUpperCase();
}

export function getInvitationVerificationCodeLength() {
  return getPositiveIntegerEnv(
    "INVITATION_VERIFICATION_CODE_LENGTH",
    DEFAULT_CODE_LENGTH,
  );
}

export function getInvitationVerificationCodeMaxAttempts() {
  return getPositiveIntegerEnv(
    "INVITATION_VERIFICATION_CODE_MAX_ATTEMPTS",
    DEFAULT_MAX_ATTEMPTS,
  );
}

export function getInvitationVerificationCodeTtlDays() {
  return getPositiveIntegerEnv(
    "INVITATION_VERIFICATION_CODE_EXPIRES_IN_DAYS",
    getInvitationTokenTtlDays(),
  );
}

export function generateInvitationVerificationCode(): string {
  const length = getInvitationVerificationCodeLength();
  const alphabet =
    process.env.INVITATION_VERIFICATION_CODE_ALPHANUMERIC === "true"
      ? EASY_READ_ALPHANUMERIC
      : DIGITS;

  let code = "";

  for (let index = 0; index < length; index += 1) {
    code += alphabet[randomInt(0, alphabet.length)];
  }

  return code;
}

export function hashInvitationVerificationCode(code: string): string {
  return createHmac("sha256", getInvitationCodeSecret())
    .update(`invitation-code:${normalizeInvitationVerificationCode(code)}`)
    .digest("hex");
}

export function verifyInvitationVerificationCodeHash(
  code: string,
  expectedHash: string,
) {
  const actualHash = hashInvitationVerificationCode(code);
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createInvitationVerificationCodePayload(now = new Date()) {
  const rawCode = generateInvitationVerificationCode();
  const expiresAt = new Date(
    now.getTime() +
      getInvitationVerificationCodeTtlDays() * 24 * 60 * 60 * 1000,
  );

  return {
    rawCode,
    codeHash: hashInvitationVerificationCode(rawCode),
    expiresAt,
    maxAttempts: getInvitationVerificationCodeMaxAttempts(),
  };
}

export function verifyInvitationVerificationCode(params: {
  invitation: InvitationVerificationCodeRecord;
  code: string;
  now?: Date;
}): InvitationVerificationResult {
  const { invitation, code, now = new Date() } = params;

  if (!invitation.verificationCodeHash || !invitation.verificationCodeExpiresAt) {
    return { ok: false, reason: "missing" };
  }

  if (invitation.verificationCodeConsumedAt) {
    return { ok: false, reason: "consumed" };
  }

  if (invitation.verificationCodeRevokedAt) {
    return { ok: false, reason: "revoked" };
  }

  if (invitation.verificationCodeExpiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  if (
    invitation.verificationCodeAttemptCount >=
    invitation.verificationCodeMaxAttempts
  ) {
    return { ok: false, reason: "locked" };
  }

  if (!verifyInvitationVerificationCodeHash(code, invitation.verificationCodeHash)) {
    return { ok: false, reason: "mismatch" };
  }

  return { ok: true };
}

export function getInvitationVerificationCodeStatus(
  invitation: InvitationVerificationCodeRecord,
  now = new Date(),
) {
  if (!invitation.verificationCodeHash) {
    return "NEEDS_REISSUE";
  }

  if (invitation.verificationCodeConsumedAt) {
    return "CONSUMED";
  }

  if (invitation.verificationCodeRevokedAt) {
    return "REVOKED";
  }

  if (
    invitation.verificationCodeAttemptCount >=
    invitation.verificationCodeMaxAttempts
  ) {
    return "LOCKED";
  }

  if (
    invitation.verificationCodeExpiresAt &&
    invitation.verificationCodeExpiresAt.getTime() <= now.getTime()
  ) {
    return "EXPIRED";
  }

  return "ISSUED";
}

export async function consumeInvitationVerificationCode(params: {
  invitationId: string;
  now?: Date;
}) {
  const { invitationId, now = new Date() } = params;

  await getPrisma().invitation.update({
    where: { id: invitationId },
    data: {
      verificationCodeConsumedAt: now,
    },
  });
}

export async function revokeInvitationVerificationCode(params: {
  invitationId: string;
  now?: Date;
}) {
  const { invitationId, now = new Date() } = params;

  await getPrisma().invitation.update({
    where: { id: invitationId },
    data: {
      verificationCodeRevokedAt: now,
    },
  });
}
