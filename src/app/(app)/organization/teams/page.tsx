import {
  createTeam,
  deactivateTeam,
  updateTeam,
} from "@/app/(app)/organization/actions";
import { TeamStatusBadge } from "@/components/ui/status-badge";
import { roleLabel } from "@/lib/display/labels";
import { teamStatusLabel } from "@/lib/display/labels";
import { getPrisma } from "@/lib/db/prisma";
import { toDisplayDate } from "@/lib/organization/format";
import {
  collectDescendantTeamIds,
  isEligibleTeamLeadCandidate,
} from "@/lib/organization/permissions";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type TeamsPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

const errorMessages: Record<string, string> = {
  invalid: "입력값을 확인해 주세요.",
  duplicate: "같은 상위 팀 아래에 동일한 팀명이 이미 있습니다.",
  cycle: "상위 팀을 자기 자신이나 하위 팀으로 지정할 수 없습니다.",
  "invalid-lead": "팀 담당자는 ACTIVE 상태의 OWNER 또는 LEAD만 지정할 수 있습니다.",
  "step-up-required": "팀 담당자 변경은 현재 비밀번호 확인이 필요합니다.",
  "not-found": "팀을 찾을 수 없습니다.",
};

export default async function TeamsPage({ searchParams }: TeamsPageProps) {
  await requireOwner();
  const { error, success } = await searchParams;
  const prisma = getPrisma();
  const [teams, users] = await Promise.all([
    prisma.team.findMany({
      include: {
        parent: true,
        lead: true,
        members: {
          where: { status: "ACTIVE" },
          select: { id: true },
        },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE", role: { in: ["OWNER", "LEAD"] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
  ]);
  const leadCandidates = users.filter(isEligibleTeamLeadCandidate);

  return (
    <section className="min-w-0">
      <p className="text-sm font-medium text-neutral-500">조직 관리</p>
      <h1 className="mt-2 break-keep text-2xl font-semibold tracking-normal">
        조직/팀 관리
      </h1>
      <p className="mt-2 max-w-3xl break-keep text-sm text-neutral-600">
        팀 담당자는 LEAD 담당 범위의 기준입니다. 담당 팀과 모든 하위 팀의 직원이
        LEAD에게 보이며, 저장 시 서버에서 OWNER 권한과 Step-up을 다시 검증합니다.
      </p>

      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessages[error] ?? "요청을 처리할 수 없습니다."}
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          변경 사항이 저장되었습니다.
        </p>
      ) : null}

      <form
        action={createTeam}
        className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-6"
      >
        <input
          name="name"
          placeholder="팀명"
          className="h-10 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-sm"
          required
        />
        <input
          name="description"
          placeholder="설명"
          className="h-10 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <select
          name="parentTeamId"
          className="h-10 w-full min-w-0 rounded-md border px-3 text-sm"
        >
          <option value="">상위 팀 없음</option>
          {teams
            .filter((team) => team.status === "ACTIVE")
            .map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
        </select>
        <select
          name="leadUserId"
          className="h-10 w-full min-w-0 rounded-md border px-3 text-sm"
        >
          <option value="">팀 담당자 없음</option>
          {leadCandidates.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} · {roleLabel(user.role)}
            </option>
          ))}
        </select>
        <input
          name="stepUpPassword"
          type="password"
          autoComplete="current-password"
          placeholder="담당자 지정 시 현재 비밀번호"
          className="h-10 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <button className="min-h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
          팀 생성
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-3">팀명</th>
                <th className="px-4 py-3">설명</th>
                <th className="px-4 py-3">상위 팀</th>
                <th className="px-4 py-3">담당자</th>
                <th className="px-4 py-3">하위 범위</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">생성일</th>
                <th className="px-4 py-3">수정</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {teams.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-neutral-500" colSpan={8}>
                    등록된 조직이 없습니다.
                  </td>
                </tr>
              ) : (
                teams.map((team) => {
                  const visibleTeamIds = collectDescendantTeamIds({
                    rootTeamIds: [team.id],
                    teams,
                  });

                  return (
                    <tr key={team.id} className="align-top">
                      <td className="px-4 py-3 font-medium">{team.name}</td>
                      <td className="px-4 py-3">{team.description ?? "-"}</td>
                      <td className="px-4 py-3">{team.parent?.name ?? "-"}</td>
                      <td className="px-4 py-3">
                        {team.lead ? (
                          <span>
                            {team.lead.name} · {roleLabel(team.lead.role)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{visibleTeamIds.length}개 팀</span>
                        <p className="mt-1 text-xs text-neutral-500">
                          활성 직원 {team.members.length}명 직접 소속
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <TeamStatusBadge status={team.status} />
                      </td>
                      <td className="px-4 py-3">{toDisplayDate(team.createdAt)}</td>
                      <td className="px-4 py-3">
                        <form action={updateTeam} className="grid min-w-80 gap-2">
                          <input name="teamId" type="hidden" value={team.id} />
                          <input
                            name="name"
                            defaultValue={team.name}
                            className="h-9 rounded-md border px-2"
                            required
                          />
                          <input
                            name="description"
                            defaultValue={team.description ?? ""}
                            className="h-9 rounded-md border px-2"
                          />
                          <select
                            name="parentTeamId"
                            defaultValue={team.parentTeamId ?? ""}
                            className="h-9 rounded-md border px-2"
                          >
                            <option value="">상위 팀 없음</option>
                            {teams
                              .filter(
                                (candidate) =>
                                  candidate.id !== team.id &&
                                  candidate.status === "ACTIVE",
                              )
                              .map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>
                                  {candidate.name}
                                </option>
                              ))}
                          </select>
                          <select
                            name="leadUserId"
                            defaultValue={team.leadUserId ?? ""}
                            className="h-9 rounded-md border px-2"
                          >
                            <option value="">팀 담당자 없음</option>
                            {leadCandidates.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name} · {roleLabel(user.role)}
                              </option>
                            ))}
                          </select>
                          <select
                            name="status"
                            defaultValue={team.status}
                            className="h-9 rounded-md border px-2"
                          >
                            <option value="ACTIVE">{teamStatusLabel("ACTIVE")}</option>
                            <option value="INACTIVE">{teamStatusLabel("INACTIVE")}</option>
                          </select>
                          <input
                            name="stepUpPassword"
                            type="password"
                            autoComplete="current-password"
                            placeholder="담당자 변경 시 현재 비밀번호"
                            className="h-9 rounded-md border px-2"
                          />
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <button className="h-9 rounded-md bg-neutral-950 px-3 text-sm font-medium text-white">
                              저장
                            </button>
                            {team.status === "ACTIVE" ? (
                              <button
                                formAction={deactivateTeam}
                                className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700"
                              >
                                비활성화
                              </button>
                            ) : null}
                          </div>
                        </form>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
