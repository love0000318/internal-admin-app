import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge, Card, buttonClassName } from "@/components/design-system/primitives";
import { MobileCardList, ResponsiveTable } from "@/components/design-system/responsive";
import { PageHeader } from "@/components/ui/page-header";
import { getPrisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/rbac/server-guards";
import { assertCanViewUserLeaveBalance } from "@/lib/leave/balance-scope";
import { dateToDateOnly, todayInSeoul } from "@/lib/leave/calculate-business-days";
import { listUserActiveLeaveGrants } from "@/lib/leave/grants";
import { formatLeaveDays } from "@/lib/leave/labels";
import { listUserLeaveLedger } from "@/lib/leave/ledger";
import { getUserLeaveBalance } from "@/lib/leave/queries";
import { toNumber } from "@/lib/leave/balance";

export const dynamic = "force-dynamic";

type BalanceDetailPageProps = {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ year?: string }>;
};

const requestStatusLabels: Record<string, string> = {
  PENDING: "승인 대기",
  APPROVED: "사용 완료",
  REJECTED: "반려",
  CANCELLED: "취소",
  WITHDRAWN: "철회",
};

const ledgerEventLabels: Record<string, string> = {
  GRANTED: "부여",
  PENDING: "승인 대기",
  PENDING_RELEASED: "대기 해제",
  USED: "사용",
  USED_RESTORED: "사용 복구",
  EXPIRED: "소멸",
  ADJUSTED: "조정",
  CANCELLED: "취소",
  REJECTED: "반려",
  WITHDRAWN: "철회",
  CARRIED_OVER: "이월",
  REVOKED: "회수",
};

function getYear(value: string | undefined) {
  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : Number(todayInSeoul().slice(0, 4));
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 whitespace-nowrap break-keep text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-keep text-slate-900">{value}</dd>
    </div>
  );
}

function grantUnitLabel(unit: string) {
  if (unit === "HOUR") return "시간";
  if (unit === "MINUTE") return "분";
  return "일";
}

function statusTone(status: string) {
  if (status === "APPROVED") return "success" as const;
  if (status === "PENDING") return "warning" as const;
  if (status === "REJECTED") return "danger" as const;
  return "default" as const;
}

export default async function LeaveBalanceDetailPage({
  params,
  searchParams,
}: BalanceDetailPageProps) {
  const actor = await requireUser();
  const { userId } = await params;
  const { year: yearParam } = await searchParams;
  const year = getYear(yearParam);

  if (actor.role === "MANAGER") {
    if (actor.id === userId) {
      redirect(`/leaves/me?year=${year}`);
    }
    redirect("/forbidden");
  }

  const prisma = getPrisma();

  try {
    await assertCanViewUserLeaveBalance(actor, userId, prisma);
  } catch {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        targetUserId: userId,
        action: "UNAUTHORIZED_ACCESS_BLOCKED",
        targetType: "LEAVE_BALANCE",
        targetId: userId,
        category: "SECURITY",
        severity: "HIGH",
        metadata: {
          route: "/admin/leaves/balances/[userId]",
          reasonCode: "LEAVE_BALANCE_DETAIL_SCOPE_DENIED",
          role: actor.role,
        },
      },
    });
    redirect("/forbidden");
  }

  const [balance, leaveRequests, activeGrants, leaveLedgers] = await Promise.all([
    getUserLeaveBalance({ userId, year, prisma }),
    prisma.leaveRequest.findMany({
      where: { userId },
      include: { customLeaveType: true },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
      take: 30,
    }),
    listUserActiveLeaveGrants(userId, prisma),
    listUserLeaveLedger({ userId, take: 40, prisma }),
  ]);

  if (!balance.user || balance.user.status !== "ACTIVE") {
    notFound();
  }

  const hireDate = balance.user.hireDate ?? balance.user.profile?.hireDate ?? null;
  const hireDateOnly = hireDate ? dateToDateOnly(hireDate) : null;
  const customRemaining = activeGrants
    .filter((grant) => grant.source !== "BIRTHDAY_AUTO" && grant.leaveType.code !== "BIRTHDAY_HALF_DAY")
    .reduce((sum, grant) => sum + grant.remainingAmount, 0);
  const birthdayRemaining = activeGrants
    .filter((grant) => grant.source === "BIRTHDAY_AUTO" || grant.leaveType.code === "BIRTHDAY_HALF_DAY")
    .reduce((sum, grant) => sum + grant.remainingAmount, 0);

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="구성원 휴가 현황"
        title={`${balance.user.name} 휴가 상세`}
        description="민감 HR 정보 없이 휴가 보유, 사용, 승인 대기, 잔여와 LeaveLedger 장부 요약을 확인합니다."
      />

      <div>
        <Link href={`/admin/leaves/balances?year=${year}`} className={buttonClassName({ tone: "neutral" })}>
          구성원 휴가 현황으로 돌아가기
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <h2 className="text-base font-semibold break-keep text-slate-950">직원 기본 정보</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <InfoRow label="이름" value={balance.user.name} />
            <InfoRow label="이메일" value={balance.user.email} />
            <InfoRow label="사번" value={balance.user.profile?.employeeNumber ?? "-"} />
            <InfoRow label="팀" value={balance.user.team?.name ?? "-"} />
            <InfoRow label="직급/직책" value={balance.user.title ?? balance.user.profile?.jobTitle ?? "-"} />
            <InfoRow label="입사일" value={hireDateOnly ?? "미입력"} />
          </dl>
        </Card>

        <Card>
          <h2 className="text-base font-semibold break-keep text-slate-950">{year}년 연차 현황</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="기본 부여" value={formatLeaveDays(balance.annualEntitled)} />
            <Metric label="조정" value={formatLeaveDays(balance.manualGranted)} />
            <Metric label="승인 대기" value={formatLeaveDays(balance.pendingDays)} />
            <Metric label="잔여" value={formatLeaveDays(balance.remainingDays)} />
          </div>
          <dl className="mt-4 grid gap-2 text-sm">
            <InfoRow label="사용 완료" value={formatLeaveDays(balance.usedDays)} />
            <InfoRow label="맞춤휴가 잔여" value={formatLeaveDays(customRemaining)} />
            <InfoRow label="생일 반차 잔여" value={formatLeaveDays(birthdayRemaining)} />
          </dl>
        </Card>
      </div>

      <Card>
        <h2 className="text-base font-semibold break-keep text-slate-950">맞춤휴가와 생일 반차</h2>
        {activeGrants.length === 0 ? (
          <p className="mt-3 text-sm break-keep text-slate-500">사용 가능한 맞춤휴가 또는 생일 반차가 없습니다.</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {activeGrants.map((grant) => (
              <div key={grant.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold break-keep text-slate-950">{grant.leaveType.name}</p>
                    <p className="mt-1 text-sm break-keep text-slate-500">{grant.reason}</p>
                  </div>
                  <Badge tone="info">
                    {grant.remainingAmount}
                    {grantUnitLabel(grant.unit)}
                  </Badge>
                </div>
                <dl className="mt-3 grid gap-2 text-sm">
                  <InfoRow label="부여" value={`${grant.grantedAmount}${grantUnitLabel(grant.unit)}`} />
                  <InfoRow label="사용 완료" value={`${grant.usedAmount}${grantUnitLabel(grant.unit)}`} />
                  <InfoRow label="승인 대기" value={`${grant.pendingAmount}${grantUnitLabel(grant.unit)}`} />
                  <InfoRow label="만료일" value={grant.expiresAt ? dateToDateOnly(grant.expiresAt) : "-"} />
                </dl>
              </div>
            ))}
          </div>
        )}
      </Card>

      <section className="space-y-3">
        <h2 className="text-base font-semibold break-keep text-slate-950">최근 휴가 요청</h2>
        <MobileCardList>
          {leaveRequests.map((request) => (
            <Card key={request.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold break-keep text-slate-950">
                    {request.customLeaveType?.name ?? request.type}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {dateToDateOnly(request.startDate)} ~ {dateToDateOnly(request.endDate)}
                  </p>
                </div>
                <Badge tone={statusTone(request.status)}>{requestStatusLabels[request.status]}</Badge>
              </div>
              <dl className="mt-3 grid gap-2 text-sm">
                <InfoRow label="일수" value={formatLeaveDays(toNumber(request.dayCount))} />
                <InfoRow label="반차" value={request.halfDayPeriod ?? "-"} />
              </dl>
            </Card>
          ))}
        </MobileCardList>
        <ResponsiveTable minWidth="900px">
          <thead className="border-b bg-slate-50 text-slate-600">
            <tr>
              <th>휴가 유형</th>
              <th>기간</th>
              <th>반차</th>
              <th>일수</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leaveRequests.map((request) => (
              <tr key={request.id}>
                <td>{request.customLeaveType?.name ?? request.type}</td>
                <td>
                  {dateToDateOnly(request.startDate)} ~ {dateToDateOnly(request.endDate)}
                </td>
                <td>{request.halfDayPeriod ?? "-"}</td>
                <td>{formatLeaveDays(toNumber(request.dayCount))}</td>
                <td>{requestStatusLabels[request.status]}</td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold break-keep text-slate-950">LeaveLedger 장부 요약</h2>
        <ResponsiveTable minWidth="960px">
          <thead className="border-b bg-slate-50 text-slate-600">
            <tr>
              <th>발생일</th>
              <th>구분</th>
              <th>휴가 유형</th>
              <th>수량</th>
              <th>사유</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leaveLedgers.map((ledger) => (
              <tr key={ledger.id}>
                <td>{dateToDateOnly(ledger.effectiveDate)}</td>
                <td>{ledgerEventLabels[ledger.eventType] ?? ledger.eventType}</td>
                <td>{ledger.leaveType?.name ?? "-"}</td>
                <td>{formatLeaveDays(ledger.amount)}</td>
                <td>{ledger.reason ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-semibold break-keep text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-slate-950">{value}</p>
    </div>
  );
}
