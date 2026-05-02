import Link from "next/link";

import { RoleLabel, UserStatusBadge } from "@/components/ui/status-badge";
import { roleLabel, userStatusLabel } from "@/lib/display/labels";
import { dateOnlyFromDate, toDisplayDate } from "@/lib/organization/format";
import { calculateTenureDays, formatTenureDays } from "@/lib/organization/tenure";
import { getPrisma } from "@/lib/db/prisma";
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
  const where = {
    ...(filters.status ? { status: filters.status as never } : {}),
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
    <section>
      <p className="text-sm font-medium text-neutral-500">직원 관리</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-normal">직원 목록</h1>
      <form className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm md:grid-cols-5">
        <input
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="이름, 이메일, 전화번호"
          className="h-10 rounded-md border px-3 text-sm"
        />
        <select name="status" defaultValue={filters.status ?? ""} className="h-10 rounded-md border px-3 text-sm">
          <option value="">상태 전체</option>
          <option value="ACTIVE">{userStatusLabel("ACTIVE")}</option>
          <option value="INVITED">{userStatusLabel("INVITED")}</option>
          <option value="DEACTIVATED">{userStatusLabel("DEACTIVATED")}</option>
          <option value="SUSPENDED">{userStatusLabel("SUSPENDED")}</option>
        </select>
        <select name="role" defaultValue={filters.role ?? ""} className="h-10 rounded-md border px-3 text-sm">
          <option value="">역할 전체</option>
          <option value="OWNER">{roleLabel("OWNER")}</option>
          <option value="LEAD">{roleLabel("LEAD")}</option>
          <option value="MANAGER">{roleLabel("MANAGER")}</option>
          <option value="EXTERNAL_PARTNER">{roleLabel("EXTERNAL_PARTNER")}</option>
        </select>
        <select name="teamId" defaultValue={filters.teamId ?? ""} className="h-10 rounded-md border px-3 text-sm">
          <option value="">팀 전체</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={filters.sort ?? "name"} className="h-10 rounded-md border px-3 text-sm">
          <option value="name">이름순</option>
          <option value="hireDate">입사일순</option>
          <option value="createdAt">생성일순</option>
        </select>
        <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white md:col-span-5">
          필터 적용
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">이메일</th>
              <th className="px-4 py-3">전화번호</th>
              <th className="px-4 py-3">직급</th>
              <th className="px-4 py-3">역할</th>
              <th className="px-4 py-3">소속 팀</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">입사일</th>
              <th className="px-4 py-3">재직일</th>
              <th className="px-4 py-3">상세</th>
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
                    <td className="px-4 py-3 font-medium">{user.name}</td>
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3">{user.phone ?? "-"}</td>
                    <td className="px-4 py-3">{user.title ?? user.profile?.jobTitle ?? "-"}</td>
                    <td className="px-4 py-3"><RoleLabel role={user.role} /></td>
                    <td className="px-4 py-3">{user.team?.name ?? "-"}</td>
                    <td className="px-4 py-3"><UserStatusBadge status={user.status} /></td>
                    <td className="px-4 py-3">{toDisplayDate(user.hireDate ?? user.profile?.hireDate)}</td>
                    <td className="px-4 py-3">{formatTenureDays(calculateTenureDays(hireDate))}</td>
                    <td className="px-4 py-3">
                      <Link className="text-sm font-medium underline" href={`/organization/employees/${user.id}`}>
                        상세
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">가입 대기 초대</h2>
        {pendingInvitations.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">진행 중인 초대가 없습니다.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100">
            {pendingInvitations.map((invitation) => (
              <li key={invitation.id} className="flex justify-between gap-4 py-2 text-sm">
                <span>{invitation.expectedName} · {invitation.email}</span>
                <span className="text-neutral-500">{roleLabel(invitation.role)} · {invitation.team?.name ?? "팀 없음"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
