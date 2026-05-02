import Link from "next/link";

import {
  cancelAnnualLeaveUsePlan,
  submitAnnualLeaveUsePlan,
} from "@/app/(app)/leaves/me/use-plan/actions";
import { getUsePlanContext } from "@/lib/leave/annual-promotion";
import { dateToDateOnly, todayInSeoul } from "@/lib/leave/calculate-business-days";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type UsePlanPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

function errorMessage(kind?: string) {
  const messages: Record<string, string> = {
    "invalid-item": "사용계획 날짜와 수량을 확인해 주세요.",
    "invalid-year": "기준 연도를 확인해 주세요.",
    "no-expiring-balance": "현재 제출할 소멸 예정 연차가 없습니다.",
    "already-submitted": "이미 제출된 사용계획은 바로 수정할 수 없습니다.",
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

export default async function AnnualLeaveUsePlanPage({
  searchParams,
}: UsePlanPageProps) {
  const actor = await requireRouteAccess("/leaves/me/use-plan");
  const params = await searchParams;
  const year = Number(todayInSeoul().slice(0, 4));
  const context = await getUsePlanContext({ userId: actor.id, year });
  const plan = context.plan;
  const isSubmitted = plan?.status === "SUBMITTED";
  const error = errorMessage(params.error);

  return (
    <section>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">내 휴가</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            연차 사용계획
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">
            소멸 예정인 연차가 있는 경우 사용할 예정일을 입력해 회사에
            제출할 수 있습니다. 사용계획 제출은 실제 휴가 신청이 아니며,
            휴가를 사용하려면 별도로 휴가 요청을 등록해야 합니다.
          </p>
        </div>
        <Link
          href="/leaves/me"
          className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
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
          <p className="mt-2 text-2xl font-semibold">{context.expiringAmount}일</p>
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
            <h2 className="text-base font-semibold">제출된 사용계획</h2>
          </div>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-3">사용 예정일</th>
                <th className="px-4 py-3">수량</th>
                <th className="px-4 py-3">반차 구분</th>
                <th className="px-4 py-3">메모</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {plan.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">{dateToDateOnly(item.plannedDate)}</td>
                  <td className="px-4 py-3">{item.amount}일</td>
                  <td className="px-4 py-3">{item.halfDayPeriod ?? "-"}</td>
                  <td className="px-4 py-3">{item.memo ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {isSubmitted ? (
        <form action={cancelAnnualLeaveUsePlan} className="mt-4">
          <input name="planId" type="hidden" value={plan.id} />
          <button className="h-10 rounded-md border border-red-300 px-4 text-sm font-medium text-red-700">
            제출 취소
          </button>
        </form>
      ) : (
        <form
          action={submitAnnualLeaveUsePlan}
          className="mt-6 grid gap-4 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
        >
          <input name="referenceYear" type="hidden" value={context.year} />
          <div>
            <h2 className="text-base font-semibold">사용계획 입력</h2>
            <p className="mt-1 text-sm text-neutral-500">
              최대 5개 예정일을 한 번에 제출할 수 있습니다. 총 수량은 소멸
              예정 연차를 초과할 수 없습니다.
            </p>
          </div>
          <div className="grid gap-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_2fr]">
                <input
                  name={`plannedDate_${index}`}
                  type="date"
                  className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
                  aria-label={`사용 예정일 ${index + 1}`}
                />
                <input
                  name={`amount_${index}`}
                  type="number"
                  step="0.5"
                  min="0.5"
                  className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
                  placeholder="수량"
                  aria-label={`사용 수량 ${index + 1}`}
                />
                <select
                  name={`halfDayPeriod_${index}`}
                  className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
                  aria-label={`반차 구분 ${index + 1}`}
                >
                  <option value="">종일 또는 해당 없음</option>
                  <option value="AM">오전 반차</option>
                  <option value="PM">오후 반차</option>
                </select>
                <input
                  name={`memo_${index}`}
                  className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
                  placeholder="메모"
                  aria-label={`메모 ${index + 1}`}
                />
              </div>
            ))}
          </div>
          <label className="text-sm">
            전체 메모
            <textarea
              name="memo"
              className="mt-1 min-h-20 w-full rounded-md border border-neutral-300 px-3 py-2"
              maxLength={1000}
            />
          </label>
          <button className="h-10 justify-self-start rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
            사용계획 제출
          </button>
        </form>
      )}
    </section>
  );
}
