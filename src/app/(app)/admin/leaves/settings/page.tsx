import Link from "next/link";

import { updateLeavePolicy } from "@/app/(app)/admin/leaves/actions";
import { LEAVE_TYPE_LABELS } from "@/lib/leave/labels";
import { listLeavePolicies } from "@/lib/leave/queries";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type LeaveSettingsPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

function numberInputValue(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

export default async function LeaveSettingsPage({
  searchParams,
}: LeaveSettingsPageProps) {
  await requireOwner();
  const { error, success } = await searchParams;
  const policies = await listLeavePolicies();

  return (
    <section>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">휴가 관리</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            휴가 관리 설정
          </h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/leaves/types"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            휴가 유형 관리
          </Link>
          <Link
            href="/admin/leaves/approval-policies"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            휴가 승인 정책
          </Link>
          <Link
            href="/admin/leaves/grants"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            맞춤휴가 지급
          </Link>
          <Link
            href="/admin/leaves/birthday-policy"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            생일 반차 설정
          </Link>
          <Link
            href="/admin/leaves/annual-policy"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            연차 정책 설정
          </Link>
          <Link
            href="/admin/leaves/promotions"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            연차 촉진 관리
          </Link>
          <Link
            href="/admin/leaves/holidays"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            회사 휴일 관리
          </Link>
          <Link
            href="/admin/leaves/balances"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            직원별 현황
          </Link>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          정책을 저장할 수 없습니다. 입력값을 확인해 주세요.
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          휴가 정책이 저장되었습니다.
        </p>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">휴가 유형</th>
              <th className="px-4 py-3">설명</th>
              <th className="px-4 py-3">연차 차감</th>
              <th className="px-4 py-3">증빙 필요</th>
              <th className="px-4 py-3">연간 최대</th>
              <th className="px-4 py-3">사용 여부</th>
              <th className="px-4 py-3">수정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {policies.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={7}>
                  등록된 휴가 정책이 없습니다.
                </td>
              </tr>
            ) : (
              policies.map((policy) => (
                <tr key={policy.id} className="align-top">
                  <td className="px-4 py-3 font-medium">
                    {LEAVE_TYPE_LABELS[policy.type]}
                  </td>
                  <td className="px-4 py-3">{policy.description ?? "-"}</td>
                  <td className="px-4 py-3">
                    {(policy.deductsAnnualBalance ?? policy.deductsAnnual)
                      ? "예"
                      : "아니오"}
                  </td>
                  <td className="px-4 py-3">
                    {policy.requiresAttachment ? "예" : "아니오"}
                  </td>
                  <td className="px-4 py-3">
                    {policy.maxDaysPerYear ? `${policy.maxDaysPerYear}일` : "-"}
                  </td>
                  <td className="px-4 py-3">{policy.isEnabled ? "사용" : "중지"}</td>
                  <td className="px-4 py-3">
                    <form action={updateLeavePolicy} className="grid min-w-80 gap-2">
                      <input name="id" type="hidden" value={policy.id} />
                      <input
                        name="name"
                        defaultValue={policy.name ?? LEAVE_TYPE_LABELS[policy.type]}
                        className="h-9 rounded-md border px-2"
                        required
                      />
                      <input
                        name="description"
                        defaultValue={policy.description ?? ""}
                        className="h-9 rounded-md border px-2"
                        placeholder="설명"
                      />
                      <div className="grid gap-2 md:grid-cols-3">
                        <label className="flex items-center gap-2">
                          <input
                            name="deductsAnnualBalance"
                            type="checkbox"
                            defaultChecked={
                              policy.deductsAnnualBalance ?? policy.deductsAnnual
                            }
                          />
                          연차 차감
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            name="requiresAttachment"
                            type="checkbox"
                            defaultChecked={policy.requiresAttachment}
                          />
                          증빙 필요
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            name="isEnabled"
                            type="checkbox"
                            defaultChecked={policy.isEnabled}
                          />
                          사용
                        </label>
                      </div>
                      <div className="grid gap-2 md:grid-cols-3">
                        <input
                          name="minRequestDays"
                          type="number"
                          step="0.5"
                          min="0.5"
                          defaultValue={numberInputValue(policy.minRequestDays)}
                          className="h-9 rounded-md border px-2"
                          placeholder="최소 요청일"
                        />
                        <input
                          name="maxRequestDays"
                          type="number"
                          step="0.5"
                          min="0.5"
                          defaultValue={numberInputValue(
                            policy.maxRequestDays ?? policy.maxDaysPerRequest,
                          )}
                          className="h-9 rounded-md border px-2"
                          placeholder="최대 요청일"
                        />
                        <input
                          name="maxDaysPerYear"
                          type="number"
                          step="0.5"
                          min="0.5"
                          defaultValue={numberInputValue(policy.maxDaysPerYear)}
                          className="h-9 rounded-md border px-2"
                          placeholder="연간 최대"
                        />
                      </div>
                      <button className="h-9 rounded-md bg-neutral-950 px-3 text-sm font-medium text-white">
                        저장
                      </button>
                    </form>
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
