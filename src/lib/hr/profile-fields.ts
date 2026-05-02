export const SELF_EDITABLE_PROFILE_FIELDS = [
  "displayName",
  "englishName",
  "personalEmail",
  "phoneNumber",
  "address",
  "postalCode",
] as const;

export const CHANGE_REQUEST_PROFILE_FIELDS = [
  "residentId",
  "bankAccount",
  "bankName",
  "bankAccountHolder",
  "visaStatus",
  "veteranOrDisabledStatus",
  "disabilityGrade",
] as const;

export const OWNER_ONLY_PROFILE_FIELDS = [
  "employeeNumber",
  "companyEmail",
  "role",
  "teamId",
  "title",
  "hireDate",
  "retirementDate",
  "contractType",
  "contractAmount",
] as const;

export type SelfEditableProfileField = (typeof SELF_EDITABLE_PROFILE_FIELDS)[number];
export type ChangeRequestProfileField =
  (typeof CHANGE_REQUEST_PROFILE_FIELDS)[number];
export type OwnerOnlyProfileField = (typeof OWNER_ONLY_PROFILE_FIELDS)[number];

export function isSelfEditableProfileField(
  field: string,
): field is SelfEditableProfileField {
  return SELF_EDITABLE_PROFILE_FIELDS.includes(field as SelfEditableProfileField);
}

export function requiresProfileChangeRequest(
  field: string,
): field is ChangeRequestProfileField {
  return CHANGE_REQUEST_PROFILE_FIELDS.includes(field as ChangeRequestProfileField);
}

export function isOwnerOnlyProfileField(
  field: string,
): field is OwnerOnlyProfileField {
  return OWNER_ONLY_PROFILE_FIELDS.includes(field as OwnerOnlyProfileField);
}
