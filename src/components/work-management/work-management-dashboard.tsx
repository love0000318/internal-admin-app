import {
  acknowledgeWorkTaskChangeRequestAction,
  createWorkTaskChangeRequestAction,
  runClickUpDocsSyncAction,
  runClickUpTaskSyncAction,
  updateWorkTaskLocalStateAction,
} from "@/app/(app)/admin/work-management/actions";
import { Badge, buttonClassName, Card, EmptyState } from "@/components/design-system/primitives";
import type { WorkTaskChangeRequestStatus, WorkTaskInternalStatus } from "@/generated/prisma/enums";
import type { WorkManagementDashboardData, WorkManagementFilters } from "@/lib/work-management/queries";
import {
  WORK_TASK_CHANGE_REQUEST_STATUS_LABELS,
  WORK_TASK_INTERNAL_STATUS_LABELS,
  WORK_TASK_INTERNAL_STATUS_OPTIONS,
} from "@/lib/work-management/labels";
import {
  CheckCircle2,
  FileText,
  GitPullRequest,
  RefreshCcw,
  Save,
} from "lucide-react";

type WorkManagementDashboardProps = {
  data: WorkManagementDashboardData;
  filters: WorkManagementFilters;
  taskConnectionMessage: string;
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

function dateInputValue(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function formatDate(value: Date | null | undefined) {
  return value ? dateFormatter.format(value) : "-";
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
      return "ClickUp 연결 정보가 아직 설정되지 않았습니다.";
    case "sync-failed":
      return "ClickUp 업무 동기화 중 오류가 발생했습니다.";
    case "docs-ready":
      return "ClickUp Docs 읽기 연동 adapter 준비 상태를 확인했습니다.";
    case "docs-skipped":
      return "ClickUp Docs 동기화 준비 중입니다.";
    case "updated":
      return "업무 내부 정보가 저장되었습니다.";
    case "change-created":
      return "변경 요청이 추가되었습니다.";
    case "change-checked":
      return "변경 요청을 확인 처리했습니다.";
    default:
      return null;
  }
}

export function WorkManagementDashboard({
  data,
  filters,
  taskConnectionMessage,
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
              <p className="text-sm font-semibold text-slate-500">ClickUp 업무</p>
              <p className="mt-2 break-keep text-lg font-bold text-slate-950">
                {taskConnectionMessage}
              </p>
            </div>
            <Badge tone={taskSyncConfigured ? "success" : "warning"}>
              {taskSyncConfigured ? "연결 가능" : "준비 중"}
            </Badge>
          </div>
          <form action={runClickUpTaskSyncAction} className="mt-4">
            <button
              className={buttonClassName({
                tone: "primary",
                className: "gap-2",
              })}
            >
              <RefreshCcw aria-hidden="true" className="h-4 w-4" />
              업무 동기화
            </button>
          </form>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-slate-500">ClickUp Docs</p>
          <p className="mt-2 break-keep text-lg font-bold text-slate-950">
            {docsConnectionMessage}
          </p>
          <form action={runClickUpDocsSyncAction} className="mt-4">
            <button className={buttonClassName({ tone: "neutral", className: "gap-2" })}>
              <FileText aria-hidden="true" className="h-4 w-4" />
              Docs 상태 확인
            </button>
          </form>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-slate-500">미확인 변경 요청</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{data.openChanges}</p>
          <Badge tone={data.openChanges > 0 ? "warning" : "success"}>
            {data.openChanges > 0 ? "확인 필요" : "정상"}
          </Badge>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
      </div>

      <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <input
          name="q"
          defaultValue={filters.q ?? ""}
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
          placeholder="업무명, 상태 검색"
        />
        <select
          name="teamId"
          defaultValue={filters.teamId ?? ""}
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">팀 전체</option>
          {data.teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={filters.status ?? ""}
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">상태 전체</option>
          {WORK_TASK_INTERNAL_STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {WORK_TASK_INTERNAL_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <input
          name="workDate"
          type="date"
          defaultValue={filters.workDate ?? ""}
          className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
        />
        <button className={buttonClassName({ tone: "neutral" })}>조회</button>
      </form>

      <div className="space-y-3">
        {data.tasks.length === 0 ? (
          <EmptyState
            title="동기화된 업무가 없습니다."
            description="ClickUp 연결 정보를 설정한 뒤 OWNER가 업무 동기화를 실행하면 목록이 표시됩니다."
          />
        ) : (
          data.tasks.map((task) => {
            const localState = task.localState;
            const internalStatus = localState?.internalStatus ?? "PLANNED";
            const selected = selectedTaskId === task.id;

            return (
              <article
                key={task.id}
                className={`min-w-0 rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${
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
                      {task.clickUpUrl ? (
                        <a
                          href={task.clickUpUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-blue-700 underline-offset-2 hover:underline"
                        >
                          ClickUp
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
                        <dt className="font-semibold text-slate-500">ClickUp Due</dt>
                        <dd className="mt-1">{formatDate(task.dueDate)}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-500">마지막 동기화</dt>
                        <dd className="mt-1">{formatDate(task.lastSyncedAt)}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Badge tone="default">문서 {task._count.documentLinks}</Badge>
                    <Badge tone={task._count.changeRequests > 0 ? "warning" : "default"}>
                      변경 {task._count.changeRequests}
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
                    담당 팀
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

                <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 xl:grid-cols-2">
                  <section className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      <FileText aria-hidden="true" className="h-4 w-4 text-slate-400" />
                      관련 회의록/문서
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
                      변경 요청/수정 사항
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
                  {formatDate(activity.createdAt)}
                </p>
              </div>
            ))
          )}
        </div>
      </Card>
    </section>
  );
}
