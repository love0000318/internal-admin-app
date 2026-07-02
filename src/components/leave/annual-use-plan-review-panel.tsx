import Link from "next/link";

import {
  confirmAnnualLeaveUsePlan,
  requestAnnualLeaveUsePlanRevision,
} from "@/app/(app)/admin/leaves/promotions/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Badge, buttonClassName, Card, EmptyState } from "@/components/design-system/primitives";
import {
  annualUsePlanUsageTypeLabel,
  halfDayPeriodToUsageType,
  type AnnualUsePlanUsageType,
} from "@/lib/leave/annual-use-plan-calculator";
import {
  annualUsePlanReviewActionLabel,
  annualUsePlanReviewStatusLabel,
  dateLabel,
  type AnnualUsePlanReviewRow,
  type AnnualUsePlanReviewStatus,
} from "@/lib/leave/annual-use-plan-review";

type AnnualUsePlanReviewPanelProps = {
  rows: AnnualUsePlanReviewRow[];
  year: number;
  returnTo: string;
  basePath: string;
  success?: string;
  error?: string;
  backHref?: string;
};

function formatAmount(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "-";
  }

  return Number.isInteger(value) ? `${value}일` : `${value.toFixed(1)}일`;
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function itemUsageType(item: {
  usageType?: AnnualUsePlanUsageType | null;
  halfDayPeriod?: "AM" | "PM" | null;
}) {
  return item.usageType ?? halfDayPeriodToUsageType(item.halfDayPeriod ?? null);
}

function reviewStatusTone(status: AnnualUsePlanReviewStatus) {
  switch (status) {
    case "CONFIRMED":
      return "success";
    case "REVISION_REQUESTED":
      return "warning";
    case "SUBMITTED":
    case "RESUBMITTED":
      return "primary";
    case "CANCELLED":
      return "default";
    default:
      return "info";
  }
}

function successMessage(value?: string) {
  if (value === "confirmed") {
    return "연차 사용계획을 접수 확인 완료 처리했습니다.";
  }

  if (value === "revision-requested") {
    return "연차 사용계획 보완요청을 등록했습니다.";
  }

  return null;
}

function errorMessage(value?: string) {
  const messages: Record<string, string> = {
    invalid: "요청값을 확인해 주세요.",
    "not-found": "연차 사용계획을 찾을 수 없습니다.",
    forbidden: "접근 권한이 없습니다.",
    "not-submitted": "제출 완료 상태의 사용계획만 처리할 수 있습니다.",
    "already-reviewed": "이미 처리된 사용계획입니다. 보완 후 재제출된 경우 다시 처리할 수 있습니다.",
    "revision-reason-required": "보완요청 사유를 입력해 주세요.",
    "review-failed": "사용계획 처리 중 오류가 발생했습니다.",
  };

  return value ? messages[value] ?? messages["review-failed"] : null;
}

function buildStats(rows: AnnualUsePlanReviewRow[]) {
  return {
    total: rows.length,
    missing: rows.filter((row) =>
      row.reviewStatus === "NOT_SUBMITTED" ||
      row.reviewStatus === "DRAFT" ||
      row.reviewStatus === "CANCELLED",
    ).length,
    submitted: rows.filter((row) =>
      row.reviewStatus === "SUBMITTED" || row.reviewStatus === "RESUBMITTED",
    ).length,
    confirmed: rows.filter((row) => row.reviewStatus === "CONFIRMED").length,
    revisionRequested: rows.filter((row) => row.reviewStatus === "REVISION_REQUESTED")
      .length,
  };
}

function canReview(status: AnnualUsePlanReviewStatus) {
  return status === "SUBMITTED" || status === "RESUBMITTED";
}

function PlanItems({ row }: { row: AnnualUsePlanReviewRow }) {
  if (!row.plan?.items.length) {
    return <p className="text-sm text-slate-500">제출된 상세 계획이 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="px-2 py-2">사용 기간</th>
            <th className="px-2 py-2">사용 형태</th>
            <th className="px-2 py-2">계획일수</th>
            <th className="px-2 py-2">사유/메모</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {row.plan.items.map((item) => {
            const startDate = dateLabel(item.plannedStartDate ?? item.plannedDate);
            const endDate = dateLabel(item.plannedEndDate ?? item.plannedDate);

            return (
              <tr key={item.id}>
                <td className="whitespace-nowrap px-2 py-2">
                  {startDate}
                  {startDate !== endDate ? ` ~ ${endDate}` : ""}
                </td>
                <td className="whitespace-nowrap px-2 py-2">
                  {annualUsePlanUsageTypeLabel(itemUsageType(item))}
                </td>
                <td className="whitespace-nowrap px-2 py-2">
                  {formatAmount(item.calculatedAmount ?? item.amount)}
                </td>
                <td className="px-2 py-2">{item.memo ?? "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReviewHistory({ row }: { row: AnnualUsePlanReviewRow }) {
  if (row.reviewHistory.length === 0) {
    return <p className="text-sm text-slate-500">처리 이력이 없습니다.</p>;
  }

  return (
    <ul className="grid gap-2 text-sm">
      {row.reviewHistory.map((history) => (
        <li key={history.id} className="rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={history.actionType === "CONFIRMED" ? "success" : "warning"}>
              {annualUsePlanReviewActionLabel(history.actionType)}
            </Badge>
            <span className="text-slate-600">
              {history.reviewerName ?? history.reviewerUserId ?? "처리자 미확인"}
            </span>
            <span className="text-slate-400">{formatDateTime(history.reviewedAt)}</span>
          </div>
          {history.revisionReason ? (
            <p className="mt-2 leading-relaxed text-slate-700">
              보완요청 사유: {history.revisionReason}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function ReviewActions({
  row,
  returnTo,
}: {
  row: AnnualUsePlanReviewRow;
  returnTo: string;
}) {
  if (!row.plan || !canReview(row.reviewStatus)) {
    return null;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <form action={confirmAnnualLeaveUsePlan} className="grid gap-2">
        <input name="planId" type="hidden" value={row.plan.id} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <ConfirmSubmitButton
          className={buttonClassName({ className: "w-full" })}
          message="이 연차 사용계획을 접수 확인 완료 처리할까요?"
        >
          접수 확인 완료
        </ConfirmSubmitButton>
      </form>
      <form action={requestAnnualLeaveUsePlanRevision} className="grid gap-2">
        <input name="planId" type="hidden" value={row.plan.id} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <textarea
          className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          name="revisionReason"
          placeholder="보완요청 사유"
          required
        />
        <ConfirmSubmitButton
          className={buttonClassName({ tone: "neutral", className: "w-full" })}
          message="이 사용계획에 보완요청을 등록할까요?"
        >
          보완요청
        </ConfirmSubmitButton>
      </form>
    </div>
  );
}

export function AnnualUsePlanReviewPanel({
  rows,
  year,
  returnTo,
  basePath,
  success,
  error,
  backHref,
}: AnnualUsePlanReviewPanelProps) {
  const stats = buildStats(rows);
  const successText = successMessage(success);
  const errorText = errorMessage(error);

  return (
    <section className="min-w-0 space-y-6">
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">연차 촉진 관리</p>
          <h1 className="mt-2 break-keep text-2xl font-semibold tracking-normal text-slate-950">
            연차 사용계획 확인
          </h1>
          <p className="mt-2 max-w-3xl break-keep text-sm leading-relaxed text-slate-600">
            제출된 연차 사용계획을 접수 확인하고, 계획일수와 잔여 연차 검토
            결과를 증적으로 남깁니다. 이 확인은 실제 휴가 신청 승인과 별개입니다.
          </p>
        </div>
        <div className="grid gap-2 sm:flex">
          {backHref ? (
            <Link className={buttonClassName({ tone: "neutral" })} href={backHref}>
              돌아가기
            </Link>
          ) : null}
          <Link
            className={buttonClassName({ tone: "neutral" })}
            href="/admin/reports/leaves/promotions"
          >
            리포트 경로
          </Link>
        </div>
      </div>

      <form className="flex max-w-xs gap-2" action={basePath}>
        <input
          aria-label="기준 연도"
          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
          defaultValue={year}
          name="year"
          type="number"
        />
        <button className={buttonClassName({ className: "min-w-20" })}>조회</button>
      </form>

      {successText ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successText}
        </p>
      ) : null}
      {errorText ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorText}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="rounded-lg">
          <p className="text-sm text-slate-500">전체 대상자</p>
          <p className="mt-2 text-2xl font-semibold">{stats.total}</p>
        </Card>
        <Card className="rounded-lg">
          <p className="text-sm text-slate-500">미제출자</p>
          <p className="mt-2 text-2xl font-semibold">{stats.missing}</p>
        </Card>
        <Card className="rounded-lg">
          <p className="text-sm text-slate-500">제출자</p>
          <p className="mt-2 text-2xl font-semibold">{stats.submitted}</p>
        </Card>
        <Card className="rounded-lg">
          <p className="text-sm text-slate-500">확인 완료자</p>
          <p className="mt-2 text-2xl font-semibold">{stats.confirmed}</p>
        </Card>
        <Card className="rounded-lg">
          <p className="text-sm text-slate-500">보완요청자</p>
          <p className="mt-2 text-2xl font-semibold">{stats.revisionRequested}</p>
        </Card>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="조회된 사용계획 대상자가 없습니다."
          description="연차 촉진 대상자 또는 제출된 사용계획이 있으면 이곳에 표시됩니다."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[1180px] table-auto text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">직원</th>
                <th className="px-4 py-3">팀/직급</th>
                <th className="px-4 py-3">잔여 연차</th>
                <th className="px-4 py-3">소멸 예정</th>
                <th className="px-4 py-3">계획일수</th>
                <th className="px-4 py-3">제출일</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">최근 처리</th>
                <th className="px-4 py-3">상세/처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {rows.map((row) => (
                <tr key={row.userId}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-950">{row.name}</p>
                    <p className="text-xs text-slate-500">{row.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{row.teamName ?? "-"}</p>
                    <p className="text-xs text-slate-500">{row.title ?? "-"}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatAmount(row.remainingAnnualDays)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatAmount(row.expiringAnnualDays)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatAmount(row.plan?.totalPlannedAmount)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {row.plan?.submittedAt ? dateLabel(row.plan.submittedAt) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={reviewStatusTone(row.reviewStatus)}>
                      {annualUsePlanReviewStatusLabel(row.reviewStatus)}
                    </Badge>
                  </td>
                  <td className="min-w-44 px-4 py-3 text-slate-600">
                    {row.latestReview ? (
                      <>
                        <p>{annualUsePlanReviewActionLabel(row.latestReview.actionType)}</p>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(row.latestReview.reviewedAt)}
                        </p>
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="min-w-[360px] px-4 py-3">
                    <details className="rounded-lg border border-slate-200 p-3">
                      <summary className="cursor-pointer font-semibold text-blue-700">
                        상세 보기
                      </summary>
                      <div className="mt-3 grid gap-4">
                        {row.plan?.memo ? (
                          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                            메모: {row.plan.memo}
                          </p>
                        ) : null}
                        <PlanItems row={row} />
                        <ReviewHistory row={row} />
                        <ReviewActions row={row} returnTo={returnTo} />
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
