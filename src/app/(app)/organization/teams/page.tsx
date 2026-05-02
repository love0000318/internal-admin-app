import {
  createTeam,
  deactivateTeam,
  updateTeam,
} from "@/app/(app)/organization/actions";
import { TeamStatusBadge } from "@/components/ui/status-badge";
import { teamStatusLabel } from "@/lib/display/labels";
import { toDisplayDate } from "@/lib/organization/format";
import { getPrisma } from "@/lib/db/prisma";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type TeamsPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
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
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <section>
      <p className="text-sm font-medium text-neutral-500">조직 관리</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-normal">
        조직/팀 관리
      </h1>
      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          요청을 처리할 수 없습니다. 입력값 또는 권한을 확인해 주세요.
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          변경 사항이 저장되었습니다.
        </p>
      ) : null}

      <form
        action={createTeam}
        className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm md:grid-cols-5"
      >
        <input
          name="name"
          placeholder="팀명"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
          required
        />
        <input
          name="description"
          placeholder="설명"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <select name="parentTeamId" className="h-10 rounded-md border px-3 text-sm">
          <option value="">상위 팀 없음</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <select name="leadUserId" className="h-10 rounded-md border px-3 text-sm">
          <option value="">팀 리드 없음</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
          팀 생성
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">팀명</th>
              <th className="px-4 py-3">설명</th>
              <th className="px-4 py-3">상위 팀</th>
              <th className="px-4 py-3">팀 리드</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">생성일</th>
              <th className="px-4 py-3">수정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {teams.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={7}>
                  등록된 조직이 없습니다.
                </td>
              </tr>
            ) : (
              teams.map((team) => (
                <tr key={team.id} className="align-top">
                  <td className="px-4 py-3 font-medium">{team.name}</td>
                  <td className="px-4 py-3">{team.description ?? "-"}</td>
                  <td className="px-4 py-3">{team.parent?.name ?? "-"}</td>
                  <td className="px-4 py-3">{team.lead?.name ?? "-"}</td>
                  <td className="px-4 py-3">
                    <TeamStatusBadge status={team.status} />
                    {team.members.length > 0 && team.status === "ACTIVE" ? (
                      <p className="mt-1 text-xs text-amber-700">
                        활성 직원 {team.members.length}명
                      </p>
                    ) : null}
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
                          .filter((candidate) => candidate.id !== team.id)
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
                        <option value="">팀 리드 없음</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name}
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
                      <div className="flex gap-2">
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
