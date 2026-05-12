import { describe, expect, it } from "vitest";

import { buildClickUpSyncConfig } from "@/lib/clickup/config";
import { normalizeClickUpTask } from "@/lib/clickup/tasks";
import {
  WORK_TASK_INTERNAL_STATUS_LABELS,
  normalizeWorkTaskInternalStatus,
} from "@/lib/work-management/labels";

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

  it("normalizes ClickUp task payloads without storing raw assignee email", () => {
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
      {
        apiToken: "redacted-value",
        teamId: null,
        spaceId: null,
        folderId: null,
        listId: "list-1",
        taskSyncConfigured: true,
        docsSyncConfigured: false,
        missingTaskKeys: [],
        missingDocsKeys: ["CLICKUP_TEAM_ID"],
      },
    );

    expect(normalized?.clickUpTaskId).toBe("task-1");
    expect(normalized?.clickUpStatus).toBe("in progress");
    expect(JSON.stringify(normalized?.clickUpAssignees)).not.toContain("owner@example.com");
  });

  it("keeps the four Internal Ops task statuses stable", () => {
    expect(WORK_TASK_INTERNAL_STATUS_LABELS).toEqual({
      PLANNED: "진행 예정",
      IN_PROGRESS: "진행 중",
      HOTFIX: "Hotfix",
      DEPLOYED: "배포 완료",
    });
    expect(normalizeWorkTaskInternalStatus("HOTFIX")).toBe("HOTFIX");
    expect(normalizeWorkTaskInternalStatus("DONE")).toBeNull();
  });
});
