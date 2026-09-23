import { createPrivateKey, randomUUID, sign, timingSafeEqual } from "crypto";

import type { AuthenticatedUser } from "@/lib/auth/types";
import { getPrisma } from "@/lib/db/prisma";

const MEETING_TEAMS = ["service", "trainer", "camera", "cs"] as const;
type MeetingTeam = (typeof MEETING_TEAMS)[number];

type MeetingAccess = {
  role: "admin" | "recorder";
  teams: MeetingTeam[];
};

function parseBoolean(value: string | undefined, fallback = false) {
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function normalizeOrigin(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required.`);
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be an HTTPS origin.`);
  }
  return url.origin;
}

function getConfig() {
  const enabled = parseBoolean(process.env.MEETING_SSO_ENABLED, false);
  const clientId = process.env.MEETING_SSO_CLIENT_ID ?? "curinginnos-meeting";
  const keyId = process.env.MEETING_SSO_KEY_ID ?? "meeting-ops-1";
  const privateKey = process.env.MEETING_SSO_PRIVATE_KEY?.replace(/\\n/g, "\n") ?? "";
  const clientSecret = process.env.MEETING_SSO_CLIENT_SECRET ?? "";
  const meetingOrigin = process.env.MEETING_APP_ORIGIN
    ? normalizeOrigin(process.env.MEETING_APP_ORIGIN, "MEETING_APP_ORIGIN")
    : "";
  const allowAllInternal = parseBoolean(process.env.MEETING_SSO_ALLOW_ALL_INTERNAL, false);

  const teamMap: Record<string, MeetingTeam[]> = {};
  if (process.env.MEETING_SSO_TEAM_MAP_JSON) {
    const parsed = JSON.parse(process.env.MEETING_SSO_TEAM_MAP_JSON) as Record<string, string[]>;
    for (const [key, values] of Object.entries(parsed)) {
      const teams = values.filter((value): value is MeetingTeam =>
        (MEETING_TEAMS as readonly string[]).includes(value),
      );
      if (teams.length) teamMap[key] = [...new Set(teams)];
    }
  }

  return {
    enabled,
    clientId,
    keyId,
    privateKey,
    clientSecret,
    meetingOrigin,
    allowAllInternal,
    teamMap,
  };
}

export function getMeetingSsoPublicConfig() {
  const cfg = getConfig();
  return {
    enabled: cfg.enabled,
    clientId: cfg.clientId,
    meetingOrigin: cfg.meetingOrigin,
  };
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyMeetingClientSecret(value: string | null) {
  const cfg = getConfig();
  if (!cfg.enabled || !cfg.clientSecret || !value?.startsWith("Bearer ")) return false;
  return safeEqual(value.slice(7), cfg.clientSecret);
}

export function validateMeetingAuthorizeRequest(input: {
  clientId: string | null;
  redirectUri: string | null;
  state: string | null;
  nonce: string | null;
}) {
  const cfg = getConfig();
  if (!cfg.enabled || !cfg.privateKey || !cfg.clientSecret || !cfg.meetingOrigin) {
    throw new Error("Meeting SSO is not configured.");
  }
  if (input.clientId !== cfg.clientId) throw new Error("Invalid client_id.");
  if (!input.redirectUri) throw new Error("Missing redirect_uri.");

  const redirect = new URL(input.redirectUri);
  const expected = new URL(cfg.meetingOrigin + "/");
  if (
    redirect.protocol !== "https:" ||
    redirect.origin !== expected.origin ||
    redirect.pathname !== "/" ||
    redirect.search ||
    redirect.hash
  ) {
    throw new Error("Invalid redirect_uri.");
  }

  if (!input.state || input.state.length < 20 || input.state.length > 100) {
    throw new Error("Invalid state.");
  }
  if (!input.nonce || input.nonce.length < 20 || input.nonce.length > 100) {
    throw new Error("Invalid nonce.");
  }

  return cfg;
}

export function resolveMeetingAccess(user: AuthenticatedUser): MeetingAccess | null {
  const cfg = getConfig();
  if (user.status !== "ACTIVE" || user.role === "EXTERNAL_PARTNER") return null;

  if (user.role === "OWNER") {
    return { role: "admin", teams: [...MEETING_TEAMS] };
  }

  if (cfg.allowAllInternal) {
    return { role: "recorder", teams: [...MEETING_TEAMS] };
  }

  const mapped = user.teamId ? cfg.teamMap[user.teamId] : undefined;
  if (!mapped?.length) return null;
  return { role: "recorder", teams: mapped };
}

function base64urlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function issueMeetingTicket(input: {
  user: AuthenticatedUser;
  sessionRef: string;
  nonce: string;
}) {
  const cfg = getConfig();
  const access = resolveMeetingAccess(input.user);
  if (!access) throw new Error("Meeting access is not allowed.");

  const now = Math.floor(Date.now() / 1000);
  const header = base64urlJson({ alg: "EdDSA", typ: "JWT", kid: cfg.keyId });
  const payload = base64urlJson({
    iss: normalizeOrigin(process.env.APP_BASE_URL ?? process.env.OPS_PUBLIC_ORIGIN, "APP_BASE_URL"),
    aud: cfg.clientId,
    sub: input.user.id,
    nonce: input.nonce,
    iat: now,
    exp: now + 60,
    jti: randomUUID(),
    session_ref: input.sessionRef,
  });
  const signingInput = `${header}.${payload}`;
  const privateKey = createPrivateKey(cfg.privateKey);
  const signature = sign(null, Buffer.from(signingInput, "ascii"), privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

export async function introspectMeetingSession(sessionRef: string) {
  if (!sessionRef || sessionRef.length > 200) return { active: false as const };

  const prisma = getPrisma();
  const session = await prisma.session.findUnique({
    where: { id: sessionRef },
    include: {
      user: {
        include: {
          profile: true,
        },
      },
    },
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt.getTime() <= Date.now() ||
    session.user.status !== "ACTIVE"
  ) {
    return { active: false as const };
  }

  const user: AuthenticatedUser = {
    id: session.user.id,
    phone: session.user.phone,
    name: session.user.name,
    title: session.user.title ?? session.user.profile?.jobTitle ?? null,
    role: session.user.role,
    status: session.user.status,
    teamId: session.user.teamId ?? session.user.profile?.teamId ?? null,
    managedTeamIds: [],
  };

  const access = resolveMeetingAccess(user);
  if (!access) return { active: false as const };

  return {
    active: true as const,
    sub: user.id,
    name: user.name,
    role: access.role,
    teams: access.teams,
    expires: Math.floor(session.expiresAt.getTime() / 1000),
  };
}
