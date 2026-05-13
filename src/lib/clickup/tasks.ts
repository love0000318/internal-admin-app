import { Prisma } from "@/generated/prisma/client";
import { clickUpGet } from "@/lib/clickup/client";
import {
  getClickUpApiToken,
  getClickUpSyncConfig,
  type ClickUpSyncConfig,
} from "@/lib/clickup/config";
import { getPrisma } from "@/lib/db/prisma";

type ClickUpTaskListResponse = {
  tasks?: unknown[];
};

type TeamSyncConfigForSync = {
  id: string;
  teamId: string;
  displayName: string;
  clickUpWorkspaceId: string | null;
  clickUpSpaceId: string | null;
  clickUpFolderId: string | null;
  clickUpListId: string | null;
  clickUpListName: string | null;
  syncScope: string;
  isEnabled: boolean;
  team: {
    id: string;
    name: string;
  };
};

export type ClickUpTaskSyncSourceResult = {
  configId: string | null;
  teamId: string | null;
  teamName: string | null;
  displayName: string | null;
  status: "success" | "skipped" | "failed";
  message: string;
  checkedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  syncedAt: Date | null;
};

export type ClickUpTaskSyncResult = {
  status: "success" | "skipped" | "failed";
  message: string;
  checkedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  syncedAt: Date | null;
  sourceResults: ClickUpTaskSyncSourceResult[];
};

type NormalizedClickUpTask = {
  clickUpTaskId: string;
  name: string;
  descriptionSummary: string | null;
  clickUpStatus: string | null;
  clickUpAssignees: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  dueDate: Date | null;
  clickUpUrl: string | null;
  sourceTeamId: string | null;
  sourceTeamName: string | null;
  clickUpSourceConfigId: string | null;
  sourceWorkspaceId: string | null;
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

function safeSyncMessage(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 500 ? normalized.slice(0, 500) : normalized;
}

function buildTeamRuntimeConfig(
  source: TeamSyncConfigForSync,
  apiToken: string | null,
): ClickUpSyncConfig {
  const missingTaskKeys: ClickUpSyncConfig["missingTaskKeys"] = [];
  const missingDocsKeys: ClickUpSyncConfig["missingDocsKeys"] = [];

  if (!apiToken) {
    missingTaskKeys.push("CLICKUP_API_TOKEN");
    missingDocsKeys.push("CLICKUP_API_TOKEN");
  }

  if (!source.clickUpListId) {
    missingTaskKeys.push("CLICKUP_LIST_ID");
  }

  if (
    !source.clickUpWorkspaceId &&
    !source.clickUpSpaceId &&
    !source.clickUpFolderId
  ) {
    missingDocsKeys.push("CLICKUP_TEAM_ID");
  }

  return {
    apiToken,
    teamId: source.clickUpWorkspaceId,
    spaceId: source.clickUpSpaceId,
    folderId: source.clickUpFolderId,
    listId: source.clickUpListId,
    sourceConfigId: source.id,
    sourceTeamId: source.teamId,
    sourceTeamName: source.team.name,
    workspaceId: source.clickUpWorkspaceId,
    listName: source.clickUpListName,
    displayName: source.displayName,
    taskSyncConfigured: missingTaskKeys.length === 0,
    docsSyncConfigured: missingDocsKeys.length === 0,
    missingTaskKeys,
    missingDocsKeys,
  };
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
    sourceTeamId: config.sourceTeamId ?? null,
    sourceTeamName: config.sourceTeamName ?? null,
    clickUpSourceConfigId: config.sourceConfigId ?? null,
    sourceWorkspaceId: config.workspaceId ?? config.teamId,
    sourceListId: nestedString(listRecord ?? {}, "id") ?? config.listId,
    sourceListName:
      nestedString(listRecord ?? {}, "name") ??
      config.listName ??
      config.displayName ??
      null,
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
      sourceConfigId: config.sourceConfigId ?? null,
      sourceTeamId: config.sourceTeamId ?? null,
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

function summarizeSourceResults(results: ClickUpTaskSyncSourceResult[]): ClickUpTaskSyncResult {
  const checkedCount = results.reduce((sum, result) => sum + result.checkedCount, 0);
  const createdCount = results.reduce((sum, result) => sum + result.createdCount, 0);
  const updatedCount = results.reduce((sum, result) => sum + result.updatedCount, 0);
  const skippedCount = results.reduce((sum, result) => sum + result.skippedCount, 0);
  const latestSyncedAt =
    results
      .map((result) => result.syncedAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const failedCount = results.filter((result) => result.status === "failed").length;
  const successCount = results.filter((result) => result.status === "success").length;
  const status = failedCount > 0 ? "failed" : successCount > 0 ? "success" : "skipped";

  return {
    status,
    message:
      status === "success"
        ? "ClickUp 팀별 업무 동기화가 완료되었습니다."
        : status === "failed"
          ? "ClickUp 팀별 업무 동기화 중 오류가 발생했습니다."
          : "동기화할 ClickUp 팀 설정이 없습니다.",
    checkedCount,
    createdCount,
    updatedCount,
    skippedCount,
    syncedAt: latestSyncedAt,
    sourceResults: results,
  };
}

async function syncOneSource(
  sourceConfig: TeamSyncConfigForSync,
  apiToken: string | null,
): Promise<ClickUpTaskSyncSourceResult> {
  const prisma = getPrisma();
  const runtimeConfig = buildTeamRuntimeConfig(sourceConfig, apiToken);
  const baseResult = {
    configId: sourceConfig.id,
    teamId: sourceConfig.teamId,
    teamName: sourceConfig.team.name,
    displayName: sourceConfig.displayName,
  };

  if (!sourceConfig.isEnabled) {
    return {
      ...baseResult,
      status: "skipped",
      message: "동기화가 비활성화된 팀 설정입니다.",
      checkedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      syncedAt: null,
    };
  }

  if (sourceConfig.syncScope === "DOCS_ONLY") {
    return {
      ...baseResult,
      status: "skipped",
      message: "Docs 전용 설정이라 업무 동기화를 건너뛰었습니다.",
      checkedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      syncedAt: null,
    };
  }

  if (!runtimeConfig.taskSyncConfigured) {
    const message = runtimeConfig.missingTaskKeys.includes("CLICKUP_API_TOKEN")
      ? "CLICKUP_API_TOKEN이 설정되지 않았습니다."
      : "ClickUp List ID가 설정되지 않았습니다.";

    await prisma.clickUpTeamSyncConfig.update({
      where: { id: sourceConfig.id },
      data: {
        lastSyncStatus: "skipped",
        lastSyncMessage: message,
      },
    });

    return {
      ...baseResult,
      status: "skipped",
      message,
      checkedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      syncedAt: null,
    };
  }

  const syncedAt = new Date();

  try {
    const fetchedTasks = await fetchClickUpTasks(runtimeConfig);
    const normalizedTasks = fetchedTasks
      .map((task) => normalizeClickUpTask(task, runtimeConfig))
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
          sourceTeamId: task.sourceTeamId,
          sourceTeamName: task.sourceTeamName,
          clickUpSourceConfigId: task.clickUpSourceConfigId,
          sourceWorkspaceId: task.sourceWorkspaceId,
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

    const message = "ClickUp 업무 동기화가 완료되었습니다.";

    await prisma.clickUpTeamSyncConfig.update({
      where: { id: sourceConfig.id },
      data: {
        lastTaskSyncedAt: syncedAt,
        lastSyncStatus: "success",
        lastSyncMessage: message,
      },
    });

    return {
      ...baseResult,
      status: "success",
      message,
      checkedCount: fetchedTasks.length,
      createdCount,
      updatedCount,
      skippedCount: fetchedTasks.length - normalizedTasks.length,
      syncedAt,
    };
  } catch (error) {
    const message = safeSyncMessage(
      error instanceof Error
        ? error.message
        : "ClickUp 업무 동기화 중 오류가 발생했습니다.",
    );

    await prisma.clickUpTeamSyncConfig.update({
      where: { id: sourceConfig.id },
      data: {
        lastTaskSyncedAt: syncedAt,
        lastSyncStatus: "failed",
        lastSyncMessage: message,
      },
    });

    return {
      ...baseResult,
      status: "failed",
      message,
      checkedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      syncedAt,
    };
  }
}

async function syncLegacyEnvSource(): Promise<ClickUpTaskSyncSourceResult> {
  const prisma = getPrisma();
  const config = getClickUpSyncConfig();
  const baseResult = {
    configId: null,
    teamId: null,
    teamName: null,
    displayName: "Legacy CLICKUP_LIST_ID",
  };

  if (!config.taskSyncConfigured) {
    return {
      ...baseResult,
      status: "skipped",
      message: "ClickUp 연결 정보가 아직 설정되지 않았습니다.",
      checkedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      syncedAt: null,
    };
  }

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
          sourceWorkspaceId: task.sourceWorkspaceId,
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
      ...baseResult,
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
      ...baseResult,
      status: "failed",
      message: safeSyncMessage(
        error instanceof Error
          ? error.message
          : "ClickUp 업무 동기화 중 오류가 발생했습니다.",
      ),
      checkedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      syncedAt,
    };
  }
}

export async function syncClickUpTasks(
  sourceConfigId?: string | null,
): Promise<ClickUpTaskSyncResult> {
  const prisma = getPrisma();
  const apiToken = getClickUpApiToken();
  const sourceConfigs = await prisma.clickUpTeamSyncConfig.findMany({
    where: sourceConfigId
      ? { id: sourceConfigId }
      : {
          isEnabled: true,
          syncScope: { not: "DOCS_ONLY" },
        },
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  if (sourceConfigs.length === 0 && !sourceConfigId) {
    return summarizeSourceResults([await syncLegacyEnvSource()]);
  }

  if (sourceConfigs.length === 0) {
    return summarizeSourceResults([
      {
        configId: sourceConfigId ?? null,
        teamId: null,
        teamName: null,
        displayName: null,
        status: "skipped",
        message: "동기화 설정을 찾을 수 없습니다.",
        checkedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        syncedAt: null,
      },
    ]);
  }

  const sourceResults: ClickUpTaskSyncSourceResult[] = [];

  for (const sourceConfig of sourceConfigs) {
    sourceResults.push(await syncOneSource(sourceConfig, apiToken));
  }

  return summarizeSourceResults(sourceResults);
}
