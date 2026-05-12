import { Prisma } from "@/generated/prisma/client";
import { clickUpGet } from "@/lib/clickup/client";
import { getClickUpSyncConfig, type ClickUpSyncConfig } from "@/lib/clickup/config";
import { getPrisma } from "@/lib/db/prisma";

type ClickUpTaskListResponse = {
  tasks?: unknown[];
};

export type ClickUpTaskSyncResult = {
  status: "success" | "skipped" | "failed";
  message: string;
  checkedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  syncedAt: Date | null;
};

type NormalizedClickUpTask = {
  clickUpTaskId: string;
  name: string;
  descriptionSummary: string | null;
  clickUpStatus: string | null;
  clickUpAssignees: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  dueDate: Date | null;
  clickUpUrl: string | null;
  sourceListId: string | null;
  sourceListName: string | null;
  sourceFolderId: string | null;
  sourceFolderName: string | null;
  sourceSpaceId: string | null;
  sourceSpaceName: string | null;
  rawJson: Prisma.InputJsonValue;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function recordValue(value: unknown) {
  return isRecord(value) ? value : null;
}

function nestedString(record: Record<string, unknown>, key: string) {
  return stringValue(record[key]);
}

function nestedRecordString(record: Record<string, unknown>, key: string, nestedKey: string) {
  const nested = recordValue(record[key]);
  return nested ? stringValue(nested[nestedKey]) : null;
}

function summarizeText(value: unknown) {
  const text = stringValue(value);

  if (!text) {
    return null;
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 600 ? `${normalized.slice(0, 600)}...` : normalized;
}

function parseClickUpDate(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const numeric = typeof value === "number" ? value : Number.parseInt(value, 10);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  const date = new Date(numeric);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function normalizeAssignees(
  value: unknown,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  if (!Array.isArray(value)) {
    return Prisma.JsonNull;
  }

  const assignees = value
    .filter(isRecord)
    .map((assignee) => ({
      id: stringValue(assignee.id),
      name:
        stringValue(assignee.username) ??
        stringValue(assignee.name) ??
        stringValue(assignee.initials),
    }))
    .filter((assignee) => assignee.id || assignee.name);

  return assignees.length > 0 ? assignees : Prisma.JsonNull;
}

export function normalizeClickUpTask(
  task: unknown,
  config: ClickUpSyncConfig = getClickUpSyncConfig(),
): NormalizedClickUpTask | null {
  if (!isRecord(task)) {
    return null;
  }

  const clickUpTaskId = stringValue(task.id);

  if (!clickUpTaskId) {
    return null;
  }

  const statusRecord = recordValue(task.status);
  const listRecord = recordValue(task.list);
  const folderRecord = recordValue(task.folder);
  const spaceRecord = recordValue(task.space);

  return {
    clickUpTaskId,
    name: stringValue(task.name) ?? "(untitled)",
    descriptionSummary: summarizeText(task.text_content ?? task.description),
    clickUpStatus: statusRecord
      ? stringValue(statusRecord.status) ?? stringValue(statusRecord.type)
      : stringValue(task.status),
    clickUpAssignees: normalizeAssignees(task.assignees),
    dueDate: parseClickUpDate(task.due_date),
    clickUpUrl: stringValue(task.url),
    sourceListId: nestedString(listRecord ?? {}, "id") ?? config.listId,
    sourceListName: nestedString(listRecord ?? {}, "name"),
    sourceFolderId: nestedString(folderRecord ?? {}, "id") ?? config.folderId,
    sourceFolderName: nestedString(folderRecord ?? {}, "name"),
    sourceSpaceId: nestedString(spaceRecord ?? {}, "id") ?? config.spaceId,
    sourceSpaceName: nestedString(spaceRecord ?? {}, "name"),
    rawJson: {
      id: clickUpTaskId,
      dateUpdated: stringValue(task.date_updated),
      dateCreated: stringValue(task.date_created),
      dateClosed: stringValue(task.date_closed),
      status: statusRecord
        ? {
            status: stringValue(statusRecord.status),
            type: stringValue(statusRecord.type),
          }
        : null,
      priority: nestedRecordString(task, "priority", "priority"),
      listId: nestedRecordString(task, "list", "id") ?? config.listId,
      folderId: nestedRecordString(task, "folder", "id") ?? config.folderId,
      spaceId: nestedRecordString(task, "space", "id") ?? config.spaceId,
    } satisfies Prisma.JsonObject,
  };
}

async function fetchClickUpTasks(config: ClickUpSyncConfig) {
  if (!config.listId) {
    return [];
  }

  const allTasks: unknown[] = [];

  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({
      include_closed: "true",
      subtasks: "true",
      page: String(page),
    });
    const response = await clickUpGet<ClickUpTaskListResponse>(
      `/list/${encodeURIComponent(config.listId)}/task?${query.toString()}`,
      config,
    );
    const tasks = Array.isArray(response.tasks) ? response.tasks : [];

    allTasks.push(...tasks);

    if (tasks.length === 0) {
      break;
    }
  }

  return allTasks;
}

export async function syncClickUpTasks(): Promise<ClickUpTaskSyncResult> {
  const config = getClickUpSyncConfig();

  if (!config.taskSyncConfigured) {
    return {
      status: "skipped",
      message: "ClickUp 연결 정보가 아직 설정되지 않았습니다.",
      checkedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      syncedAt: null,
    };
  }

  const prisma = getPrisma();
  const syncedAt = new Date();

  try {
    const fetchedTasks = await fetchClickUpTasks(config);
    const normalizedTasks = fetchedTasks
      .map((task) => normalizeClickUpTask(task, config))
      .filter((task): task is NormalizedClickUpTask => Boolean(task));
    const existingIds = new Set(
      (
        await prisma.clickUpTaskMirror.findMany({
          where: {
            clickUpTaskId: {
              in: normalizedTasks.map((task) => task.clickUpTaskId),
            },
          },
          select: { clickUpTaskId: true },
        })
      ).map((task) => task.clickUpTaskId),
    );
    let createdCount = 0;
    let updatedCount = 0;

    for (const task of normalizedTasks) {
      const mirror = await prisma.clickUpTaskMirror.upsert({
        where: { clickUpTaskId: task.clickUpTaskId },
        create: {
          ...task,
          lastSyncedAt: syncedAt,
          localState: {
            create: {},
          },
        },
        update: {
          name: task.name,
          descriptionSummary: task.descriptionSummary,
          clickUpStatus: task.clickUpStatus,
          clickUpAssignees: task.clickUpAssignees,
          dueDate: task.dueDate,
          clickUpUrl: task.clickUpUrl,
          sourceListId: task.sourceListId,
          sourceListName: task.sourceListName,
          sourceFolderId: task.sourceFolderId,
          sourceFolderName: task.sourceFolderName,
          sourceSpaceId: task.sourceSpaceId,
          sourceSpaceName: task.sourceSpaceName,
          rawJson: task.rawJson,
          lastSyncedAt: syncedAt,
        },
        select: { id: true },
      });

      await prisma.workTaskLocalState.upsert({
        where: { clickUpTaskMirrorId: mirror.id },
        create: { clickUpTaskMirrorId: mirror.id },
        update: {},
      });

      if (existingIds.has(task.clickUpTaskId)) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }
    }

    return {
      status: "success",
      message: "ClickUp 업무 동기화가 완료되었습니다.",
      checkedCount: fetchedTasks.length,
      createdCount,
      updatedCount,
      skippedCount: fetchedTasks.length - normalizedTasks.length,
      syncedAt,
    };
  } catch (error) {
    return {
      status: "failed",
      message:
        error instanceof Error
          ? error.message
          : "ClickUp 업무 동기화 중 오류가 발생했습니다.",
      checkedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      syncedAt,
    };
  }
}
