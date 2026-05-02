import Link from "next/link";

import { cancelApprovedLeaveRequest } from "@/app/(app)/leaves/approvals/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { getPrisma } from "@/lib/db/prisma";
import { listApprovedLeaveRequestsForReview } from "@/lib/leave/approval-queries";
import { toNumber } from "@/lib/leave/balance";
import { dateToDateOnly } from "@/lib/leave/calculate-business-days";
import {
  formatLeaveDays,
  HALF_DAY_PERIOD_LABELS,
  LEAVE_TYPE_LABELS,
} from "@/lib/leave/labels";
import { hydrateReviewScope } from "@/lib/leave/review";
import { LEAVE_TYPES } from "@/lib/leave/types";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type ApprovedPageProps = {
  searchParams: Promise<{
    teamId?: string;
    type?: string;
    requester?: string;
    startDate?: string;
    endDate?: string;
    reviewerId?: string;
    sort?: string;
    error?: string;
    success?: string;
  }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "요청값이 올바르지 않습니다.",
  "not-found": "휴가 요청을 찾을 수 없습니다.",
  "not-approved": "승인 완료 상태의 요청만 취소할 수 있습니다.",
  forbidden: "접근 권한이 없습니다.",
  "cancel-comment-required": "취소 사유를 입력해 주세요.",
};

function buildReturnTo(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "error" && key !== "success") {
      search.set(key, value);
    }
  }

  const suffix = search.toString();
  return suffix
    ? `/leaves/approvals/approved?${suffix}`
    : "/leaves/approvals/approved";
}

export default async function ApprovedLeaveRequestsPage({
  searchParams,
}: ApprovedPageProps) {
  const actor = await requireRouteAccess("/leaves/approvals/approved");
  const filters = await searchParams;
  const prisma = getPrisma();
  const scopedActor = await hydrateReviewScope(actor, prisma);
  const [requests, teams, reviewers] = await Promise.all([
    listApprovedLeaveRequestsForReview({ actor: scopedActor, filters, prisma }),
    prisma.team.findMany({
      where:
        scopedActor.role === "LEAD"
          ? { id: { in: scopedActor.managedTeamIds ?? [] } }
          : {},
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: { in: ["OWNER", "LEAD"] }, status: "ACTIVE" },
      orderBy: { name: "asc" },
    }),
  ]);
  const returnTo = buildReturnTo(filters);

  return (
    <section>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">휴가 승인</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            승인 완료된 휴가
          </h1>
        </div>
        <Link
          href="/leaves/approvals"
          className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
        >
          승인 대기 목록
        </Link>
      </div>

      {filters.error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {ERROR_MESSAGES[filters.error] ?? "요청을 처리할 수 없습니다."}
        </p>
      ) : null}
      {filters.success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          승인된 휴가를 취소했습니다.
        </p>
      ) : null}

      <form className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm md:grid-cols-6">
        <input
          name="requester"
          defaultValue={filters.requester ?? ""}
          placeholder="요청자 이름"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <select
          name="teamId"
          defaultValue={filters.teamId ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
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
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">휴가 유형 전체</option>
          {LEAVE_TYPES.map((type) => (
            <option key={type} value={type}>
              {LEAVE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <select
          name="reviewerId"
          defaultValue={filters.reviewerId ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">승인자 전체</option>
          {reviewers.map((reviewer) => (
            <option key={reviewer.id} value={reviewer.id}>
              {reviewer.name}
            </option>
          ))}
        </select>
        <input
          name="startDate"
          type="date"
          defaultValue={filters.startDate ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <input
          name="endDate"
          type="date"
          defaultValue={filters.endDate ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <select
          name="sort"
          defaultValue={filters.sort ?? "createdAt"}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="createdAt">요청일 최신순</option>
          <option value="startDate">시작일순</option>
          <option value="requester">요청자 이름순</option>
        </select>
        <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white md:col-span-5">
          필터 적용
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[1150px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">요청자</th>
              <th className="px-4 py-3">팀</th>
              <th className="px-4 py-3">직급</th>
              <th className="px-4 py-3">휴가 유형</th>
              <th className="px-4 py-3">기간</th>
              <th className="px-4 py-3">반차</th>
              <th className="px-4 py-3">일수</th>
              <th className="px-4 py-3">승인자</th>
              <th className="px-4 py-3">승인일</th>
              <th className="px-4 py-3">처리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {requests.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={10}>
                  승인 완료된 휴가가 없습니다.
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
                    {request.requestKind === "CUSTOM_GRANT"
                      ? `${request.customLeaveType?.name ?? "맞춤휴가"}`
                      : LEAVE_TYPE_LABELS[request.type]}
                    {request.requestKind === "CUSTOM_GRANT" ? (
                      <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                        맞춤
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {dateToDateOnly(request.startDate)} -{" "}
                    {dateToDateOnly(request.endDate)}
                  </td>
                  <td className="px-4 py-3">
                    {request.halfDayPeriod
                      ? HALF_DAY_PERIOD_LABELS[request.halfDayPeriod]
                      : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {formatLeaveDays(toNumber(request.dayCount))}
                  </td>
                  <td className="px-4 py-3">{request.reviewer?.name ?? "-"}</td>
                  <td className="px-4 py-3">
                    {request.reviewedAt ? dateToDateOnly(request.reviewedAt) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="grid min-w-72 gap-2">
                      <Link
                        href={`/leaves/approvals/${request.id}`}
                        className="text-sm font-medium underline"
                      >
                        상세
                      </Link>
                      <form action={cancelApprovedLeaveRequest} className="grid gap-2">
                        <input name="requestId" type="hidden" value={request.id} />
                        <input name="returnTo" type="hidden" value={returnTo} />
                        <input
                          name="cancelComment"
                          placeholder="취소 사유"
                          className="h-9 rounded-md border border-neutral-300 px-2"
                          required
                        />
                        <ConfirmSubmitButton
                          message="승인된 휴가를 취소할까요?"
                          className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700"
                        >
                          승인 취소
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
