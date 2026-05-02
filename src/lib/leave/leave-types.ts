import { z } from "zod";

export const LEAVE_TYPE_CODE_PATTERN = /^[A-Z0-9_]+$/;

export const LEAVE_CATEGORY_VALUES = ["ANNUAL", "CUSTOM"] as const;
export const LEAVE_GRANT_METHOD_VALUES = [
  "SYSTEM",
  "ON_REQUEST",
  "AFTER_ANNUAL_EXHAUSTED",
  "ON_HIRE_DATE",
  "MANUAL",
  "RECURRING",
  "ON_TENURE",
] as const;
export const LEAVE_GRANT_UNIT_VALUES = ["DAY", "HOUR", "MINUTE"] as const;
export const LEAVE_USAGE_MODE_VALUES = [
  "USE_ALL_AT_ONCE",
  "SPLIT_ALLOWED",
] as const;
export const LEAVE_USAGE_UNIT_VALUES = [
  "FULL_DAY",
  "HALF_DAY",
  "HOUR",
  "MINUTE",
] as const;
export const UNUSED_REMAINDER_HANDLING_VALUES = [
  "KEEP_REMAINING",
  "EXPIRE_REMAINING",
] as const;
export const ATTACHMENT_POLICY_VALUES = [
  "NOT_REQUIRED",
  "REQUIRED_BEFORE_REQUEST",
  "REQUIRED_AFTER_REQUEST",
  "OPTIONAL",
] as const;
export const LEAVE_VISIBILITY_VALUES = [
  "PUBLIC_AS_LEAVE",
  "PUBLIC_WITH_TYPE",
  "PRIVATE_TO_APPROVERS",
] as const;

export type LeaveUsageUnitValue = (typeof LEAVE_USAGE_UNIT_VALUES)[number];

export const SYSTEM_REQUIRED_LEAVE_CODES = [
  "ANNUAL",
  "HALF_DAY",
  "RESERVE_FORCES",
  "SICK",
  "BEREAVEMENT",
] as const;

export function normalizeLeaveTypeCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "_");
}

export function validateLeaveTypeCode(code: string) {
  return LEAVE_TYPE_CODE_PATTERN.test(code);
}

export function parseAllowedUnits(value: FormDataEntryValue | FormDataEntryValue[] | null) {
  const values = Array.isArray(value) ? value : value ? [value] : [];

  return values
    .filter((unit): unit is string => typeof unit === "string")
    .filter((unit): unit is LeaveUsageUnitValue =>
      LEAVE_USAGE_UNIT_VALUES.includes(unit as LeaveUsageUnitValue),
    );
}

export function serializeAllowedUnits(units: string[]) {
  return [...new Set(units)].join(",");
}

export function deserializeAllowedUnits(value: string) {
  return value
    .split(",")
    .map((unit) => unit.trim())
    .filter(Boolean);
}

export function validatePaidRate(paidRate: number) {
  return paidRate >= 0 && paidRate <= 1;
}

export function validateAllowedUnits(units: string[]) {
  return units.length > 0;
}

export function assertSystemRequiredLeaveTypeProtection(params: {
  isSystemRequired: boolean;
  beforeCode: string;
  nextCode: string;
  beforeCategory: string;
  nextCategory: string;
}) {
  if (!params.isSystemRequired) {
    return;
  }

  if (params.beforeCode !== params.nextCode) {
    throw new Error("시스템 기본 휴가의 코드는 변경할 수 없습니다.");
  }

  if (params.beforeCategory !== params.nextCategory) {
    throw new Error("시스템 기본 휴가의 구분은 변경할 수 없습니다.");
  }
}

const optionalPositiveNumber = z.preprocess((value) => {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return Number(value);
}, z.number().positive().nullable());

const checkboxBoolean = z.preprocess((value) => value === "on" || value === true, z.boolean());

export const leaveTypeCreateSchema = z.object({
  code: z.string().trim().min(1).transform(normalizeLeaveTypeCode).refine(validateLeaveTypeCode),
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  category: z.enum(LEAVE_CATEGORY_VALUES),
  isEnabled: checkboxBoolean,
  isPaid: checkboxBoolean,
  paidRate: z.coerce.number().min(0).max(1),
  grantMethod: z.enum(LEAVE_GRANT_METHOD_VALUES),
  grantAmount: optionalPositiveNumber,
  grantUnit: z.enum(LEAVE_GRANT_UNIT_VALUES),
  usageMode: z.enum(LEAVE_USAGE_MODE_VALUES),
  allowedUnits: z.array(z.enum(LEAVE_USAGE_UNIT_VALUES)).min(1),
  unusedRemainderHandling: z.enum(UNUSED_REMAINDER_HANDLING_VALUES),
  deductsAnnualBalance: checkboxBoolean,
  attachmentPolicy: z.enum(ATTACHMENT_POLICY_VALUES),
  attachmentDescription: z.string().trim().optional().nullable(),
  includeHolidayInDeduction: checkboxBoolean,
  visibility: z.enum(LEAVE_VISIBILITY_VALUES),
});

export const leaveTypeUpdateSchema = leaveTypeCreateSchema.extend({
  id: z.string().min(1),
});

export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  return Object.keys(after).filter((key) => before[key] !== after[key]);
}
