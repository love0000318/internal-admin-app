"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { hashInvitationToken, isInvitationExpired } from "@/lib/auth/invitation-token";
import { verifyInvitationVerificationCode } from "@/lib/auth/invitation-verification-code";
import { hashPassword, validatePasswordPolicy } from "@/lib/auth/password";
import { normalizePhoneNumber } from "@/lib/auth/phone";
import { createSessionForUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { createEmployeeProfilesFromPrejoin } from "@/lib/hr/profile-provisioning";
import { maskEmail } from "@/lib/security/masking";

export type AcceptInvitationFormState = {
  error: string | null;
};

const acceptInvitationSchema = z
  .object({
    token: z.string().min(1),
    name: z.string().trim().min(1),
    phone: z.string().trim().min(1),
    password: z.string().min(8),
    passwordConfirm: z.string().min(8),
    verificationCode: z.string().trim().min(1),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "PASSWORD_CONFIRM_MISMATCH",
  });

const invalidCodeMessage = "가입 인증 코드가 올바르지 않거나 만료되었습니다.";

export async function acceptInvitationAction(
  _prevState: AcceptInvitationFormState,
  formData: FormData,
): Promise<AcceptInvitationFormState> {
  const parsed = acceptInvitationSchema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
    verificationCode: formData.get("verificationCode"),
  });

  if (!parsed.success) {
    return { error: "가입 정보를 다시 확인해 주세요." };
  }

  const prisma = getPrisma();
  const phone = normalizePhoneNumber(parsed.data.phone);
  const tokenHash = hashInvitationToken(parsed.data.token);
  const invitation = await prisma.invitation.findUnique({
    where: {
      tokenHash,
    },
    include: {
      employeePrejoinProfile: true,
    },
  });

  if (!invitation) {
    return { error: "유효하지 않은 초대 링크입니다." };
  }

  if (invitation.status === "ACCEPTED" || invitation.acceptedAt || invitation.usedAt) {
    return { error: "이미 사용된 초대 링크입니다." };
  }

  if (invitation.status !== "PENDING") {
    return { error: "유효하지 않은 초대 링크입니다." };
  }

  if (isInvitationExpired(invitation.expiresAt)) {
    await prisma.invitation.update({
      where: {
        id: invitation.id,
      },
      data: {
        status: "EXPIRED",
      },
    });

    return { error: "만료된 초대 링크입니다." };
  }

  const codeResult = verifyInvitationVerificationCode({
    invitation,
    code: parsed.data.verificationCode,
  });

  if (!codeResult.ok) {
    const nextAttemptCount =
      codeResult.reason === "mismatch"
        ? Math.min(
            invitation.verificationCodeAttemptCount + 1,
            invitation.verificationCodeMaxAttempts,
          )
        : invitation.verificationCodeAttemptCount;

    if (codeResult.reason === "mismatch") {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: {
          verificationCodeAttemptCount: {
            increment: 1,
          },
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        action: "INVITATION_VERIFICATION_CODE_FAILED",
        targetType: "INVITATION",
        targetId: invitation.id,
        metadata: {
          invitationId: invitation.id,
          targetEmailMasked: maskEmail(invitation.email),
          role: invitation.role,
          attemptCount: nextAttemptCount,
          status:
            nextAttemptCount >= invitation.verificationCodeMaxAttempts
              ? "LOCKED"
              : "FAILED",
        },
      },
    });

    return { error: invalidCodeMessage };
  }

  if (parsed.data.name !== invitation.expectedName) {
    return { error: "가입 정보를 다시 확인해 주세요." };
  }

  const existingPhoneUser = await prisma.user.findUnique({
    where: {
      phone,
    },
  });

  if (existingPhoneUser) {
    return { error: "이미 등록된 전화번호입니다." };
  }

  const existingEmailUser = await prisma.user.findUnique({
    where: {
      email: invitation.email,
    },
  });

  if (existingEmailUser) {
    return { error: "이미 등록된 이메일입니다." };
  }

  if (!validatePasswordPolicy(parsed.data.password)) {
    return {
      error: "비밀번호는 영문, 숫자, 특수문자를 포함한 8자 이상이어야 합니다.",
    };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const now = new Date();
  let user: { id: string };

  try {
    user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: invitation.email,
          phone,
          name: parsed.data.name,
          title: invitation.title ?? invitation.jobTitle,
          teamId: invitation.teamId,
          hireDate: invitation.hireDate,
          birthDate: invitation.birthDate ?? invitation.birthday,
          role: invitation.role,
          status: "ACTIVE",
          passwordHash,
          profile: {
            create: {
              teamId: invitation.teamId,
              jobTitle: invitation.title ?? invitation.jobTitle,
              hireDate: invitation.hireDate,
              birthday: invitation.birthDate ?? invitation.birthday,
            },
          },
        },
      });

      await tx.identityVerification.create({
        data: {
          userId: createdUser.id,
          invitationId: invitation.id,
          provider: "invitation-code",
          verifiedName: parsed.data.name,
          verifiedPhone: phone,
          providerRef: null,
          verifiedAt: now,
        },
      });

      const accepted = await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          status: "PENDING",
          acceptedAt: null,
          usedAt: null,
          verificationCodeConsumedAt: null,
          verificationCodeRevokedAt: null,
          verificationCodeAttemptCount: {
            lt: invitation.verificationCodeMaxAttempts,
          },
        },
        data: {
          status: "ACCEPTED",
          usedAt: now,
          acceptedAt: now,
          acceptedUserId: createdUser.id,
          acceptedByUserId: createdUser.id,
          verificationCodeConsumedAt: now,
        },
      });

      if (accepted.count !== 1) {
        throw new Error("Invitation has already been used.");
      }

      await tx.auditLog.create({
        data: {
          actorId: createdUser.id,
          actorUserId: createdUser.id,
          targetUserId: createdUser.id,
          action: "USER_CREATED",
          targetType: "USER",
          targetId: createdUser.id,
          metadata: {
            role: invitation.role,
            targetEmailMasked: maskEmail(invitation.email),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: createdUser.id,
          actorUserId: createdUser.id,
          targetUserId: createdUser.id,
          action: "INVITATION_ACCEPTED",
          targetType: "INVITATION",
          targetId: invitation.id,
          metadata: {
            role: invitation.role,
            targetEmailMasked: maskEmail(invitation.email),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: createdUser.id,
          actorUserId: createdUser.id,
          targetUserId: createdUser.id,
          action: "INVITATION_VERIFICATION_CODE_CONSUMED",
          targetType: "INVITATION",
          targetId: invitation.id,
          metadata: {
            invitationId: invitation.id,
            targetEmailMasked: maskEmail(invitation.email),
            role: invitation.role,
            status: "CONSUMED",
          },
        },
      });

      if (invitation.employeePrejoinProfileId) {
        await createEmployeeProfilesFromPrejoin({
          tx,
          userId: createdUser.id,
          prejoinProfileId: invitation.employeePrejoinProfileId,
        });

        await tx.notification.create({
          data: {
            userId: createdUser.id,
            type: "SYSTEM",
            title: "인사정보를 확인해 주세요.",
            message:
              "초대 가입 시 등록된 인사정보가 자동으로 입력되었습니다. 내용을 확인하고 필요한 항목을 수정해 주세요.",
            linkUrl: "/profile/confirm",
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: createdUser.id,
            actorUserId: createdUser.id,
            targetUserId: createdUser.id,
            action: "EMPLOYEE_PROFILE_CREATED_FROM_IMPORT",
            targetType: "EMPLOYEE_PROFILE",
            targetId: createdUser.id,
            metadata: {
              userId: createdUser.id,
              prejoinProfileId: invitation.employeePrejoinProfileId,
            },
          },
        });
      }

      return createdUser;
    });
  } catch {
    return { error: "초대 링크를 처리할 수 없습니다. 다시 시도해 주세요." };
  }

  await createSessionForUser(user.id);
  redirect(invitation.employeePrejoinProfileId ? "/profile/confirm" : "/dashboard");
}
