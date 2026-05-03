"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  getLoginThrottleStatus,
  recordLoginAttempt,
} from "@/lib/auth/login-attempts";
import { verifyPassword } from "@/lib/auth/password";
import { normalizePhoneNumber } from "@/lib/auth/phone";
import { createSessionForUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { maskPhoneNumber } from "@/lib/security/masking";

export type LoginFormState = {
  error: string | null;
};

const loginSchema = z.object({
  phone: z.string().trim().min(1),
  password: z.string().min(1),
  rememberMe: z.boolean(),
});

const INVALID_LOGIN_MESSAGE = "전화번호 또는 비밀번호가 올바르지 않습니다.";
const BLOCKED_LOGIN_MESSAGE =
  "로그인 시도가 여러 번 실패했습니다. 잠시 후 다시 시도해 주세요.";

export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = loginSchema.safeParse({
    phone: formData.get("phone"),
    password: formData.get("password"),
    rememberMe: formData.get("rememberMe") === "on",
  });

  if (!parsed.success) {
    return { error: INVALID_LOGIN_MESSAGE };
  }

  const prisma = getPrisma();
  const phone = normalizePhoneNumber(parsed.data.phone);
  const maskedIdentifier = maskPhoneNumber(phone);
  const throttleStatus = await getLoginThrottleStatus({ identifier: phone });

  if (throttleStatus.blocked) {
    await prisma.auditLog.create({
      data: {
        actorId: null,
        actorUserId: null,
        action: "LOGIN_BLOCKED",
        targetType: "SESSION",
        metadata: {
          maskedIdentifier,
          reasonCode: "TOO_MANY_FAILED_ATTEMPTS",
          failedAttemptCount: throttleStatus.failedAttemptCount,
          maxAttempts: throttleStatus.maxAttempts,
        },
      },
    });

    return { error: BLOCKED_LOGIN_MESSAGE };
  }

  const user = await prisma.user.findUnique({
    where: {
      phone,
    },
  });

  if (!user || user.status !== "ACTIVE" || !user.passwordHash) {
    await recordLoginAttempt({
      identifier: phone,
      success: false,
    });

    await prisma.auditLog.create({
      data: {
        actorId: null,
        actorUserId: null,
        action: "LOGIN_FAILED",
        targetType: "SESSION",
        metadata: {
          maskedIdentifier,
          reasonCode: "INVALID_CREDENTIALS_OR_STATUS",
        },
      },
    });

    return { error: INVALID_LOGIN_MESSAGE };
  }

  const verified = await verifyPassword(parsed.data.password, user.passwordHash);

  if (!verified) {
    await recordLoginAttempt({
      identifier: phone,
      success: false,
    });

    await prisma.auditLog.create({
      data: {
        actorId: null,
        actorUserId: null,
        targetUserId: user.id,
        action: "LOGIN_FAILED",
        targetType: "SESSION",
        metadata: {
          maskedIdentifier,
          reasonCode: "INVALID_CREDENTIALS",
        },
      },
    });

    return { error: INVALID_LOGIN_MESSAGE };
  }

  await recordLoginAttempt({
    identifier: phone,
    success: true,
  });

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      lastLoginAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      actorUserId: user.id,
      targetUserId: user.id,
      action: "LOGIN_SUCCEEDED",
      targetType: "SESSION",
      targetId: user.id,
      metadata: {
        rememberMe: parsed.data.rememberMe,
      },
    },
  });

  await createSessionForUser(user.id, {
    rememberMe: parsed.data.rememberMe,
  });
  redirect("/dashboard");
}
