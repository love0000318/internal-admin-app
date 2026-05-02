import { describe, expect, it } from "vitest";

import {
  mapMainEmployeeRow,
  normalizeImportDate,
  normalizeImportEmail,
  normalizeImportString,
} from "@/lib/hr/mapping";
import {
  isOwnerOnlyProfileField,
  isSelfEditableProfileField,
  requiresProfileChangeRequest,
} from "@/lib/hr/profile-fields";
import {
  decryptSensitiveText,
  encryptSensitiveText,
  maskBankAccount,
  maskResidentId,
} from "@/lib/hr/sensitive";

describe("HR import mapping", () => {
  it("normalizes placeholders and email values", () => {
    expect(normalizeImportString("N/A")).toBeNull();
    expect(normalizeImportString(" 해당 없음 ")).toBeNull();
    expect(normalizeImportEmail("TEST@EXAMPLE.COM")).toBe("test@example.com");
    expect(normalizeImportEmail("not-email")).toBeNull();
  });

  it("maps the main employee sheet without sensitive logging fields", () => {
    const mapped = mapMainEmployeeRow({
      사번: "E-001",
      이름: "홍길동",
      이메일: "hong@example.com",
      직급: "매니저",
      조직: "운영팀",
      입사일: "2026.05.01",
      생년월일: "1995-03-12",
      주민등록번호: "950312-1234567",
      급여계좌: "110123456789",
    });

    expect(mapped.employeeNumber).toBe("E-001");
    expect(mapped.legalName).toBe("홍길동");
    expect(mapped.companyEmail).toBe("hong@example.com");
    expect(mapped.hireDate).toEqual(normalizeImportDate("2026-05-01"));
    expect(mapped.residentId).toBe("950312-1234567");
    expect(mapped.bankAccount).toBe("110123456789");
  });
});

describe("HR sensitive fields", () => {
  it("encrypts, decrypts, and masks sensitive values", () => {
    const encrypted = encryptSensitiveText("950312-1234567");

    expect(encrypted).not.toContain("950312");
    expect(decryptSensitiveText(encrypted)).toBe("950312-1234567");
    expect(maskResidentId("950312-1234567")).toBe("950312-1******");
    expect(maskBankAccount("110123456789")).toBe("110******789");
  });
});

describe("employee profile field policy", () => {
  it("separates self editable, approval required, and owner-only fields", () => {
    expect(isSelfEditableProfileField("displayName")).toBe(true);
    expect(isSelfEditableProfileField("role")).toBe(false);
    expect(requiresProfileChangeRequest("bankAccount")).toBe(true);
    expect(requiresProfileChangeRequest("employeeNumber")).toBe(false);
    expect(isOwnerOnlyProfileField("hireDate")).toBe(true);
  });
});
