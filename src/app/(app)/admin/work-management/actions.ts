"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { syncClickUpDocsSkeleton } from "@/lib/clickup/docs";
import { syncClickUpTasks } from "@/lib/clickup/tasks";
import { getPrisma } from "@/lib/db/prisma";
import { requireOwner } from "@/lib/rbac/server-guards";
import { normalizeWorkTaskInternalStatus } from "@/lib/work-management/labels";
import { parseDateOnlyInput } from "@/lib/work-management/queries";
import {
  acknowledgeWorkTaskChangeRequest,
  createWorkTaskChangeRequest,
  updateWorkTaskLocalState,
} from "@/lib/work-management/service";

function nullableString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function runClickUpTaskSyncAction() {
  const actor = await requireOwner();
  const result = await syncClickUpTasks();

  await getPrisma().auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "WORK_TASK_SYNC_RUN",
      targetType: "CLICKUP_TASK_MIRROR",
      targetId: null,
      metadata: {
        status: result.status,
        checkedCount: result.checkedCount,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        skippedCount: result.skippedCount,
        syncedAt: result.syncedAt?.toISOString() ?? null,
      } satisfies Prisma.JsonObject,
    },
  });

  revalidatePath("/admin/work-management");
  redirect(`/admin/work-management?sync=${result.status}`);
}

export async function runClickUpDocsSyncAction() {
  const actor = await requireOwner();
  const result = await syncClickUpDocsSkeleton();

  await getPrisma().auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "CLICKUP_DOC_SYNC_RUN",
      targetType: "CLICKUP_DOC_MIRROR",
      targetId: null,
      metadata: {
        status: result.status,
        checkedCount: result.checkedCount,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount,
        syncedAt: result.syncedAt?.toISOString() ?? null,
      } satisfies Prisma.JsonObject,
    },
  });

  revalidatePath("/admin/work-management");
  redirect(`/admin/work-management?docs=${result.status}`);
}

export async function updateWorkTaskLocalStateAction(formData: FormData) {
  const actor = await requireOwner();
  const taskMirrorId = nullableString(formData.get("taskMirrorId"));
  const internalStatus = normalizeWorkTaskInternalStatus(formData.get("internalStatus"));

  if (!taskMirrorId || !internalStatus) {
    redirect("/admin/work-management?error=invalid-task-update");
  }

  try {
    await updateWorkTaskLocalState({
      actorUserId: actor.id,
      taskMirrorId,
      internalStatus,
      teamId: nullableString(formData.get("teamId")),
      workDate: parseDateOnlyInput(formData.get("workDate")),
      memo: nullableString(formData.get("memo")),
    });
  } catch {
    redirect("/admin/work-management?error=task-update-failed");
  }

  revalidatePath("/admin/work-management");
  redirect(`/admin/work-management?taskId=${taskMirrorId}&updated=1`);
}

export async function createWorkTaskChangeRequestAction(formData: FormData) {
  const actor = await requireOwner();
  const taskMirrorId = nullableString(formData.get("taskMirrorId"));

  if (!taskMirrorId) {
    redirect("/admin/work-management?error=invalid-change-request");
  }

  try {
    await createWorkTaskChangeRequest({
      actorUserId: actor.id,
      taskMirrorId,
      docMirrorId: nullableString(formData.get("docMirrorId")),
      title: nullableString(formData.get("title")) ?? "",
      content: nullableString(formData.get("content")) ?? "",
      sourceDocumentUrl: nullableString(formData.get("sourceDocumentUrl")),
    });
  } catch {
    redirect("/admin/work-management?error=change-request-failed");
  }

  revalidatePath("/admin/work-management");
  redirect(`/admin/work-management?taskId=${taskMirrorId}&changeRequest=created`);
}

export async function acknowledgeWorkTaskChangeRequestAction(formData: FormData) {
  const actor = await requireOwner();
  const changeRequestId = nullableString(formData.get("changeRequestId"));
  const taskMirrorId = nullableString(formData.get("taskMirrorId"));

  if (!changeRequestId) {
    redirect("/admin/work-management?error=invalid-change-request");
  }

  try {
    await acknowledgeWorkTaskChangeRequest({
      actorUserId: actor.id,
      changeRequestId,
    });
  } catch {
    redirect("/admin/work-management?error=change-request-check-failed");
  }

  revalidatePath("/admin/work-management");
  redirect(`/admin/work-management?taskId=${taskMirrorId ?? ""}&changeRequest=checked`);
}
