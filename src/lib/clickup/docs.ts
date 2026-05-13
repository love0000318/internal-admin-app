import { getClickUpApiToken, getClickUpSyncConfig } from "@/lib/clickup/config";
import { getPrisma } from "@/lib/db/prisma";

export type ClickUpDocsSyncResult = {
  status: "ready" | "skipped";
  message: string;
  checkedCount: number;
  createdCount: number;
  updatedCount: number;
  syncedAt: Date | null;
};

export function getClickUpDocsSyncReadiness() {
  const config = getClickUpSyncConfig();

  if (!config.docsSyncConfigured) {
    return {
      configured: false,
      message: "ClickUp Docs 동기화는 아직 준비 중입니다.",
    };
  }

  return {
    configured: true,
    message: "ClickUp Docs 읽기 연동 adapter 준비 상태를 확인할 수 있습니다.",
  };
}

export async function syncClickUpDocsSkeleton(
  sourceConfigId?: string | null,
): Promise<ClickUpDocsSyncResult> {
  const prisma = getPrisma();
  const apiToken = getClickUpApiToken();

  if (!sourceConfigId) {
    const readiness = getClickUpDocsSyncReadiness();

    if (!readiness.configured) {
      return {
        status: "skipped",
        message: readiness.message,
        checkedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        syncedAt: null,
      };
    }

    return {
      status: "ready",
      message: readiness.message,
      checkedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      syncedAt: new Date(),
    };
  }

  const config = await prisma.clickUpTeamSyncConfig.findUnique({
    where: { id: sourceConfigId },
    include: { team: { select: { id: true, name: true } } },
  });

  if (!config) {
    return {
      status: "skipped",
      message: "동기화 설정을 찾을 수 없습니다.",
      checkedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      syncedAt: null,
    };
  }

  const hasDocsScope = config.syncScope !== "TASKS_ONLY";
  const hasSourceRange =
    Boolean(config.clickUpWorkspaceId) ||
    Boolean(config.clickUpSpaceId) ||
    Boolean(config.clickUpFolderId);
  const ready = Boolean(apiToken) && config.isEnabled && hasDocsScope && hasSourceRange;
  const syncedAt = ready ? new Date() : null;
  const message = !apiToken
    ? "CLICKUP_API_TOKEN이 설정되지 않았습니다."
    : !config.isEnabled
      ? "동기화가 비활성화된 팀 설정입니다."
      : !hasDocsScope
        ? "업무 전용 설정이라 Docs 확인을 건너뛰었습니다."
        : !hasSourceRange
          ? "Workspace, Space 또는 Folder ID 중 하나가 필요합니다."
          : "ClickUp Docs 읽기 연동 adapter 준비 상태입니다.";

  await prisma.clickUpTeamSyncConfig.update({
    where: { id: config.id },
    data: {
      lastDocsSyncedAt: syncedAt ?? undefined,
      lastSyncStatus: ready ? "ready" : "skipped",
      lastSyncMessage: message,
    },
  });

  return {
    status: ready ? "ready" : "skipped",
    message,
    checkedCount: 0,
    createdCount: 0,
    updatedCount: 0,
    syncedAt,
  };
}
