import { ConsoleEmailProvider } from "@/lib/external-notifications/console-email-provider";
import { getEmailProviderName, getEmailReplyTo, isEmailProviderUsable } from "@/lib/external-notifications/config";
import type { EmailProvider, SendEmailParams, SendEmailResult } from "@/lib/external-notifications/email-provider";
import { ResendEmailProvider } from "@/lib/external-notifications/resend-email-provider";

export function getEmailProvider(): EmailProvider | null {
  if (!isEmailProviderUsable()) {
    return null;
  }

  const provider = getEmailProviderName();

  if (provider === "console") {
    return new ConsoleEmailProvider();
  }

  if (provider === "resend") {
    return new ResendEmailProvider();
  }

  return null;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const provider = getEmailProvider();

  if (!provider) {
    return { ok: false, error: "email notifications are disabled" };
  }

  return provider.sendEmail({
    ...params,
    replyTo: params.replyTo ?? getEmailReplyTo(),
  });
}
