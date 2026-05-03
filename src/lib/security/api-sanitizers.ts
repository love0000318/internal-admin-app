const USER_SECRET_KEYS = new Set([
  "passwordHash",
]);

const SESSION_SECRET_KEYS = new Set([
  "tokenHash",
  "ipAddressHash",
  "userAgentHash",
]);

const INVITATION_SECRET_KEYS = new Set([
  "tokenHash",
  "shortTokenHash",
  "verificationCodeHash",
]);

function omitKeys<T extends Record<string, unknown>>(
  value: T,
  keys: Set<string>,
) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.has(key)),
  );
}

export function sanitizeUserForResponse<T extends Record<string, unknown>>(user: T) {
  return omitKeys(user, USER_SECRET_KEYS);
}

export function sanitizeSessionForResponse<T extends Record<string, unknown>>(
  session: T,
) {
  return omitKeys(session, SESSION_SECRET_KEYS);
}

export function sanitizeInvitationForResponse<T extends Record<string, unknown>>(
  invitation: T,
) {
  return omitKeys(invitation, INVITATION_SECRET_KEYS);
}
