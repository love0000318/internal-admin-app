import Link from "next/link";

import {
  cancelAnnualLeaveUsePlan,
  submitAnnualLeaveUsePlan,
} from "@/app/(app)/leaves/me/use-plan/actions";
import { AnnualUsePlanForm } from "@/components/leave/annual-use-plan-form";
import {
  annualUsePlanUsageTypeLabel,
  halfDayPeriodToUsageType,
  type AnnualUsePlanUsageType,
} from "@/lib/leave/annual-use-plan-calculator";
import { getPrisma } from "@/lib/db/prisma";
import { getUsePlanContext } from "@/lib/leave/annual-promotion";
import {
  annualUsePlanReviewStatusLabel,
  deriveAnnualUsePlanReviewStatus,
  getAnnualUsePlanReviewHistoryByPlanIds,
} from "@/lib/leave/annual-use-plan-review";
import { dateToDateOnly, todayInSeoul } from "@/lib/leave/calculate-business-days";
import { getUserLeaveBalance, listEnabledCompanyHolidayDateOnlys } from "@/lib/leave/queries";
import type { DateOnly } from "@/lib/leave/types";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type UsePlanPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

function errorMessage(kind?: string) {
  const messages: Record<string, string> = {
    "invalid-item": "사용계획 날짜와 기간을 확인해 주세요.",
    "invalid-year": "기준 연도를 확인해 주세요.",
    "no-expiring-balance": "현재 제출할 소멸 예정 연차가 없습니다.",
    "already-submitted": "이미 제출한 사용계획은 바로 수정할 수 없습니다.",
    "not-cancellable": "취소할 수 있는 제출 상태가 아닙니다.",
  };

  return kind ? messages[kind] ?? "처리 중 오류가 발생했습니다." : null;
}

function formatAmount(value: number) {
  return Number.isInteger(value) ? `${value}일` : `${value.toFixed(1)}일`;
}

function itemStartDate(item: {
  plannedDate: Date;
  plannedStartDate?: Date | null;
}) {
  return dateToDateOnly(item.plannedStartDate ?? item.plannedDate);
}

function itemEndDate(item: {
  plannedDate: Date;
  plannedEndDate?: Date | null;
}) {
  return dateToDateOnly(item.plannedEndDate ?? item.plannedDate);
}

function itemUsageType(item: {
  usageType?: AnnualUsePlanUsageType | null;
  halfDayPeriod?: "AM" | "PM" | null;
}) {
  return item.usageType ?? halfDayPeriodToUsageType(item.halfDayPeriod ?? null);
}

function itemAmount(item: { calculatedAmount?: number | null; amount: number }) {
  return item.calculatedAmount ?? item.amount;
}

export default async function AnnualLeaveUsePlanPage({
  searchParams,
}: UsePlanPageProps) {
  const actor = await requireRouteAccess("/leaves/me/use-plan");
  const params = await searchParams;
  const today = todayInSeoul();
  const year = Number(today.slice(0, 4));
  const prisma = getPrisma();
  const [context, balance, companyHolidays] = await Promise.all([
    getUsePlanContext({ userId: actor.id, year, prisma }),
    getUserLeaveBalance({ userId: actor.id, year, prisma }),
    listEnabledCompanyHolidayDateOnlys(
      `${year}-01-01` as DateOnly,
      `${year + 1}-12-31` as DateOnly,
      prisma,
    ),
  ]);
  const planAvailableAmount = Math.max(0, balance.remainingDays);
  const plan = context.plan;
  const reviewHistoryByPlanId = plan
    ? await getAnnualUsePlanReviewHistoryByPlanIds({
        planIds: [plan.id],
        prisma,
      })
    : new Map();
  const reviewHistory = plan ? reviewHistoryByPlanId.get(plan.id) ?? [] : [];
  const reviewStatus = deriveAnnualUsePlanReviewStatus(plan, reviewHistory);
  const latestReview = reviewHistory[0] ?? null;
  const isSubmitted = plan?.status === "SUBMITTED";
  const canEditPlan = !isSubmitted || reviewStatus === "REVISION_REQUESTED";
  const canCancelPlan = isSubmitted && reviewStatus !== "CONFIRMED";
  const error = errorMessage(params.error);

  return (
    <section className="min-w-0">
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium break-keep text-neutral-500">
            내 휴가
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal break-keep text-neutral-950 sm:text-3xl">
            연차 사용계획
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed break-keep text-neutral-600">
            소멸 예정 연차가 있는 경우 시작일과 종료일 기준으로 사용계획을
            제출합니다. 사용계획 제출은 실제 휴가 요청이 아니며, 휴가를
            사용하려면 별도로 휴가 요청을 등록해야 합니다.
          </p>
        </div>
        <Link
          href="/leaves/me"
          className="inline-flex min-h-10 w-full items-center justify-center whitespace-nowrap break-keep rounded-md border border-neutral-300 px-4 text-sm font-medium sm:w-auto"
        >
          내 휴가 현황
        </Link>
      </div>

      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm leading-relaxed break-keep text-red-700">
          {error}
        </p>
      ) : null}
      {params.success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm leading-relaxed break-keep text-green-700">
          연차 사용계획을 처리했습니다.
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-sm break-keep text-neutral-500">기준 연도</p>
          <p className="mt-2 text-2xl font-semibold">{context.year}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-sm break-keep text-neutral-500">소멸 예정 연차</p>
          <p className="mt-2 text-2xl font-semibold">
            {formatAmount(planAvailableAmount)}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-sm break-keep text-neutral-500">소멸 예정일</p>
          <p className="mt-2 text-lg font-semibold break-keep">
            {context.expirationDate ?? "소멸 예정 없음"}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-sm break-keep text-neutral-500">제출 상태</p>
          <p className="mt-2 text-lg font-semibold break-keep">
            {annualUsePlanReviewStatusLabel(reviewStatus)}
          </p>
        </div>
      </div>

      {latestReview ? (
        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-relaxed text-blue-900">
          <p className="font-semibold break-keep">
            {annualUsePlanReviewStatusLabel(reviewStatus)}
          </p>
          <p className="mt-1 break-keep">
            처리자: {latestReview.reviewerName ?? latestReview.reviewerUserId ?? "-"} ·
            처리일시: {latestReview.reviewedAt.toISOString().slice(0, 16).replace("T", " ")}
          </p>
          {latestReview.revisionReason ? (
            <p className="mt-2 break-keep">
              보완요청 사유: {latestReview.revisionReason}
            </p>
          ) : null}
        </div>
      ) : null}

      {plan?.items.length ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 px-4 py-3">
            <h2 className="text-base font-semibold break-keep">
              제출한 사용계획
            </h2>
          </div>

          <div className="grid gap-3 p-4 md:hidden">
            {plan.items.map((item) => {
              const startDate = itemStartDate(item);
              const endDate = itemEndDate(item);

              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-neutral-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold break-keep text-neutral-950">
                        {startDate}
                        {startDate !== endDate ? ` ~ ${endDate}` : ""}
                      </p>
                      <p className="mt-1 text-sm break-keep text-neutral-500">
                        {annualUsePlanUsageTypeLabel(itemUsageType(item))}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium whitespace-nowrap break-keep text-blue-700">
                      {formatAmount(itemAmount(item))}
                    </span>
                  </div>
                  <dl className="mt-4 grid gap-2 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 whitespace-nowrap break-keep text-neutral-500">
                        사용 기간
                      </dt>
                      <dd className="min-w-0 text-right font-medium break-keep">
                        {startDate}
                        {startDate !== endDate ? ` ~ ${endDate}` : ""}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 whitespace-nowrap break-keep text-neutral-500">
                        사용 형태
                      </dt>
                      <dd className="min-w-0 text-right font-medium break-keep">
                        {annualUsePlanUsageTypeLabel(itemUsageType(item))}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 whitespace-nowrap break-keep text-neutral-500">
                        자동 계산
                      </dt>
                      <dd className="min-w-0 text-right font-medium">
                        {formatAmount(itemAmount(item))}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 whitespace-nowrap break-keep text-neutral-500">
                        메모
                      </dt>
                      <dd className="min-w-0 text-right break-words">
                        {item.memo ?? "-"}
                      </dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  {["사용 기간", "사용 형태", "자동 계산 수량", "메모"].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="whitespace-nowrap break-keep px-4 py-3"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {plan.items.map((item) => {
                  const startDate = itemStartDate(item);
                  const endDate = itemEndDate(item);

                  return (
                    <tr key={item.id}>
                      <td className="whitespace-nowrap px-4 py-3">
                        {startDate}
                        {startDate !== endDate ? ` ~ ${endDate}` : ""}
                      </td>
                      <td className="whitespace-nowrap break-keep px-4 py-3">
                        {annualUsePlanUsageTypeLabel(itemUsageType(item))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {formatAmount(itemAmount(item))}
                      </td>
                      <td className="px-4 py-3 break-words">
                        {item.memo ?? "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {canCancelPlan && plan ? (
        <form action={cancelAnnualLeaveUsePlan} className="mt-4">
          <input name="planId" type="hidden" value={plan.id} />
          <button className="min-h-10 w-full whitespace-nowrap break-keep rounded-md border border-red-300 px-4 text-sm font-medium text-red-700 sm:w-auto">
            제출 취소
          </button>
        </form>
      ) : null}

      {canEditPlan ? (
        <AnnualUsePlanForm
          action={submitAnnualLeaveUsePlan}
          referenceYear={context.year}
          expiringAmount={planAvailableAmount}
          today={today}
          companyHolidays={companyHolidays}
        />
      ) : null}
    </section>
  );
}
