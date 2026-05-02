import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const DEV_TOKEN_SECRET =
  "dev-only-internal-ops-generic-token-secret-change-before-production";

function getTokenSecret() {
  const secret = process.env.TOKEN_SECRET ?? process.env.APP_SECRET;

  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("TOKEN_SECRET or APP_SECRET is required.");
  }

  return secret ?? DEV_TOKEN_SECRET;
}

export function generateSecureToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHmac("sha256", getTokenSecret()).update(token).digest("hex");
}

export function verifyTokenHash(token: string, expectedHash: string) {
  const actualHash = hashToken(token);
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
