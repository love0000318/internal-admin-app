import { describe, expect, it, vi } from "vitest";

import {
  getPasswordPolicyResult,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from "@/lib/auth/password";
import {
  createInvitationToken,
  createInvitationTokenPayload,
  getInvitationTokenTtlDays,
  hashInvitationToken,
  isInvitationExpired,
  verifyInvitationToken,
} from "@/lib/auth/invitation-token";
import {
  createInvitationVerificationCodePayload,
  generateInvitationVerificationCode,
  hashInvitationVerificationCode,
  verifyInvitationVerificationCode,
  verifyInvitationVerificationCodeHash,
} from "@/lib/auth/invitation-verification-code";
import { MockIdentityVerificationProvider } from "@/lib/auth/identity-verification-provider";
import { normalizePhoneNumber } from "@/lib/auth/phone";
import {
  createSessionToken,
  getSessionCookieOptions,
  getSessionTtlDays,
  hashSessionToken,
  isSessionExpired,
} from "@/lib/auth/session";
import {
  generateSecureToken,
  hashToken,
  verifyTokenHash,
} from "@/lib/auth/token";

describe("auth helpers", () => {
  it("validates the password policy", () => {
    expect(validatePasswordPolicy("Password1!")).toBe(true);
    expect(validatePasswordPolicy("password")).toBe(false);

    expect(getPasswordPolicyResult("Password1!")).toEqual({
      valid: true,
      errors: [],
    });

    expect(getPasswordPolicyResult("password").errors).toEqual([
      "PASSWORD_REQUIRES_NUMBER",
      "PASSWORD_REQUIRES_SPECIAL_CHARACTER",
    ]);
  });

  it("normalizes phone numbers for Korean mobile numbers", () => {
    expect(normalizePhoneNumber("010-1234-5678")).toBe("01012345678");
    expect(normalizePhoneNumber(" 010 1234 5678 ")).toBe("01012345678");
  });

  it("hashes and verifies passwords without storing raw passwords", async () => {
    const password = "Password1!";
    const passwordHash = await hashPassword(password);

    expect(passwordHash).not.toBe(password);
    expect(await verifyPassword(password, passwordHash)).toBe(true);
    expect(await verifyPassword("WrongPassword1!", passwordHash)).toBe(false);
  });

  it("hashes and verifies invitation tokens", () => {
    const token = createInvitationToken();
    const tokenHash = hashInvitationToken(token);

    expect(token).not.toEqual(tokenHash);
    expect(tokenHash).toHaveLength(64);
    expect(verifyInvitationToken(token, tokenHash)).toBe(true);
    expect(verifyInvitationToken(`${token}-wrong`, tokenHash)).toBe(false);
  });

  it("generates and verifies one-time invitation verification codes", () => {
    vi.stubEnv("INVITATION_VERIFICATION_CODE_LENGTH", "8");

    const code = generateInvitationVerificationCode();
    const codeHash = hashInvitationVerificationCode(code);

    expect(code).toMatch(/^[2-9]{8}$/);
    expect(codeHash).toHaveLength(64);
    expect(codeHash).not.toEqual(code);
    expect(verifyInvitationVerificationCodeHash(code, codeHash)).toBe(true);
    expect(verifyInvitationVerificationCodeHash("22222222", codeHash)).toBe(
      code === "22222222",
    );

    vi.unstubAllEnvs();
  });

  it("validates invitation verification code state", () => {
    const now = new Date("2026-05-01T00:00:00.000Z");
    const payload = createInvitationVerificationCodePayload(now);
    const invitation = {
      verificationCodeHash: payload.codeHash,
      verificationCodeExpiresAt: new Date("2026-05-02T00:00:00.000Z"),
      verificationCodeConsumedAt: null,
      verificationCodeRevokedAt: null,
      verificationCodeAttemptCount: 0,
      verificationCodeMaxAttempts: 5,
    };

    expect(
      verifyInvitationVerificationCode({
        invitation,
        code: payload.rawCode,
        now,
      }),
    ).toEqual({ ok: true });
    expect(
      verifyInvitationVerificationCode({
        invitation,
        code: "22222222",
        now,
      }).ok,
    ).toBe(payload.rawCode === "22222222");
    expect(
      verifyInvitationVerificationCode({
        invitation: {
          ...invitation,
          verificationCodeExpiresAt: new Date("2026-04-30T00:00:00.000Z"),
        },
        code: payload.rawCode,
        now,
      }),
    ).toEqual({ ok: false, reason: "expired" });
    expect(
      verifyInvitationVerificationCode({
        invitation: {
          ...invitation,
          verificationCodeConsumedAt: now,
        },
        code: payload.rawCode,
        now,
      }),
    ).toEqual({ ok: false, reason: "consumed" });
    expect(
      verifyInvitationVerificationCode({
        invitation: {
          ...invitation,
          verificationCodeRevokedAt: now,
        },
        code: payload.rawCode,
        now,
      }),
    ).toEqual({ ok: false, reason: "revoked" });
    expect(
      verifyInvitationVerificationCode({
        invitation: {
          ...invitation,
          verificationCodeAttemptCount: 5,
        },
        code: payload.rawCode,
        now,
      }),
    ).toEqual({ ok: false, reason: "locked" });
  });

  it("hashes and verifies generic secure tokens", () => {
    const token = generateSecureToken();
    const tokenHash = hashToken(token);

    expect(token).not.toEqual(tokenHash);
    expect(verifyTokenHash(token, tokenHash)).toBe(true);
    expect(verifyTokenHash(`${token}-wrong`, tokenHash)).toBe(false);
  });

  it("detects expired invitation tokens", () => {
    const now = new Date("2026-05-01T00:00:00.000Z");

    expect(isInvitationExpired(new Date("2026-04-30T23:59:59.000Z"), now)).toBe(
      true,
    );
    expect(isInvitationExpired(new Date("2026-05-01T00:00:00.000Z"), now)).toBe(
      true,
    );
    expect(isInvitationExpired(new Date("2026-05-01T00:00:01.000Z"), now)).toBe(
      false,
    );
  });

  it("allows invitation token TTL to be configured by env", () => {
    vi.stubEnv("INVITATION_EXPIRES_IN_DAYS", "3");

    const now = new Date("2026-05-01T00:00:00.000Z");
    const payload = createInvitationTokenPayload(now);

    expect(getInvitationTokenTtlDays()).toBe(3);
    expect(payload.expiresAt.toISOString()).toBe("2026-05-04T00:00:00.000Z");

    vi.unstubAllEnvs();
  });

  it("hashes session tokens without storing raw tokens", () => {
    const token = createSessionToken();
    const tokenHash = hashSessionToken(token);

    expect(token).not.toEqual(tokenHash);
    expect(tokenHash).toHaveLength(64);
  });

  it("detects expired sessions", () => {
    const now = new Date("2026-05-01T00:00:00.000Z");

    expect(isSessionExpired(new Date("2026-04-30T23:59:59.000Z"), now)).toBe(
      true,
    );
    expect(isSessionExpired(new Date("2026-05-01T00:00:01.000Z"), now)).toBe(
      false,
    );
  });

  it("uses secure httpOnly session cookie settings in production", () => {
    const expiresAt = new Date("2026-05-08T00:00:00.000Z");

    vi.stubEnv("NODE_ENV", "development");
    expect(getSessionCookieOptions(expiresAt)).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    vi.stubEnv("NODE_ENV", "production");
    expect(getSessionCookieOptions(expiresAt)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    vi.unstubAllEnvs();
  });

  it("allows session TTL to be configured by env", () => {
    vi.stubEnv("SESSION_EXPIRES_IN_DAYS", "10");

    expect(getSessionTtlDays()).toBe(10);

    vi.unstubAllEnvs();
  });

  it("verifies identity through the development mock provider", async () => {
    const provider = new MockIdentityVerificationProvider();
    const result = await provider.verify({
      name: "권예찬",
      phoneNumber: "01012345678",
      verificationToken: "mock-verified",
    });

    expect(result).toMatchObject({
      verified: true,
      verifiedName: "권예찬",
      verifiedPhoneNumber: "01012345678",
    });
  });

  it("blocks the mock identity provider in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const provider = new MockIdentityVerificationProvider();

    await expect(
      provider.verify({
        name: "권예찬",
        phoneNumber: "01012345678",
        verificationToken: "mock-verified",
      }),
    ).rejects.toThrow("Mock identity verification is disabled in production.");

    vi.unstubAllEnvs();
  });
});
