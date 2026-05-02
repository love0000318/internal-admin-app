import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/db/prisma";
import { canAccessLeaveRequestAttachments } from "@/lib/leave/attachments";
import { requireCurrentUser } from "@/lib/auth/session";
import { sanitizeAuditMetadata } from "@/lib/security/sanitize";
import { getStorageProvider } from "@/lib/storage/local-private-storage-provider";

function contentDispositionFileName(fileName: string) {
  const safeName = fileName.replace(/["\r\n]/g, "_");

  return `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const actor = await requireCurrentUser();
  const { attachmentId } = await context.params;
  const prisma = getPrisma();
  const attachment = await prisma.leaveAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      leaveRequest: {
        include: { user: true },
      },
    },
  });

  if (!attachment || attachment.deletedAt || !attachment.fileKey) {
    return new NextResponse("첨부자료를 찾을 수 없습니다.", { status: 404 });
  }

  const allowed = await canAccessLeaveRequestAttachments({
    actor,
    leaveRequest: attachment.leaveRequest,
    prisma,
  });

  if (!allowed) {
    return new NextResponse("첨부자료에 접근할 권한이 없습니다.", { status: 403 });
  }

  const provider = getStorageProvider();
  const read = provider.read?.bind(provider);

  if (!read) {
    return new NextResponse("첨부자료를 읽을 수 없습니다.", { status: 500 });
  }

  const buffer = await read(attachment.fileKey);

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      targetUserId: attachment.leaveRequest.userId,
      action: "LEAVE_ATTACHMENT_DOWNLOADED",
      targetType: "LEAVE_ATTACHMENT",
      targetId: attachment.id,
      metadata: sanitizeAuditMetadata({
        attachmentId: attachment.id,
        leaveRequestId: attachment.leaveRequestId,
        fileName: attachment.originalFileName,
        fileSize: attachment.fileSize,
        mimeType: attachment.mimeType,
      }),
    },
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": attachment.mimeType ?? "application/octet-stream",
      "Content-Length": String(buffer.byteLength),
      "Content-Disposition": contentDispositionFileName(
        attachment.originalFileName ?? attachment.fileName,
      ),
      "Cache-Control": "private, no-store",
    },
  });
}
