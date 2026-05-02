import Link from "next/link";

import {
  createLeaveGrant,
  revokeLeaveGrant,
} from "@/app/(app)/admin/leaves/grants/actions";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { dateToDateOnly, todayInSeoul } from "@/lib/leave/calculate-business-days";
import { listGrantableLeaveTypes } from "@/lib/leave/grants";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type LeaveGrantsPageProps = {
  searchParams: Promise<{
    q?: string;
    teamId?: string;
    leaveTypeId?: string;
    status?: string;
    source?: string;
    error?: string;
    success?: string;
  }>;
};

const unitLabels = {
  DAY: "일",
  HOUR: "시간",
  MINUTE: "분",
};

const statusLabels = {
  ACTIVE: "사용 가능",
  REVOKED: "회수됨",
  EXPIRED: "만료됨",
};

function formatGrantAmount(amount: number, unit: keyof typeof unitLabels) {
  return `${amount}${unitLabels[unit]}`;
}

function formatDate(value: Date | null) {
  return value ? dateToDateOnly(value) : "-";
}

function statusMessage(kind?: string) {
  const messages: Record<string, string> = {
    "bulk-created": "맞춤휴가가 일괄 지급되었습니다.",
    revoked: "맞춤휴가 지급 내역이 회수되었습니다.",
  };

  return kind ? messages[kind] ?? "처리가 완료되었습니다." : null;
}

function errorMessage(kind?: string) {
  const messages: Record<string, string> = {
    invalid: "입력값을 확인해 주세요.",
    "invalid-users": "지급 대상 직원은 ACTIVE 상태여야 합니다.",
    "not-found": "지급 내역을 찾을 수 없습니다.",
    "not-revocable": "이미 사용되었거나 승인 대기 중인 휴가가 있어 회수할 수 없습니다.",
    "revoke-reason-required": "회수 사유를 입력해 주세요.",
  };

  return kind ? messages[kind] ?? "처리 중 오류가 발생했습니다." : null;
}

export default async function LeaveGrantsPage({
  searchParams,
}: LeaveGrantsPageProps) {
  await requireOwner();
  const params = await searchParams;
  const prisma = getPrisma();
  const grantWhere: Prisma.LeaveGrantWhereInput = {};

  if (params.leaveTypeId) {
    grantWhere.leaveTypeId = params.leaveTypeId;
  }

  if (
    params.status === "ACTIVE" ||
    params.status === "REVOKED" ||
    params.status === "EXPIRED"
  ) {
    grantWhere.status = params.status;
  }

  if (params.source === "BIRTHDAY_AUTO") {
    grantWhere.source = "BIRTHDAY_AUTO";
  }

  const [teams, users, grantableLeaveTypes, grants] = await Promise.all([
    prisma.team.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      include: { team: true },
      orderBy: { name: "asc" },
    }),
    listGrantableLeaveTypes(prisma),
    prisma.leaveGrant.findMany({
      where: grantWhere,
      include: {
        user: { include: { team: true } },
        leaveType: true,
        grantedByUser: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const query = params.q?.trim().toLowerCase();
  const filteredGrants = grants.filter((grant) => {
    const matchesTeam = !params.teamId || grant.user.teamId === params.teamId;
    const matchesQuery =
      !query ||
      grant.user.name.toLowerCase().includes(query) ||
      grant.user.email.toLowerCase().includes(query) ||
      (grant.user.phone ?? "").includes(query);

    return matchesTeam && matchesQuery;
  });
  const success = statusMessage(params.success);
  const error = errorMessage(params.error);
  const today = todayInSeoul();

  return (
    <section>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">휴가 관리</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            맞춤휴가 지급
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">
            직원에게 회사가 별도로 운영하는 맞춤휴가를 지급하고, 지급 내역을
            관리합니다. 연차 추가 또는 차감은 직원별 휴가 보유 현황의 연차
            조정 기능을 사용해 주세요.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/leaves/types"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            휴가 유형 관리
          </Link>
          <Link
            href="/admin/leaves/birthday-policy"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            생일 반차 설정
          </Link>
          <Link
            href="/admin/leaves/balances"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            직원별 휴가 현황
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
      {success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </p>
      ) : null}

      <form
        action={createLeaveGrant}
        className="mt-6 grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
      >
        <div>
          <h2 className="text-lg font-semibold">맞춤휴가 지급하기</h2>
          <p className="mt-1 text-sm text-neutral-500">
            여러 직원을 선택하면 같은 조건으로 일괄 지급됩니다. 지급된
            맞춤휴가는 다음 단계에서 휴가 요청과 연결됩니다.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
          <label className="text-sm">
            지급 대상 직원
            <select
              name="userIds"
              multiple
              size={Math.min(Math.max(users.length, 4), 8)}
              className="mt-1 min-h-36 w-full rounded-md border border-neutral-300 px-3 py-2"
              required
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} / {user.email} / {user.team?.name ?? "팀 없음"}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
            <label className="text-sm">
              휴가 유형
              <select
                name="leaveTypeId"
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
                required
              >
                <option value="">선택해 주세요</option>
                {grantableLeaveTypes.map((leaveType) => (
                  <option key={leaveType.id} value={leaveType.id}>
                    {leaveType.name} ({leaveType.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              지급 사유
              <input
                name="reason"
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
                placeholder="예: 리프레시 휴가 지급"
                required
              />
            </label>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          <label className="text-sm">
            지급 수량
            <input
              name="grantedAmount"
              type="number"
              step="0.5"
              min="0.5"
              className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              required
            />
          </label>
          <label className="text-sm">
            지급 단위
            <select
              name="unit"
              defaultValue="DAY"
              className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
            >
              <option value="DAY">일</option>
              <option value="HOUR">시간</option>
              <option value="MINUTE">분</option>
            </select>
          </label>
          <label className="text-sm">
            사용 시작일
            <input
              name="effectiveFrom"
              type="date"
              defaultValue={today}
              className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              required
            />
          </label>
          <label className="text-sm">
            만료일
            <input
              name="expiresAt"
              type="date"
              className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
            />
          </label>
          <button className="mt-6 h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
            지급하기
          </button>
        </div>
      </form>

      <form className="mt-6 grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="직원 이름, 이메일, 전화번호"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <select
          name="teamId"
          defaultValue={params.teamId ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">팀 전체</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <select
          name="leaveTypeId"
          defaultValue={params.leaveTypeId ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">휴가 유형 전체</option>
          {grantableLeaveTypes.map((leaveType) => (
            <option key={leaveType.id} value={leaveType.id}>
              {leaveType.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={params.status ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">상태 전체</option>
          <option value="ACTIVE">사용 가능</option>
          <option value="REVOKED">회수됨</option>
          <option value="EXPIRED">만료됨</option>
        </select>
        <select
          name="source"
          defaultValue={params.source ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">지급 방식 전체</option>
          <option value="BIRTHDAY_AUTO">생일 반차 자동 지급</option>
        </select>
        <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
          조회
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[1500px] table-auto text-left text-sm [&_td]:break-keep [&_th]:break-keep [&_th]:whitespace-nowrap">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">직원</th>
              <th className="px-4 py-3">팀</th>
              <th className="px-4 py-3">휴가 유형</th>
              <th className="px-4 py-3">지급 수량</th>
              <th className="px-4 py-3">사용 완료</th>
              <th className="px-4 py-3">승인 대기</th>
              <th className="px-4 py-3">잔여</th>
              <th className="px-4 py-3">기간</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">지급자</th>
              <th className="px-4 py-3">지급일</th>
              <th className="px-4 py-3">상세</th>
              <th className="px-4 py-3">회수</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filteredGrants.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={13}>
                  지급된 맞춤휴가가 없습니다.
                </td>
              </tr>
            ) : (
              filteredGrants.map((grant) => (
                <tr key={grant.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{grant.user.name}</p>
                    <p className="text-xs text-neutral-500">{grant.user.email}</p>
                  </td>
                  <td className="px-4 py-3">{grant.user.team?.name ?? "-"}</td>
                  <td className="px-4 py-3">{grant.leaveType.name}</td>
                  <td className="px-4 py-3">
                    {formatGrantAmount(grant.grantedAmount, grant.unit)}
                  </td>
                  <td className="px-4 py-3">
                    {formatGrantAmount(grant.usedAmount, grant.unit)}
                  </td>
                  <td className="px-4 py-3">
                    {formatGrantAmount(grant.pendingAmount, grant.unit)}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {formatGrantAmount(grant.remainingAmount, grant.unit)}
                  </td>
                  <td className="px-4 py-3">
                    {formatDate(grant.effectiveFrom)} ~ {formatDate(grant.expiresAt)}
                  </td>
                  <td className="px-4 py-3">{statusLabels[grant.status]}</td>
                  <td className="px-4 py-3">{grant.grantedByUser.name}</td>
                  <td className="px-4 py-3">{dateToDateOnly(grant.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/leaves/grants/${grant.id}`}
                      className="font-medium underline"
                    >
                      상세
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {grant.status === "ACTIVE" ? (
                      <form action={revokeLeaveGrant} className="grid min-w-56 gap-2">
                        <input name="grantId" type="hidden" value={grant.id} />
                        <input
                          name="revokeReason"
                          placeholder="회수 사유"
                          className="h-9 rounded-md border border-neutral-300 px-2"
                          required
                        />
                        <button className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700">
                          회수
                        </button>
                      </form>
                    ) : (
                      "-"
                    )}
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
