import type { EmailProvider, SendEmailParams, SendEmailResult } from "@/lib/external-notifications/email-provider";

type ResendSendResponse = {
  id?: string;
  error?: {
    message?: string;
    name?: string;
  };
};

export class ResendEmailProvider implements EmailProvider {
  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;

    if (!apiKey || !from) {
      return { ok: false, error: "resend email provider is not configured" };
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: params.to,
          subject: params.subject,
          text: params.text,
          html: params.html,
          reply_to: params.replyTo,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as ResendSendResponse;

      if (!response.ok) {
        return {
          ok: false,
          error: body.error?.message ?? `resend request failed: ${response.status}`,
        };
      }

      return { ok: true, providerMessageId: body.id };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "resend request failed",
      };
    }
  }
}
