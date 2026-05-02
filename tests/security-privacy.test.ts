import { describe, expect, it } from "vitest";

import {
  decryptSensitiveText,
  encryptSensitiveText,
  isEncryptedValue,
} from "@/lib/hr/sensitive";
import {
  maskAddress,
  maskBankAccount,
  maskBirthDate,
  maskEmail,
  maskPhoneNumber,
  maskResidentId,
} from "@/lib/security/masking";
import {
  sanitizeAuditMetadata,
  sanitizeJobRunSummary,
  sanitizeNotificationMetadata,
  sanitizeSecurityValue,
} from "@/lib/security/sanitize";

describe("security privacy helpers", () => {
  it("encrypts sensitive values and detects encrypted payloads", () => {
    const encrypted = encryptSensitiveText("970118-1234567");

    expect(encrypted).not.toContain("970118");
    expect(isEncryptedValue(encrypted)).toBe(true);
    expect(isEncryptedValue("970118-1234567")).toBe(false);
    expect(decryptSensitiveText(encrypted)).toBe("970118-1234567");
  });

  it("masks common HR sensitive fields", () => {
    expect(maskResidentId("970118-1234567")).toBe("970118-1******");
    expect(maskBankAccount("11012345605")).toBe("110*****605");
    expect(maskPhoneNumber("01012344186")).toBe("010-****-4186");
    expect(maskEmail("hyunji@example.com")).toBe("h***@example.com");
    expect(maskAddress("서울특별시 강남구 테헤란로 123")).toBe("서울특별시 강남구 테헤란로 ****");
    expect(maskBirthDate("1997-01-18")).toBe("1997-**-**");
  });

  it("sanitizes AuditLog metadata without removing safe identifiers", () => {
    const metadata = sanitizeAuditMetadata({
      requestId: "request-1",
      changedFields: ["bankAccountEncrypted"],
      tokenHash: "secret",
      residentId: "970118-1234567",
      nested: {
        fileKey: "private/uploads/leave-attachments/document.pdf",
        ok: true,
      },
    }) as Record<string, unknown>;

    expect(metadata.requestId).toBe("request-1");
    expect(metadata.changedFields).toEqual(["bankAccountEncrypted"]);
    expect(metadata.tokenHash).toBe("[민감정보 숨김]");
    expect(metadata.residentId).toBe("[민감정보 숨김]");
    expect(metadata.nested).toEqual({ fileKey: "[민감정보 숨김]", ok: true });
  });

  it("sanitizes Notification metadata and JobRun summaries", () => {
    expect(
      sanitizeNotificationMetadata({
        linkUrl: "/profile",
        bankAccount: "110123456789",
      }),
    ).toEqual({
      linkUrl: "/profile",
      bankAccount: "[민감정보 숨김]",
    });

    expect(
      sanitizeJobRunSummary({
        checkedCount: 10,
        raw: [{ residentId: "970118-1234567" }],
        error: "abc".repeat(200),
      }),
    ).toEqual({
      checkedCount: 10,
      raw: "[민감정보 숨김]",
      error: "[민감정보 숨김]",
    });
  });

  it("redacts long secret-like values even when the key looks safe", () => {
    expect(
      sanitizeSecurityValue({
        note: "failed with v1:abcdefghijklmnopqrstuvwxyz:abcdefghijklmnopqrstuvwxyz:abcdefghijklmnopqrstuvwxyz",
      }),
    ).toEqual({
      note: "failed with [민감정보 숨김]",
    });
  });
});
