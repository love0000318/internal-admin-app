import Link from "next/link";

import { RoleLabel } from "@/components/ui/status-badge";
import { getPrisma } from "@/lib/db/prisma";
import { formatLeaveDays } from "@/lib/display/format";
import { listPendingLeaveApprovals } from "@/lib/leave/approval-queries";
import { getUserLeaveBalance } from "@/lib/leave/queries";
import { todayInSeoul } from "@/lib/leave/calculate-business-days";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

const dashboardCards = [
  "오늘 해야 할 업무 리스트",
  "오늘 회의 일정 리스트",
  "이번 주 해야 할 업무 리스트",
  "이번 주 회의 일정 리스트",
];

export default async function DashboardPage() {
  const user = await requireRouteAccess("/dashboard");
  const prisma = getPrisma();
  const year = Number(todayInSeoul().slice(0, 4));
  const [
    dbUser,
    balance,
    myPendingCount,
    unreadNotificationCount,
    pendingApprovalRequests,
  ] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        include: { team: true, profile: true },
      }),
      getUserLeaveBalance({ userId: user.id, year, prisma }),
      prisma.leaveRequest.count({
        where: { userId: user.id, status: "PENDING" },
      }),
      prisma.notification.count({
        where: { userId: user.id, readAt: null },
      }),
      user.role === "OWNER" || user.role === "LEAD"
        ? listPendingLeaveApprovals({
            actor: user,
            filters: { status: "PENDING" },
            prisma,
          })
        : Promise.resolve([]),
    ]);

  return (
    <section>
      <p className="text-sm font-medium text-neutral-500">MVP 진입 화면</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-normal">
        {user.name}님 대시보드
      </h1>

      <dl className="mt-4 grid gap-2 rounded-lg border border-neutral-200 bg-white p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-neutral-500">사용자 이름</dt>
          <dd className="mt-1 font-semibold text-neutral-950">{user.name}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">직급</dt>
          <dd className="mt-1 font-semibold text-neutral-950">
            {user.title ?? dbUser?.title ?? dbUser?.profile?.jobTitle ?? "미설정"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">역할</dt>
          <dd className="mt-1">
            <RoleLabel role={user.role} />
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">소속 팀</dt>
          <dd className="mt-1 font-semibold text-neutral-950">
            {dbUser?.team?.name ?? "미설정"}
          </dd>
        </div>
      </dl>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <MetricCard
          label="내 휴가 잔여 일수"
          value={formatLeaveDays(balance.remainingDays)}
          href="/leaves/me"
        />
        <MetricCard
          label="내 승인 대기 요청"
          value={`${myPendingCount}건`}
          href="/leaves/me"
        />
        <MetricCard
          label="읽지 않은 알림"
          value={`${unreadNotificationCount}건`}
          href="/notifications"
        />
        {user.role === "OWNER" || user.role === "LEAD" ? (
          <MetricCard
            label="승인 대기 중인 휴가"
            value={`${pendingApprovalRequests.length}건`}
            href="/leaves/approvals"
          />
        ) : null}
      </div>

      {user.role === "OWNER" || user.role === "LEAD" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {user.role === "OWNER" ? (
            <Link
              href="/organization"
              className="inline-flex h-10 items-center rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium"
            >
              조직 관리 바로가기
            </Link>
          ) : null}
          <Link
            href="/leaves/approvals"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium"
          >
            휴가 승인 요청 사항
          </Link>
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {dashboardCards.map((title) => (
          <div
            key={title}
            className="min-h-28 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
          >
            <p className="text-sm font-semibold text-neutral-900">{title}</p>
            <p className="mt-3 text-sm text-neutral-500">준비 중</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-300"
    >
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </Link>
  );
}
