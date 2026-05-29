import Link from "next/link";

import { updateBirthdayLeavePolicy } from "@/app/(app)/admin/leaves/birthday-policy/actions";
import { getPrisma } from "@/lib/db/prisma";
import { BIRTHDAY_HALF_DAY_CODE } from "@/lib/leave/birthday-half-day";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type BirthdayPolicyPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

function errorMessage(kind?: string) {
  const messages: Record<string, string> = {
    invalid: "입력값을 확인해 주세요.",
    "leave-type-not-found": "생일 반차 휴가 유형을 찾을 수 없습니다. seed를 확인해 주세요.",
  };

  return kind ? messages[kind] ?? "처리 중 오류가 발생했습니다." : null;
}

export default async function BirthdayLeavePolicyPage({
  searchParams,
}: BirthdayPolicyPageProps) {
  await requireOwner();
  const params = await searchParams;
  const prisma = getPrisma();
  const [leaveType, policy, recentGrants] = await Promise.all([
    prisma.leaveTypeDefinition.findUnique({
      where: { code: BIRTHDAY_HALF_DAY_CODE },
    }),
    prisma.birthdayLeavePolicy.findFirst({
      include: { leaveType: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.leaveGrant.findMany({
      where: { source: "BIRTHDAY_AUTO" },
      include: {
        user: { include: { team: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  const error = errorMessage(params.error);

  return (
    <section>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">휴가 관리</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            생일 반차 자동 지급 설정
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">
            직원 생일 기준으로 매년 0.5일 맞춤휴가를 자동 지급합니다. 지급
            기준일이 토요일, 일요일 또는 회사 휴일이면 직전 영업일로 앞당길 수
            있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/leaves/grants?source=BIRTHDAY_AUTO"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            자동 지급 내역
          </Link>
          <Link
            href="/admin/leaves/settings"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            휴가 정책 설정
          </Link>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {params.success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          생일 반차 자동 지급 정책이 저장되었습니다.
        </p>
      ) : null}

      <form
        action={updateBirthdayLeavePolicy}
        className="mt-6 grid gap-4 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              name="isEnabled"
              type="checkbox"
              defaultChecked={policy?.isEnabled ?? true}
            />
            자동 지급 사용
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              name="adjustGrantDateToPreviousBusinessDay"
              type="checkbox"
              defaultChecked={policy?.adjustGrantDateToPreviousBusinessDay ?? true}
            />
            휴일이면 직전 영업일 지급
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              name="notifyEmployee"
              type="checkbox"
              defaultChecked={policy?.notifyEmployee ?? true}
            />
            지급 완료 알림 생성
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm">
            지급 휴가 유형
            <input
              value={
                leaveType
                  ? `${leaveType.name} (${leaveType.code})`
                  : "생일 반차 유형 없음"
              }
              className="mt-1 h-10 w-full rounded-md border border-neutral-200 bg-neutral-50 px-3"
              disabled
            />
          </label>
          <label className="text-sm">
            지급 수량
            <input
              name="grantAmount"
              type="number"
              step="0.5"
              min="0.5"
              defaultValue={policy?.grantAmount ?? 0.5}
              className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              required
            />
          </label>
          <label className="text-sm">
            생일 며칠 전 지급
            <input
              name="grantDaysBefore"
              type="number"
              min="0"
              defaultValue={policy?.grantDaysBefore ?? 1}
              className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              required
            />
          </label>
          <label className="text-sm">
            지급일부터 사용 가능 기간
            <input
              name="usableDaysFromBirthday"
              type="number"
              min="0"
              defaultValue={policy?.usableDaysFromBirthday ?? 7}
              className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              required
            />
            <span className="mt-1 block text-xs text-neutral-500">
              실제 지급일부터 입력한 일수 뒤 날짜까지 포함합니다.
            </span>
          </label>
        </div>

        <p className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          2월 29일 생일은 평년에는 2월 28일로 처리합니다. 3월 1일 처리 옵션은
          후속 정책 설정으로 분리합니다.
        </p>

        <button className="h-10 justify-self-start rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
          정책 저장
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-100 px-4 py-3">
          <h2 className="text-base font-semibold">최근 자동 지급 내역</h2>
          <p className="mt-1 text-sm text-neutral-500">
            전체 내역은 맞춤휴가 지급 화면에서 확인할 수 있습니다.
          </p>
        </div>
        <table className="w-full min-w-[900px] table-auto text-left text-sm [&_td]:break-keep [&_th]:break-keep [&_th]:whitespace-nowrap">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">직원</th>
              <th className="px-4 py-3">팀</th>
              <th className="px-4 py-3">생일</th>
              <th className="px-4 py-3">사용 가능 기간</th>
              <th className="px-4 py-3">지급 수량</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">생성일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {recentGrants.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={7}>
                  생일 반차 자동 지급 내역이 없습니다.
                </td>
              </tr>
            ) : (
              recentGrants.map((grant) => (
                <tr key={grant.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{grant.user.name}</p>
                    <p className="text-xs text-neutral-500">{grant.user.email}</p>
                  </td>
                  <td className="px-4 py-3">{grant.user.team?.name ?? "-"}</td>
                  <td className="px-4 py-3">
                    {grant.referenceDate
                      ? grant.referenceDate.toISOString().slice(0, 10)
                      : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {grant.effectiveFrom.toISOString().slice(0, 10)} ~{" "}
                    {grant.expiresAt ? grant.expiresAt.toISOString().slice(0, 10) : "-"}
                  </td>
                  <td className="px-4 py-3">{grant.grantedAmount}일</td>
                  <td className="px-4 py-3">{grant.status}</td>
                  <td className="px-4 py-3">
                    {grant.createdAt.toISOString().slice(0, 10)}
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
