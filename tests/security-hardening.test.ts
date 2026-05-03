import { describe, expect, it } from "vitest";

import {
  isHighRiskEmployeeChange,
  resolveEmployeeChangeStepUpPurpose,
  getStepUpTtlMinutes,
  getStepUpMaxAttempts,
  STEP_UP_TTL_MINUTES,
} from "@/lib/security/step-up";
import { isSameOriginRequest } from "@/lib/security/request-origin";
import {
  sanitizeInvitationForResponse,
  sanitizeSessionForResponse,
  sanitizeUserForResponse,
} from "@/lib/security/api-sanitizers";
import {
  findDuplicateSecretNames,
  validateDistinctSecrets,
  validateSecretLength,
} from "@/lib/security/env-validation";
import { classifyAuditAction } from "@/lib/audit/audit-classification";
import { sanitizeAuditMetadata } from "@/lib/audit/sanitize-audit-metadata";

describe("step-up security policy", () => {
  it("requires step-up for role changes, owner changes, and deactivation", () => {
    expect(
      isHighRiskEmployeeChange({
        beforeRole: "MANAGER",
        nextRole: "LEAD",
        beforeStatus: "ACTIVE",
        nextStatus: "ACTIVE",
      }),
    ).toBe(true);
    expect(
      isHighRiskEmployeeChange({
        beforeRole: "MANAGER",
        nextRole: "MANAGER",
        beforeStatus: "ACTIVE",
        nextStatus: "DEACTIVATED",
      }),
    ).toBe(true);
    expect(
      isHighRiskEmployeeChange({
        beforeRole: "OWNER",
        nextRole: "MANAGER",
        beforeStatus: "ACTIVE",
        nextStatus: "ACTIVE",
      }),
    ).toBe(true);
  });

  it("does not require step-up for ordinary profile edits", () => {
    expect(
      isHighRiskEmployeeChange({
        beforeRole: "MANAGER",
        nextRole: "MANAGER",
        beforeStatus: "ACTIVE",
        nextStatus: "ACTIVE",
      }),
    ).toBe(false);
  });

  it("maps high-risk changes to explicit purposes", () => {
    expect(
      resolveEmployeeChangeStepUpPurpose({
        beforeRole: "MANAGER",
        nextRole: "OWNER",
        nextStatus: "ACTIVE",
      }),
    ).toBe("OWNER_ROLE_CHANGE");
    expect(
      resolveEmployeeChangeStepUpPurpose({
        beforeRole: "MANAGER",
        nextRole: "MANAGER",
        nextStatus: "DEACTIVATED",
      }),
    ).toBe("EMPLOYEE_DEACTIVATION");
    expect(STEP_UP_TTL_MINUTES).toBe(5);
  });

  it("allows step-up TTL and max attempts to be configured", () => {
    expect(getStepUpTtlMinutes()).toBe(5);
    expect(getStepUpMaxAttempts()).toBe(5);
  });
});

describe("same-origin request validation", () => {
  it("accepts matching origin headers", () => {
    const request = new Request("https://app.example.com/api/admin", {
      headers: { origin: "https://app.example.com" },
    });

    expect(isSameOriginRequest(request, "https://app.example.com")).toBe(true);
  });

  it("rejects cross-origin mutation attempts", () => {
    const request = new Request("https://app.example.com/api/admin", {
      headers: { origin: "https://evil.example.com" },
    });

    expect(isSameOriginRequest(request, "https://app.example.com")).toBe(false);
  });
});

describe("token/session response sanitizers", () => {
  it("removes passwordHash, tokenHash, and verification hashes from responses", () => {
    expect(
      sanitizeUserForResponse({
        id: "user-1",
        name: "User",
        passwordHash: "hash",
      }),
    ).toEqual({ id: "user-1", name: "User" });

    expect(
      sanitizeSessionForResponse({
        id: "session-1",
        tokenHash: "hash",
        rememberMe: true,
      }),
    ).toEqual({ id: "session-1", rememberMe: true });

    expect(
      sanitizeInvitationForResponse({
        id: "invitation-1",
        tokenHash: "hash",
        shortTokenHash: "short",
        verificationCodeHash: "code",
        status: "PENDING",
      }),
    ).toEqual({ id: "invitation-1", status: "PENDING" });
  });
});

describe("secret validation", () => {
  it("requires long secrets and detects duplicate secret values", () => {
    expect(validateSecretLength("SESSION_SECRET", "short").ok).toBe(false);
    expect(validateSecretLength("SESSION_SECRET", "a".repeat(32)).ok).toBe(true);

    expect(
      findDuplicateSecretNames({
        SESSION_SECRET: "same".repeat(8),
        ENCRYPTION_SECRET: "same".repeat(8),
        TOKEN_SECRET: "different".repeat(4),
      }),
    ).toEqual([["SESSION_SECRET", "ENCRYPTION_SECRET"]]);

    expect(
      validateDistinctSecrets({
        SESSION_SECRET: "same".repeat(8),
        ENCRYPTION_SECRET: "same".repeat(8),
      }).ok,
    ).toBe(false);
  });
});

describe("audit log sanitizing and classification", () => {
  it("redacts token, passwordHash, secret, and nested sensitive metadata", () => {
    const sanitized = sanitizeAuditMetadata({
      token: "raw-token",
      nested: {
        passwordHash: "hash",
        safe: "visible",
      },
      array: [{ verificationCodeHash: "code-hash" }],
      url: "postgresql://user:pass@example.test/db",
    }) as Record<string, unknown>;

    expect(sanitized.token).toBe("[민감정보 숨김]");
    expect((sanitized.nested as Record<string, unknown>).passwordHash).toBe("[민감정보 숨김]");
    expect((sanitized.nested as Record<string, unknown>).safe).toBe("visible");
    expect(((sanitized.array as Array<Record<string, unknown>>)[0]).verificationCodeHash).toBe(
      "[민감정보 숨김]",
    );
    expect(sanitized.url).toBe("[민감정보 숨김]");
  });

  it("classifies high-risk audit actions", () => {
    expect(classifyAuditAction("OWNER_ROLE_GRANTED")).toEqual({
      category: "SECURITY",
      severity: "CRITICAL",
    });
    expect(classifyAuditAction("REPORT_EXPORTED")).toEqual({
      category: "REPORT",
      severity: "HIGH",
    });
    expect(classifyAuditAction("LOGIN_FAILED")).toEqual({
      category: "AUTH",
      severity: "WARNING",
    });
    expect(classifyAuditAction("LEAVE_REQUEST_CREATED")).toEqual({
      category: "LEAVE",
      severity: "INFO",
    });
  });
});
