import type { AttachmentPolicy } from "@/generated/prisma/client";
import type { LeavePolicy, LeaveType } from "@/lib/leave/types";

export const RESERVE_FORCES_LEAVE_TYPE = "RESERVE_FORCES" as const;
export const RESERVE_FORCES_ATTACHMENT_POLICY = "OPTIONAL" as const satisfies AttachmentPolicy;

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

function normalizeLeaveTypeCode(value?: string | null) {
  return value?.trim().toUpperCase().replace(/\s+/g, "_") ?? "";
}

export function isReserveForcesLeaveType({
  type,
  code,
  name,
}: {
  type?: string | null;
  code?: string | null;
  name?: string | null;
}) {
  return (
    normalizeLeaveTypeCode(type) === RESERVE_FORCES_LEAVE_TYPE ||
    normalizeLeaveTypeCode(code) === RESERVE_FORCES_LEAVE_TYPE ||
    Boolean(name?.replace(/\s+/g, "").includes("예비군"))
  );
}

export function resolveAttachmentPolicyForLeaveType({
  type,
  code,
  name,
  attachmentPolicy,
}: {
  type?: string | null;
  code?: string | null;
  name?: string | null;
  attachmentPolicy: AttachmentPolicy;
}): AttachmentPolicy {
  if (isReserveForcesLeaveType({ type, code, name })) {
    return RESERVE_FORCES_ATTACHMENT_POLICY;
  }

  return attachmentPolicy;
}

export function isAttachmentRequiredForPolicy(attachmentPolicy: AttachmentPolicy) {
  return (
    attachmentPolicy === "REQUIRED_BEFORE_REQUEST" ||
    attachmentPolicy === "REQUIRED_AFTER_REQUEST"
  );
}

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
  type,
  leaveTypeDefinition,
  fallbackRequiresAttachment,
}: {
  type?: LeaveType;
  leaveTypeDefinition: LegacyLeaveTypeDefinitionForRequest | null;
  fallbackRequiresAttachment: boolean;
}): AttachmentPolicy {
  if (
    isReserveForcesLeaveType({
      type,
      code: leaveTypeDefinition?.code,
      name: leaveTypeDefinition?.name,
    })
  ) {
    return RESERVE_FORCES_ATTACHMENT_POLICY;
  }

  if (leaveTypeDefinition) {
    return leaveTypeDefinition.attachmentPolicy;
  }

  return fallbackRequiresAttachment ? "REQUIRED_BEFORE_REQUEST" : "NOT_REQUIRED";
}
