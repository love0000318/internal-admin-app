export type SecretValidationResult = {
  ok: boolean;
  name: string;
  detail?: string;
};

export const SECURITY_SECRET_ENV_KEYS = [
  "APP_SECRET",
  "SESSION_SECRET",
  "TOKEN_SECRET",
  "INVITATION_TOKEN_SECRET",
  "INVITATION_SHORT_TOKEN_SECRET",
  "INVITATION_VERIFICATION_CODE_SECRET",
  "ENCRYPTION_SECRET",
  "CRON_SECRET",
] as const;

export function validateSecretLength(
  name: string,
  value: string | undefined,
  minLength = 32,
): SecretValidationResult {
  return value && value.length >= minLength
    ? { ok: true, name }
    : {
        ok: false,
        name,
        detail: `use a secret with at least ${minLength} characters`,
      };
}

export function findDuplicateSecretNames(
  values: Record<string, string | undefined>,
) {
  const seen = new Map<string, string>();
  const duplicates: Array<[string, string]> = [];

  for (const [name, value] of Object.entries(values)) {
    if (!value) continue;

    const previous = seen.get(value);
    if (previous) {
      duplicates.push([previous, name]);
      continue;
    }

    seen.set(value, name);
  }

  return duplicates;
}

export function validateDistinctSecrets(
  values: Record<string, string | undefined>,
): SecretValidationResult {
  const duplicates = findDuplicateSecretNames(values);

  return duplicates.length === 0
    ? { ok: true, name: "distinct secrets" }
    : {
        ok: false,
        name: "distinct secrets",
        detail: duplicates
          .map(([first, second]) => `${first}/${second}`)
          .join(", "),
      };
}
