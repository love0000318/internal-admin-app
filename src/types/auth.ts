import type { Role } from "@/lib/rbac/roles";

export type SessionDraft = {
  employeeId: string;
  companyId: string;
  role: Role;
  expiresAt: Date;
};

export type PasswordPolicyDraft = {
  minLength: 8;
  requiresLetter: true;
  requiresNumber: true;
  requiresSpecialCharacter: true;
};

export type {
  IdentityVerificationInput,
  IdentityVerificationProvider,
  IdentityVerificationResult,
} from "@/lib/auth/types";

export type AuthImplementationTodo =
  | "hash-password"
  | "issue-http-only-session"
  | "verify-session-server-side"
  | "block-mock-provider-in-production";
