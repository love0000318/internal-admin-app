import Link from "next/link";

import { Badge, buttonClassName, Card } from "@/components/design-system/primitives";
import { RoleLabel } from "@/components/ui/status-badge";
import { getPrisma } from "@/lib/db/prisma";
import { formatLeaveDays } from "@/lib/display/format";
import { listPendingLeaveApprovals } from "@/lib/leave/approval-queries";
import { todayInSeoul } from "@/lib/leave/calculate-business-days";
import { getUserLeaveBalance } from "@/lib/leave/queries";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

const quickCards = [
  {
    title: "휴가 요청",
    description: "연차, 반차, 지급 휴가를 신청합니다.",
    href: "/leaves/me/requests/new",
  },
  {
    title: "내 휴가 현황",
    description: "잔여, 대기, 사용 내역을 확인합니다.",
    href: "/leaves/me",
  },
  {
    title: "휴가 캘린더",
    description: "팀 휴가 일정을 공개 범위에 맞게 확인합니다.",
    href: "/leaves/calendar",
  },
  {
    title: "알림센터",
    description: "읽지 않은 알림과 처리할 일을 확인합니다.",
    href: "/notifications",
  },
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
  ] = await Promise.all([
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
    <section className="min-w-0 space-y-6">
      <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-white to-blue-50 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-700">대시보드</p>
            <h1 className="mt-2 break-keep text-2xl font-bold tracking-normal text-slate-950 sm:text-3xl">
              {user.name}님, 오늘도 차분하게 운영해 볼까요.
            </h1>
            <p className="mt-2 break-keep text-sm leading-relaxed text-slate-600">
              휴가, 승인, 알림, 조직 운영 현황을 한눈에 확인합니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RoleLabel role={user.role} />
            <Badge tone="primary">{dbUser?.team?.name ?? "팀 미지정"}</Badge>
          </div>
        </div>
      </div>

      <dl className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm sm:grid-cols-4">
        <div>
          <dt className="text-slate-500">사용자</dt>
          <dd className="mt-1 font-semibold text-slate-950">{user.name}</dd>
        </div>
        <div>
          <dt className="text-slate-500">직책</dt>
          <dd className="mt-1 font-semibold text-slate-950">
            {user.title ?? dbUser?.title ?? dbUser?.profile?.jobTitle ?? "미설정"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">역할</dt>
          <dd className="mt-1">
            <RoleLabel role={user.role} />
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">소속 팀</dt>
          <dd className="mt-1 font-semibold text-slate-950">
            {dbUser?.team?.name ?? "미설정"}
          </dd>
        </div>
      </dl>

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard
          label="내 휴가 잔여"
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
            label="승인 대기 휴가"
            value={`${pendingApprovalRequests.length}건`}
            href="/leaves/approvals"
          />
        ) : null}
      </div>

      {user.role === "OWNER" || user.role === "LEAD" ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {user.role === "OWNER" ? (
            <Link
              href="/organization"
              className={buttonClassName({ tone: "neutral", className: "w-full sm:w-auto" })}
            >
              조직 관리 바로가기
            </Link>
          ) : null}
          <Link
            href="/leaves/approvals"
            className={buttonClassName({ className: "w-full sm:w-auto" })}
          >
            휴가 승인 요청
          </Link>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {quickCards.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card className="min-h-32 transition hover:border-blue-200 hover:shadow-md">
              <p className="break-keep text-base font-semibold text-slate-950">
                {card.title}
              </p>
              <p className="mt-3 break-keep text-sm leading-relaxed text-slate-500">
                {card.description}
              </p>
            </Card>
          </Link>
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
    <Link href={href}>
      <Card className="transition hover:border-blue-200 hover:shadow-md">
        <p className="break-keep text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
      </Card>
    </Link>
  );
}
