"use server";

import { redirect } from "next/navigation";

import { getPrisma } from "@/lib/db/prisma";
import { requireOwner } from "@/lib/rbac/server-guards";

function formValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function asChangeMap(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function approveProfileChangeRequest(formData: FormData) {
  const actor = await requireOwner();
  const requestId = formValue(formData, "requestId");

  if (!requestId) {
    redirect("/admin/profile-change-requests?error=invalid");
  }

  const prisma = getPrisma();
  const request = await prisma.employeeProfileChangeRequest.findUnique({
    where: { id: requestId },
    include: { user: true },
  });

  if (!request || request.status !== "PENDING") {
    redirect("/admin/profile-change-requests?error=not-pending");
  }

  const changes = asChangeMap(request.requestedChanges);
  const sensitiveUpdate = {
    ...(typeof changes.residentIdEncrypted === "string"
      ? { residentIdEncrypted: changes.residentIdEncrypted }
      : {}),
    ...(typeof changes.bankAccountEncrypted === "string"
      ? { bankAccountEncrypted: changes.bankAccountEncrypted }
      : {}),
    ...(typeof changes.bankName === "string" ? { bankName: changes.bankName } : {}),
    ...(typeof changes.bankAccountHolder === "string"
      ? { bankAccountHolder: changes.bankAccountHolder }
      : {}),
  };

  await prisma.$transaction(async (tx) => {
    if (Object.keys(sensitiveUpdate).length > 0) {
      await tx.employeeSensitiveProfile.upsert({
        where: { userId: request.userId },
        create: {
          userId: request.userId,
          ...sensitiveUpdate,
        },
        update: sensitiveUpdate,
      });
    }

    await tx.employeeProfileChangeRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedByUserId: actor.id,
      },
    });

    await tx.notification.create({
      data: {
        userId: request.userId,
        type: "SYSTEM",
        title: "정보 수정 요청이 승인되었습니다.",
        message: "요청하신 인사정보 변경 사항이 반영되었습니다.",
        linkUrl: "/profile",
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        targetUserId: request.userId,
        action: "EMPLOYEE_PROFILE_CHANGE_REQUEST_APPROVED",
        targetType: "PROFILE_CHANGE_REQUEST",
        targetId: request.id,
        metadata: {
          requestId: request.id,
          targetUserId: request.userId,
          section: request.section,
          changedFields: Object.keys(sensitiveUpdate),
        },
      },
    });

    if (Object.keys(sensitiveUpdate).length > 0) {
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorUserId: actor.id,
          targetUserId: request.userId,
          action: "SENSITIVE_FIELD_UPDATED",
          targetType: "EMPLOYEE_PROFILE",
          targetId: request.userId,
          metadata: {
            targetUserId: request.userId,
            section: request.section,
            changedFields: Object.keys(sensitiveUpdate),
          },
        },
      });
    }
  });

  redirect("/admin/profile-change-requests?success=approved");
}

export async function rejectProfileChangeRequest(formData: FormData) {
  const actor = await requireOwner();
  const requestId = formValue(formData, "requestId");
  const reviewComment = formValue(formData, "reviewComment").trim();

  if (!requestId || !reviewComment) {
    redirect("/admin/profile-change-requests?error=invalid-reject");
  }

  const prisma = getPrisma();
  const request = await prisma.employeeProfileChangeRequest.findUnique({
    where: { id: requestId },
  });

  if (!request || request.status !== "PENDING") {
    redirect("/admin/profile-change-requests?error=not-pending");
  }

  await prisma.$transaction(async (tx) => {
    await tx.employeeProfileChangeRequest.update({
      where: { id: request.id },
      data: {
        status: "REJECTED",
        reviewComment,
        reviewedAt: new Date(),
        reviewedByUserId: actor.id,
      },
    });

    await tx.notification.create({
      data: {
        userId: request.userId,
        type: "SYSTEM",
        title: "정보 수정 요청이 반려되었습니다.",
        message: "요청하신 인사정보 변경이 반려되었습니다. 사유를 확인해 주세요.",
        linkUrl: "/profile",
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        targetUserId: request.userId,
        action: "EMPLOYEE_PROFILE_CHANGE_REQUEST_REJECTED",
        targetType: "PROFILE_CHANGE_REQUEST",
        targetId: request.id,
        metadata: {
          requestId: request.id,
          targetUserId: request.userId,
          section: request.section,
          changedFields: [],
        },
      },
    });
  });

  redirect("/admin/profile-change-requests?success=rejected");
}
