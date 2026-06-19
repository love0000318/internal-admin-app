import type { AttachmentPolicy } from "@/generated/prisma/client";
import type { LeavePolicy, LeaveType } from "@/lib/leave/types";

export const RESERVE_FORCES_LEAVE_TYPE = "RESERVE_FORCES" as const;

export type LegacyLeaveTypeDefinitionForRequest = {
  id: string;
  code: string;
  name: string;
  isEnabled: boolean;
  attachmentPolicy: AttachmentPolicy;
  deductsAnnualBalance: boolean;
};

export type LegacyLeaveTypeRequestError =
  | "reserve-forces-type-missing"
  | "disabled-policy";

export function getLegacyLeaveTypeRequestError({
  type,
  leaveTypeDefinition,
}: {
  type: LeaveType;
  leaveTypeDefinition: LegacyLeaveTypeDefinitionForRequest | null;
}): LegacyLeaveTypeRequestError | null {
  if (type === RESERVE_FORCES_LEAVE_TYPE && !leaveTypeDefinition) {
    return "reserve-forces-type-missing";
  }

  if (
    type === RESERVE_FORCES_LEAVE_TYPE &&
    leaveTypeDefinition &&
    !leaveTypeDefinition.isEnabled
  ) {
    return "disabled-policy";
  }

  return null;
}

export function legacyLeaveTypeDeductsAnnualBalance({
  type,
  policy,
}: {
  type: LeaveType;
  policy: Pick<LeavePolicy, "deductsAnnual"> & {
    deductsAnnualBalance?: boolean | null;
  };
}) {
  if (type === RESERVE_FORCES_LEAVE_TYPE) {
    return false;
  }

  return policy.deductsAnnualBalance ?? policy.deductsAnnual;
}

export function resolveLegacyLeaveAttachmentPolicy({
  leaveTypeDefinition,
  fallbackRequiresAttachment,
}: {
  leaveTypeDefinition: LegacyLeaveTypeDefinitionForRequest | null;
  fallbackRequiresAttachment: boolean;
}): AttachmentPolicy {
  if (leaveTypeDefinition) {
    return leaveTypeDefinition.attachmentPolicy;
  }

  return fallbackRequiresAttachment ? "REQUIRED_BEFORE_REQUEST" : "NOT_REQUIRED";
}
