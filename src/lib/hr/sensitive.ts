import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const DEV_SECRET = "dev-only-hr-encryption-secret-change-before-production";

function getEncryptionSecret() {
  const secret = process.env.ENCRYPTION_SECRET;

  if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) {
    throw new Error("ENCRYPTION_SECRET must be at least 32 characters in production.");
  }

  return secret || DEV_SECRET;
}

function getKey() {
  return createHash("sha256").update(getEncryptionSecret()).digest();
}

export function encryptSensitiveText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `v1:${iv.toString("base64url")}:${authTag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSensitiveText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const [version, iv, authTag, encrypted] = value.split(":");

  if (version !== "v1" || !iv || !authTag || !encrypted) {
    throw new Error("Unsupported encrypted sensitive value.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function isEncryptedValue(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const [version, iv, authTag, encrypted, ...rest] = value.split(":");

  return (
    rest.length === 0 &&
    version === "v1" &&
    Boolean(iv) &&
    Boolean(authTag) &&
    Boolean(encrypted)
  );
}

export function maskResidentId(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const normalized = value.replace(/\D/g, "");

  if (normalized.length < 7) {
    return "***";
  }

  return `${normalized.slice(0, 6)}-${normalized.slice(6, 7)}******`;
}

export function maskBankAccount(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const normalized = value.replace(/\s+/g, "");

  if (normalized.length <= 6) {
    return "***";
  }

  return `${normalized.slice(0, 3)}${"*".repeat(Math.max(normalized.length - 6, 4))}${normalized.slice(-3)}`;
}
