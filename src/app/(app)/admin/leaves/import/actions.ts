"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getPrisma } from "@/lib/db/prisma";
import {
  applyLeaveImportBatch,
  createLeaveImportReconciliationAdjustment,
  createLeaveImportBatchFromWorkbook,
  reverseLeaveImportBatch,
  type ParsedLeaveImportType,
} from "@/lib/leave/import";
import { requireOwner } from "@/lib/rbac/server-guards";

function maxFileSizeBytes() {
  const configuredMb = Number(process.env.MAX_LEAVE_IMPORT_FILE_SIZE_MB ?? "10");
  const safeMb = Number.isFinite(configuredMb) && configuredMb > 0 ? configuredMb : 10;
  return safeMb * 1024 * 1024;
}

function getRequestedType(value: FormDataEntryValue | null): ParsedLeaveImportType | "AUTO" {
  if (value === "MONTHLY_ANNUAL_USAGE" || value === "DETAILED_LEAVE_USAGE") {
    return value;
  }

  return "AUTO";
}

function getReferenceYear(value: FormDataEntryValue | null) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : null;
}

export async function uploadLeaveImportAction(formData: FormData) {
  const actor = await requireOwner();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size <= 0) {
    redirect("/admin/leaves/import?error=missing-file");
  }

  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    redirect("/admin/leaves/import?error=invalid-file-type");
  }

  if (file.size > maxFileSizeBytes()) {
    redirect("/admin/leaves/import?error=file-too-large");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const batch = await createLeaveImportBatchFromWorkbook({
    actorUserId: actor.id,
    fileName: file.name,
    fileSize: file.size,
    buffer,
    requestedType: getRequestedType(formData.get("importType")),
    selectedYear: getReferenceYear(formData.get("referenceYear")),
  });

  revalidatePath("/admin/leaves/import");
  redirect(`/admin/leaves/import/${batch.id}`);
}

export async function applyLeaveImportAction(formData: FormData) {
  const actor = await requireOwner();
  const batchId = String(formData.get("batchId") ?? "");
  if (!batchId) {
    redirect("/admin/leaves/import?error=missing-batch");
  }

  try {
    await applyLeaveImportBatch({ actorUserId: actor.id, batchId });
  } catch (error) {
    const reason =
      error instanceof Error && error.message.includes("STEP_UP_REQUIRED")
        ? "step-up-required"
        : "apply-failed";
    redirect(`/admin/leaves/import/${batchId}?error=${reason}`);
  }

  revalidatePath("/admin/leaves/import");
  revalidatePath(`/admin/leaves/import/${batchId}`);
  redirect(`/admin/leaves/import/${batchId}?success=applied`);
}

export async function updateLeaveImportRowMappingAction(formData: FormData) {
  const actor = await requireOwner();
  const prisma = getPrisma();
  const batchId = String(formData.get("batchId") ?? "");
  const rowId = String(formData.get("rowId") ?? "");
  const matchedUserId = String(formData.get("matchedUserId") ?? "");
  const leaveTypeId = String(formData.get("leaveTypeId") ?? "");
  const mappedStatus = String(formData.get("mappedStatus") ?? "");

  if (!batchId || !rowId) {
    redirect("/admin/leaves/import?error=missing-batch");
  }

  const [row, leaveType] = await Promise.all([
    prisma.leaveImportRow.findFirst({
      where: { id: rowId, batchId },
      include: { batch: true },
    }),
    leaveTypeId
      ? prisma.leaveTypeDefinition.findUnique({ where: { id: leaveTypeId } })
      : Promise.resolve(null),
  ]);

  if (!row || row.batch.status === "APPLIED" || row.batch.status === "REVERSED") {
    redirect(`/admin/leaves/import/${batchId}?error=apply-failed`);
  }

  const data = {
    ...(matchedUserId
      ? {
          matchedUserId,
          matchStatus: "MATCHED" as const,
        }
      : {}),
    ...(leaveType
      ? {
          mappedLeaveTypeId: leaveType.id,
          mappedLeaveTypeCode: leaveType.code,
        }
      : {}),
    ...(mappedStatus === "PENDING" || mappedStatus === "APPROVED" || mappedStatus === "CANCELLED" || mappedStatus === "UNKNOWN"
      ? { mappedStatus: mappedStatus as "PENDING" | "APPROVED" | "CANCELLED" | "UNKNOWN" }
      : {}),
  };

  await prisma.leaveImportRow.update({
    where: { id: row.id },
    data,
  });

  const rows = await prisma.leaveImportRow.findMany({ where: { batchId } });
  await prisma.leaveImportBatch.update({
    where: { id: batchId },
    data: {
      matchedCount: rows.filter((item) => item.matchStatus === "MATCHED").length,
      unmatchedCount: rows.filter((item) => item.matchStatus !== "MATCHED").length,
      warningCount: rows.filter((item) => Array.isArray(item.warnings) && item.warnings.length > 0).length,
      errorCount: rows.filter((item) => Array.isArray(item.errors) && item.errors.length > 0).length,
      status: rows.some((item) => Array.isArray(item.errors) && item.errors.length > 0) ? "PARSED" : "VALIDATED",
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "LEAVE_IMPORT_ROW_MANUALLY_MATCHED",
      targetType: "LEAVE_IMPORT_ROW",
      targetId: row.id,
      metadata: {
        batchId,
        rowId: row.id,
        matchedUserId: matchedUserId || null,
        mappedLeaveTypeId: leaveType?.id ?? null,
        mappedLeaveTypeCode: leaveType?.code ?? null,
        mappedStatus: data.mappedStatus ?? null,
      },
    },
  });

  revalidatePath(`/admin/leaves/import/${batchId}`);
  redirect(`/admin/leaves/import/${batchId}`);
}

export async function createLeaveImportReconciliationAdjustmentAction(formData: FormData) {
  const actor = await requireOwner();
  const batchId = String(formData.get("batchId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const year = Number(formData.get("year") ?? "");

  if (!batchId || !userId || !Number.isInteger(year)) {
    redirect("/admin/leaves/import?error=missing-batch");
  }

  try {
    await createLeaveImportReconciliationAdjustment({
      actorUserId: actor.id,
      batchId,
      userId,
      year,
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.message.includes("STEP_UP_REQUIRED")
        ? "step-up-required"
        : "reconciliation-adjustment-failed";
    redirect(`/admin/leaves/import/${batchId}?error=${reason}`);
  }

  revalidatePath(`/admin/leaves/import/${batchId}`);
  redirect(`/admin/leaves/import/${batchId}?success=reconciliation-adjusted`);
}

export async function reverseLeaveImportBatchAction(formData: FormData) {
  const actor = await requireOwner();
  const batchId = String(formData.get("batchId") ?? "");
  const reason =
    String(formData.get("reverseReason") ?? "").trim() ||
    "휴가 현황 엑셀 업로드 반영 취소";

  if (!batchId) {
    redirect("/admin/leaves/import?error=missing-batch");
  }

  try {
    await reverseLeaveImportBatch({
      actorUserId: actor.id,
      batchId,
      reason,
    });
  } catch (error) {
    const reasonCode =
      error instanceof Error && error.message.includes("STEP_UP_REQUIRED")
        ? "step-up-required"
        : "reverse-failed";
    redirect(`/admin/leaves/import/${batchId}?error=${reasonCode}`);
  }

  revalidatePath("/admin/leaves/import");
  revalidatePath(`/admin/leaves/import/${batchId}`);
  redirect(`/admin/leaves/import/${batchId}?success=reversed`);
}
