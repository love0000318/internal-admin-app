import { createHmac } from "crypto";

const DEV_FINGERPRINT_SECRET =
  "dev-only-internal-ops-request-fingerprint-secret-change-before-production";

function getFingerprintSecret() {
  const secret =
    process.env.APP_SECRET ??
    process.env.TOKEN_SECRET ??
    process.env.SESSION_SECRET;

  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("APP_SECRET, TOKEN_SECRET, or SESSION_SECRET is required.");
  }

  return secret ?? DEV_FINGERPRINT_SECRET;
}

export function hashSecurityIdentifier(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return createHmac("sha256", getFingerprintSecret())
    .update(`security-fingerprint:${value.trim().toLowerCase()}`)
    .digest("hex");
}

export function hashRequestHeaderValue(value: string | null | undefined) {
  return value ? hashSecurityIdentifier(value.slice(0, 500)) : null;
}
