"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSessionForUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { normalizePhoneNumber } from "@/lib/auth/phone";
import { getPrisma } from "@/lib/db/prisma";

export type LoginFormState = {
  error: string | null;
};

const loginSchema = z.object({
  phone: z.string().trim().min(1),
  password: z.string().min(1),
  rememberMe: z.boolean(),
});

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
    return { error: "전화번호 또는 비밀번호가 올바르지 않습니다." };
  }

  const prisma = getPrisma();
  const phone = normalizePhoneNumber(parsed.data.phone);
  const user = await prisma.user.findUnique({
    where: {
      phone,
    },
  });

  if (!user || user.status !== "ACTIVE" || !user.passwordHash) {
    await prisma.auditLog.create({
      data: {
        actorId: null,
        actorUserId: null,
        action: "LOGIN_FAILED",
        targetType: "SESSION",
        metadata: {
          phone,
          reason: "INVALID_CREDENTIALS_OR_STATUS",
        },
      },
    });

    return { error: "전화번호 또는 비밀번호가 올바르지 않습니다." };
  }

  const verified = await verifyPassword(parsed.data.password, user.passwordHash);

  if (!verified) {
    await prisma.auditLog.create({
      data: {
        actorId: null,
        actorUserId: null,
        targetUserId: user.id,
        action: "LOGIN_FAILED",
        targetType: "SESSION",
        metadata: {
          phone,
          reason: "INVALID_CREDENTIALS",
        },
      },
    });

    return { error: "전화번호 또는 비밀번호가 올바르지 않습니다." };
  }

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
