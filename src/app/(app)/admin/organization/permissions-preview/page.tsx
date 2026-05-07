import Link from "next/link";

import { features, featureUnavailableMessage } from "@/config/features";
import { roleLabel } from "@/lib/display/labels";
import { getPrisma } from "@/lib/db/prisma";
import {
  collectDescendantTeamIds,
  describeRoleChangeImpact,
  describeTeamChangeImpact,
  getManagedScopeForUser,
} from "@/lib/organization/permissions";
import { requireOwner } from "@/lib/rbac/server-guards";
import type { Role } from "@/lib/rbac/roles";

export const dynamic = "force-dynamic";

type PermissionsPreviewPageProps = {
  searchParams: Promise<{
    userId?: string;
    nextRole?: Role;
    nextTeamId?: string;
  }>;
};

const roleOptions: Role[] = ["OWNER", "LEAD", "MANAGER", "EXTERNAL_PARTNER"];

export default async function PermissionsPreviewPage({
  searchParams,
}: PermissionsPreviewPageProps) {
  await requireOwner();

  if (!features.permissionPreview) {
    return (
      <section className="min-w-0 rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <p className="font-semibold">권한 미리보기 점검 중</p>
        <p className="mt-2 break-keep">{featureUnavailableMessage()}</p>
      </section>
    );
  }

  const params = await searchParams;
  const prisma = getPrisma();
  const [users, teams] = await Promise.all([
    prisma.user.findMany({
      where: { status: { not: "DELETED" } },
      include: { team: true },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    prisma.team.findMany({
      where: { status: "ACTIVE" },
      include: { lead: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const selectedUser =
    users.find((user) => user.id === params.userId) ?? users[0] ?? null;
  const nextRole = params.nextRole ?? selectedUser?.role ?? "MANAGER";
  const nextTeamId = params.nextTeamId ?? selectedUser?.teamId ?? "";
  const scope =
    selectedUser && selectedUser.status === "ACTIVE"
      ? await getManagedScopeForUser(
          {
            id: selectedUser.id,
            role: selectedUser.role,
            status: selectedUser.status,
          },
          "ORGANIZATION",
        )
      : null;
  const visibleLeadNames = selectedUser
    ? getLeadNamesForTeam({ teamId: selectedUser.teamId, teams })
    : [];
  const nextLeadNames = getLeadNamesForTeam({
    teamId: nextTeamId || null,
    teams,
  });
  const roleImpact =
    selectedUser && scope
      ? describeRoleChangeImpact({
          previousRole: selectedUser.role,
          nextRole,
          managedTeamCount: scope.teamIds.length,
          managedUserCount: scope.userIds.length,
        })
      : null;
  const teamImpact = selectedUser
    ? describeTeamChangeImpact({
        previousTeamName: selectedUser.team?.name ?? null,
        nextTeamName:
          teams.find((team) => team.id === nextTeamId)?.name ??
          (nextTeamId ? "알 수 없는 팀" : null),
        previousLeadNames: visibleLeadNames,
        nextLeadNames,
      })
    : null;

  return (
    <section className="min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">조직 권한</p>
          <h1 className="mt-2 break-keep text-2xl font-semibold tracking-normal">
            권한 미리보기
          </h1>
          <p className="mt-2 max-w-3xl break-keep text-sm text-neutral-600">
            사용자의 현재 role/team 기준으로 볼 수 있는 팀과 직원 범위를 확인합니다.
            실제 role/team 저장은 직원 상세 화면에서 Step-up 후 처리됩니다.
          </p>
        </div>
        <Link
          href="/organization/teams"
          className="inline-flex min-h-10 items-center justify-center rounded-md border border-neutral-200 px-4 text-sm font-medium text-neutral-700"
        >
          팀 담당자 관리
        </Link>
      </div>

      <form className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm font-medium">
          사용자
          <select
            name="userId"
            defaultValue={selectedUser?.id ?? ""}
            className="h-10 w-full min-w-0 rounded-md border px-3 text-sm"
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} · {roleLabel(user.role)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          변경 예정 role
          <select
            name="nextRole"
            defaultValue={nextRole}
            className="h-10 w-full min-w-0 rounded-md border px-3 text-sm"
          >
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">
          변경 예정 팀
          <select
            name="nextTeamId"
            defaultValue={nextTeamId}
            className="h-10 w-full min-w-0 rounded-md border px-3 text-sm"
          >
            <option value="">소속 팀 없음</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button className="min-h-10 w-full rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
            미리보기
          </button>
        </div>
      </form>

      {!selectedUser || !scope ? (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
          미리볼 사용자가 없습니다.
        </div>
      ) : (
        <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">현재 권한 정보</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <InfoItem label="사용자" value={selectedUser.name} />
              <InfoItem label="현재 role" value={roleLabel(selectedUser.role)} />
              <InfoItem label="소속 팀" value={selectedUser.team?.name ?? "-"} />
              <InfoItem label="상태" value={selectedUser.status} />
              <InfoItem label="조회 scope" value={scope.scope} />
              <InfoItem label="볼 수 있는 팀" value={`${scope.teamIds.length}개`} />
              <InfoItem label="볼 수 있는 직원" value={`${scope.userIds.length}명`} />
              <InfoItem label="Export 가능" value={scope.canExport ? "가능" : "불가"} />
            </dl>
          </section>

          <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">변경 영향 미리보기</h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-neutral-700">
              <p className="rounded-md bg-neutral-50 p-3">{roleImpact}</p>
              <p className="rounded-md bg-neutral-50 p-3">{teamImpact}</p>
              <p className="rounded-md bg-amber-50 p-3 text-amber-800">
                OWNER 부여/해제, 직원 비활성화, team 변경 저장은 서버에서 마지막
                OWNER 보호와 Step-up을 다시 검증합니다.
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm xl:col-span-2">
            <h2 className="text-lg font-semibold">기능별 접근 범위</h2>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
              <ScopeCard
                title="휴가 현황"
                value={scope.scope === "ALL" ? "전체" : scope.scope === "MANAGED_TEAMS" ? "담당 조직" : scope.scope === "SELF" ? "본인" : "접근 불가"}
              />
              <ScopeCard
                title="휴가 승인"
                value={selectedUser.role === "OWNER" ? "전체 승인" : selectedUser.role === "LEAD" ? "담당 조직 승인" : "승인 불가"}
              />
              <ScopeCard
                title="근태/직원 목록"
                value={scope.scope === "ALL" ? "전체" : scope.scope === "MANAGED_TEAMS" ? "담당 조직" : "접근 불가"}
              />
              <ScopeCard
                title="리포트/보안"
                value={selectedUser.role === "OWNER" ? "전체/보안 포함" : selectedUser.role === "LEAD" ? "담당 조직 요약" : "접근 불가"}
              />
            </div>
          </section>

          <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm xl:col-span-2">
            <h2 className="text-lg font-semibold">이 직원을 볼 수 있는 LEAD</h2>
            <p className="mt-2 break-keep text-sm text-neutral-600">
              현재 소속 팀이 담당 팀 또는 하위 팀 범위에 포함되는 LEAD입니다. OWNER는
              항상 접근 가능합니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {visibleLeadNames.length > 0 ? (
                visibleLeadNames.map((name) => (
                  <span
                    key={name}
                    className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
                  >
                    {name}
                  </span>
                ))
              ) : (
                <span className="text-sm text-neutral-500">담당 LEAD 없음</span>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function getLeadNamesForTeam(params: {
  teamId: string | null;
  teams: Array<{
    id: string;
    parentTeamId: string | null;
    status: "ACTIVE" | "INACTIVE";
    lead: { id: string; name: string; role: Role; status: string } | null;
  }>;
}) {
  if (!params.teamId) {
    return [];
  }

  const names = new Set<string>();

  for (const team of params.teams) {
    if (!team.lead || team.lead.role !== "LEAD" || team.lead.status !== "ACTIVE") {
      continue;
    }

    const visibleTeamIds = collectDescendantTeamIds({
      rootTeamIds: [team.id],
      teams: params.teams,
    });

    if (visibleTeamIds.includes(params.teamId)) {
      names.add(team.lead.name);
    }
  }

  return [...names].sort();
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="mt-1 break-words font-medium text-neutral-950">{value}</dd>
    </div>
  );
}

function ScopeCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <p className="text-xs font-medium text-neutral-500">{title}</p>
      <p className="mt-2 break-keep text-base font-semibold text-neutral-950">
        {value}
      </p>
    </div>
  );
}
