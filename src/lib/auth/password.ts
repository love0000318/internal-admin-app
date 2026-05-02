import { compare, hash } from "bcryptjs";

import type { PasswordPolicyResult } from "@/lib/auth/types";

export const PASSWORD_MIN_LENGTH = 8;
export const BCRYPT_HIGH_COST = 12;

export function getPasswordPolicyResult(password: string): PasswordPolicyResult {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push("PASSWORD_TOO_SHORT");
  }

  if (!/[A-Za-z]/.test(password)) {
    errors.push("PASSWORD_REQUIRES_LETTER");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("PASSWORD_REQUIRES_NUMBER");
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push("PASSWORD_REQUIRES_SPECIAL_CHARACTER");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validatePasswordPolicy(password: string): boolean {
  return getPasswordPolicyResult(password).valid;
}

export async function hashPassword(password: string): Promise<string> {
  const result = getPasswordPolicyResult(password);

  if (!result.valid) {
    throw new Error(`Password policy violation: ${result.errors.join(",")}`);
  }

  // Argon2id is preferred for production. bcrypt high cost is used for this
  // foundation because it is already available in the project dependencies.
  return hash(password, BCRYPT_HIGH_COST);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return compare(password, passwordHash);
}
