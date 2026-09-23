import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  timingSafeEqual,
} from "node:crypto";

export function exactOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error("HTTPS origin required");
  }
  return url.origin;
}

export function secretEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signingKey(pem) {
  return createPrivateKey(pem.replace(/\\n/g, "\n"));
}

export function publicPem(privateKey) {
  return createPublicKey(privateKey).export({ type: "spki", format: "pem" });
}

export function makeTicket(payload, key, keyId) {
  const header = Buffer.from(
    JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: keyId }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const input = `${header}.${body}`;
  const signature = sign(null, Buffer.from(input), key).toString("base64url");
  return `${input}.${signature}`;
}

function referenceKey(secret) {
  return createHash("sha256")
    .update("ci-meeting-session-reference-v1\0" + secret)
    .digest();
}

export function sealReference(data, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", referenceKey(secret), iv);
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString("base64url");
}

export function openReference(value, secret) {
  if (typeof value !== "string" || value.length > 4000) {
    throw new Error("bad reference");
  }
  const raw = Buffer.from(value, "base64url");
  if (raw.length < 29) throw new Error("bad reference");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    referenceKey(secret),
    raw.subarray(0, 12),
  );
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(raw.subarray(28)),
      decipher.final(),
    ]).toString("utf8"),
  );
}

const PERMITTED_TEAMS = ["service", "trainer", "camera", "cs"];

export function accessFor(user, teamMap, allowedIds, rollout) {
  if (
    user.status !== "ACTIVE" ||
    !["OWNER", "LEAD", "MANAGER"].includes(user.role)
  ) {
    return null;
  }

  if (user.role === "OWNER") {
    return {
      sub: user.id,
      name: user.name,
      role: "admin",
      teams: [...PERMITTED_TEAMS],
    };
  }

  if (rollout === "all-internal") {
    return {
      sub: user.id,
      name: user.name,
      role: "recorder",
      teams: [...PERMITTED_TEAMS],
    };
  }

  if (rollout !== "pilot" || !allowedIds.includes(user.id)) {
    return null;
  }

  const permitted = new Set(PERMITTED_TEAMS);
  const ids = [user.teamId, ...(user.managedTeamIds ?? [])].filter(Boolean);
  const teams = [
    ...new Set(ids.flatMap((id) => teamMap[id] ?? [])),
  ];

  if (!teams.length || teams.some((team) => !permitted.has(team))) {
    return null;
  }

  return {
    sub: user.id,
    name: user.name,
    role: "recorder",
    teams,
  };
}
