import Link from "next/link";

import { permanentlyDeleteEmployee } from "@/app/(app)/organization/actions";
import { Card, EmptyState, buttonClassName } from "@/components/design-system/primitives";
import { MobileCardList } from "@/components/design-system/responsive";
import { RoleLabel, UserStatusBadge } from "@/components/ui/status-badge";
import { roleLabel, userStatusLabel } from "@/lib/display/labels";
import { getPrisma } from "@/lib/db/prisma";
import { dateOnlyFromDate, toDisplayDate } from "@/lib/organization/format";
import { calculateTenureDays, formatTenureDays } from "@/lib/organization/tenure";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type EmployeesPageProps = {
  searchParams: Promise<{
    status?: string;
    role?: string;
    teamId?: string;
    q?: string;
    sort?: string;
  }>;
};

export default async function EmployeesPage({ searchParams }: EmployeesPageProps) {
  await requireOwner();
  const filters = await searchParams;
  const prisma = getPrisma();
  const statusFilter =
    filters.status === "ALL"
      ? {}
      : filters.status
        ? { status: filters.status as never }
        : { status: { not: "DELETED" as const } };
  const where = {
    ...statusFilter,
    ...(filters.role ? { role: filters.role as never } : {}),
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
  const orderBy =
    filters.sort === "hireDate"
      ? [{ hireDate: "asc" as const }]
      : filters.sort === "createdAt"
        ? [{ createdAt: "desc" as const }]
        : [{ name: "asc" as const }];
  const [users, teams, pendingInvitations] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        team: true,
        profile: true,
      },
      orderBy,
    }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
    prisma.invitation.findMany({
      where: { status: "PENDING" },
      include: { team: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <section className="min-w-0">
      <p className="text-sm font-medium text-neutral-500">직원 관리</p>
      <h1 className="mt-2 break-keep text-2xl font-semibold tracking-normal">직원 목록</h1>
      <form className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <input
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="이름, 이메일, 전화번호"
          className="h-10 w-full min-w-0 rounded-md border px-3 text-sm"
        />
        <select name="status" defaultValue={filters.status ?? ""} className="h-10 w-full min-w-0 rounded-md border px-3 text-sm">
          <option value="">상태 전체</option>
          <option value="ALL">전체(삭제됨 포함)</option>
          <option value="ACTIVE">{userStatusLabel("ACTIVE")}</option>
          <option value="INVITED">{userStatusLabel("INVITED")}</option>
          <option value="DEACTIVATED">{userStatusLabel("DEACTIVATED")}</option>
          <option value="DELETED">{userStatusLabel("DELETED")}</option>
          <option value="SUSPENDED">{userStatusLabel("SUSPENDED")}</option>
        </select>
        <select name="role" defaultValue={filters.role ?? ""} className="h-10 w-full min-w-0 rounded-md border px-3 text-sm">
          <option value="">역할 전체</option>
          <option value="OWNER">{roleLabel("OWNER")}</option>
          <option value="LEAD">{roleLabel("LEAD")}</option>
          <option value="MANAGER">{roleLabel("MANAGER")}</option>
          <option value="EXTERNAL_PARTNER">{roleLabel("EXTERNAL_PARTNER")}</option>
        </select>
        <select name="teamId" defaultValue={filters.teamId ?? ""} className="h-10 w-full min-w-0 rounded-md border px-3 text-sm">
          <option value="">팀 전체</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={filters.sort ?? "name"} className="h-10 w-full min-w-0 rounded-md border px-3 text-sm">
          <option value="name">이름순</option>
          <option value="hireDate">입사일순</option>
          <option value="createdAt">생성일순</option>
        </select>
        <button className="min-h-10 rounded-md bg-neutral-950 px-4 py-2 text-sm font-medium text-white sm:col-span-2 lg:col-span-5">
          필터 적용
        </button>
      </form>

      <div className="mt-6 md:hidden">
        {users.length === 0 ? (
          <EmptyState title="등록된 직원이 없습니다." />
        ) : (
          <MobileCardList>
            {users.map((user) => {
              const hireDate = dateOnlyFromDate(user.hireDate ?? user.profile?.hireDate);
              return (
                <Card key={user.id} className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="break-keep text-base font-semibold text-neutral-950">
                        {user.status === "DELETED" ? "삭제된 직원" : user.name}
                      </h2>
                      <p className="mt-1 break-keep text-sm text-neutral-500">
                        {user.team?.name ?? "팀 없음"} · {user.title ?? user.profile?.jobTitle ?? "직급 없음"}
                      </p>
                    </div>
                    <UserStatusBadge status={user.status} />
                  </div>
                  <dl className="grid gap-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="shrink-0 whitespace-nowrap break-keep text-neutral-500">역할</dt>
                      <dd><RoleLabel role={user.role} /></dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="shrink-0 whitespace-nowrap break-keep text-neutral-500">이메일</dt>
                      <dd className="min-w-0 text-right break-all">{user.status === "DELETED" ? "-" : user.email}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="shrink-0 whitespace-nowrap break-keep text-neutral-500">전화번호</dt>
                      <dd className="text-right">{user.status === "DELETED" ? "-" : (user.phone ?? "-")}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="shrink-0 whitespace-nowrap break-keep text-neutral-500">입사일</dt>
                      <dd className="text-right">{toDisplayDate(user.hireDate ?? user.profile?.hireDate)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="shrink-0 whitespace-nowrap break-keep text-neutral-500">재직일</dt>
                      <dd className="text-right">{formatTenureDays(calculateTenureDays(hireDate))}</dd>
                    </div>
                  </dl>
                  <Link className={buttonClassName({ tone: "neutral", className: "w-full" })} href={`/organization/employees/${user.id}`}>
                    상세 보기
                  </Link>
                  {user.status === "DEACTIVATED" && !user.deletedAt ? (
                    <form
                      action={permanentlyDeleteEmployee}
                      className="grid gap-2 rounded-lg border border-red-100 bg-red-50 p-3"
                    >
                      <input name="userId" type="hidden" value={user.id} />
                      <input
                        name="deletionReason"
                        type="hidden"
                        value="직원 목록에서 비활성 직원 계정 삭제"
                      />
                      <input
                        name="stepUpPassword"
                        type="password"
                        autoComplete="current-password"
                        placeholder="현재 비밀번호"
                        className="h-10 w-full rounded-md border border-red-200 bg-white px-3 text-sm"
                        required
                      />
                      <input
                        name="confirmation"
                        placeholder="DELETE"
                        pattern="DELETE"
                        className="h-10 w-full rounded-md border border-red-200 bg-white px-3 text-sm"
                        required
                      />
                      <p className="break-keep text-xs leading-relaxed text-red-700">
                        개인정보는 익명화하고 휴가, 근태, 감사 로그는 보존합니다.
                      </p>
                      <button className="min-h-10 w-full rounded-md bg-red-700 px-3 text-sm font-semibold text-white">
                        계정 삭제
                      </button>
                    </form>
                  ) : null}
                </Card>
              );
            })}
          </MobileCardList>
        )}
      </div>

      <div className="mt-6 hidden overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm md:block">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1000px] table-auto text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="whitespace-nowrap break-keep px-4 py-3">이름</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">이메일</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">전화번호</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">직급</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">역할</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">소속 팀</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">상태</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">입사일</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">재직일</th>
                <th className="whitespace-nowrap break-keep px-4 py-3">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {users.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-neutral-500" colSpan={10}>
                    등록된 직원이 없습니다.
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const hireDate = dateOnlyFromDate(user.hireDate ?? user.profile?.hireDate);
                  return (
                    <tr key={user.id}>
                      <td className="px-4 py-3 font-medium">{user.status === "DELETED" ? "삭제된 직원" : user.name}</td>
                      <td className="px-4 py-3">{user.status === "DELETED" ? "-" : user.email}</td>
                      <td className="px-4 py-3">{user.status === "DELETED" ? "-" : (user.phone ?? "-")}</td>
                      <td className="px-4 py-3">{user.title ?? user.profile?.jobTitle ?? "-"}</td>
                      <td className="px-4 py-3"><RoleLabel role={user.role} /></td>
                      <td className="px-4 py-3">{user.team?.name ?? "-"}</td>
                      <td className="px-4 py-3"><UserStatusBadge status={user.status} /></td>
                      <td className="px-4 py-3">{toDisplayDate(user.hireDate ?? user.profile?.hireDate)}</td>
                      <td className="px-4 py-3">{formatTenureDays(calculateTenureDays(hireDate))}</td>
                      <td className="px-4 py-3">
                        <div className="grid gap-2">
                          <Link className="whitespace-nowrap break-keep text-sm font-medium underline" href={`/organization/employees/${user.id}`}>
                            상세 보기
                          </Link>
                          {user.status === "DEACTIVATED" && !user.deletedAt ? (
                            <form action={permanentlyDeleteEmployee} className="grid gap-1">
                              <input name="userId" type="hidden" value={user.id} />
                              <input
                                name="deletionReason"
                                type="hidden"
                                value="직원 목록에서 비활성 직원 계정 삭제"
                              />
                              <input
                                name="stepUpPassword"
                                type="password"
                                autoComplete="current-password"
                                placeholder="현재 비밀번호"
                                className="h-8 w-36 rounded-md border border-red-200 px-2 text-xs"
                                required
                              />
                              <input
                                name="confirmation"
                                placeholder="DELETE"
                                pattern="DELETE"
                                className="h-8 w-36 rounded-md border border-red-200 px-2 text-xs"
                                required
                              />
                              <button className="h-8 w-36 rounded-md bg-red-700 px-2 text-xs font-semibold text-white">
                                계정 삭제
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="break-keep text-base font-semibold">가입 대기 초대</h2>
        {pendingInvitations.length === 0 ? (
          <p className="mt-3 break-keep text-sm text-neutral-500">진행 중인 초대가 없습니다.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100">
            {pendingInvitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-col gap-1 py-2 text-sm sm:flex-row sm:justify-between sm:gap-4">
                <span className="min-w-0 break-keep">{invitation.expectedName} · {invitation.email}</span>
                <span className="break-keep text-neutral-500">{roleLabel(invitation.role)} · {invitation.team?.name ?? "팀 없음"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
