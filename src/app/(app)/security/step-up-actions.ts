"use server";

import type { StepUpPurpose } from "@/generated/prisma/client";
import { requireCurrentUser } from "@/lib/auth/session";
import { createStepUpVerification } from "@/lib/security/step-up";

export type VerifyStepUpPasswordResult =
  | { ok: true; expiresAt: string }
  | { ok: false; error: "PASSWORD_REQUIRED" | "INVALID_PASSWORD" };

export async function verifyStepUpPasswordAction(params: {
  password: string;
  purpose: StepUpPurpose;
}): Promise<VerifyStepUpPasswordResult> {
  const actor = await requireCurrentUser();
  const password = params.password;

  if (!password) {
    return { ok: false, error: "PASSWORD_REQUIRED" };
  }

  const verification = await createStepUpVerification({
    userId: actor.id,
    purpose: params.purpose,
    password,
  });

  if (!verification) {
    return { ok: false, error: "INVALID_PASSWORD" };
  }

  return { ok: true, expiresAt: verification.expiresAt.toISOString() };
}
