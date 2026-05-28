import { afterEach, describe, expect, it, vi } from "vitest";

import { ConsoleEmailProvider } from "@/lib/external-notifications/console-email-provider";
import {
  getEmailProviderName,
  isEmailProviderUsable,
  isSlackProviderUsable,
} from "@/lib/external-notifications/config";
import { dispatchExternalNotification } from "@/lib/external-notifications/dispatch-external-notification";
import { sendEmail } from "@/lib/external-notifications/send-email";
import { WebhookSlackProvider } from "@/lib/external-notifications/slack-provider";
import {
  buildExternalEmailTemplate,
  buildInvitationEmailTemplate,
} from "@/lib/external-notifications/templates";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("external notification config", () => {
  it("selects the configured email provider", () => {
    vi.stubEnv("EMAIL_PROVIDER", "console");

    expect(getEmailProviderName()).toBe("console");
  });

  it("does not allow console email provider in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_PROVIDER", "console");
    vi.stubEnv("EXTERNAL_EMAIL_NOTIFICATIONS_ENABLED", "true");

    expect(isEmailProviderUsable()).toBe(false);
  });

  it("requires Resend API key and sender when email is enabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("EXTERNAL_EMAIL_NOTIFICATIONS_ENABLED", "true");

    expect(isEmailProviderUsable()).toBe(false);

    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "no-reply@example.com");

    expect(isEmailProviderUsable()).toBe(true);
  });

  it("requires Slack webhook URL when Slack is enabled", () => {
    vi.stubEnv("SLACK_NOTIFICATIONS_ENABLED", "true");

    expect(isSlackProviderUsable()).toBe(false);

    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.test/services/test");

    expect(isSlackProviderUsable()).toBe(true);
  });
});

describe("external notification templates", () => {
  it("does not include leave rejection reason in email text", () => {
    const template = buildExternalEmailTemplate({
      type: "LEAVE_REJECTED",
      title: "ignored",
      message: "ignored",
      linkUrl: "/leaves/me/requests/request-1",
      appBaseUrl: "https://app.example.com",
      context: {
        rejectReason: "private reason",
      },
    });

    expect(template.text).not.toContain("private reason");
    expect(template.text).toContain("https://app.example.com/leaves/me/requests/request-1");
  });

  it("handles new leave request notification aliases without private reasons", () => {
    const template = buildExternalEmailTemplate({
      type: "LEAVE_REQUEST_CREATED",
      title: "ignored",
      message: "private reason should not be copied",
      linkUrl: "/leaves/approvals/request-1",
      appBaseUrl: "https://app.example.com",
      context: {
        leaveTypeName: "연차",
        startDate: "2026-05-01",
        endDate: "2026-05-01",
        reason: "private reason",
      },
    });

    expect(template.subject).toBe("휴가 승인 요청이 등록되었습니다.");
    expect(template.text).toContain("연차");
    expect(template.text).not.toContain("private reason");
  });

  it("builds auto-confirmed leave email without private reasons", () => {
    const template = buildExternalEmailTemplate({
      type: "LEAVE_AUTO_CONFIRMED",
      title: "ignored",
      message: "private reason should not be copied",
      linkUrl: "/leaves/me/requests/request-1",
      appBaseUrl: "https://app.example.com",
      context: {
        leaveTypeName: "연차",
        startDate: "2026-05-01",
        endDate: "2026-05-01",
        reason: "private reason",
      },
    });

    expect(template.subject).toBe("휴가 요청이 자동 확정되었습니다.");
    expect(template.text).toContain("연차");
    expect(template.text).toContain("https://app.example.com/leaves/me/requests/request-1");
    expect(template.text).not.toContain("private reason");
  });

  it("builds invitation email with link and one-time code", () => {
    const template = buildInvitationEmailTemplate({
      invitationUrl: "https://app.example.com/i/A7K9P2Q8",
      verificationCode: "48291370",
    });

    expect(template.text).toContain("https://app.example.com/i/A7K9P2Q8");
    expect(template.text).toContain("48291370");
  });
});

describe("email and Slack providers", () => {
  it("console email provider is disabled in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const result = await new ConsoleEmailProvider().sendEmail({
      to: "user@example.com",
      subject: "subject",
      text: "body",
    });

    expect(result.ok).toBe(false);
  });

  it("sendEmail returns failure instead of throwing when disabled", async () => {
    const result = await sendEmail({
      to: "user@example.com",
      subject: "subject",
      text: "body",
    });

    expect(result.ok).toBe(false);
  });

  it("skips external notification dispatch when email is disabled", async () => {
    await expect(
      dispatchExternalNotification({
        type: "SECURITY_EVENT",
        recipientEmail: "owner@example.com",
        title: "중요 보안 이벤트가 발생했습니다.",
        message: "보안 대시보드에서 내용을 확인해 주세요.",
        linkUrl: "/admin/security",
        context: { token: "secret-token" },
      }),
    ).resolves.toBeUndefined();
  });

  it("Slack webhook provider returns failure instead of throwing", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.test/services/test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    const result = await new WebhookSlackProvider().sendMessage({
      text: "safe operational alert",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("500");
  });
});
