import Link from "next/link";

import { getPrisma } from "@/lib/db/prisma";
import {
  dateToDateOnly,
  todayInSeoul,
} from "@/lib/leave/calculate-business-days";
import {
  formatLeaveDays,
  HALF_DAY_PERIOD_LABELS,
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
} from "@/lib/leave/labels";
import {
  listUserActiveLeaveGrants,
  listUserExpiredOrRevokedLeaveGrants,
} from "@/lib/leave/grants";
import { getUserLeaveBalance } from "@/lib/leave/queries";
import { listUserLeaveLedger } from "@/lib/leave/ledger";
import { toNumber } from "@/lib/leave/balance";
import { calculateTenureDays, formatTenureDays } from "@/lib/organization/tenure";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type MyLeavesPageProps = {
  searchParams: Promise<{ year?: string; error?: string; success?: string }>;
};

function getYear(value: string | undefined) {
  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : Number(todayInSeoul().slice(0, 4));
}

export default async function MyLeavesPage({ searchParams }: MyLeavesPageProps) {
  const actor = await requireRouteAccess("/leaves/me");
  const { year: yearParam, error, success } = await searchParams;
  const year = getYear(yearParam);
  const prisma = getPrisma();
  const [balance, leaveRequests, activeCustomGrants, inactiveCustomGrants, leaveLedgers] =
    await Promise.all([
    getUserLeaveBalance({ userId: actor.id, year, prisma }),
    prisma.leaveRequest.findMany({
      where: { userId: actor.id },
      include: { customLeaveType: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    listUserActiveLeaveGrants(actor.id, prisma),
    listUserExpiredOrRevokedLeaveGrants(actor.id, prisma),
    listUserLeaveLedger({ userId: actor.id, take: 20, prisma }),
  ]);
  const hireDate = balance.user.hireDate ?? balance.user.profile?.hireDate ?? null;
  const hireDateOnly = hireDate ? dateToDateOnly(hireDate) : null;

  return (
    <section>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">내 휴가</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            휴가 보유 현황 및 요청
          </h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link
            href="/leaves/me/use-plan"
            className="inline-flex h-10 w-full items-center justify-center rounded-md border border-neutral-300 px-4 text-sm font-medium sm:w-auto"
          >
            연차 사용계획
          </Link>
          <Link
            href="/leaves/me/requests/new"
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-neutral-950 px-4 text-sm font-medium text-white sm:w-auto"
          >
            새 휴가 요청하기
          </Link>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          휴가 요청을 처리할 수 없습니다. 날짜, 잔여 휴가, 중복 요청 여부를 확인해 주세요.
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          휴가 요청 상태가 저장되었습니다.
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">직원 정보</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">이름</dt>
              <dd className="font-medium">{balance.user.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">직급</dt>
              <dd>{balance.user.title ?? balance.user.profile?.jobTitle ?? "-"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">소속 팀</dt>
              <dd>{balance.user.team?.name ?? "-"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">입사일</dt>
              <dd>{hireDateOnly ?? "미입력"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-neutral-500">재직일</dt>
              <dd>{formatTenureDays(calculateTenureDays(hireDateOnly))}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">{year}년 휴가 보유 현황</h2>
            <form>
              <select
                name="year"
                defaultValue={year}
                className="h-9 rounded-md border border-neutral-300 px-2 text-sm"
              >
                {[year - 1, year, year + 1].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <button className="ml-2 h-9 rounded-md border border-neutral-300 px-3 text-sm">
                조회
              </button>
            </form>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Metric label="총 부여 휴가" value={formatLeaveDays(balance.grantedDays)} />
            <Metric label="사용 완료 휴가" value={formatLeaveDays(balance.usedDays)} />
            <Metric label="승인 대기 휴가" value={formatLeaveDays(balance.pendingDays)} />
            <Metric
              label="사용 가능 잔여"
              value={formatLeaveDays(balance.remainingDays)}
            />
          </div>
          {balance.underOneYearProratedAnnualDays > 0 ? (
            <dl className="mt-4 grid gap-2 rounded-md bg-neutral-50 px-3 py-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500">1년 미만 월차</dt>
                <dd className="font-medium">{formatLeaveDays(balance.monthlyAccruedDays)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500">회계연도 비례 연차</dt>
                <dd className="font-medium">
                  {formatLeaveDays(balance.underOneYearProratedAnnualDays)}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-base font-semibold">맞춤휴가 보유 현황</h2>
          <p className="mt-1 text-sm text-neutral-500">
            회사가 별도로 지급한 맞춤휴가입니다. 맞춤휴가 요청 기능은 다음
            단계에서 제공됩니다.
          </p>
        </div>
        {activeCustomGrants.length === 0 ? (
          <p className="mt-4 rounded-md bg-neutral-50 px-3 py-4 text-sm text-neutral-500">
            사용 가능한 맞춤휴가가 없습니다.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeCustomGrants.map((grant) => (
              <CustomGrantCard key={grant.id} grant={grant} />
            ))}
          </div>
        )}

        {inactiveCustomGrants.length > 0 ? (
          <div className="mt-6">
            <h3 className="text-sm font-semibold">만료되었거나 회수된 맞춤휴가</h3>
            <div className="mt-3 overflow-x-auto rounded-md border border-neutral-200">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-neutral-50 text-neutral-500">
                  <tr>
                    <th className="px-3 py-2">휴가명</th>
                    <th className="px-3 py-2">잔여</th>
                    <th className="px-3 py-2">기간</th>
                    <th className="px-3 py-2">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {inactiveCustomGrants.map((grant) => (
                    <tr key={grant.id}>
                      <td className="px-3 py-2">{grant.leaveType.name}</td>
                      <td className="px-3 py-2">
                        {formatGrantAmount(grant.remainingAmount, grant.unit)}
                      </td>
                      <td className="px-3 py-2">
                        {dateToDateOnly(grant.effectiveFrom)} ~{" "}
                        {grant.expiresAt ? dateToDateOnly(grant.expiresAt) : "-"}
                      </td>
                      <td className="px-3 py-2">
                        {grant.status === "ACTIVE" ? "만료됨" : "회수됨"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-100 px-4 py-3">
          <h2 className="text-base font-semibold">휴가 장부</h2>
          <p className="mt-1 text-sm text-neutral-500">
            부여, 대기, 사용, 반려, 철회, 취소 기록을 최신순으로 표시합니다.
          </p>
        </div>
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">발생일</th>
              <th className="px-4 py-3">구분</th>
              <th className="px-4 py-3">휴가 유형</th>
              <th className="px-4 py-3">수량</th>
              <th className="px-4 py-3">사유</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {leaveLedgers.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={5}>
                  휴가 장부 이력이 없습니다.
                </td>
              </tr>
            ) : (
              leaveLedgers.map((ledger) => (
                <tr key={ledger.id}>
                  <td className="px-4 py-3">{dateToDateOnly(ledger.effectiveDate)}</td>
                  <td className="px-4 py-3">{leaveLedgerEventLabel(ledger.eventType)}</td>
                  <td className="px-4 py-3">
                    {ledger.leaveType?.name ?? leaveLedgerLegacyTypeLabel(ledger.metadata)}
                  </td>
                  <td className="px-4 py-3">{formatLeaveDays(ledger.amount)}</td>
                  <td className="px-4 py-3">{ledger.reason ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">요청일</th>
              <th className="px-4 py-3">휴가 유형</th>
              <th className="px-4 py-3">시작일</th>
              <th className="px-4 py-3">종료일</th>
              <th className="px-4 py-3">반차</th>
              <th className="px-4 py-3">요청 일수</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">상세</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {leaveRequests.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={8}>
                  등록된 휴가 요청이 없습니다.
                </td>
              </tr>
            ) : (
              leaveRequests.map((request) => (
                <tr key={request.id}>
                  <td className="px-4 py-3">{dateToDateOnly(request.createdAt)}</td>
                  <td className="px-4 py-3">
                    {request.requestKind === "CUSTOM_GRANT"
                      ? request.customLeaveType?.name ?? "맞춤휴가"
                      : LEAVE_TYPE_LABELS[request.type]}
                  </td>
                  <td className="px-4 py-3">{dateToDateOnly(request.startDate)}</td>
                  <td className="px-4 py-3">{dateToDateOnly(request.endDate)}</td>
                  <td className="px-4 py-3">
                    {request.halfDayPeriod
                      ? HALF_DAY_PERIOD_LABELS[request.halfDayPeriod]
                      : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {formatLeaveDays(toNumber(request.dayCount))}
                  </td>
                  <td className="px-4 py-3">
                    {LEAVE_STATUS_LABELS[request.status]}
                    {request.approvalSource === "AUTO_START_DATE" ? " · 자동 확정" : ""}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/leaves/me/requests/${request.id}`}
                      className="font-medium underline"
                    >
                      상세 보기
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-neutral-50 p-3">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function formatGrantAmount(amount: number, unit: "DAY" | "HOUR" | "MINUTE") {
  const unitLabels = {
    DAY: "일",
    HOUR: "시간",
    MINUTE: "분",
  };

  return `${amount}${unitLabels[unit]}`;
}

function leaveLedgerEventLabel(eventType: string) {
  const labels: Record<string, string> = {
    GRANTED: "부여",
    PENDING: "승인 대기",
    PENDING_RELEASED: "대기 해제",
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

  return labels[eventType] ?? eventType;
}

function leaveLedgerLegacyTypeLabel(metadata: unknown) {
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

function CustomGrantCard({
  grant,
}: {
  grant: {
    id: string;
    leaveType: { name: string };
    remainingAmount: number;
    unit: "DAY" | "HOUR" | "MINUTE";
    effectiveFrom: Date;
    expiresAt: Date | null;
    reason: string;
  };
}) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{grant.leaveType.name}</h3>
          <p className="mt-1 text-sm text-neutral-500">{grant.reason}</p>
        </div>
        <p className="rounded-full bg-white px-3 py-1 text-sm font-semibold">
          {formatGrantAmount(grant.remainingAmount, grant.unit)}
        </p>
      </div>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">사용 가능 시작일</dt>
          <dd>{dateToDateOnly(grant.effectiveFrom)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">만료일</dt>
          <dd>{grant.expiresAt ? dateToDateOnly(grant.expiresAt) : "-"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">상태</dt>
          <dd>사용 가능</dd>
        </div>
      </dl>
      <p className="mt-4 rounded-md bg-white px-3 py-2 text-xs text-neutral-600">
        요청 기능은 다음 단계에서 제공됩니다.
      </p>
    </div>
  );
}
