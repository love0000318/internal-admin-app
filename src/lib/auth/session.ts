import { createHmac, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getPrisma } from "@/lib/db/prisma";
import type { AuthenticatedUser } from "@/lib/auth/types";

export const SESSION_COOKIE_NAME = "internal_ops_session";
export const SESSION_TTL_DAYS = 14;
export const REMEMBER_ME_SESSION_TTL_DAYS = 30;

const DEV_SESSION_SECRET =
  "dev-only-internal-ops-session-secret-change-before-production";

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET ?? process.env.APP_SECRET;

  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET or APP_SECRET is required.");
  }

  return secret ?? DEV_SESSION_SECRET;
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getSessionTtlDays() {
  return getPositiveIntegerEnv("SESSION_EXPIRES_IN_DAYS", SESSION_TTL_DAYS);
}

export function getRememberMeSessionTtlDays() {
  return getPositiveIntegerEnv(
    "REMEMBER_ME_SESSION_EXPIRES_IN_DAYS",
    REMEMBER_ME_SESSION_TTL_DAYS,
  );
}

export function getSessionExpiresAt({
  rememberMe = false,
  now = new Date(),
}: {
  rememberMe?: boolean;
  now?: Date;
} = {}) {
  const ttlDays = rememberMe
    ? getRememberMeSessionTtlDays()
    : getSessionTtlDays();

  return new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHmac("sha256", getSessionSecret())
    .update(`session:${token}`)
    .digest("hex");
}

export function isSessionExpired(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() <= now.getTime();
}

export function getSessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

async function getCookieStore() {
  return cookies();
}

async function collectManagedTeamIds(userId: string) {
  const prisma = getPrisma();
  const teams = await prisma.team.findMany({
    select: {
      id: true,
      parentTeamId: true,
      leadUserId: true,
      status: true,
    },
  });
  const managed = new Set(
    teams
      .filter((team) => team.leadUserId === userId && team.status === "ACTIVE")
      .map((team) => team.id),
  );
  let changed = true;

  while (changed) {
    changed = false;

    for (const team of teams) {
      if (
        team.parentTeamId &&
        team.status === "ACTIVE" &&
        managed.has(team.parentTeamId) &&
        !managed.has(team.id)
      ) {
        managed.add(team.id);
        changed = true;
      }
    }
  }

  return [...managed];
}

export async function createSessionForUser(
  userId: string,
  options: { rememberMe?: boolean } = {},
) {
  const prisma = getPrisma();
  const rawToken = createSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = getSessionExpiresAt({
    rememberMe: options.rememberMe ?? false,
  });

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      rememberMe: options.rememberMe ?? false,
      lastUsedAt: new Date(),
    },
  });

  const cookieStore = await getCookieStore();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, getSessionCookieOptions(expiresAt));
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await getCookieStore();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!rawToken) {
    return null;
  }

  const prisma = getPrisma();
  const session = await prisma.session.findUnique({
    where: {
      tokenHash: hashSessionToken(rawToken),
    },
    include: {
      user: {
        include: {
          profile: true,
        },
      },
    },
  });

  if (!session) {
    cookieStore.delete(SESSION_COOKIE_NAME);
    return null;
  }

  if (session.revokedAt) {
    cookieStore.delete(SESSION_COOKIE_NAME);
    return null;
  }

  if (isSessionExpired(session.expiresAt)) {
    await prisma.session.update({
      where: { id: session.id },
      data: {
        revokedAt: new Date(),
        revokedReason: "EXPIRED",
        lastUsedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        actorUserId: session.userId,
        targetUserId: session.userId,
        action: "SESSION_EXPIRED",
        targetType: "SESSION",
        targetId: session.id,
        metadata: {
          reasonCode: "EXPIRED",
          rememberMe: session.rememberMe,
        },
      },
    });

    cookieStore.delete(SESSION_COOKIE_NAME);
    return null;
  }

  if (session.user.status !== "ACTIVE") {
    await prisma.session.update({
      where: { id: session.id },
      data: {
        revokedAt: new Date(),
        revokedReason: "USER_NOT_ACTIVE",
        lastUsedAt: new Date(),
      },
    });

    cookieStore.delete(SESSION_COOKIE_NAME);
    return null;
  }

  const managedTeamIds =
    session.user.role === "LEAD"
      ? await collectManagedTeamIds(session.user.id)
      : [];

  await prisma.session.update({
    where: {
      id: session.id,
    },
    data: {
      lastUsedAt: new Date(),
    },
  });

  return {
    id: session.user.id,
    phone: session.user.phone,
    name: session.user.name,
    title: session.user.title ?? session.user.profile?.jobTitle ?? null,
    role: session.user.role,
    status: session.user.status,
    teamId: session.user.teamId ?? session.user.profile?.teamId ?? null,
    managedTeamIds,
  };
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function destroyCurrentSession(reason = "LOGOUT") {
  const cookieStore = await getCookieStore();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (rawToken) {
    await getPrisma().session.updateMany({
      where: {
        tokenHash: hashSessionToken(rawToken),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
        lastUsedAt: new Date(),
      },
    });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}
