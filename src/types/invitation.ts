import type { Role } from "@/types/roles";

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export type InvitationDraft = {
  id: string;
  email: string;
  expectedName: string;
  role: Role;
  teamId: string | null;
  jobTitle: string | null;
  hireDate: Date | null;
  birthday: Date | null;
  tokenHash: string;
  status: InvitationStatus;
  expiresAt: Date;
  usedAt: Date | null;
  acceptedAt: Date | null;
  createdById: string | null;
  acceptedUserId: string | null;
};

export type InvitationFormDraft = {
  email: string;
  expectedName: string;
  role: Exclude<Role, "EXTERNAL_PARTNER">;
  teamId: string;
  jobTitle?: string;
  hireDate?: string;
  birthday?: string;
};

export type InvitationTokenRules = {
  storeRawToken: false;
  hashAlgorithm: "HMAC-SHA256";
  oneTimeUse: true;
};
