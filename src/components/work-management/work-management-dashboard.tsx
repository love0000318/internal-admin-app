import {
  acknowledgeWorkTaskChangeRequestAction,
  createWorkTaskChangeRequestAction,
  createWorkTaskRelationAction,
  deleteWorkTaskRelationAction,
  runClickUpDocsSyncAction,
  runClickUpTaskSyncAction,
  updateClickUpTeamSyncConfigAction,
  updateWorkTaskLocalStateAction,
} from "@/app/(app)/admin/work-management/actions";
import { Badge, buttonClassName, Card, EmptyState } from "@/components/design-system/primitives";
import type {
  WorkTaskChangeRequestStatus,
  WorkTaskInternalStatus,
  WorkTaskRelationType,
} from "@/generated/prisma/enums";
import type { WorkManagementDashboardData, WorkManagementFilters } from "@/lib/work-management/queries";
import {
  WORK_TASK_CHANGE_REQUEST_STATUS_LABELS,
  WORK_TASK_INTERNAL_STATUS_LABELS,
  WORK_TASK_INTERNAL_STATUS_OPTIONS,
} from "@/lib/work-management/labels";
import { CLICKUP_SYNC_SCOPE_OPTIONS } from "@/lib/work-management/team-sync-configs";
import {
  CheckCircle2,
  FileText,
  GitPullRequest,
  Link2,
  RefreshCcw,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";

type WorkManagementDashboardProps = {
  data: WorkManagementDashboardData;
  filters: WorkManagementFilters;
  taskConnectionMessage: string;
  apiTokenConfigured: boolean;
  taskSyncConfigured: boolean;
  docsConnectionMessage: string;
  selectedTaskId?: string;
  notice?: string;
};

type BadgeTone = "default" | "primary" | "success" | "warning" | "danger" | "info";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const relationTypeLabels: Record<WorkTaskRelationType, string> = {
  RELATED: "관련",
  BLOCKED_BY: "차단 원인",
  FOLLOW_UP: "후속",
  DUPLICATE: "중복",
  REFERENCE: "참고",
};
const syncScopeLabels: Record<(typeof CLICKUP_SYNC_SCOPE_OPTIONS)[number], string> = {
  TASKS_AND_DOCS: "업무 + Docs",
  TASKS_ONLY: "업무만",
  DOCS_ONLY: "Docs만",
};

function dateInputValue(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function formatDate(value: Date | null | undefined) {
  return value ? dateFormatter.format(value) : "-";
}

function formatDateTime(value: Date | null | undefined) {
  return value ? dateTimeFormatter.format(value) : "-";
}

function internalStatusTone(status: WorkTaskInternalStatus): BadgeTone {
  if (status === "DEPLOYED") {
    return "success";
  }

  if (status === "HOTFIX") {
    return "danger";
  }

  if (status === "IN_PROGRESS") {
    return "primary";
  }

  return "default";
}

function changeRequestTone(status: WorkTaskChangeRequestStatus): BadgeTone {
  if (status === "OPEN") {
    return "warning";
  }

  if (status === "ACKNOWLEDGED") {
    return "primary";
  }

  if (status === "RESOLVED") {
    return "success";
  }

  return "default";
}

function syncStatusTone(status: string | null | undefined): BadgeTone {
  if (status === "success" || status === "ready") {
    return "success";
  }

  if (status === "failed") {
    return "danger";
  }

  if (status === "skipped") {
    return "warning";
  }

  return "default";
}

function assigneeText(value: unknown) {
  if (!Array.isArray(value)) {
    return "-";
  }

  const names = value
    .map((entry) =>
      entry && typeof entry === "object" && "name" in entry
        ? String(entry.name ?? "").trim()
        : "",
    )
    .filter(Boolean);

  return names.length > 0 ? names.join(", ") : "-";
}

function noticeText(notice?: string) {
  switch (notice) {
    case "sync-success":
      return "ClickUp 업무 동기화가 완료되었습니다.";
    case "sync-skipped":
      return "동기화할 ClickUp 팀 설정이 없습니다.";
    case "sync-failed":
      return "ClickUp 업무 동기화 중 오류가 발생했습니다.";
    case "docs-ready":
      return "ClickUp Docs 읽기 연동 상태를 확인했습니다.";
    case "docs-skipped":
      return "ClickUp Docs 동기화 준비가 아직 완료되지 않았습니다.";
    case "updated":
      return "업무 내부 정보가 저장되었습니다.";
    case "change-created":
      return "변경 요청을 추가했습니다.";
    case "change-checked":
      return "변경 요청을 확인 처리했습니다.";
    case "settings-updated":
      return "ClickUp 팀별 동기화 설정을 저장했습니다.";
    case "relation-created":
      return "타 팀 연계 업무를 추가했습니다.";
    case "relation-deleted":
      return "타 팀 연계 업무를 해제했습니다.";
    default:
      return null;
  }
}

function sourceLabel(task: {
  sourceTeamName?: string | null;
  sourceListName?: string | null;
  sourceListId?: string | null;
}) {
  const team = task.sourceTeamName ?? "출처 팀 미지정";
  const list = task.sourceListName ?? task.sourceListId ?? "List 미지정";
  return `${team} / ${list}`;
}

export function WorkManagementDashboard({
  data,
  filters,
  taskConnectionMessage,
  apiTokenConfigured,
  taskSyncConfigured,
  docsConnectionMessage,
  selectedTaskId,
  notice,
}: WorkManagementDashboardProps) {
  const visibleNotice = noticeText(notice);

  return (
    <section className="min-w-0 space-y-5">
      {visibleNotice ? (
        <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
          {visibleNotice}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-4">
        <Card className="lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-500">ClickUp 연결</p>
              <p className="mt-2 break-keep text-lg font-bold text-slate-950">
                {taskConnectionMessage}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <Badge tone={apiTokenConfigured ? "success" : "warning"}>
                token {apiTokenConfigured ? "설정됨" : "필요"}
              </Badge>
              <Badge tone={taskSyncConfigured ? "success" : "default"}>
                legacy {taskSyncConfigured ? "가능" : "미사용"}
              </Badge>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={runClickUpTaskSyncAction}>
              <button className={buttonClassName({ tone: "primary", className: "gap-2" })}>
                <RefreshCcw aria-hidden="true" className="h-4 w-4" />
                전체 팀 업무 동기화
              </button>
            </form>
            <form action={runClickUpDocsSyncAction}>
              <button className={buttonClassName({ tone: "neutral", className: "gap-2" })}>
                <FileText aria-hidden="true" className="h-4 w-4" />
                Docs 상태 확인
              </button>
            </form>
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-slate-500">팀별 설정</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">
            {data.teamSyncSettings.configuredTeamCount}/4
          </p>
          <p className="mt-2 text-sm text-slate-600">
            활성 팀 {data.teamSyncSettings.activeConfigCount}개
          </p>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-slate-500">최근 전체 동기화</p>
          <p className="mt-2 break-keep text-lg font-bold text-slate-950">
            {formatDateTime(data.teamSyncSettings.lastTaskSyncedAt)}
          </p>
          <p className="mt-2 text-sm text-slate-600">{docsConnectionMessage}</p>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.teamSyncSettings.targets.map((target) => {
          const config = target.config;
          const canSync = Boolean(config?.id && config.isEnabled && config.clickUpListId);

          return (
            <article
              key={target.targetName}
              className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="break-keep text-base font-bold text-slate-950">
                    {target.targetName}
                  </h2>
                  <p className="mt-1 break-keep text-sm text-slate-500">
                    {target.team ? target.team.name : "팀 매핑 필요"}
                  </p>
                </div>
                <Badge
                  tone={
                    target.needsTeamMapping
                      ? "warning"
                      : config?.isEnabled && config.clickUpListId
                        ? "success"
                        : "default"
                  }
                >
                  {target.needsTeamMapping
                    ? "조직 팀 필요"
                    : config?.isEnabled && config.clickUpListId
                      ? "연결됨"
                      : "설정 필요"}
                </Badge>
              </div>

              {!target.team ? (
                <p className="mt-4 break-keep text-sm leading-relaxed text-slate-600">
                  해당 팀을 먼저 조직 관리에서 생성하세요.
                </p>
              ) : (
                <>
                  <form action={updateClickUpTeamSyncConfigAction} className="mt-4 grid gap-2">
                    <input name="teamId" type="hidden" value={target.team.id} />
                    <label className="grid gap-1 text-xs font-semibold text-slate-600">
                      표시명
                      <input
                        name="displayName"
                        defaultValue={config?.displayName ?? target.team.name}
                        className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-900"
                      />
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs font-semibold text-slate-600">
                        Workspace ID
                        <input
                          name="clickUpWorkspaceId"
                          defaultValue={config?.clickUpWorkspaceId ?? ""}
                          className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-900"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold text-slate-600">
                        Space ID
                        <input
                          name="clickUpSpaceId"
                          defaultValue={config?.clickUpSpaceId ?? ""}
                          className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-900"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold text-slate-600">
                        Folder ID
                        <input
                          name="clickUpFolderId"
                          defaultValue={config?.clickUpFolderId ?? ""}
                          className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-900"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-semibold text-slate-600">
                        List ID
                        <input
                          name="clickUpListId"
                          defaultValue={config?.clickUpListId ?? ""}
                          className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-900"
                        />
                      </label>
                    </div>
                    <label className="grid gap-1 text-xs font-semibold text-slate-600">
                      List 표시명
                      <input
                        name="clickUpListName"
                        defaultValue={config?.clickUpListName ?? ""}
                        className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-900"
                      />
                    </label>
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <label className="grid gap-1 text-xs font-semibold text-slate-600">
                        동기화 범위
                        <select
                          name="syncScope"
                          defaultValue={config?.syncScope ?? "TASKS_AND_DOCS"}
                          className="h-9 rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-900"
                        >
                          {CLICKUP_SYNC_SCOPE_OPTIONS.map((scope) => (
                            <option key={scope} value={scope}>
                              {syncScopeLabels[scope]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-end gap-2 pb-2 text-sm font-semibold text-slate-700">
                        <input
                          name="isEnabled"
                          type="checkbox"
                          defaultChecked={config?.isEnabled ?? false}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        활성
                      </label>
                    </div>
                    <label className="grid gap-1 text-xs font-semibold text-slate-600">
                      메모
                      <textarea
                        name="note"
                        defaultValue={config?.note ?? ""}
                        rows={2}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
                      />
                    </label>
                    <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                      <span>마지막 동기화: {formatDateTime(config?.lastTaskSyncedAt)}</span>
                      <span>Docs 확인: {formatDateTime(config?.lastDocsSyncedAt)}</span>
                      <span className="flex items-center gap-2">
                        결과
                        <Badge tone={syncStatusTone(config?.lastSyncStatus)}>
                          {config?.lastSyncStatus ?? "-"}
                        </Badge>
                      </span>
                      <span className="break-keep">메시지: {config?.lastSyncMessage ?? "-"}</span>
                    </div>
                    <button className={buttonClassName({ tone: "primary", className: "gap-2" })}>
                      <Save aria-hidden="true" className="h-4 w-4" />
                      설정 저장
                    </button>
                  </form>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={runClickUpTaskSyncAction}>
                      <input name="sourceConfigId" type="hidden" value={config?.id ?? ""} />
                      <button
                        disabled={!canSync}
                        className={buttonClassName({
                          tone: "neutral",
                          className: `gap-2 ${canSync ? "" : "cursor-not-allowed opacity-50"}`,
                        })}
                      >
                        <RefreshCcw aria-hidden="true" className="h-4 w-4" />
                        이 팀 동기화
                      </button>
                    </form>
                    <form action={runClickUpDocsSyncAction}>
                      <input name="sourceConfigId" type="hidden" value={config?.id ?? ""} />
                      <button
                        disabled={!config?.id}
                        className={buttonClassName({
                          tone: "neutral",
                          className: `gap-2 ${config?.id ? "" : "cursor-not-allowed opacity-50"}`,
                        })}
                      >
                        <FileText aria-hidden="true" className="h-4 w-4" />
                        Docs 확인
                      </button>
                    </form>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {WORK_TASK_INTERNAL_STATUS_OPTIONS.map((status) => (
          <Card key={status}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-500">
                {WORK_TASK_INTERNAL_STATUS_LABELS[status]}
              </p>
              <Badge tone={internalStatusTone(status)}>{status}</Badge>
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-950">
              {data.statusCounts[status]}
            </p>
          </Card>
        ))}
        <Card>
          <p className="text-sm font-semibold text-slate-500">미확인 변경 요청</p>
          <p className="mt-3 text-3xl font-bold text-slate-950">{data.openChanges}</p>
          <Badge tone={data.openChanges > 0 ? "warning" : "success"}>
            {data.openChanges > 0 ? "확인 필요" : "정상"}
          </Badge>
        </Card>
      </div>

      <form className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-6">
        <input
          name="q"
          defaultValue={filters.q ?? ""}
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
          placeholder="업무명, 상태 검색"
        />
        <select
          name="sourceTeamId"
          defaultValue={filters.sourceTeamId ?? ""}
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">출처 팀 전체</option>
          {data.teamSyncSettings.targets
            .filter((target) => target.team)
            .map((target) => (
              <option key={target.team?.id} value={target.team?.id}>
                {target.team?.name}
              </option>
            ))}
        </select>
        <select
          name="teamId"
          defaultValue={filters.teamId ?? ""}
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">내부 담당 팀 전체</option>
          {data.teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <select
          name="sourceListId"
          defaultValue={filters.sourceListId ?? ""}
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">ClickUp List 전체</option>
          {data.sourceLists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name ?? list.id}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={filters.status ?? ""}
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">내부 상태 전체</option>
          {WORK_TASK_INTERNAL_STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {WORK_TASK_INTERNAL_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            name="workDate"
            type="date"
            defaultValue={filters.workDate ?? ""}
            className="h-10 min-w-0 rounded-lg border border-slate-300 px-3 text-sm"
          />
          <button className={buttonClassName({ tone: "neutral" })}>조회</button>
        </div>
      </form>

      <div className="space-y-3">
        {data.tasks.length === 0 ? (
          <EmptyState
            title="동기화된 업무가 없습니다."
            description="팀별 ClickUp 설정을 저장한 뒤 OWNER가 read-only 동기화를 실행하면 목록에 표시됩니다."
          />
        ) : (
          data.tasks.map((task) => {
            const localState = task.localState;
            const internalStatus = localState?.internalStatus ?? "PLANNED";
            const selected = selectedTaskId === task.id;
            const relationCandidates = data.relationCandidates.filter(
              (candidate) => candidate.id !== task.id,
            );

            return (
              <article
                key={task.id}
                className={`min-w-0 rounded-lg border bg-white p-4 shadow-sm sm:p-5 ${
                  selected ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-200"
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={internalStatusTone(internalStatus)}>
                        {WORK_TASK_INTERNAL_STATUS_LABELS[internalStatus]}
                      </Badge>
                      {task.clickUpStatus ? <Badge tone="info">{task.clickUpStatus}</Badge> : null}
                      <Badge tone="default">{sourceLabel(task)}</Badge>
                      {task.clickUpUrl ? (
                        <a
                          href={task.clickUpUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-blue-700 underline-offset-2 hover:underline"
                        >
                          ClickUp 원본
                        </a>
                      ) : null}
                    </div>
                    <h2 className="mt-3 break-keep text-lg font-bold text-slate-950">
                      {task.name}
                    </h2>
                    {task.descriptionSummary ? (
                      <p className="mt-2 line-clamp-2 break-keep text-sm leading-relaxed text-slate-600">
                        {task.descriptionSummary}
                      </p>
                    ) : null}
                    <dl className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                      <div>
                        <dt className="font-semibold text-slate-500">ClickUp 담당자</dt>
                        <dd className="mt-1 break-keep">{assigneeText(task.clickUpAssignees)}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">작업일</dt>
                        <dd className="mt-1">{formatDate(localState?.workDate)}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">마지막 동기화</dt>
                        <dd className="mt-1">{formatDateTime(task.lastSyncedAt)}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Badge tone="default">문서 {task._count.documentLinks}</Badge>
                    <Badge tone={task._count.changeRequests > 0 ? "warning" : "default"}>
                      변경 {task._count.changeRequests}
                    </Badge>
                    <Badge
                      tone={
                        task._count.childRelations + task._count.parentRelations > 0
                          ? "info"
                          : "default"
                      }
                    >
                      연계 {task._count.childRelations + task._count.parentRelations}
                    </Badge>
                  </div>
                </div>

                <form
                  action={updateWorkTaskLocalStateAction}
                  className="mt-4 grid gap-3 border-t border-slate-100 pt-4 lg:grid-cols-[1fr_1fr_1fr_2fr_auto]"
                >
                  <input name="taskMirrorId" type="hidden" value={task.id} />
                  <label className="grid gap-1 text-sm font-semibold text-slate-600">
                    내부 상태
                    <select
                      name="internalStatus"
                      defaultValue={internalStatus}
                      className="h-10 rounded-lg border border-slate-300 px-3 font-normal text-slate-900"
                    >
                      {WORK_TASK_INTERNAL_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {WORK_TASK_INTERNAL_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-semibold text-slate-600">
                    내부 담당 팀
                    <select
                      name="teamId"
                      defaultValue={localState?.teamId ?? ""}
                      className="h-10 rounded-lg border border-slate-300 px-3 font-normal text-slate-900"
                    >
                      <option value="">미지정</option>
                      {data.teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-semibold text-slate-600">
                    작업일
                    <input
                      name="workDate"
                      type="date"
                      defaultValue={dateInputValue(localState?.workDate)}
                      className="h-10 rounded-lg border border-slate-300 px-3 font-normal text-slate-900"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-semibold text-slate-600">
                    내부 메모
                    <textarea
                      name="memo"
                      defaultValue={localState?.memo ?? ""}
                      rows={2}
                      className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 font-normal text-slate-900"
                    />
                  </label>
                  <div className="flex items-end">
                    <button className={buttonClassName({ tone: "primary", className: "gap-2" })}>
                      <Save aria-hidden="true" className="h-4 w-4" />
                      저장
                    </button>
                  </div>
                </form>

                <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 xl:grid-cols-3">
                  <section className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      <Settings2 aria-hidden="true" className="h-4 w-4 text-slate-400" />
                      원본 정보
                    </div>
                    <dl className="mt-3 space-y-2 text-sm text-slate-600">
                      <div>
                        <dt className="font-semibold text-slate-500">출처 팀</dt>
                        <dd>{task.sourceTeamName ?? task.sourceTeam?.name ?? "-"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">Workspace / Space</dt>
                        <dd className="break-all">
                          {task.sourceWorkspaceId ?? "-"} / {task.sourceSpaceId ?? "-"}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">Folder / List</dt>
                        <dd className="break-all">
                          {task.sourceFolderId ?? "-"} / {task.sourceListId ?? "-"}
                        </dd>
                      </div>
                    </dl>
                  </section>

                  <section className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      <FileText aria-hidden="true" className="h-4 w-4 text-slate-400" />
                      관련 Docs
                    </div>
                    <div className="mt-3 space-y-2">
                      {task.documentLinks.length === 0 ? (
                        <p className="text-sm text-slate-500">연결된 문서가 없습니다.</p>
                      ) : (
                        task.documentLinks.map((link) =>
                          link.document.documentUrl ? (
                            <a
                              key={link.id}
                              href={link.document.documentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block break-keep text-sm font-medium text-blue-700 underline-offset-2 hover:underline"
                            >
                              {link.document.title}
                            </a>
                          ) : (
                            <p key={link.id} className="break-keep text-sm font-medium text-slate-700">
                              {link.document.title}
                            </p>
                          ),
                        )
                      )}
                    </div>
                  </section>

                  <section className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      <GitPullRequest aria-hidden="true" className="h-4 w-4 text-slate-400" />
                      변경 요청
                    </div>
                    <div className="mt-3 space-y-3">
                      {task.changeRequests.length === 0 ? (
                        <p className="text-sm text-slate-500">등록된 변경 요청이 없습니다.</p>
                      ) : (
                        task.changeRequests.map((changeRequest) => (
                          <div key={changeRequest.id} className="border-b border-slate-100 pb-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="break-keep text-sm font-semibold text-slate-900">
                                {changeRequest.title}
                              </p>
                              <Badge tone={changeRequestTone(changeRequest.status)}>
                                {WORK_TASK_CHANGE_REQUEST_STATUS_LABELS[changeRequest.status]}
                              </Badge>
                            </div>
                            <p className="mt-1 break-keep text-sm leading-relaxed text-slate-600">
                              {changeRequest.content}
                            </p>
                            {changeRequest.status === "OPEN" ? (
                              <form
                                action={acknowledgeWorkTaskChangeRequestAction}
                                className="mt-2"
                              >
                                <input
                                  name="changeRequestId"
                                  type="hidden"
                                  value={changeRequest.id}
                                />
                                <input name="taskMirrorId" type="hidden" value={task.id} />
                                <button
                                  className={buttonClassName({
                                    tone: "neutral",
                                    className: "min-h-8 gap-2 px-3 py-1 text-xs",
                                  })}
                                >
                                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                                  확인
                                </button>
                              </form>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>

                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm font-semibold text-blue-700">
                        변경 요청 추가
                      </summary>
                      <form action={createWorkTaskChangeRequestAction} className="mt-3 grid gap-2">
                        <input name="taskMirrorId" type="hidden" value={task.id} />
                        <input
                          name="title"
                          className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
                          placeholder="제목"
                        />
                        <textarea
                          name="content"
                          rows={3}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          placeholder="변경 요청 내용"
                        />
                        <select
                          name="docMirrorId"
                          className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
                          defaultValue=""
                        >
                          <option value="">문서 선택 안 함</option>
                          {data.recentDocs.map((doc) => (
                            <option key={doc.id} value={doc.id}>
                              {doc.title}
                            </option>
                          ))}
                        </select>
                        <input
                          name="sourceDocumentUrl"
                          className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
                          placeholder="출처 문서 URL"
                        />
                        <button className={buttonClassName({ tone: "neutral" })}>
                          변경 요청 저장
                        </button>
                      </form>
                    </details>
                  </section>
                </div>

                <section className="mt-4 border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <Link2 aria-hidden="true" className="h-4 w-4 text-slate-400" />
                    타 팀 연계 정보
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="space-y-2">
                      {task.childRelations.length === 0 ? (
                        <p className="text-sm text-slate-500">이 업무에 연결된 연계 업무가 없습니다.</p>
                      ) : (
                        task.childRelations.map((relation) => (
                          <div
                            key={relation.id}
                            className="rounded-lg border border-slate-200 p-3 text-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="break-keep font-semibold text-slate-900">
                                  {relation.relatedTask.name}
                                </p>
                                <p className="mt-1 break-keep text-slate-500">
                                  {sourceLabel(relation.relatedTask)}
                                </p>
                              </div>
                              <Badge tone="info">{relationTypeLabels[relation.relationType]}</Badge>
                            </div>
                            {relation.note ? (
                              <p className="mt-2 break-keep text-slate-600">{relation.note}</p>
                            ) : null}
                            <form action={deleteWorkTaskRelationAction} className="mt-2">
                              <input name="relationId" type="hidden" value={relation.id} />
                              <input name="taskMirrorId" type="hidden" value={task.id} />
                              <button
                                className={buttonClassName({
                                  tone: "danger",
                                  className: "min-h-8 gap-2 px-3 py-1 text-xs",
                                })}
                              >
                                <Trash2 aria-hidden="true" className="h-4 w-4" />
                                해제
                              </button>
                            </form>
                          </div>
                        ))
                      )}
                      {task.parentRelations.length > 0 ? (
                        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
                          <p className="font-semibold text-sky-900">
                            다른 업무에서 이 업무를 참조 중
                          </p>
                          <div className="mt-2 space-y-1">
                            {task.parentRelations.map((relation) => (
                              <p key={relation.id} className="break-keep text-sky-800">
                                {relation.parentTask.name} · {relationTypeLabels[relation.relationType]}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <form action={createWorkTaskRelationAction} className="grid gap-2">
                      <input name="parentTaskMirrorId" type="hidden" value={task.id} />
                      <select
                        name="relatedTaskMirrorId"
                        className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
                        defaultValue=""
                      >
                        <option value="">연계할 업무 선택</option>
                        {relationCandidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.sourceTeamName ?? "출처 미지정"} · {candidate.name}
                          </option>
                        ))}
                      </select>
                      <select
                        name="relationType"
                        className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
                        defaultValue="RELATED"
                      >
                        {Object.entries(relationTypeLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <textarea
                        name="note"
                        rows={2}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        placeholder="연계 사유 또는 검토 메모"
                      />
                      <button
                        disabled={relationCandidates.length === 0}
                        className={buttonClassName({
                          tone: "neutral",
                          className:
                            relationCandidates.length === 0
                              ? "cursor-not-allowed opacity-50"
                              : "",
                        })}
                      >
                        연계 정보 추가
                      </button>
                    </form>
                  </div>
                </section>
              </article>
            );
          })
        )}
      </div>

      <Card>
        <h2 className="text-lg font-bold text-slate-950">최근 업무 이력</h2>
        <div className="mt-3 divide-y divide-slate-100">
          {data.recentActivities.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">업무 이력이 없습니다.</p>
          ) : (
            data.recentActivities.map((activity) => (
              <div key={activity.id} className="py-3 text-sm">
                <p className="font-semibold text-slate-900">{activity.message}</p>
                <p className="mt-1 break-keep text-slate-500">
                  {activity.task.name} · {activity.actor?.name ?? "시스템"} ·{" "}
                  {formatDateTime(activity.createdAt)}
                </p>
              </div>
            ))
          )}
        </div>
      </Card>
    </section>
  );
}
