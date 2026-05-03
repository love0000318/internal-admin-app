import {
  sanitizeAuditMetadata,
  stringifySanitizedAuditMetadata,
} from "@/lib/audit/sanitize-audit-metadata";

export function redactAuditValue(value: unknown): unknown {
  return sanitizeAuditMetadata(value);
}

export function stringifyRedactedAuditValue(value: unknown) {
  return stringifySanitizedAuditMetadata(value);
}
