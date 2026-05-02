import Link from "next/link";

import { getPrisma } from "@/lib/db/prisma";
import { dateToDateOnly } from "@/lib/leave/calculate-business-days";
import { formatLeaveDays } from "@/lib/leave/labels";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type HistoryPageProps = {
  searchParams: Promise<{
    q?: string;
    eventType?: string;
    year?: string;
  }>;
};

const EVENT_LABELS: Record<string, string> = {
  GRANTED: "부여",
  PENDING: "승인 대기 차감",
  PENDING_RELEASED: "대기 차감 해제",
  USED: "사용 확정",
  USED_RESTORED: "사용 복구",
  EXPIRED: "소멸",
  ADJUSTED: "조정",
  CANCELLED: "승인 취소",
  REJECTED: "반려",
  WITHDRAWN: "철회",
  CARRIED_OVER: "이월",
  REVOKED: "회수",
};

export default async function LeaveHistoryPage({ searchParams }: HistoryPageProps) {
  await requireOwner();
  const filters = await searchParams;
  const year = filters.year ? Number(filters.year) : undefined;
  const prisma = getPrisma();
  const ledgers = await prisma.leaveLedger.findMany({
    where: {
      ...(filters.eventType ? { eventType: filters.eventType as never } : {}),
      ...(Number.isInteger(year) ? { referenceYear: year } : {}),
      ...(filters.q
        ? {
            user: {
              OR: [
                { name: { contains: filters.q, mode: "insensitive" } },
                { email: { contains: filters.q, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    include: {
      user: { include: { team: true } },
      leaveType: true,
      leaveRequest: true,
      leaveGrant: true,
      leaveAdjustment: true,
      createdByUser: true,
    },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <section>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">휴가 관리</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            휴가 장부 이력
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            직원별 휴가 부여, 대기, 사용, 반려, 철회, 취소, 회수 기록을 장부 기준으로 확인합니다.
          </p>
        </div>
        <Link
          href="/admin/leaves/balances"
          className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
        >
          직원별 휴가 현황
        </Link>
      </div>

      <form className="mt-6 grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        <input
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="직원 이름 또는 이메일"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <select
          name="eventType"
          defaultValue={filters.eventType ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">이벤트 전체</option>
          {Object.entries(EVENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          name="year"
          type="number"
          defaultValue={filters.year ?? ""}
          placeholder="기준 연도"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
          조회
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[1100px] table-auto text-left text-sm [&_td]:break-keep [&_th]:break-keep [&_th]:whitespace-nowrap">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">발생일</th>
              <th className="px-4 py-3">직원</th>
              <th className="px-4 py-3">팀</th>
              <th className="px-4 py-3">휴가 유형</th>
              <th className="px-4 py-3">이벤트</th>
              <th className="px-4 py-3">수량</th>
              <th className="px-4 py-3">기준 연도</th>
              <th className="px-4 py-3">사유</th>
              <th className="px-4 py-3">생성자</th>
              <th className="px-4 py-3">생성일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {ledgers.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={10}>
                  휴가 장부 이력이 없습니다.
                </td>
              </tr>
            ) : (
              ledgers.map((ledger) => (
                <tr key={ledger.id}>
                  <td className="px-4 py-3">{dateToDateOnly(ledger.effectiveDate)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{ledger.user.name}</p>
                    <p className="text-xs text-neutral-500">{ledger.user.email}</p>
                  </td>
                  <td className="px-4 py-3">{ledger.user.team?.name ?? "-"}</td>
                  <td className="px-4 py-3">
                    {ledger.leaveType?.name ?? legacyLeaveLabel(ledger.metadata)}
                  </td>
                  <td className="px-4 py-3">
                    {EVENT_LABELS[ledger.eventType] ?? ledger.eventType}
                  </td>
                  <td className="px-4 py-3">{formatLeaveDays(ledger.amount)}</td>
                  <td className="px-4 py-3">{ledger.referenceYear ?? "-"}</td>
                  <td className="px-4 py-3">{ledger.reason ?? "-"}</td>
                  <td className="px-4 py-3">{ledger.createdByUser?.name ?? "-"}</td>
                  <td className="px-4 py-3">{dateToDateOnly(ledger.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function legacyLeaveLabel(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return "연차/기본 휴가";
  }

  const leaveType = (metadata as Record<string, unknown>).leaveType;

  if (leaveType === "ANNUAL") return "연차";
  if (leaveType === "HALF_DAY") return "반차";
  if (leaveType === "RESERVE_FORCES") return "예비군";
  if (leaveType === "SICK") return "병가";
  if (leaveType === "BEREAVEMENT") return "경조사";

  return "연차/기본 휴가";
}
