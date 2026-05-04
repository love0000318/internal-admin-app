import { updateLeavePolicy } from "@/app/(app)/admin/leaves/actions";
import { Badge, buttonClassName, Card, EmptyState } from "@/components/design-system/primitives";
import { MobileCardList, ResponsiveTable } from "@/components/design-system/responsive";
import { LeaveAdminNav } from "@/components/leave/leave-admin-nav";
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

function yesNo(value: boolean | null | undefined) {
  return value ? "예" : "아니오";
}

function PolicyForm({ policy }: { policy: Awaited<ReturnType<typeof listLeavePolicies>>[number] }) {
  return (
    <form action={updateLeavePolicy} className="grid min-w-0 gap-3">
      <input name="id" type="hidden" value={policy.id} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="break-keep text-sm font-medium text-slate-800">
          정책명
          <input
            name="name"
            defaultValue={policy.name ?? LEAVE_TYPE_LABELS[policy.type]}
            className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
            required
          />
        </label>
        <label className="break-keep text-sm font-medium text-slate-800">
          설명
          <input
            name="description"
            defaultValue={policy.description ?? ""}
            className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
            placeholder="직원에게 보이는 안내"
          />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex items-center gap-2 break-keep text-sm text-slate-700">
          <input
            name="deductsAnnualBalance"
            type="checkbox"
            defaultChecked={policy.deductsAnnualBalance ?? policy.deductsAnnual}
          />
          연차 차감
        </label>
        <label className="flex items-center gap-2 break-keep text-sm text-slate-700">
          <input
            name="requiresAttachment"
            type="checkbox"
            defaultChecked={policy.requiresAttachment}
          />
          증명자료 필요
        </label>
        <label className="flex items-center gap-2 break-keep text-sm text-slate-700">
          <input name="isEnabled" type="checkbox" defaultChecked={policy.isEnabled} />
          사용
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="break-keep text-sm font-medium text-slate-800">
          최소 요청 일수
          <input
            name="minRequestDays"
            type="number"
            step="0.5"
            min="0.5"
            defaultValue={numberInputValue(policy.minRequestDays)}
            className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
            placeholder="0.5"
          />
        </label>
        <label className="break-keep text-sm font-medium text-slate-800">
          최대 요청 일수
          <input
            name="maxRequestDays"
            type="number"
            step="0.5"
            min="0.5"
            defaultValue={numberInputValue(
              policy.maxRequestDays ?? policy.maxDaysPerRequest,
            )}
            className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
            placeholder="선택"
          />
        </label>
        <label className="break-keep text-sm font-medium text-slate-800">
          연간 최대 일수
          <input
            name="maxDaysPerYear"
            type="number"
            step="0.5"
            min="0.5"
            defaultValue={numberInputValue(policy.maxDaysPerYear)}
            className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
            placeholder="선택"
          />
        </label>
      </div>
      <button className={buttonClassName({ className: "w-full sm:w-auto" })}>
        저장
      </button>
    </form>
  );
}

export default async function LeaveSettingsPage({
  searchParams,
}: LeaveSettingsPageProps) {
  await requireOwner();
  const { error, success } = await searchParams;
  const policies = await listLeavePolicies();

  return (
    <section className="min-w-0 space-y-5">
      <div className="space-y-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-blue-700">휴가 관리</p>
          <h1 className="mt-2 break-keep text-2xl font-bold tracking-normal text-slate-950 sm:text-3xl">
            휴가 관리 설정
          </h1>
          <p className="mt-2 max-w-3xl break-keep text-sm leading-relaxed text-slate-600">
            기본 휴가 정책의 연차 차감 여부, 증명자료 필요 여부, 요청 가능 범위를 운영 정책에 맞게 조정합니다.
          </p>
        </div>
        <LeaveAdminNav activeHref="/admin/leaves/settings" />
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          정책을 저장할 수 없습니다. 입력값을 확인해 주세요.
        </p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          휴가 정책이 저장되었습니다.
        </p>
      ) : null}

      {policies.length === 0 ? (
        <EmptyState title="등록된 휴가 정책이 없습니다." />
      ) : (
        <>
          <MobileCardList>
            {policies.map((policy) => (
              <Card key={policy.id} className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-keep text-base font-semibold text-slate-950">
                      {LEAVE_TYPE_LABELS[policy.type]}
                    </h2>
                    <p className="mt-1 break-keep text-sm text-slate-500">
                      {policy.description ?? "설명 없음"}
                    </p>
                  </div>
                  <Badge tone={policy.isEnabled ? "success" : "default"}>
                    {policy.isEnabled ? "사용" : "중지"}
                  </Badge>
                </div>
                <dl className="grid gap-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 whitespace-nowrap break-keep text-slate-500">
                      연차 차감
                    </dt>
                    <dd className="text-right">
                      {yesNo(policy.deductsAnnualBalance ?? policy.deductsAnnual)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 whitespace-nowrap break-keep text-slate-500">
                      증명자료
                    </dt>
                    <dd className="text-right">{yesNo(policy.requiresAttachment)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 whitespace-nowrap break-keep text-slate-500">
                      연간 최대
                    </dt>
                    <dd className="text-right">
                      {policy.maxDaysPerYear ? `${policy.maxDaysPerYear}일` : "-"}
                    </dd>
                  </div>
                </dl>
                <details className="rounded-xl border border-slate-200 p-3">
                  <summary className="cursor-pointer whitespace-nowrap break-keep text-sm font-semibold">
                    수정
                  </summary>
                  <div className="mt-4">
                    <PolicyForm policy={policy} />
                  </div>
                </details>
              </Card>
            ))}
          </MobileCardList>

          <ResponsiveTable minWidth="1120px">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th>휴가 유형</th>
                <th>설명</th>
                <th>연차 차감</th>
                <th>증명자료</th>
                <th>연간 최대</th>
                <th>상태</th>
                <th className="min-w-[520px]">수정</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {policies.map((policy) => (
                <tr key={policy.id} className="align-top">
                  <td className="font-semibold text-slate-950">
                    {LEAVE_TYPE_LABELS[policy.type]}
                  </td>
                  <td>{policy.description ?? "-"}</td>
                  <td>{yesNo(policy.deductsAnnualBalance ?? policy.deductsAnnual)}</td>
                  <td>{yesNo(policy.requiresAttachment)}</td>
                  <td>{policy.maxDaysPerYear ? `${policy.maxDaysPerYear}일` : "-"}</td>
                  <td>{policy.isEnabled ? "사용" : "중지"}</td>
                  <td>
                    <PolicyForm policy={policy} />
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        </>
      )}
    </section>
  );
}
