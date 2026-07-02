import Link from "next/link";

import {
  AnnualUsePlanReviewTable,
  type AnnualUsePlanReviewTableRow,
} from "@/components/leave/annual-use-plan-review-table";
import { buttonClassName, Card, EmptyState } from "@/components/design-system/primitives";
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
import { todayInSeoul } from "@/lib/leave/calculate-business-days";

type AnnualUsePlanReviewPanelProps = {
  rows: AnnualUsePlanReviewRow[];
  year: number;
  returnTo: string;
  basePath: string;
  success?: string;
  error?: string;
  backHref?: string;
  statusFilter?: string;
  teamFilter?: string;
  sort?: string;
};

type StatusFilter = "all" | "submitted" | "confirmed" | "revision-requested";
type ReviewSort = "default" | "submitted-desc" | "submitted-asc" | "expiration-asc";
type TeamOption = { value: string; label: string };

const NO_TEAM_VALUE = "__NO_TEAM__";

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

function reviewStatusTone(
  status: AnnualUsePlanReviewStatus,
): AnnualUsePlanReviewTableRow["statusTone"] {
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

function normalizeStatusFilter(value?: string): StatusFilter {
  if (
    value === "submitted" ||
    value === "confirmed" ||
    value === "revision-requested"
  ) {
    return value;
  }

  return "all";
}

function normalizeSort(value?: string): ReviewSort {
  if (
    value === "submitted-desc" ||
    value === "submitted-asc" ||
    value === "expiration-asc"
  ) {
    return value;
  }

  return "default";
}

function cleanQueryValue(value?: string) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

export function buildAnnualUsePlanReviewReturnTo({
  basePath,
  year,
  status,
  team,
  sort,
}: {
  basePath: string;
  year: number;
  status?: string;
  team?: string;
  sort?: string;
}) {
  const query = new URLSearchParams({ year: String(year) });
  const statusFilter = normalizeStatusFilter(status);
  const teamFilter = cleanQueryValue(team);
  const sortValue = normalizeSort(sort);

  if (statusFilter !== "all") {
    query.set("status", statusFilter);
  }

  if (teamFilter && teamFilter !== "all") {
    query.set("team", teamFilter);
  }

  if (sortValue !== "default") {
    query.set("sort", sortValue);
  }

  return `${basePath}?${query.toString()}`;
}

function teamKey(row: AnnualUsePlanReviewRow) {
  return row.teamName ?? NO_TEAM_VALUE;
}

function teamLabel(row: AnnualUsePlanReviewRow) {
  return row.teamName ?? "팀 미지정";
}

function buildTeamOptions(rows: AnnualUsePlanReviewRow[]): TeamOption[] {
  const optionsByValue = new Map<string, string>();

  for (const row of rows) {
    optionsByValue.set(teamKey(row), teamLabel(row));
  }

  return Array.from(optionsByValue, ([value, label]) => ({ value, label })).sort(
    (a, b) => {
      if (a.value === NO_TEAM_VALUE) {
        return 1;
      }

      if (b.value === NO_TEAM_VALUE) {
        return -1;
      }

      return a.label.localeCompare(b.label, "ko");
    },
  );
}

function normalizeTeamFilter(value: string | undefined, options: TeamOption[]) {
  const cleaned = cleanQueryValue(value);

  if (!cleaned || cleaned === "all") {
    return "all";
  }

  return options.some((option) => option.value === cleaned) ? cleaned : "all";
}

function matchesStatusFilter(
  row: AnnualUsePlanReviewRow,
  statusFilter: StatusFilter,
) {
  switch (statusFilter) {
    case "submitted":
      return row.reviewStatus === "SUBMITTED" || row.reviewStatus === "RESUBMITTED";
    case "confirmed":
      return row.reviewStatus === "CONFIRMED";
    case "revision-requested":
      return row.reviewStatus === "REVISION_REQUESTED";
    default:
      return true;
  }
}

function filterRows({
  rows,
  statusFilter,
  teamFilter,
}: {
  rows: AnnualUsePlanReviewRow[];
  statusFilter: StatusFilter;
  teamFilter: string;
}) {
  return rows.filter(
    (row) =>
      matchesStatusFilter(row, statusFilter) &&
      (teamFilter === "all" || teamKey(row) === teamFilter),
  );
}

function dateOnlySortValue(value: string | null | undefined) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const time = Date.parse(`${value}T00:00:00.000Z`);

  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function submittedSortValue(row: AnnualUsePlanReviewRow) {
  return row.plan?.submittedAt?.getTime() ?? null;
}

function compareName(a: AnnualUsePlanReviewRow, b: AnnualUsePlanReviewRow) {
  return a.name.localeCompare(b.name, "ko");
}

function sortRows(rows: AnnualUsePlanReviewRow[], sort: ReviewSort) {
  if (sort === "default") {
    return rows;
  }

  return [...rows].sort((a, b) => {
    if (sort === "expiration-asc") {
      const byExpiration =
        dateOnlySortValue(a.expirationDate) - dateOnlySortValue(b.expirationDate);
      const byAmount =
        (b.expiringAnnualDays ?? Number.NEGATIVE_INFINITY) -
        (a.expiringAnnualDays ?? Number.NEGATIVE_INFINITY);

      return byExpiration || byAmount || compareName(a, b);
    }

    const aSubmitted = submittedSortValue(a);
    const bSubmitted = submittedSortValue(b);

    if (sort === "submitted-asc") {
      return (
        (aSubmitted ?? Number.POSITIVE_INFINITY) -
          (bSubmitted ?? Number.POSITIVE_INFINITY) || compareName(a, b)
      );
    }

    return (
      (bSubmitted ?? Number.NEGATIVE_INFINITY) -
        (aSubmitted ?? Number.NEGATIVE_INFINITY) || compareName(a, b)
    );
  });
}

function isExpirationSoon(expirationDate: string | null) {
  if (!expirationDate) {
    return false;
  }

  const today = dateOnlySortValue(todayInSeoul());
  const expiration = dateOnlySortValue(expirationDate);
  const diffDays = Math.floor((expiration - today) / 86_400_000);

  return diffDays >= 0 && diffDays <= 30;
}

function planItemPeriodLabel(item: {
  plannedDate: Date;
  plannedStartDate?: Date | null;
  plannedEndDate?: Date | null;
}) {
  const startDate = dateLabel(item.plannedStartDate ?? item.plannedDate);
  const endDate = dateLabel(item.plannedEndDate ?? item.plannedDate);

  return startDate !== endDate ? `${startDate} ~ ${endDate}` : startDate;
}

function planPeriodLabel(row: AnnualUsePlanReviewRow) {
  const items = row.plan?.items ?? [];

  if (items.length === 0) {
    return "-";
  }

  const first = items[0];
  const last = items[items.length - 1];
  const startDate = dateLabel(first.plannedStartDate ?? first.plannedDate);
  const endDate = dateLabel(last.plannedEndDate ?? last.plannedDate);

  return startDate !== endDate ? `${startDate} ~ ${endDate}` : startDate;
}

function toTableRow(row: AnnualUsePlanReviewRow): AnnualUsePlanReviewTableRow {
  return {
    userId: row.userId,
    planId: row.plan?.id ?? null,
    name: row.name,
    email: row.email,
    teamLabel: teamLabel(row),
    titleLabel: row.title ?? "-",
    remainingAnnualDaysLabel: formatAmount(row.remainingAnnualDays),
    expiringAnnualDaysLabel: formatAmount(row.expiringAnnualDays),
    expirationDateLabel: row.expirationDate ? `${row.expirationDate} 소멸` : "-",
    expirationSoon: isExpirationSoon(row.expirationDate),
    plannedAmountLabel: formatAmount(row.plan?.totalPlannedAmount),
    submittedAtLabel: row.plan?.submittedAt ? dateLabel(row.plan.submittedAt) : "-",
    statusLabel: annualUsePlanReviewStatusLabel(row.reviewStatus),
    statusTone: reviewStatusTone(row.reviewStatus),
    latestReviewLabel: row.latestReview
      ? annualUsePlanReviewActionLabel(row.latestReview.actionType)
      : null,
    latestReviewDateLabel: row.latestReview
      ? formatDateTime(row.latestReview.reviewedAt)
      : null,
    planMemo: row.plan?.memo ?? null,
    planPeriodLabel: planPeriodLabel(row),
    canReview: Boolean(row.plan) && canReview(row.reviewStatus),
    items:
      row.plan?.items.map((item) => ({
        id: item.id,
        periodLabel: planItemPeriodLabel(item),
        usageTypeLabel: annualUsePlanUsageTypeLabel(itemUsageType(item)),
        amountLabel: formatAmount(item.calculatedAmount ?? item.amount),
        memoLabel: item.memo ?? "-",
      })) ?? [],
    reviewHistory: row.reviewHistory.map((history) => ({
      id: history.id,
      actionLabel: annualUsePlanReviewActionLabel(history.actionType),
      actionTone: history.actionType === "CONFIRMED" ? "success" : "warning",
      reviewerLabel: history.reviewerName ?? history.reviewerUserId ?? "처리자 미확인",
      reviewedAtLabel: formatDateTime(history.reviewedAt),
      revisionReason: history.revisionReason,
    })),
  };
}

export function AnnualUsePlanReviewPanel({
  rows,
  year,
  returnTo,
  basePath,
  success,
  error,
  backHref,
  statusFilter,
  teamFilter,
  sort,
}: AnnualUsePlanReviewPanelProps) {
  const stats = buildStats(rows);
  const successText = successMessage(success);
  const errorText = errorMessage(error);
  const teamOptions = buildTeamOptions(rows);
  const statusFilterValue = normalizeStatusFilter(statusFilter);
  const teamFilterValue = normalizeTeamFilter(teamFilter, teamOptions);
  const sortValue = normalizeSort(sort);
  const visibleRows = sortRows(
    filterRows({
      rows,
      statusFilter: statusFilterValue,
      teamFilter: teamFilterValue,
    }),
    sortValue,
  );
  const tableRows = visibleRows.map(toTableRow);

  return (
    <section className="min-w-0 space-y-5">
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

      <form
        action={basePath}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm"
      >
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          기준 연도
          <input
            className="h-9 w-28 rounded-md border border-slate-300 px-3 text-sm text-slate-900"
            defaultValue={year}
            name="year"
            type="number"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          상태
          <select
            className="h-9 rounded-md border border-slate-300 px-3 text-sm text-slate-900"
            defaultValue={statusFilterValue}
            name="status"
          >
            <option value="all">전체</option>
            <option value="submitted">제출 완료</option>
            <option value="confirmed">확인 완료</option>
            <option value="revision-requested">보완요청</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          팀
          <select
            className="h-9 min-w-36 rounded-md border border-slate-300 px-3 text-sm text-slate-900"
            defaultValue={teamFilterValue}
            name="team"
          >
            <option value="all">전체 팀</option>
            {teamOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-slate-600">
          정렬
          <select
            className="h-9 min-w-40 rounded-md border border-slate-300 px-3 text-sm text-slate-900"
            defaultValue={sortValue}
            name="sort"
          >
            <option value="default">기본</option>
            <option value="submitted-desc">제출일 최신순</option>
            <option value="submitted-asc">제출일 오래된순</option>
            <option value="expiration-asc">소멸일 임박순</option>
          </select>
        </label>
        <button className={buttonClassName({ className: "min-h-9 px-4 py-1.5" })}>
          조회
        </button>
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

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="rounded-lg p-3 sm:p-3">
          <p className="text-xs text-slate-500">전체 대상자</p>
          <p className="mt-1 text-xl font-semibold">{stats.total}</p>
        </Card>
        <Card className="rounded-lg p-3 sm:p-3">
          <p className="text-xs text-slate-500">미제출자</p>
          <p className="mt-1 text-xl font-semibold">{stats.missing}</p>
        </Card>
        <Card className="rounded-lg p-3 sm:p-3">
          <p className="text-xs text-slate-500">제출자</p>
          <p className="mt-1 text-xl font-semibold">{stats.submitted}</p>
        </Card>
        <Card className="rounded-lg p-3 sm:p-3">
          <p className="text-xs text-slate-500">확인 완료자</p>
          <p className="mt-1 text-xl font-semibold">{stats.confirmed}</p>
        </Card>
        <Card className="rounded-lg p-3 sm:p-3">
          <p className="text-xs text-slate-500">보완요청자</p>
          <p className="mt-1 text-xl font-semibold">{stats.revisionRequested}</p>
        </Card>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="조회된 사용계획 대상자가 없습니다."
          description="연차 촉진 대상자 또는 제출된 사용계획이 있으면 이곳에 표시됩니다."
        />
      ) : (
        <AnnualUsePlanReviewTable
          returnTo={returnTo}
          rows={tableRows}
          totalCount={rows.length}
        />
      )}
    </section>
  );
}
