import { createHmac, randomBytes } from "crypto";

const TOKEN_BYTES = 32;

function getCalendarTokenSecret() {
  return (
    process.env.CALENDAR_SUBSCRIPTION_TOKEN_SECRET ??
    process.env.TOKEN_SECRET ??
    process.env.SESSION_SECRET ??
    process.env.APP_SECRET ??
    "development-calendar-subscription-secret"
  );
}

export function generateCalendarSubscriptionToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashCalendarSubscriptionToken(token: string) {
  return createHmac("sha256", getCalendarTokenSecret())
    .update(`calendar-subscription:${token}`)
    .digest("hex");
}

export function getCalendarSubscriptionUrl(token: string) {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

  return `${baseUrl.replace(/\/$/, "")}/api/calendar/ical?token=${encodeURIComponent(token)}`;
}
