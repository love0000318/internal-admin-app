import type { AuditAction } from "@/types/audit";

export type AuditCategoryValue =
  | "GENERAL"
  | "AUTH"
  | "INVITATION"
  | "HR"
  | "LEAVE"
  | "ATTENDANCE"
  | "SECURITY"
  | "REPORT"
  | "JOB"
  | "FILE"
  | "POLICY";

export type AuditSeverityValue = "INFO" | "WARNING" | "HIGH" | "CRITICAL";

const CRITICAL_ACTIONS = new Set<AuditAction>([
  "OWNER_ROLE_GRANTED",
  "OWNER_ROLE_REVOKED",
  "LAST_OWNER_PROTECTION_TRIGGERED",
  "SESSION_REVOKED_BY_ADMIN",
  "SECURITY_SETTING_CHANGED",
  "CSRF_BLOCKED",
  "SUSPICIOUS_LOGIN_DETECTED",
]);

const HIGH_ACTIONS = new Set<AuditAction>([
  "LOGIN_BLOCKED",
  "INVITATION_REISSUED",
  "INVITATION_REISSUED_WITH_STEP_UP",
  "EMPLOYEE_DEACTIVATED_WITH_STEP_UP",
  "REPORT_EXPORTED",
  "AUDIT_LOG_EXPORTED",
  "LEAVE_ATTACHMENT_DOWNLOADED",
  "UNAUTHORIZED_ACCESS_BLOCKED",
  "ROLE_CHANGE_BLOCKED",
  "SELF_ROLE_CHANGE_BLOCKED",
  "EMPLOYEE_DEACTIVATION_BLOCKED",
]);

const WARNING_ACTIONS = new Set<AuditAction>([
  "LOGIN_FAILED",
  "INVITATION_TOKEN_FAILED",
  "INVITATION_VERIFICATION_CODE_FAILED",
  "STEP_UP_VERIFICATION_FAILED",
  "REPORT_EXPORT_STEP_UP_REQUIRED",
  "LEAVE_LEDGER_INCONSISTENCY_FOUND",
  "JOB_RUN_FAILED",
  "EXTERNAL_EMAIL_FAILED",
  "EXTERNAL_SLACK_FAILED",
]);

export function classifyAuditAction(action: AuditAction): {
  category: AuditCategoryValue;
  severity: AuditSeverityValue;
} {
  return {
    category: classifyAuditCategory(action),
    severity: classifyAuditSeverity(action),
  };
}

export function classifyAuditSeverity(action: AuditAction): AuditSeverityValue {
  if (CRITICAL_ACTIONS.has(action)) {
    return "CRITICAL";
  }

  if (HIGH_ACTIONS.has(action)) {
    return "HIGH";
  }

  if (WARNING_ACTIONS.has(action)) {
    return "WARNING";
  }

  return "INFO";
}

export function classifyAuditCategory(action: AuditAction): AuditCategoryValue {
  if (
    action.startsWith("LOGIN") ||
    action === "LOGOUT" ||
    action.startsWith("SESSION_")
  ) {
    return "AUTH";
  }

  if (action.startsWith("INVITATION")) {
    return "INVITATION";
  }

  if (
    action.startsWith("OWNER_") ||
    action.startsWith("STEP_UP_") ||
    action.includes("BLOCKED") ||
    action === "SECURITY_SETTING_CHANGED" ||
    action === "SUSPICIOUS_LOGIN_DETECTED" ||
    action === "CSRF_BLOCKED"
  ) {
    return "SECURITY";
  }

  if (action.startsWith("EMPLOYEE_") || action.startsWith("SENSITIVE_")) {
    return "HR";
  }

  if (
    action.startsWith("LEAVE_") ||
    action.startsWith("CUSTOM_LEAVE_") ||
    action.startsWith("BIRTHDAY_") ||
    action.startsWith("ANNUAL_LEAVE_") ||
    action.startsWith("MONTHLY_LEAVE_") ||
    action.startsWith("APPROVAL_POLICY_")
  ) {
    return "LEAVE";
  }

  if (action.startsWith("ATTENDANCE_")) {
    return "ATTENDANCE";
  }

  if (action.includes("ATTACHMENT")) {
    return "FILE";
  }

  if (action.startsWith("REPORT_") || action === "AUDIT_LOG_EXPORTED") {
    return "REPORT";
  }

  if (action.startsWith("JOB_") || action.startsWith("CRON_")) {
    return "JOB";
  }

  if (action.includes("POLICY") || action.includes("HOLIDAY")) {
    return "POLICY";
  }

  return "GENERAL";
}

export function isHighRiskAuditSeverity(severity: AuditSeverityValue) {
  return severity === "HIGH" || severity === "CRITICAL";
}
