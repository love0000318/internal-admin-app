import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import type { Prisma } from "@/generated/prisma/client";
import { createLeaveAdjustment } from "@/app/(app)/admin/leaves/actions";
import { Card, EmptyState, buttonClassName } from "@/components/design-system/primitives";
import { MobileCardList, ResponsiveTable } from "@/components/design-system/responsive";
import { LeaveAdminNav } from "@/components/leave/leave-admin-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getPrisma } from "@/lib/db/prisma";
import { getLeaveBalanceScope } from "@/lib/leave/balance-scope";
import { dateToDateOnly, todayInSeoul } from "@/lib/leave/calculate-business-days";
import { formatLeaveDays } from "@/lib/leave/labels";
import { getUserLeaveBalance } from "@/lib/leave/queries";
import { requireUser } from "@/lib/rbac/server-guards";

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

type GrantSummary = {
  customRemaining: number;
  birthdayRemaining: number;
  customGranted: number;
  birthdayGranted: number;
};

function getYear(value: string | undefined) {
  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : Number(todayInSeoul().slice(0, 4));
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 whitespace-nowrap break-keep text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-keep text-slate-900">{value}</dd>
    </div>
  );
}

function sumGrantSummaries(
  grants: Array<{
    userId: string;
    grantedAmount: number;
    remainingAmount: number;
    source: string;
    leaveType: { code: string };
  }>,
) {
  const summaries = new Map<string, GrantSummary>();

  for (const grant of grants) {
    const current =
      summaries.get(grant.userId) ??
      ({
        customRemaining: 0,
        birthdayRemaining: 0,
        customGranted: 0,
        birthdayGranted: 0,
      } satisfies GrantSummary);
    const isBirthday =
      grant.source === "BIRTHDAY_AUTO" || grant.leaveType.code === "BIRTHDAY_HALF_DAY";

    if (isBirthday) {
      current.birthdayRemaining += grant.remainingAmount;
      current.birthdayGranted += grant.grantedAmount;
    } else {
      current.customRemaining += grant.remainingAmount;
      current.customGranted += grant.grantedAmount;
    }

    summaries.set(grant.userId, current);
  }

  return summaries;
}

export default async function EmployeeLeaveBalancesPage({ searchParams }: BalancesPageProps) {
  const actor = await requireUser();
  const filters = await searchParams;
  const year = getYear(filters.year);
  const prisma = getPrisma();

  if (actor.role !== "OWNER" && actor.role !== "LEAD") {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        action: "UNAUTHORIZED_ACCESS_BLOCKED",
        targetType: "LEAVE_BALANCE",
        targetId: null,
        category: "SECURITY",
        severity: "HIGH",
        metadata: {
          route: "/admin/leaves/balances",
          reasonCode: "LEAVE_BALANCE_LIST_SCOPE_DENIED",
          role: actor.role,
        },
      },
    });
    redirect("/forbidden");
  }

  const scope = await getLeaveBalanceScope(actor, prisma);
  const allowedTeamFilter =
    filters.teamId && scope.teamIds.includes(filters.teamId) ? filters.teamId : undefined;
  const search = filters.q?.trim();
  const userWhere: Prisma.UserWhereInput = {
    id: { in: scope.userIds },
    status: "ACTIVE",
    role: { not: "EXTERNAL_PARTNER" },
    ...(allowedTeamFilter ? { teamId: allowedTeamFilter } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { phone: { contains: search, mode: "insensitive" } },
            { profile: { employeeNumber: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [users, teams] = await Promise.all([
    prisma.user.findMany({
      where: userWhere,
      include: {
        team: true,
        profile: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.team.findMany({
      where: { id: { in: scope.teamIds }, status: "ACTIVE" },
      orderBy: { name: "asc" },
    }),
  ]);
  const [balances, activeGrants] = await Promise.all([
    Promise.all(users.map((user) => getUserLeaveBalance({ userId: user.id, year, prisma }))),
    prisma.leaveGrant.findMany({
      where: {
        userId: { in: users.map((user) => user.id) },
        status: "ACTIVE",
      },
      include: {
        leaveType: true,
      },
    }),
  ]);
  const grantSummaries = sumGrantSummaries(activeGrants);
  const isOwner = actor.role === "OWNER";
  const title = isOwner ? "구성원 휴가 현황" : "담당 조직 휴가 현황";
  const description = isOwner
    ? "전체 구성원의 휴가 보유, 사용, 승인 대기, 잔여 현황을 확인합니다."
    : "담당 조직과 하위 조직 구성원의 휴가 보유, 사용, 승인 대기, 잔여 현황을 확인합니다.";

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader eyebrow="휴가 관리" title={title} description={description} />
      {isOwner ? <LeaveAdminNav activeHref="/admin/leaves/balances" /> : null}

      {filters.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed break-keep text-red-700">
          휴가 조정을 저장할 수 없습니다. 직원, 기준 연도, 조정 일수와 사유를 확인해 주세요.
        </p>
      ) : null}
      {filters.success ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm leading-relaxed break-keep text-green-700">
          휴가 조정이 저장되었습니다.
        </p>
      ) : null}

      <form className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-2 text-sm font-medium break-keep text-slate-700">
          직원 검색
          <input
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="이름, 이메일, 전화번호, 사번"
            className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium break-keep text-slate-700">
          팀
          <select
            name="teamId"
            defaultValue={allowedTeamFilter ?? ""}
            className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm"
          >
            <option value="">전체 팀</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium break-keep text-slate-700">
          기준 연도
          <input
            name="year"
            type="number"
            defaultValue={year}
            className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm"
          />
        </label>
        <button className="min-h-11 w-full self-end whitespace-nowrap break-keep rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white">
          조회
        </button>
      </form>

      {isOwner ? (
        <form
          action={createLeaveAdjustment}
          className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-5"
        >
          <select
            name="userId"
            className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm"
            required
          >
            <option value="">조정할 직원 선택</option>
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
            aria-label="조정 기준 연도"
            className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm"
            required
          />
          <input
            name="amount"
            type="number"
            step="0.5"
            placeholder="조정 일수"
            className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm"
            required
          />
          <input
            name="reason"
            placeholder="조정 사유"
            className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm"
            required
          />
          <button className="min-h-11 w-full whitespace-nowrap break-keep rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white">
            조정 추가
          </button>
        </form>
      ) : null}

      {balances.length === 0 ? (
        <EmptyState title="조회 가능한 구성원이 없습니다." description="검색 조건이나 담당 조직 범위를 확인해 주세요." />
      ) : (
        <>
          <MobileCardList>
            {balances.map((balance) => {
              const hireDate = balance.user.hireDate ?? balance.user.profile?.hireDate;
              const hireDateOnly = hireDate ? dateToDateOnly(hireDate) : null;
              const grants = grantSummaries.get(balance.user.id);

              return (
                <Card key={balance.user.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-semibold break-keep text-slate-950">{balance.user.name}</h2>
                      <p className="mt-1 text-xs break-words text-slate-500">
                        {balance.user.team?.name ?? "팀 미지정"} ·{" "}
                        {balance.user.title ?? balance.user.profile?.jobTitle ?? "직책 미입력"}
                      </p>
                    </div>
                    <Link
                      href={`/admin/leaves/balances/${balance.user.id}?year=${year}`}
                      className={buttonClassName({ tone: "neutral", className: "shrink-0 px-3 py-2" })}
                    >
                      상세
                    </Link>
                  </div>
                  <dl className="mt-4 grid gap-2 text-sm">
                    <InfoRow label="사번" value={balance.user.profile?.employeeNumber ?? "-"} />
                    <InfoRow label="입사일" value={hireDateOnly ?? "미입력"} />
                    <InfoRow label="기본 부여 연차" value={formatLeaveDays(balance.annualEntitled)} />
                    {balance.underOneYearProratedAnnualDays > 0 ? (
                      <>
                        <InfoRow label="1년 미만 월차" value={formatLeaveDays(balance.monthlyAccruedDays)} />
                        <InfoRow
                          label="회계연도 비례 연차"
                          value={formatLeaveDays(balance.underOneYearProratedAnnualDays)}
                        />
                      </>
                    ) : null}
                    <InfoRow label="조정" value={formatLeaveDays(balance.manualGranted)} />
                    <InfoRow label="맞춤휴가 잔여" value={formatLeaveDays(grants?.customRemaining ?? 0)} />
                    <InfoRow label="생일 반차 잔여" value={formatLeaveDays(grants?.birthdayRemaining ?? 0)} />
                    <InfoRow label="승인 대기" value={formatLeaveDays(balance.pendingDays)} />
                    <InfoRow label="사용 완료" value={formatLeaveDays(balance.usedDays)} />
                    <InfoRow label="잔여" value={formatLeaveDays(balance.remainingDays)} />
                  </dl>
                </Card>
              );
            })}
          </MobileCardList>

          <ResponsiveTable minWidth="1180px">
            <thead className="border-b bg-slate-50 text-slate-600">
              <tr>
                {[
                  "구성원",
                  "사번",
                  "팀",
                  "직급/직책",
                  "입사일",
                  "기준 연도",
                  "기본 부여",
                  "조정",
                  "맞춤휴가 잔여",
                  "생일 반차 잔여",
                  "승인 대기",
                  "사용 완료",
                  "잔여",
                  "상세",
                ].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {balances.map((balance) => {
                const hireDate = balance.user.hireDate ?? balance.user.profile?.hireDate;
                const hireDateOnly = hireDate ? dateToDateOnly(hireDate) : null;
                const grants = grantSummaries.get(balance.user.id);

                return (
                  <tr key={balance.user.id}>
                    <td>
                      <p className="font-semibold break-keep text-slate-950">{balance.user.name}</p>
                      <p className="text-xs text-slate-500">{balance.user.email}</p>
                    </td>
                    <td>{balance.user.profile?.employeeNumber ?? "-"}</td>
                    <td>{balance.user.team?.name ?? "-"}</td>
                    <td>{balance.user.title ?? balance.user.profile?.jobTitle ?? "-"}</td>
                    <td>{hireDateOnly ?? "미입력"}</td>
                    <td>{year}</td>
                    <td>{formatLeaveDays(balance.annualEntitled)}</td>
                    <td>{formatLeaveDays(balance.manualGranted)}</td>
                    <td>{formatLeaveDays(grants?.customRemaining ?? 0)}</td>
                    <td>{formatLeaveDays(grants?.birthdayRemaining ?? 0)}</td>
                    <td>{formatLeaveDays(balance.pendingDays)}</td>
                    <td>{formatLeaveDays(balance.usedDays)}</td>
                    <td className="font-semibold">{formatLeaveDays(balance.remainingDays)}</td>
                    <td>
                      <Link
                        href={`/admin/leaves/balances/${balance.user.id}?year=${year}`}
                        className="font-semibold text-blue-700 underline"
                      >
                        상세 보기
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </ResponsiveTable>
        </>
      )}
    </section>
  );
}
