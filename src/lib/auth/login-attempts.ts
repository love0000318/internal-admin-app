import { getPrisma } from "@/lib/db/prisma";
import { hashSecurityIdentifier } from "@/lib/security/request-fingerprint";

export const LOGIN_ATTEMPT_WINDOW_MINUTES = 15;
export const LOGIN_ATTEMPT_MAX_FAILURES = 5;

export function getLoginAttemptCutoff(now = new Date()) {
  return new Date(now.getTime() - LOGIN_ATTEMPT_WINDOW_MINUTES * 60 * 1000);
}

export function hashLoginIdentifier(identifier: string) {
  return hashSecurityIdentifier(`login:${identifier}`)!;
}

export function isLoginFailureLimitReached(failedAttemptCount: number) {
  return failedAttemptCount >= LOGIN_ATTEMPT_MAX_FAILURES;
}

export async function getLoginThrottleStatus(params: {
  identifier: string;
  now?: Date;
}) {
  const { identifier, now = new Date() } = params;
  const identifierHash = hashLoginIdentifier(identifier);
  const failedAttemptCount = await getPrisma().loginAttempt.count({
    where: {
      identifierHash,
      success: false,
      createdAt: {
        gte: getLoginAttemptCutoff(now),
      },
    },
  });

  return {
    blocked: isLoginFailureLimitReached(failedAttemptCount),
    failedAttemptCount,
    maxAttempts: LOGIN_ATTEMPT_MAX_FAILURES,
  };
}

export async function recordLoginAttempt(params: {
  identifier: string;
  success: boolean;
  ipHash?: string | null;
  userAgentHash?: string | null;
}) {
  const identifierHash = hashLoginIdentifier(params.identifier);
  const prisma = getPrisma();

  if (params.success) {
    await prisma.loginAttempt.deleteMany({
      where: {
        identifierHash,
        success: false,
      },
    });
  }

  await prisma.loginAttempt.create({
    data: {
      identifierHash,
      success: params.success,
      ipHash: params.ipHash ?? null,
      userAgentHash: params.userAgentHash ?? null,
    },
  });
}
