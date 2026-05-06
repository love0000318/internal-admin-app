import { Prisma } from "@/generated/prisma/client";
import { sanitizeAuditMetadata as sanitizeStrictAuditMetadata } from "@/lib/audit/sanitize-audit-metadata";

const REDACTED = "[민감정보 숨김]";
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 500;

const SENSITIVE_KEY_PATTERN =
  /(password|token|hash|secret|resident|registration|account|bank|fileKey|fileUrl|filePath|attachmentUrl|attachmentContent|storagePath|privatePath|internalPath|private|address|salary|wage|compensation|contractAmount|payroll|beforeSnapshot|requestedChanges|raw|plaintext|plainText)/i;

const SECRET_LIKE_VALUE_PATTERN =
  /(v1:[A-Za-z0-9_-]{8,}:[A-Za-z0-9_-]{8,}:[A-Za-z0-9_-]{8,}|[A-Za-z0-9+/=_-]{32,})/g;

function sanitizePrimitive(value: string | number | boolean) {
  if (typeof value !== "string") {
    return value;
  }

  const redacted = value.replace(SECRET_LIKE_VALUE_PATTERN, REDACTED);

  return redacted.length > MAX_STRING_LENGTH
    ? `${redacted.slice(0, MAX_STRING_LENGTH)}...`
    : redacted;
}

export function sanitizeSecurityValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((entry) => sanitizeSecurityValue(entry));
  }

  if (typeof value === "object") {
    const safe: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      safe[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED
        : sanitizeSecurityValue(nestedValue);
    }

    return safe;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return sanitizePrimitive(value);
  }

  return String(value);
}

export function sanitizeSecurityMetadata(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(sanitizeSecurityValue(value))) as Prisma.InputJsonValue;
}

export function sanitizeAuditMetadata(value: unknown): Prisma.InputJsonValue {
  return sanitizeStrictAuditMetadata(value);
}

export function sanitizeNotificationMetadata(value: unknown): Prisma.InputJsonValue {
  return sanitizeSecurityMetadata(value);
}

export function sanitizeJobRunSummary(value: unknown): Prisma.InputJsonValue {
  return sanitizeSecurityMetadata(value);
}

export function sanitizeJobRunError(error: unknown) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown job error";

  return String(sanitizeSecurityValue(message));
}
