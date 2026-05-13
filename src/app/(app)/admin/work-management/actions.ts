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
  createWorkTaskRelation,
  createWorkTaskChangeRequest,
  deleteWorkTaskRelation,
  normalizeWorkTaskRelationType,
  updateClickUpTeamSyncConfig,
  updateWorkTaskLocalState,
} from "@/lib/work-management/service";

function nullableString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function runClickUpTaskSyncAction(formData?: FormData) {
  const actor = await requireOwner();
  const sourceConfigId = formData ? nullableString(formData.get("sourceConfigId")) : null;
  const result = await syncClickUpTasks(sourceConfigId);

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
        sourceConfigId,
        sourceResults: result.sourceResults.map((source) => ({
          configId: source.configId,
          teamId: source.teamId,
          teamName: source.teamName,
          displayName: source.displayName,
          status: source.status,
          checkedCount: source.checkedCount,
          createdCount: source.createdCount,
          updatedCount: source.updatedCount,
          skippedCount: source.skippedCount,
        })),
      } satisfies Prisma.JsonObject,
    },
  });

  revalidatePath("/admin/work-management");
  redirect(`/admin/work-management?sync=${result.status}`);
}

export async function runClickUpDocsSyncAction(formData?: FormData) {
  const actor = await requireOwner();
  const sourceConfigId = formData ? nullableString(formData.get("sourceConfigId")) : null;
  const result = await syncClickUpDocsSkeleton(sourceConfigId);

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
        sourceConfigId,
      } satisfies Prisma.JsonObject,
    },
  });

  revalidatePath("/admin/work-management");
  redirect(`/admin/work-management?docs=${result.status}`);
}

export async function updateClickUpTeamSyncConfigAction(formData: FormData) {
  const actor = await requireOwner();
  const teamId = nullableString(formData.get("teamId"));

  if (!teamId) {
    redirect("/admin/work-management?error=invalid-sync-config");
  }

  try {
    await updateClickUpTeamSyncConfig({
      actorUserId: actor.id,
      teamId,
      displayName: nullableString(formData.get("displayName")),
      clickUpWorkspaceId: nullableString(formData.get("clickUpWorkspaceId")),
      clickUpSpaceId: nullableString(formData.get("clickUpSpaceId")),
      clickUpFolderId: nullableString(formData.get("clickUpFolderId")),
      clickUpListId: nullableString(formData.get("clickUpListId")),
      clickUpListName: nullableString(formData.get("clickUpListName")),
      syncScope: nullableString(formData.get("syncScope")) ?? "TASKS_AND_DOCS",
      isEnabled: formData.get("isEnabled") === "on",
      note: nullableString(formData.get("note")),
    });
  } catch {
    redirect("/admin/work-management?error=sync-config-failed");
  }

  revalidatePath("/admin/work-management");
  redirect("/admin/work-management?settings=updated");
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

export async function createWorkTaskRelationAction(formData: FormData) {
  const actor = await requireOwner();
  const parentTaskMirrorId = nullableString(formData.get("parentTaskMirrorId"));
  const relatedTaskMirrorId = nullableString(formData.get("relatedTaskMirrorId"));

  if (!parentTaskMirrorId || !relatedTaskMirrorId) {
    redirect("/admin/work-management?error=invalid-task-relation");
  }

  try {
    await createWorkTaskRelation({
      actorUserId: actor.id,
      parentTaskMirrorId,
      relatedTaskMirrorId,
      relationType: normalizeWorkTaskRelationType(formData.get("relationType")),
      note: nullableString(formData.get("note")),
    });
  } catch {
    redirect(`/admin/work-management?taskId=${parentTaskMirrorId}&error=task-relation-failed`);
  }

  revalidatePath("/admin/work-management");
  redirect(`/admin/work-management?taskId=${parentTaskMirrorId}&relation=created`);
}

export async function deleteWorkTaskRelationAction(formData: FormData) {
  const actor = await requireOwner();
  const relationId = nullableString(formData.get("relationId"));
  const taskMirrorId = nullableString(formData.get("taskMirrorId"));

  if (!relationId) {
    redirect("/admin/work-management?error=invalid-task-relation");
  }

  try {
    await deleteWorkTaskRelation({
      actorUserId: actor.id,
      relationId,
    });
  } catch {
    redirect(`/admin/work-management?taskId=${taskMirrorId ?? ""}&error=task-relation-delete-failed`);
  }

  revalidatePath("/admin/work-management");
  redirect(`/admin/work-management?taskId=${taskMirrorId ?? ""}&relation=deleted`);
}
