export type EmailProviderName = "console" | "resend";

function envFlag(name: string, defaultValue = false) {
  const value = process.env[name];

  if (value === undefined || value === "") {
    return defaultValue;
  }

  return value === "true" || value === "1";
}

export function getEmailProviderName(): EmailProviderName | null {
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();

  if (provider === "console" || provider === "resend") {
    return provider;
  }

  return null;
}

export function isExternalEmailEnabled() {
  return envFlag("EXTERNAL_EMAIL_NOTIFICATIONS_ENABLED", false);
}

export function isEmailProviderUsable() {
  if (!isExternalEmailEnabled()) {
    return false;
  }

  const provider = getEmailProviderName();

  if (!provider) {
    return false;
  }

  if (provider === "console") {
    return process.env.NODE_ENV !== "production";
  }

  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function isInvitationEmailAvailable() {
  return isEmailProviderUsable();
}

export function getEmailReplyTo() {
  return process.env.EMAIL_REPLY_TO || undefined;
}

export function isSlackNotificationsEnabled() {
  return envFlag("SLACK_NOTIFICATIONS_ENABLED", false);
}

export function shouldNotifySlackJobFailures() {
  return envFlag("SLACK_NOTIFY_JOB_FAILURES", true);
}

export function shouldNotifySlackLeaveRequests() {
  return envFlag("SLACK_NOTIFY_LEAVE_REQUESTS", false);
}

export function isSlackProviderUsable() {
  return isSlackNotificationsEnabled() && Boolean(process.env.SLACK_WEBHOOK_URL);
}
