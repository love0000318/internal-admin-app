import type { EmailProvider, SendEmailParams, SendEmailResult } from "@/lib/external-notifications/email-provider";

export class ConsoleEmailProvider implements EmailProvider {
  async sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, error: "console email provider is disabled in production" };
    }

    console.info("[external-email:console]", {
      to: params.to,
      subject: params.subject,
      text: params.text,
    });

    return { ok: true, providerMessageId: `console-${Date.now()}` };
  }
}
