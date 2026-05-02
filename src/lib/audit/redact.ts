import { sanitizeSecurityValue } from "@/lib/security/sanitize";

export function redactAuditValue(value: unknown): unknown {
  return sanitizeSecurityValue(value);
}

export function stringifyRedactedAuditValue(value: unknown) {
  return JSON.stringify(redactAuditValue(value), null, 2);
}
