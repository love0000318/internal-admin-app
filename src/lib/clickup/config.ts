type ClickUpEnvKey =
  | "CLICKUP_API_TOKEN"
  | "CLICKUP_TEAM_ID"
  | "CLICKUP_SPACE_ID"
  | "CLICKUP_FOLDER_ID"
  | "CLICKUP_LIST_ID";
type ClickUpEnv = Partial<Record<ClickUpEnvKey, string | undefined>>;

export type ClickUpSyncConfig = {
  apiToken: string | null;
  teamId: string | null;
  spaceId: string | null;
  folderId: string | null;
  listId: string | null;
  sourceConfigId?: string | null;
  sourceTeamId?: string | null;
  sourceTeamName?: string | null;
  workspaceId?: string | null;
  listName?: string | null;
  displayName?: string | null;
  taskSyncConfigured: boolean;
  docsSyncConfigured: boolean;
  missingTaskKeys: ClickUpEnvKey[];
  missingDocsKeys: ClickUpEnvKey[];
};

function getEnvValue(env: ClickUpEnv, key: ClickUpEnvKey) {
  const value = env[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function buildClickUpSyncConfig(env: ClickUpEnv): ClickUpSyncConfig {
  const apiToken = getEnvValue(env, "CLICKUP_API_TOKEN");
  const teamId = getEnvValue(env, "CLICKUP_TEAM_ID");
  const spaceId = getEnvValue(env, "CLICKUP_SPACE_ID");
  const folderId = getEnvValue(env, "CLICKUP_FOLDER_ID");
  const listId = getEnvValue(env, "CLICKUP_LIST_ID");
  const missingTaskKeys: ClickUpEnvKey[] = [];
  const missingDocsKeys: ClickUpEnvKey[] = [];

  if (!apiToken) {
    missingTaskKeys.push("CLICKUP_API_TOKEN");
    missingDocsKeys.push("CLICKUP_API_TOKEN");
  }

  if (!listId) {
    missingTaskKeys.push("CLICKUP_LIST_ID");
  }

  if (!teamId && !spaceId && !folderId) {
    missingDocsKeys.push("CLICKUP_TEAM_ID");
  }

  return {
    apiToken,
    teamId,
    spaceId,
    folderId,
    listId,
    workspaceId: teamId,
    taskSyncConfigured: missingTaskKeys.length === 0,
    docsSyncConfigured: missingDocsKeys.length === 0,
    missingTaskKeys,
    missingDocsKeys,
  };
}

export function getClickUpSyncConfig() {
  return buildClickUpSyncConfig({
    CLICKUP_API_TOKEN: process.env.CLICKUP_API_TOKEN,
    CLICKUP_TEAM_ID: process.env.CLICKUP_TEAM_ID,
    CLICKUP_SPACE_ID: process.env.CLICKUP_SPACE_ID,
    CLICKUP_FOLDER_ID: process.env.CLICKUP_FOLDER_ID,
    CLICKUP_LIST_ID: process.env.CLICKUP_LIST_ID,
  });
}

export function getClickUpApiToken() {
  return getEnvValue(
    { CLICKUP_API_TOKEN: process.env.CLICKUP_API_TOKEN },
    "CLICKUP_API_TOKEN",
  );
}

export function getClickUpConnectionSummary() {
  const config = getClickUpSyncConfig();
  const apiTokenConfigured = Boolean(config.apiToken);

  if (!config.taskSyncConfigured) {
    return {
      apiTokenConfigured,
      taskSyncConfigured: false,
      docsSyncConfigured: config.docsSyncConfigured,
      message: "ClickUp 연결 정보가 아직 설정되지 않았습니다.",
    };
  }

  return {
    apiTokenConfigured,
    taskSyncConfigured: true,
    docsSyncConfigured: config.docsSyncConfigured,
    message: "ClickUp 업무 동기화를 실행할 수 있습니다.",
  };
}
