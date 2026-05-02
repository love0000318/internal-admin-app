import { sanitizeJobRunError, sanitizeJobRunSummary } from "@/lib/security/sanitize";

export function sanitizeJobSummary(value: unknown): unknown {
  return sanitizeJobRunSummary(value);
}

export function sanitizeJobError(error: unknown) {
  return sanitizeJobRunError(error);
}
