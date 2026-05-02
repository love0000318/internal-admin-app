"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { dispatchExternalNotification } from "@/lib/external-notifications/dispatch-external-notification";
import {
  canAccessLeaveRequestAttachments,
  canSubmitAttachmentForRequest,
  createLeaveAttachmentRecord,
  LeaveAttachmentError,
  prepareAttachmentFromFormData,
} from "@/lib/leave/attachments";
import { hydrateReviewScope, toReviewableLeaveRequest } from "@/lib/leave/review";
import { canReviewLeaveRequest } from "@/lib/rbac/guards";
import { isOwner } from "@/lib/rbac/roles";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getString(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value.trim() : "";
}

function redirectToRequest(requestId: string, key: "error" | "success", value: string): never {
  redirect(`/leaves/me/requests/${requestId}?${key}=${value}`);
}

function redirectToApproval(requestId: string, key: "error" | "success", value: string): never {
  redirect(`/leaves/approvals/${requestId}?${key}=${value}`);
}

const requestInclude = {
  user: true,
} satisfies Prisma.LeaveRequestInclude;

export async function submitLeaveAttachment(formData: FormData) {
  const actor = await requireRouteAccess("/leaves/me/requests");
  const requestId = getString(formData, "requestId");

  if (!requestId) {
    redirect("/leaves/me?error=invalid");
  }

  const prisma = getPrisma();
  const leaveRequest = await prisma.leaveRequest.findFirst({
    where: { id: requestId, userId: actor.id },
    include: requestInclude,
  });

  if (!leaveRequest) {
    redirect("/leaves/me?error=not-found");
  }

  if (!canSubmitAttachmentForRequest(leaveRequest.status)) {
    redirectToRequest(requestId, "error", "attachment-closed");
  }

  let prepared;

  try {
    prepared = await prepareAttachmentFromFormData(formData);
  } catch (error) {
    if (error instanceof LeaveAttachmentError) {
      redirectToRequest(requestId, "error", error.code);
    }

    throw error;
  }

  if (!prepared) {
    redirectToRequest(requestId, "error", "attachment-required");
  }

  await prisma.$transaction(async (tx) => {
    const attachment = await createLeaveAttachmentRecord({
      tx,
      leaveRequestId: requestId,
      uploadedByUserId: actor.id,
      prepared,
    });

    await tx.leaveRequest.update({
      where: { id: requestId },
      data: {
        attachmentStatus: "SUBMITTED",
        attachmentUrl: leaveRequest.attachmentUrl ?? prepared.originalFileName,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        targetUserId: actor.id,
        action: "LEAVE_ATTACHMENT_UPLOADED",
        targetType: "LEAVE_ATTACHMENT",
        targetId: attachment.id,
        metadata: toJsonValue({
          attachmentId: attachment.id,
          leaveRequestId: requestId,
          fileName: attachment.originalFileName,
          fileSize: attachment.fileSize,
          mimeType: attachment.mimeType,
          status: attachment.status,
        }),
      },
    });
  });

  revalidatePath(`/leaves/me/requests/${requestId}`);
  revalidatePath(`/leaves/approvals/${requestId}`);
  redirectToRequest(requestId, "success", "attachment-submitted");
}

async function getReviewableRequestOrRedirect(actorId: string, requestId: string) {
  const prisma = getPrisma();
  const actor = await requireRouteAccess("/leaves/approvals");
  const scopedActor = await hydrateReviewScope(actor, prisma);
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      user: true,
      attachments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!leaveRequest) {
    redirectToApproval(requestId, "error", "not-found");
  }

  const canReview =
    (isOwner(scopedActor) || leaveRequest.userId !== actorId) &&
    canReviewLeaveRequest(scopedActor, toReviewableLeaveRequest(leaveRequest).user);

  if (!canReview) {
    redirectToApproval(requestId, "error", "forbidden");
  }

  return { prisma, actor: scopedActor, leaveRequest };
}

export async function acceptLeaveAttachment(formData: FormData) {
  const actor = await requireRouteAccess("/leaves/approvals");
  const attachmentId = getString(formData, "attachmentId");
  const requestId = getString(formData, "requestId");

  if (!attachmentId || !requestId) {
    redirect("/leaves/approvals?error=invalid");
  }

  const { prisma, leaveRequest } = await getReviewableRequestOrRedirect(actor.id, requestId);
  const attachment = leaveRequest.attachments.find((item) => item.id === attachmentId);

  if (!attachment) {
    redirectToApproval(requestId, "error", "attachment-not-found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.leaveAttachment.update({
      where: { id: attachmentId },
      data: {
        status: "ACCEPTED",
        reviewedAt: new Date(),
        reviewedByUserId: actor.id,
        reviewComment: null,
      },
    });

    await tx.leaveRequest.update({
      where: { id: requestId },
      data: { attachmentStatus: "ACCEPTED" },
    });

    await tx.notification.create({
      data: {
        userId: leaveRequest.userId,
        type: "LEAVE_ATTACHMENT_ACCEPTED",
        title: "제출한 증명자료가 확인되었습니다.",
        message: "휴가 요청에 제출한 증명자료가 확인되었습니다.",
        linkUrl: `/leaves/me/requests/${requestId}`,
        metadata: toJsonValue({ leaveRequestId: requestId, attachmentId }),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        targetUserId: leaveRequest.userId,
        action: "LEAVE_ATTACHMENT_ACCEPTED",
        targetType: "LEAVE_ATTACHMENT",
        targetId: attachmentId,
        metadata: toJsonValue({ attachmentId, leaveRequestId: requestId }),
      },
    });
  });

  revalidatePath(`/leaves/approvals/${requestId}`);
  redirectToApproval(requestId, "success", "attachment-accepted");
}

export async function rejectLeaveAttachment(formData: FormData) {
  const actor = await requireRouteAccess("/leaves/approvals");
  const attachmentId = getString(formData, "attachmentId");
  const requestId = getString(formData, "requestId");
  const reviewComment = getString(formData, "reviewComment");

  if (!attachmentId || !requestId) {
    redirect("/leaves/approvals?error=invalid");
  }

  if (!reviewComment) {
    redirectToApproval(requestId, "error", "attachment-comment-required");
  }

  const { prisma, leaveRequest } = await getReviewableRequestOrRedirect(actor.id, requestId);
  const attachment = leaveRequest.attachments.find((item) => item.id === attachmentId);

  if (!attachment) {
    redirectToApproval(requestId, "error", "attachment-not-found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.leaveAttachment.update({
      where: { id: attachmentId },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewedByUserId: actor.id,
        reviewComment,
      },
    });

    await tx.leaveRequest.update({
      where: { id: requestId },
      data: { attachmentStatus: "REJECTED" },
    });

    await tx.notification.create({
      data: {
        userId: leaveRequest.userId,
        type: "LEAVE_ATTACHMENT_REJECTED",
        title: "증명자료가 반려되었습니다.",
        message: "반려 사유를 확인하고 필요한 경우 다시 제출해 주세요.",
        linkUrl: `/leaves/me/requests/${requestId}`,
        metadata: toJsonValue({ leaveRequestId: requestId, attachmentId }),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        targetUserId: leaveRequest.userId,
        action: "LEAVE_ATTACHMENT_REJECTED",
        targetType: "LEAVE_ATTACHMENT",
        targetId: attachmentId,
        metadata: toJsonValue({
          attachmentId,
          leaveRequestId: requestId,
          status: "REJECTED",
        }),
      },
    });
  });

  revalidatePath(`/leaves/approvals/${requestId}`);
  redirectToApproval(requestId, "success", "attachment-rejected");
}

export async function requestLeaveAttachmentResubmission(formData: FormData) {
  const actor = await requireRouteAccess("/leaves/approvals");
  const requestId = getString(formData, "requestId");
  const reviewComment = getString(formData, "reviewComment");

  if (!requestId) {
    redirect("/leaves/approvals?error=invalid");
  }

  if (!reviewComment) {
    redirectToApproval(requestId, "error", "attachment-comment-required");
  }

  const { prisma, leaveRequest } = await getReviewableRequestOrRedirect(actor.id, requestId);

  await prisma.$transaction(async (tx) => {
    const latestAttachment = leaveRequest.attachments[0];

    if (latestAttachment) {
      await tx.leaveAttachment.update({
        where: { id: latestAttachment.id },
        data: {
          status: "RESUBMISSION_REQUESTED",
          reviewedAt: new Date(),
          reviewedByUserId: actor.id,
          reviewComment,
        },
      });
    }

    await tx.leaveRequest.update({
      where: { id: requestId },
      data: { attachmentStatus: "RESUBMISSION_REQUESTED" },
    });

    await tx.notification.create({
      data: {
        userId: leaveRequest.userId,
        type: "LEAVE_ATTACHMENT_RESUBMISSION_REQUESTED",
        title: "증명자료 재제출이 필요합니다.",
        message: "제출한 휴가 증명자료 확인이 필요합니다. 사유를 확인하고 다시 제출해 주세요.",
        linkUrl: `/leaves/me/requests/${requestId}`,
        metadata: toJsonValue({ leaveRequestId: requestId }),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        targetUserId: leaveRequest.userId,
        action: "LEAVE_ATTACHMENT_RESUBMISSION_REQUESTED",
        targetType: latestAttachment ? "LEAVE_ATTACHMENT" : "LEAVE_REQUEST",
        targetId: latestAttachment?.id ?? requestId,
        metadata: toJsonValue({
          attachmentId: latestAttachment?.id,
          leaveRequestId: requestId,
          status: "RESUBMISSION_REQUESTED",
        }),
      },
    });
  });

  revalidatePath(`/leaves/approvals/${requestId}`);
  await dispatchExternalNotification({
    type: "LEAVE_ATTACHMENT_RESUBMISSION_REQUESTED",
    recipientUserId: leaveRequest.userId,
    title: "휴가 증명자료 재제출이 필요합니다.",
    message: "휴가 증명자료 재제출이 필요합니다.",
    linkUrl: `/leaves/me/requests/${requestId}`,
    context: { leaveRequestId: requestId },
  });
  redirectToApproval(requestId, "success", "attachment-resubmission-requested");
}

export async function assertCanAccessAttachmentDownload(attachmentId: string) {
  const actor = await requireRouteAccess("/leaves/me");
  const prisma = getPrisma();
  const attachment = await prisma.leaveAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      leaveRequest: {
        include: { user: true },
      },
    },
  });

  if (!attachment || attachment.deletedAt) {
    return null;
  }

  const allowed = await canAccessLeaveRequestAttachments({
    actor,
    leaveRequest: attachment.leaveRequest,
    prisma,
  });

  if (!allowed) {
    return null;
  }

  return { actor, prisma, attachment };
}
