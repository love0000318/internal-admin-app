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
import { getUsePlanContext } from "@/lib/leave/annual-promotion";
import { dateToDateOnly, todayInSeoul } from "@/lib/leave/calculate-business-days";
import { listEnabledCompanyHolidayDateOnlys } from "@/lib/leave/queries";
import { requireRouteAccess } from "@/lib/rbac/server-guards";
import type { DateOnly } from "@/lib/leave/types";

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

function statusLabel(status?: string) {
  switch (status) {
    case "SUBMITTED":
      return "제출 완료";
    case "CANCELLED":
      return "취소됨";
    case "DRAFT":
      return "작성 중";
    default:
      return "미제출";
  }
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
  const context = await getUsePlanContext({ userId: actor.id, year });
  const companyHolidays = await listEnabledCompanyHolidayDateOnlys(
    `${year}-01-01` as DateOnly,
    `${year + 1}-12-31` as DateOnly,
  );
  const plan = context.plan;
  const isSubmitted = plan?.status === "SUBMITTED";
  const error = errorMessage(params.error);

  return (
    <section className="min-w-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">내 휴가</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            연차 사용계획
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-600">
            소멸 예정 연차가 있는 경우 시작일과 종료일 기준으로 사용계획을
            제출합니다. 사용계획 제출은 실제 휴가 신청이 아니며, 휴가를
            사용하려면 별도로 휴가 요청을 등록해야 합니다.
          </p>
        </div>
        <Link
          href="/leaves/me"
          className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap break-keep rounded-md border border-neutral-300 px-4 text-sm font-medium sm:w-auto"
        >
          내 휴가 현황
        </Link>
      </div>

      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {params.success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          연차 사용계획이 처리되었습니다.
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-neutral-500">기준 연도</p>
          <p className="mt-2 text-2xl font-semibold">{context.year}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-neutral-500">소멸 예정 연차</p>
          <p className="mt-2 text-2xl font-semibold">
            {formatAmount(context.expiringAmount)}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-neutral-500">소멸 예정일</p>
          <p className="mt-2 text-lg font-semibold">
            {context.expirationDate ?? "소멸 없음"}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-neutral-500">제출 상태</p>
          <p className="mt-2 text-lg font-semibold">{statusLabel(plan?.status)}</p>
        </div>
      </div>

      {plan?.items.length ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 px-4 py-3">
            <h2 className="text-base font-semibold">제출한 사용계획</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="whitespace-nowrap break-keep px-4 py-3">
                    사용 기간
                  </th>
                  <th className="whitespace-nowrap break-keep px-4 py-3">
                    사용 형태
                  </th>
                  <th className="whitespace-nowrap break-keep px-4 py-3">
                    자동 계산 수량
                  </th>
                  <th className="whitespace-nowrap break-keep px-4 py-3">메모</th>
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
                      <td className="whitespace-nowrap px-4 py-3">
                        {annualUsePlanUsageTypeLabel(itemUsageType(item))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {formatAmount(itemAmount(item))}
                      </td>
                      <td className="px-4 py-3">{item.memo ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {isSubmitted ? (
        <form action={cancelAnnualLeaveUsePlan} className="mt-4">
          <input name="planId" type="hidden" value={plan.id} />
          <button className="h-10 w-full rounded-md border border-red-300 px-4 text-sm font-medium text-red-700 sm:w-auto">
            제출 취소
          </button>
        </form>
      ) : (
        <AnnualUsePlanForm
          action={submitAnnualLeaveUsePlan}
          referenceYear={context.year}
          expiringAmount={context.expiringAmount}
          today={today}
          companyHolidays={companyHolidays}
        />
      )}
    </section>
  );
}
