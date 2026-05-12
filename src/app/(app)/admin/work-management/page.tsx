import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkManagementDashboard } from "@/components/work-management/work-management-dashboard";
import { getClickUpConnectionSummary } from "@/lib/clickup/config";
import { getClickUpDocsSyncReadiness } from "@/lib/clickup/docs";
import { requireOwner } from "@/lib/rbac/server-guards";
import {
  listWorkManagementDashboard,
  type WorkManagementFilters,
} from "@/lib/work-management/queries";

export const dynamic = "force-dynamic";

type WorkManagementPageProps = {
  searchParams: Promise<{
    teamId?: string;
    status?: string;
    workDate?: string;
    q?: string;
    taskId?: string;
    sync?: string;
    docs?: string;
    updated?: string;
    changeRequest?: string;
    error?: string;
  }>;
};

function safeDateFilter(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function buildNotice(params: Awaited<WorkManagementPageProps["searchParams"]>) {
  if (params.sync === "success") {
    return "sync-success";
  }

  if (params.sync === "skipped") {
    return "sync-skipped";
  }

  if (params.sync === "failed") {
    return "sync-failed";
  }

  if (params.docs === "ready") {
    return "docs-ready";
  }

  if (params.docs === "skipped") {
    return "docs-skipped";
  }

  if (params.updated) {
    return "updated";
  }

  if (params.changeRequest === "created") {
    return "change-created";
  }

  if (params.changeRequest === "checked") {
    return "change-checked";
  }

  if (params.error) {
    return "sync-failed";
  }

  return undefined;
}

export default async function WorkManagementPage({
  searchParams,
}: WorkManagementPageProps) {
  await requireOwner();
  const params = await searchParams;
  const filters: WorkManagementFilters = {
    teamId: params.teamId,
    status: params.status,
    workDate: safeDateFilter(params.workDate),
    q: params.q,
  };
  const clickUpConnection = getClickUpConnectionSummary();
  const docsConnection = getClickUpDocsSyncReadiness();
  const data = await listWorkManagementDashboard(filters);

  return (
    <PageContainer>
            <PageHeader
        eyebrow="OWNER test"
        title="Work Management"
        description="Manage ClickUp task and Docs mirrors for team assignment, internal status, and change request tracking."
      />
      <WorkManagementDashboard
        data={data}
        filters={filters}
        taskConnectionMessage={clickUpConnection.message}
        taskSyncConfigured={clickUpConnection.taskSyncConfigured}
        docsConnectionMessage={docsConnection.message}
        selectedTaskId={params.taskId}
        notice={buildNotice(params)}
      />
    </PageContainer>
  );
}

