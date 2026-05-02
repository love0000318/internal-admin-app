import { Prisma, type AttachmentPolicy, type LeaveRequestAttachmentStatus } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { dateToDateOnly } from "@/lib/leave/calculate-business-days";
import { hydrateReviewScope, toReviewableLeaveRequest } from "@/lib/leave/review";
import { canReviewLeaveRequest } from "@/lib/rbac/guards";
import { isOwner, type RbacUser } from "@/lib/rbac/roles";
import { getStorageProvider } from "@/lib/storage/local-private-storage-provider";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const DEFAULT_MAX_ATTACHMENT_SIZE_MB = 10;

export class LeaveAttachmentError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export type PreparedLeaveAttachment = {
  fileName: string;
  originalFileName: string;
  fileKey: string | null;
  fileUrl: string | null;
  fileSize: number | null;
  mimeType: string | null;
};

export type LeaveRequestForAttachmentAccess = {
  id: string;
  userId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "WITHDRAWN";
  reviewerId?: string | null;
  user: {
    id: string;
    role: RbacUser["role"];
    status: NonNullable<RbacUser["status"]>;
    teamId: string | null;
  };
};

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function getMaxLeaveAttachmentSizeBytes() {
  const configured = Number(process.env.MAX_LEAVE_ATTACHMENT_SIZE_MB);
  const sizeMb =
    Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_MAX_ATTACHMENT_SIZE_MB;

  return sizeMb * 1024 * 1024;
}

export function sanitizeOriginalFileName(fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop() ?? "attachment";
  const sanitized = baseName.replace(/[^\p{L}\p{N}._ -]/gu, "_").trim();

  return sanitized.slice(0, 180) || "attachment";
}

export function validateLeaveAttachmentFile({
  fileName,
  mimeType,
  fileSize,
}: {
  fileName: string;
  mimeType: string;
  fileSize: number;
}) {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new LeaveAttachmentError("invalid-file-type");
  }

  if (fileSize <= 0) {
    throw new LeaveAttachmentError("empty-file");
  }

  if (fileSize > getMaxLeaveAttachmentSizeBytes()) {
    throw new LeaveAttachmentError("file-too-large");
  }

  return {
    originalFileName: sanitizeOriginalFileName(fileName),
    mimeType,
    fileSize,
  };
}

export function getAttachmentStatusForPolicy({
  attachmentPolicy,
  hasAttachment,
}: {
  attachmentPolicy: AttachmentPolicy;
  hasAttachment: boolean;
}): LeaveRequestAttachmentStatus {
  if (hasAttachment) {
    return "SUBMITTED";
  }

  if (attachmentPolicy === "REQUIRED_BEFORE_REQUEST") {
    throw new LeaveAttachmentError("attachment-required");
  }

  if (attachmentPolicy === "REQUIRED_AFTER_REQUEST") {
    return "REQUIRED_NOT_SUBMITTED";
  }

  if (attachmentPolicy === "OPTIONAL") {
    return "OPTIONAL";
  }

  return "NOT_REQUIRED";
}

export function getAttachmentPolicyLabel(policy: AttachmentPolicy) {
  const labels: Record<AttachmentPolicy, string> = {
    NOT_REQUIRED: "필요 없음",
    OPTIONAL: "선택 제출",
    REQUIRED_BEFORE_REQUEST: "요청 전 필수",
    REQUIRED_AFTER_REQUEST: "요청 후 제출 필요",
  };

  return labels[policy];
}

export function getAttachmentStatusLabel(status: LeaveRequestAttachmentStatus) {
  const labels: Record<LeaveRequestAttachmentStatus, string> = {
    NOT_REQUIRED: "필요 없음",
    OPTIONAL: "선택 제출",
    REQUIRED_NOT_SUBMITTED: "제출 필요",
    SUBMITTED: "제출됨",
    ACCEPTED: "확인 완료",
    REJECTED: "반려됨",
    RESUBMISSION_REQUESTED: "재제출 요청",
  };

  return labels[status];
}

export async function getAttachmentPolicyForLegacyLeaveType(
  type: string,
  fallbackRequiresAttachment: boolean,
  prisma = getPrisma(),
): Promise<AttachmentPolicy> {
  const leaveType = await prisma.leaveTypeDefinition.findUnique({
    where: { code: type },
    select: { attachmentPolicy: true },
  });

  if (leaveType) {
    return leaveType.attachmentPolicy;
  }

  return fallbackRequiresAttachment ? "REQUIRED_BEFORE_REQUEST" : "NOT_REQUIRED";
}

function getFormFile(formData: FormData, fieldName: string) {
  const entry = formData.get(fieldName);

  if (typeof File === "undefined" || !(entry instanceof File) || entry.size === 0) {
    return null;
  }

  return entry;
}

export async function prepareAttachmentFromFormData(
  formData: FormData,
  fieldName = "attachmentFile",
): Promise<PreparedLeaveAttachment | null> {
  const file = getFormFile(formData, fieldName);

  if (!file) {
    return null;
  }

  const validated = validateLeaveAttachmentFile({
    fileName: file.name,
    mimeType: file.type,
    fileSize: file.size,
  });
  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await getStorageProvider().save({
    fileName: validated.originalFileName,
    contentType: validated.mimeType,
    buffer,
  });

  return {
    fileName: saved.fileKey.split(/[\\/]/).pop() ?? saved.fileKey,
    originalFileName: validated.originalFileName,
    fileKey: saved.fileKey,
    fileUrl: null,
    fileSize: saved.fileSize,
    mimeType: saved.mimeType,
  };
}

export function getAttachmentTypeFromMime(mimeType?: string | null) {
  if (mimeType?.startsWith("image/") || mimeType === "application/pdf") {
    return "EVIDENCE" as const;
  }

  return "OTHER" as const;
}

export async function canAccessLeaveRequestAttachments({
  actor,
  leaveRequest,
  prisma = getPrisma(),
}: {
  actor: RbacUser;
  leaveRequest: LeaveRequestForAttachmentAccess;
  prisma?: ReturnType<typeof getPrisma>;
}) {
  if (leaveRequest.userId === actor.id) {
    return true;
  }

  if (leaveRequest.reviewerId === actor.id) {
    return true;
  }

  if (isOwner(actor)) {
    return true;
  }

  const scopedActor = await hydrateReviewScope(actor, prisma);

  return canReviewLeaveRequest(
    scopedActor,
    toReviewableLeaveRequest(leaveRequest).user,
  );
}

export async function createLeaveAttachmentRecord({
  tx,
  leaveRequestId,
  uploadedByUserId,
  prepared,
}: {
  tx: Prisma.TransactionClient;
  leaveRequestId: string;
  uploadedByUserId: string;
  prepared: PreparedLeaveAttachment;
}) {
  return tx.leaveAttachment.create({
    data: {
      leaveRequestId,
      uploadedByUserId,
      fileName: prepared.fileName,
      originalFileName: prepared.originalFileName,
      fileKey: prepared.fileKey,
      fileUrl: prepared.fileUrl,
      fileSize: prepared.fileSize,
      mimeType: prepared.mimeType,
      attachmentType: getAttachmentTypeFromMime(prepared.mimeType),
      status: "SUBMITTED",
      metadata: toJsonValue({
        storage: prepared.fileKey ? "local-private" : "metadata-only",
      }),
    },
  });
}

export function canSubmitAttachmentForRequest(status: string) {
  return status === "PENDING" || status === "APPROVED";
}

export function formatAttachmentSubmittedAt(date: Date) {
  return dateToDateOnly(date);
}
