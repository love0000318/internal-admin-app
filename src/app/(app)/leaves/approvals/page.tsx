import Link from "next/link";

import {
  approveLeaveRequest,
  rejectLeaveRequest,
} from "@/app/(app)/leaves/approvals/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Badge, buttonClassName } from "@/components/design-system/primitives";
import { getPrisma } from "@/lib/db/prisma";
import { listPendingLeaveApprovals } from "@/lib/leave/approval-queries";
import { toNumber } from "@/lib/leave/balance";
import { dateToDateOnly } from "@/lib/leave/calculate-business-days";
import {
  formatLeaveDays,
  HALF_DAY_PERIOD_LABELS,
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
} from "@/lib/leave/labels";
import { hydrateReviewScope } from "@/lib/leave/review";
import { LEAVE_TYPES } from "@/lib/leave/types";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type ApprovalsPageProps = {
  searchParams: Promise<{
    teamId?: string;
    type?: string;
    requester?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    sort?: string;
    error?: string;
    success?: string;
  }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "요청값이 올바르지 않습니다.",
  "not-found": "휴가 요청을 찾을 수 없습니다.",
  "not-pending": "승인 대기 상태의 요청만 처리할 수 있습니다.",
  "requester-inactive": "비활성화된 직원의 요청은 승인할 수 없습니다.",
  forbidden: "접근 권한이 없습니다.",
  "balance-or-overlap": "잔여 휴가가 부족하거나 이미 승인된 휴가와 날짜가 겹칩니다.",
  "reject-comment-required": "반려 사유를 입력해 주세요.",
};

const SUCCESS_MESSAGES: Record<string, string> = {
  approved: "휴가 요청을 승인했습니다.",
  rejected: "휴가 요청을 반려했습니다.",
};

function buildReturnTo(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "error" && key !== "success") {
      search.set(key, value);
    }
  }

  const suffix = search.toString();
  return suffix ? `/leaves/approvals?${suffix}` : "/leaves/approvals";
}

function getRequestTypeLabel(request: Awaited<ReturnType<typeof listPendingLeaveApprovals>>[number]) {
  return request.requestKind === "CUSTOM_GRANT"
    ? (request.customLeaveType?.name ?? "맞춤휴가")
    : LEAVE_TYPE_LABELS[request.type];
}

function renderApprovalActions({
  requestId,
  returnTo,
  compact = false,
}: {
  requestId: string;
  returnTo: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "grid gap-2" : "grid min-w-72 gap-2"}>
      <Link
        href={`/leaves/approvals/${requestId}`}
        className="inline-flex min-h-9 items-center whitespace-nowrap break-keep text-sm font-semibold text-blue-700 underline"
      >
        상세 보기
      </Link>
      <form action={approveLeaveRequest} className="grid gap-2">
        <input name="requestId" type="hidden" value={requestId} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <input
          name="reviewComment"
          placeholder="승인 코멘트(선택)"
          className="h-10 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <ConfirmSubmitButton
          message="이 휴가 요청을 승인할까요?"
          className="min-h-10 rounded-md bg-neutral-950 px-3 py-2 text-sm font-medium text-white"
        >
          승인
        </ConfirmSubmitButton>
      </form>
      <form action={rejectLeaveRequest} className="grid gap-2">
        <input name="requestId" type="hidden" value={requestId} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <input
          name="reviewComment"
          placeholder="반려 사유"
          className="h-10 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-sm"
          required
        />
        <ConfirmSubmitButton
          message="이 휴가 요청을 반려할까요?"
          className="min-h-10 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700"
        >
          반려
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}

export default async function LeaveApprovalsPage({
  searchParams,
}: ApprovalsPageProps) {
  const actor = await requireRouteAccess("/leaves/approvals");
  const filters = await searchParams;
  const prisma = getPrisma();
  const scopedActor = await hydrateReviewScope(actor, prisma);
  const [requests, teams] = await Promise.all([
    listPendingLeaveApprovals({ actor: scopedActor, filters, prisma }),
    prisma.team.findMany({
      where:
        scopedActor.role === "LEAD"
          ? { id: { in: scopedActor.managedTeamIds ?? [] } }
          : {},
      orderBy: { name: "asc" },
    }),
  ]);
  const returnTo = buildReturnTo(filters);

  return (
    <section className="min-w-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-500">휴가 승인</p>
          <h1 className="mt-2 break-keep text-2xl font-semibold tracking-normal">
            휴가 승인 요청 사항
          </h1>
        </div>
        <Link
          href="/leaves/approvals/approved"
          className={buttonClassName({ tone: "neutral", className: "w-full sm:w-auto" })}
        >
          승인 완료 리스트
        </Link>
      </div>

      {filters.error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {filters.error === "attachment-not-accepted"
            ? "증명자료 확인이 완료되어야 승인할 수 있습니다."
            : ERROR_MESSAGES[filters.error] ?? "요청을 처리할 수 없습니다."}
        </p>
      ) : null}
      {filters.success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {SUCCESS_MESSAGES[filters.success] ?? "요청을 처리했습니다."}
        </p>
      ) : null}

      <form className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
        <input
          name="requester"
          defaultValue={filters.requester ?? ""}
          placeholder="요청자 이름"
          className="h-10 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <select
          name="teamId"
          defaultValue={filters.teamId ?? ""}
          className="h-10 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">팀 전체</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <select
          name="type"
          defaultValue={filters.type ?? ""}
          className="h-10 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">휴가 유형 전체</option>
          {LEAVE_TYPES.map((type) => (
            <option key={type} value={type}>
              {LEAVE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={filters.status ?? "PENDING"}
          className="h-10 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="PENDING">승인 대기</option>
          <option value="APPROVED">승인 완료</option>
          <option value="REJECTED">반려</option>
          <option value="CANCELLED">취소</option>
          <option value="WITHDRAWN">철회</option>
        </select>
        <input
          name="startDate"
          type="date"
          defaultValue={filters.startDate ?? ""}
          className="h-10 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <input
          name="endDate"
          type="date"
          defaultValue={filters.endDate ?? ""}
          className="h-10 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <select
          name="sort"
          defaultValue={filters.sort ?? "createdAt"}
          className="h-10 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="createdAt">요청일 최신순</option>
          <option value="startDate">시작일순</option>
          <option value="requester">요청자 이름순</option>
        </select>
        <button className="min-h-10 rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white sm:col-span-2 lg:col-span-5">
          필터 적용
        </button>
      </form>

      <div className="mt-6 grid gap-3 md:hidden">
        {requests.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-500 shadow-sm">
            승인 대기 중인 휴가 요청이 없습니다.
          </div>
        ) : (
          requests.map((request) => (
            <article
              key={request.id}
              className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-keep text-base font-semibold text-neutral-950">
                    {request.user.name}
                  </h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    {request.user.team?.name ?? "팀 없음"} ·{" "}
                    {request.user.title ?? request.user.profile?.jobTitle ?? "직급 없음"}
                  </p>
                </div>
                <Badge tone={request.status === "PENDING" ? "warning" : "default"}>
                  {LEAVE_STATUS_LABELS[request.status]}
                </Badge>
              </div>

              <dl className="mt-4 grid gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 whitespace-nowrap break-keep text-neutral-500">휴가 유형</dt>
                  <dd className="min-w-0 text-right break-keep font-medium text-neutral-900">
                    {getRequestTypeLabel(request)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 whitespace-nowrap break-keep text-neutral-500">기간</dt>
                  <dd className="min-w-0 text-right text-neutral-900">
                    {dateToDateOnly(request.startDate)} ~ {dateToDateOnly(request.endDate)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 whitespace-nowrap break-keep text-neutral-500">반차</dt>
                  <dd className="text-right text-neutral-900">
                    {request.halfDayPeriod
                      ? HALF_DAY_PERIOD_LABELS[request.halfDayPeriod]
                      : "-"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 whitespace-nowrap break-keep text-neutral-500">일수</dt>
                  <dd className="text-right font-medium text-neutral-900">
                    {formatLeaveDays(toNumber(request.dayCount))}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 whitespace-nowrap break-keep text-neutral-500">요청일</dt>
                  <dd className="text-right text-neutral-900">{dateToDateOnly(request.createdAt)}</dd>
                </div>
              </dl>

              <div className="mt-4">
                {request.status === "PENDING" ? (
                  renderApprovalActions({ requestId: request.id, returnTo, compact: true })
                ) : (
                  <Link
                    href={`/leaves/approvals/${request.id}`}
                    className={buttonClassName({ tone: "neutral", className: "w-full" })}
                  >
                    상세 보기
                  </Link>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      <div className="mt-6 hidden overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm md:block">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1200px] table-auto text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="whitespace-nowrap break-keep px-4 py-3">요청자</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">팀</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">직급</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">휴가 유형</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">시작일</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">종료일</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">반차</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">일수</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">상태</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">요청일</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {requests.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-neutral-500" colSpan={11}>
                    승인 대기 중인 휴가 요청이 없습니다.
                  </td>
                </tr>
              ) : (
                requests.map((request) => (
                  <tr key={request.id} className="align-top">
                    <td className="px-4 py-3 font-medium">{request.user.name}</td>
                    <td className="px-4 py-3">{request.user.team?.name ?? "-"}</td>
                    <td className="px-4 py-3">
                      {request.user.title ?? request.user.profile?.jobTitle ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="break-keep">{getRequestTypeLabel(request)}</span>
                      {request.requestKind === "CUSTOM_GRANT" ? (
                        <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                          맞춤
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{dateToDateOnly(request.startDate)}</td>
                    <td className="px-4 py-3">{dateToDateOnly(request.endDate)}</td>
                    <td className="px-4 py-3">
                      {request.halfDayPeriod
                        ? HALF_DAY_PERIOD_LABELS[request.halfDayPeriod]
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {formatLeaveDays(toNumber(request.dayCount))}
                    </td>
                    <td className="px-4 py-3">{LEAVE_STATUS_LABELS[request.status]}</td>
                    <td className="px-4 py-3">{dateToDateOnly(request.createdAt)}</td>
                    <td className="px-4 py-3">
                      {request.status === "PENDING" ? (
                        renderApprovalActions({ requestId: request.id, returnTo })
                      ) : (
                        <Link
                          href={`/leaves/approvals/${request.id}`}
                          className="text-sm font-semibold text-blue-700 underline"
                        >
                          상세 보기
                        </Link>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
