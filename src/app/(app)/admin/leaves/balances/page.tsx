import Link from "next/link";

import { createLeaveAdjustment } from "@/app/(app)/admin/leaves/actions";
import { getPrisma } from "@/lib/db/prisma";
import { dateToDateOnly, todayInSeoul } from "@/lib/leave/calculate-business-days";
import { formatLeaveDays } from "@/lib/leave/labels";
import { getUserLeaveBalance } from "@/lib/leave/queries";
import { calculateTenureDays, formatTenureDays } from "@/lib/organization/tenure";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type BalancesPageProps = {
  searchParams: Promise<{
    year?: string;
    teamId?: string;
    q?: string;
    error?: string;
    success?: string;
  }>;
};

function getYear(value: string | undefined) {
  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : Number(todayInSeoul().slice(0, 4));
}

export default async function EmployeeLeaveBalancesPage({
  searchParams,
}: BalancesPageProps) {
  await requireOwner();
  const filters = await searchParams;
  const year = getYear(filters.year);
  const prisma = getPrisma();
  const where = {
    status: "ACTIVE" as const,
    ...(filters.teamId ? { teamId: filters.teamId } : {}),
    ...(filters.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: "insensitive" as const } },
            { email: { contains: filters.q, mode: "insensitive" as const } },
            { phone: { contains: filters.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [users, teams] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        team: true,
        profile: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.team.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
    }),
  ]);
  const balances = await Promise.all(
    users.map((user) => getUserLeaveBalance({ userId: user.id, year, prisma })),
  );
  const customLeaveGrants = await prisma.leaveGrant.findMany({
    where: {
      userId: { in: users.map((user) => user.id) },
      status: "ACTIVE",
      remainingAmount: { gt: 0 },
    },
    include: {
      user: { include: { team: true } },
      leaveType: true,
    },
    orderBy: [{ user: { name: "asc" } }, { expiresAt: "asc" }],
  });

  return (
    <section>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">휴가 관리</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            직원별 휴가 보유 현황
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/leaves/grants"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            맞춤휴가 지급
          </Link>
          <Link
            href="/admin/leaves/history"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            휴가 장부 이력
          </Link>
          <Link
            href="/admin/leaves/settings"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            휴가 정책으로 돌아가기
          </Link>
        </div>
      </div>

      {filters.error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          휴가 조정을 저장할 수 없습니다. 직원, 연도, 조정 일수와 사유를 확인해 주세요.
        </p>
      ) : null}
      {filters.success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          휴가 조정이 저장되었습니다.
        </p>
      ) : null}

      <form className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <input
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="이름, 이메일, 전화번호"
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
        <input
          name="year"
          type="number"
          defaultValue={year}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
          조회
        </button>
      </form>

      <form
        action={createLeaveAdjustment}
        className="mt-4 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm md:grid-cols-5"
      >
        <select
          name="userId"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
          required
        >
          <option value="">직원 선택</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.email})
            </option>
          ))}
        </select>
        <input
          name="year"
          type="number"
          defaultValue={year}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
          required
        />
        <input
          name="amount"
          type="number"
          step="0.5"
          placeholder="조정 일수"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
          required
        />
        <input
          name="reason"
          placeholder="조정 사유"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
          required
        />
        <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
          조정 추가
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[1150px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">직원 이름</th>
              <th className="px-4 py-3">이메일</th>
              <th className="px-4 py-3">팀</th>
              <th className="px-4 py-3">직급</th>
              <th className="px-4 py-3">입사일</th>
              <th className="px-4 py-3">재직일</th>
              <th className="px-4 py-3">기준 연도</th>
              <th className="px-4 py-3">기본 부여</th>
              <th className="px-4 py-3">조정</th>
              <th className="px-4 py-3">사용 완료</th>
              <th className="px-4 py-3">승인 대기</th>
              <th className="px-4 py-3">잔여</th>
              <th className="px-4 py-3">상세</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {balances.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={13}>
                  등록된 직원이 없습니다.
                </td>
              </tr>
            ) : (
              balances.map((balance) => {
                const hireDate = balance.user.hireDate ?? balance.user.profile?.hireDate;
                const hireDateOnly = hireDate ? dateToDateOnly(hireDate) : null;

                return (
                  <tr key={balance.user.id}>
                    <td className="px-4 py-3 font-medium">{balance.user.name}</td>
                    <td className="px-4 py-3">{balance.user.email}</td>
                    <td className="px-4 py-3">{balance.user.team?.name ?? "-"}</td>
                    <td className="px-4 py-3">
                      {balance.user.title ?? balance.user.profile?.jobTitle ?? "-"}
                    </td>
                    <td className="px-4 py-3">{hireDateOnly ?? "미입력"}</td>
                    <td className="px-4 py-3">
                      {formatTenureDays(calculateTenureDays(hireDateOnly))}
                    </td>
                    <td className="px-4 py-3">{year}</td>
                    <td className="px-4 py-3">
                      {formatLeaveDays(balance.annualEntitled)}
                    </td>
                    <td className="px-4 py-3">
                      {formatLeaveDays(balance.manualGranted)}
                    </td>
                    <td className="px-4 py-3">{formatLeaveDays(balance.usedDays)}</td>
                    <td className="px-4 py-3">
                      {formatLeaveDays(balance.pendingDays)}
                    </td>
                    <td className="px-4 py-3">
                      {formatLeaveDays(balance.remainingDays)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/organization/employees/${balance.user.id}`}
                        className="font-medium underline"
                      >
                        직원 상세
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-100 px-4 py-3">
          <h2 className="text-base font-semibold">맞춤휴가 현황</h2>
          <p className="mt-1 text-sm text-neutral-500">
            연차 조정은 위 표의 조정 기능을 사용하고, 회사가 별도로 지급한
            맞춤휴가는 이 영역에서 확인합니다.
          </p>
        </div>
        <table className="w-full min-w-[950px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">직원</th>
              <th className="px-4 py-3">팀</th>
              <th className="px-4 py-3">휴가 유형</th>
              <th className="px-4 py-3">잔여 수량</th>
              <th className="px-4 py-3">사용 시작일</th>
              <th className="px-4 py-3">만료일</th>
              <th className="px-4 py-3">상세</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {customLeaveGrants.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={7}>
                  지급된 맞춤휴가가 없습니다.
                </td>
              </tr>
            ) : (
              customLeaveGrants.map((grant) => (
                <tr key={grant.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{grant.user.name}</p>
                    <p className="text-xs text-neutral-500">{grant.user.email}</p>
                  </td>
                  <td className="px-4 py-3">{grant.user.team?.name ?? "-"}</td>
                  <td className="px-4 py-3">{grant.leaveType.name}</td>
                  <td className="px-4 py-3">
                    {formatGrantAmount(grant.remainingAmount, grant.unit)}
                  </td>
                  <td className="px-4 py-3">{dateToDateOnly(grant.effectiveFrom)}</td>
                  <td className="px-4 py-3">
                    {grant.expiresAt ? dateToDateOnly(grant.expiresAt) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/leaves/grants/${grant.id}`}
                      className="font-medium underline"
                    >
                      지급 상세
                    </Link>
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

function formatGrantAmount(amount: number, unit: "DAY" | "HOUR" | "MINUTE") {
  const labels = {
    DAY: "일",
    HOUR: "시간",
    MINUTE: "분",
  };

  return `${amount}${labels[unit]}`;
}
