"use server";

import { headers } from "next/headers";

import {
  SelfPasswordChangeError,
  changeOwnPassword,
} from "@/lib/auth/self-password-change";
import { getPrisma } from "@/lib/db/prisma";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export type PasswordChangeFormState = {
  error: string | null;
  successMessage: string | null;
};

export const PASSWORD_CHANGE_INITIAL_STATE: PasswordChangeFormState = {
  error: null,
  successMessage: null,
};

const PASSWORD_CHANGE_ERROR_MESSAGES = {
  FORBIDDEN: "접근 권한이 없습니다.",
  INVALID_INPUT: "모든 항목을 입력해 주세요.",
  CURRENT_PASSWORD_INVALID: "현재 비밀번호가 올바르지 않습니다.",
  PASSWORD_MISMATCH: "새 비밀번호와 확인 비밀번호가 일치하지 않습니다.",
  PASSWORD_POLICY:
    "새 비밀번호는 8자 이상이며 영문, 숫자, 특수문자를 포함해야 합니다.",
} satisfies Record<SelfPasswordChangeError["code"], string>;

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function firstHeaderValue(value: string | null, maxLength: number) {
  const first = value?.split(",")[0]?.trim();
  return first && first.length > 0 ? first.slice(0, maxLength) : null;
}

async function getAuditRequestContext() {
  const headerStore = await headers();

  return {
    ipAddress:
      firstHeaderValue(headerStore.get("x-forwarded-for"), 100) ??
      firstHeaderValue(headerStore.get("x-real-ip"), 100),
    userAgent: firstHeaderValue(headerStore.get("user-agent"), 500),
  };
}

export async function changeMyPasswordAction(
  _prevState: PasswordChangeFormState,
  formData: FormData,
): Promise<PasswordChangeFormState> {
  const actor = await requireRouteAccess("/profile/security");

  try {
    await changeOwnPassword({
      prisma: getPrisma(),
      actor,
      currentPassword: getFormString(formData, "currentPassword"),
      newPassword: getFormString(formData, "newPassword"),
      confirmNewPassword: getFormString(formData, "confirmNewPassword"),
      targetUserIdFromClient: getFormString(formData, "userId"),
      requestContext: await getAuditRequestContext(),
    });

    return {
      error: null,
      successMessage: "비밀번호가 변경되었습니다.",
    };
  } catch (error) {
    if (error instanceof SelfPasswordChangeError) {
      return {
        error: PASSWORD_CHANGE_ERROR_MESSAGES[error.code],
        successMessage: null,
      };
    }

    return {
      error: "비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      successMessage: null,
    };
  }
}
