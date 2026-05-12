import { getClickUpSyncConfig } from "@/lib/clickup/config";

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
      message: "ClickUp Docs 동기화 준비 중입니다.",
    };
  }

  return {
    configured: true,
    message: "ClickUp Docs 읽기 연동 adapter가 준비되면 수집을 실행할 수 있습니다.",
  };
}

export async function syncClickUpDocsSkeleton(): Promise<ClickUpDocsSyncResult> {
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
