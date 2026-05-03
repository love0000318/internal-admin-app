import { Prisma } from "@/generated/prisma/client";

const REDACTED = "[민감정보 숨김]";
const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 700;
const MAX_SERIALIZED_LENGTH = 12000;

const SENSITIVE_KEY_PATTERN =
  /(password|passwordHash|token|tokenHash|sessionToken|sessionTokenHash|invitationToken|invitationTokenHash|shortToken|shortTokenHash|verificationCode|verificationCodeHash|codeHash|residentId|residentIdEncrypted|foreignResidentId|bankAccount|bankAccountEncrypted|fileKey|privatePath|privateFilePath|filePath|DATABASE_URL|SESSION_SECRET|ENCRYPTION_SECRET|APP_SECRET|TOKEN_SECRET|INVITATION_TOKEN_SECRET|CRON_SECRET|RESEND_API_KEY|SLACK_WEBHOOK_URL|cookie|authorization|secret|apiKey)/i;

const SECRET_LIKE_VALUE_PATTERN =
  /(Bearer\s+[A-Za-z0-9._~+/-]+=*|v1:[A-Za-z0-9_-]{8,}:[A-Za-z0-9_-]{8,}:[A-Za-z0-9_-]{8,}|postgres(?:ql)?:\/\/\S+|[A-Za-z0-9+/=_-]{48,})/g;

function sanitizePrimitive(value: string | number | boolean) {
  if (typeof value !== "string") {
    return value;
  }

  const redacted = value.replace(SECRET_LIKE_VALUE_PATTERN, REDACTED);
  return redacted.length > MAX_STRING_LENGTH
    ? `${redacted.slice(0, MAX_STRING_LENGTH)}...`
    : redacted;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth > MAX_DEPTH) {
    return "[TRUNCATED]";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) => sanitizeValue(entry, depth + 1));
  }

  if (typeof value === "object") {
    const safe: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      safe[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED
        : sanitizeValue(nestedValue, depth + 1);
    }

    return safe;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return sanitizePrimitive(value);
  }

  return String(value);
}

export function sanitizeAuditMetadata(metadata: unknown): Prisma.InputJsonValue {
  try {
    const sanitized = sanitizeValue(metadata);
    const serialized = JSON.stringify(sanitized);

    if (serialized.length > MAX_SERIALIZED_LENGTH) {
      return {
        truncated: true,
        summary: serialized.slice(0, MAX_SERIALIZED_LENGTH),
      } as Prisma.InputJsonValue;
    }

    return JSON.parse(serialized) as Prisma.InputJsonValue;
  } catch {
    return {
      sanitized: false,
      reason: "metadata_sanitize_failed",
    } as Prisma.InputJsonValue;
  }
}

export function stringifySanitizedAuditMetadata(metadata: unknown) {
  return JSON.stringify(sanitizeAuditMetadata(metadata), null, 2);
}
