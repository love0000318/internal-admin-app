import type { Role } from "@/lib/rbac/roles";

export type AuthenticatedUser = {
  id: string;
  phone: string | null;
  name: string;
  title: string | null;
  role: Role;
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED" | "DELETED";
  teamId?: string | null;
  managedTeamIds?: string[];
};

export type PasswordPolicyResult = {
  valid: boolean;
  errors: string[];
};

export type InvitationTokenPayload = {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
};

export type IdentityVerificationInput = {
  name: string;
  phoneNumber: string;
  verificationToken: string;
};

export type IdentityVerificationResult = {
  verified: boolean;
  provider: string;
  verifiedName: string;
  verifiedPhoneNumber: string;
  providerRef: string;
  verifiedAt: Date;
};

export interface IdentityVerificationProvider {
  verify(input: IdentityVerificationInput): Promise<IdentityVerificationResult>;
}
