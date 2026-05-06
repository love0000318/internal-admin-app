import { describe, expect, it } from "vitest";

import { assertCronRequestAuthorized } from "@/lib/jobs/cron";
import { sanitizeJobError, sanitizeJobSummary } from "@/lib/jobs/sanitize";
import {
  dedupeRecipientUserIds,
  getNotificationGroup,
  normalizeNotificationPriority,
  sanitizeNotificationMetadata,
} from "@/lib/notifications/notifications";

describe("notifications and job operations", () => {
  it("groups notification types for filtering", () => {
    expect(getNotificationGroup("LEAVE_APPROVED")).toBe("LEAVE");
    expect(getNotificationGroup("LEAVE_AUTO_CONFIRMED")).toBe("LEAVE");
    expect(getNotificationGroup("LEAVE_ATTACHMENT_REJECTED")).toBe("ATTACHMENT");
    expect(getNotificationGroup("ANNUAL_LEAVE_PROMOTION")).toBe("ANNUAL_PROMOTION");
    expect(getNotificationGroup("HR_PROFILE_CHANGE_REQUEST_CREATED")).toBe("HR");
    expect(getNotificationGroup("ONBOARDING_COMPLETED")).toBe("ONBOARDING");
    expect(getNotificationGroup("REPORT_EXPORTED")).toBe("REPORT");
    expect(getNotificationGroup("JOB_FAILED")).toBe("JOB");
    expect(getNotificationGroup("ATTENDANCE_CHANGE_REQUEST_CREATED")).toBe("ATTENDANCE");
    expect(getNotificationGroup("PASSWORD_RESET_BY_OWNER")).toBe("ACCOUNT");
    expect(getNotificationGroup("SECURITY_EVENT")).toBe("SECURITY");
    expect(getNotificationGroup("SYSTEM")).toBe("SYSTEM");
  });

  it("handles CRITICAL priority and unknown priority fallback", () => {
    expect(normalizeNotificationPriority("CRITICAL")).toBe("CRITICAL");
    expect(normalizeNotificationPriority("HIGH")).toBe("HIGH");
    expect(normalizeNotificationPriority(undefined)).toBe("NORMAL");
    expect(normalizeNotificationPriority("UNKNOWN")).toBe("NORMAL");
  });

  it("deduplicates recipients and sanitizes notification metadata", () => {
    expect(dedupeRecipientUserIds(["u1", "u1", "", "u2"])).toEqual(["u1", "u2"]);

    const metadata = sanitizeNotificationMetadata({
      safeId: "leave-1",
      token: "raw-token",
      nested: {
        passwordHash: "hash",
        attachmentContent: "private content",
      },
    }) as Record<string, unknown>;

    expect(metadata.safeId).toBe("leave-1");
    expect(metadata.token).not.toBe("raw-token");
    expect((metadata.nested as Record<string, unknown>).passwordHash).not.toBe("hash");
    expect((metadata.nested as Record<string, unknown>).attachmentContent).not.toBe(
      "private content",
    );
  });

  it("redacts sensitive keys from job result summaries", () => {
    const summary = sanitizeJobSummary({
      checkedCount: 1,
      tokenHash: "secret-token-hash",
      nested: {
        fileKey: "private/uploads/file.pdf",
        ok: true,
      },
    });

    expect(summary).toEqual({
      checkedCount: 1,
      tokenHash: "[민감정보 숨김]",
      nested: {
        fileKey: "[민감정보 숨김]",
        ok: true,
      },
    });
  });

  it("redacts long secret-like strings from job errors", () => {
    expect(sanitizeJobError("failed abcdefghijklmnopqrstuvwxyz1234567890")).toContain(
      "[민감정보 숨김]",
    );
  });

  it("validates cron secrets from headers", () => {
    const original = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "a".repeat(40);

    expect(() =>
      assertCronRequestAuthorized(
        new Request("https://example.com", {
          headers: { "x-cron-secret": "a".repeat(40) },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertCronRequestAuthorized(
        new Request("https://example.com", {
          headers: { "x-cron-secret": "wrong" },
        }),
      ),
    ).toThrow("cron-unauthorized");

    process.env.CRON_SECRET = original;
  });
});
