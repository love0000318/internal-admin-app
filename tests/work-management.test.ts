import { afterEach, describe, expect, it, vi } from "vitest";

import { clickUpGet } from "@/lib/clickup/client";
import { buildClickUpSyncConfig, type ClickUpSyncConfig } from "@/lib/clickup/config";
import { normalizeClickUpTask } from "@/lib/clickup/tasks";
import {
  WORK_TASK_INTERNAL_STATUS_LABELS,
  normalizeWorkTaskInternalStatus,
} from "@/lib/work-management/labels";

function testConfig(overrides: Partial<ClickUpSyncConfig> = {}): ClickUpSyncConfig {
  return {
    apiToken: "redacted-value",
    teamId: null,
    spaceId: null,
    folderId: null,
    listId: "list-1",
    sourceConfigId: "config-1",
    sourceTeamId: "team-service",
    sourceTeamName: "서비스팀",
    workspaceId: "workspace-1",
    listName: "Service List",
    displayName: "서비스팀 업무",
    taskSyncConfigured: true,
    docsSyncConfigured: false,
    missingTaskKeys: [],
    missingDocsKeys: ["CLICKUP_TEAM_ID"],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("work management foundation", () => {
  it("keeps ClickUp sync disabled when required values are absent", () => {
    const config = buildClickUpSyncConfig({
      CLICKUP_API_TOKEN: undefined,
      CLICKUP_TEAM_ID: undefined,
      CLICKUP_SPACE_ID: undefined,
      CLICKUP_FOLDER_ID: undefined,
      CLICKUP_LIST_ID: undefined,
    });

    expect(config.taskSyncConfigured).toBe(false);
    expect(config.docsSyncConfigured).toBe(false);
    expect(config.missingTaskKeys).toEqual(["CLICKUP_API_TOKEN", "CLICKUP_LIST_ID"]);
  });

  it("normalizes ClickUp task payloads with source team metadata and without raw assignee email", () => {
    const normalized = normalizeClickUpTask(
      {
        id: "task-1",
        name: "Deploy admin panel",
        text_content: "  Ship internal work management MVP.  ",
        status: { status: "in progress", type: "custom" },
        due_date: "1778540400000",
        url: "https://app.clickup.com/t/task-1",
        assignees: [{ id: 1, username: "Owner", email: "owner@example.com" }],
        list: { id: "list-1", name: "Ops" },
      },
      testConfig(),
    );

    expect(normalized?.clickUpTaskId).toBe("task-1");
    expect(normalized?.clickUpStatus).toBe("in progress");
    expect(normalized?.sourceTeamId).toBe("team-service");
    expect(normalized?.sourceTeamName).toBe("서비스팀");
    expect(normalized?.clickUpSourceConfigId).toBe("config-1");
    expect(normalized?.sourceWorkspaceId).toBe("workspace-1");
    expect(JSON.stringify(normalized?.clickUpAssignees)).not.toContain("owner@example.com");
  });

  it("uses GET for ClickUp API reads", async () => {
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await clickUpGet("/list/list-1/task", testConfig());

    expect(fetchMock).toHaveBeenCalledOnce();
    const firstCall = fetchMock.mock.calls[0];

    expect(firstCall?.[0]).toBe("https://api.clickup.com/api/v2/list/list-1/task");
    expect(firstCall?.[1]).toMatchObject({
      method: "GET",
      cache: "no-store",
    });
  });

  it("keeps the four Internal Ops task statuses stable", () => {
    expect(WORK_TASK_INTERNAL_STATUS_LABELS).toEqual({
      PLANNED: "진행 예정",
      IN_PROGRESS: "진행 중",
      HOTFIX: "긴급 수정",
      DEPLOYED: "배포 완료",
    });
    expect(normalizeWorkTaskInternalStatus("HOTFIX")).toBe("HOTFIX");
    expect(normalizeWorkTaskInternalStatus("DONE")).toBeNull();
  });
});
