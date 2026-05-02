"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { encryptSensitiveText } from "@/lib/hr/sensitive";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

const profileUpdateSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  englishName: z.string().trim().max(120).optional(),
  personalEmail: z
    .string()
    .trim()
    .max(200)
    .optional()
    .refine((value) => !value || z.string().email().safeParse(value).success),
  phoneNumber: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  postalCode: z.string().trim().max(20).optional(),
});

const changeRequestSchema = z.object({
  section: z.enum(["PRIVATE", "BANK"]),
  residentId: z.string().trim().max(30).optional(),
  bankName: z.string().trim().max(80).optional(),
  bankAccount: z.string().trim().max(80).optional(),
  bankAccountHolder: z.string().trim().max(80).optional(),
  reason: z.string().trim().max(500).optional(),
});

function nullable(value: string | undefined) {
  return value && value.length > 0 ? value : null;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function confirmMyProfile() {
  const actor = await requireRouteAccess("/profile");
  const prisma = getPrisma();
  const now = new Date();

  await prisma.employeeProfile.upsert({
    where: { userId: actor.id },
    create: {
      userId: actor.id,
      legalName: actor.name,
      displayName: actor.name,
      profileCompletedAt: now,
      lastConfirmedAt: now,
    },
    update: {
      profileCompletedAt: now,
      lastConfirmedAt: now,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      targetUserId: actor.id,
      action: "EMPLOYEE_PROFILE_CONFIRMED",
      targetType: "EMPLOYEE_PROFILE",
      targetId: actor.id,
      metadata: {
        userId: actor.id,
        section: "BASIC",
      },
    },
  });

  redirect("/profile?success=confirmed");
}

export async function updateMyBasicProfile(formData: FormData) {
  const actor = await requireRouteAccess("/profile");
  const parsed = profileUpdateSchema.safeParse({
    displayName: formData.get("displayName"),
    englishName: formData.get("englishName"),
    personalEmail: formData.get("personalEmail"),
    phoneNumber: formData.get("phoneNumber"),
    address: formData.get("address"),
    postalCode: formData.get("postalCode"),
  });

  if (!parsed.success) {
    redirect("/profile/edit?error=invalid");
  }

  const prisma = getPrisma();
  const before = await prisma.employeeProfile.findUnique({
    where: { userId: actor.id },
  });
  const data = {
    displayName: nullable(parsed.data.displayName),
    englishName: nullable(parsed.data.englishName),
    personalEmail: nullable(parsed.data.personalEmail),
    phoneNumber: nullable(parsed.data.phoneNumber),
    address: nullable(parsed.data.address),
    postalCode: nullable(parsed.data.postalCode),
  };

  await prisma.employeeProfile.upsert({
    where: { userId: actor.id },
    create: {
      userId: actor.id,
      legalName: actor.name,
      ...data,
    },
    update: data,
  });

  await prisma.user.update({
    where: { id: actor.id },
    data: {
      name: data.displayName ?? before?.legalName ?? actor.name,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      targetUserId: actor.id,
      action: "EMPLOYEE_PROFILE_UPDATED_BY_SELF",
      targetType: "EMPLOYEE_PROFILE",
      targetId: actor.id,
      metadata: {
        userId: actor.id,
        section: "BASIC",
        changedFields: Object.keys(data),
      },
    },
  });

  redirect("/profile?success=updated");
}

export async function createMyProfileChangeRequest(formData: FormData) {
  const actor = await requireRouteAccess("/profile");
  const parsed = changeRequestSchema.safeParse({
    section: formData.get("section"),
    residentId: formData.get("residentId"),
    bankName: formData.get("bankName"),
    bankAccount: formData.get("bankAccount"),
    bankAccountHolder: formData.get("bankAccountHolder"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    redirect("/profile/edit?error=invalid-change-request");
  }

  const requestedChanges = {
    ...(parsed.data.residentId
      ? { residentIdEncrypted: encryptSensitiveText(parsed.data.residentId) }
      : {}),
    ...(parsed.data.bankAccount
      ? { bankAccountEncrypted: encryptSensitiveText(parsed.data.bankAccount) }
      : {}),
    ...(parsed.data.bankName ? { bankName: parsed.data.bankName } : {}),
    ...(parsed.data.bankAccountHolder
      ? { bankAccountHolder: parsed.data.bankAccountHolder }
      : {}),
    ...(parsed.data.reason ? { reason: parsed.data.reason } : {}),
  };

  if (Object.keys(requestedChanges).length === 0) {
    redirect("/profile/edit?error=empty-change-request");
  }

  const prisma = getPrisma();
  const request = await prisma.employeeProfileChangeRequest.create({
    data: {
      userId: actor.id,
      section: parsed.data.section,
      requestedChanges: json({
        ...requestedChanges,
        sensitiveValuesEncrypted: true,
      }),
      beforeSnapshot: json({
        redacted: true,
      }),
    },
  });

  const owners = await prisma.user.findMany({
    where: { role: "OWNER", status: "ACTIVE" },
    select: { id: true },
  });

  if (owners.length > 0) {
    await prisma.notification.createMany({
      data: owners.map((owner) => ({
        userId: owner.id,
        type: "SYSTEM",
        title: "직원 정보 수정 요청이 등록되었습니다.",
        message: `${actor.name} 님이 인사정보 수정을 요청했습니다.`,
        linkUrl: "/admin/profile-change-requests",
      })),
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      targetUserId: actor.id,
      action: "EMPLOYEE_PROFILE_CHANGE_REQUEST_CREATED",
      targetType: "PROFILE_CHANGE_REQUEST",
      targetId: request.id,
      metadata: {
        requestId: request.id,
        userId: actor.id,
        section: parsed.data.section,
        changedFields: Object.keys(requestedChanges).filter((key) => key !== "reason"),
      },
    },
  });

  redirect("/profile?success=change-requested");
}
