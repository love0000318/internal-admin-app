import Link from "next/link";

import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime } from "@/lib/display/format";
import { getPrisma } from "@/lib/db/prisma";
import { requireOwner } from "@/lib/rbac/server-guards";
import type { AuditAction } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

const OWNER_ACTIONS: AuditAction[] = [
  "OWNER_ROLE_GRANTED",
  "OWNER_ROLE_REVOKED",
  "LAST_OWNER_PROTECTION_TRIGGERED",
];

const ROLE_CHANGE_ACTIONS: AuditAction[] = [
  "OWNER_ROLE_GRANTED",
  "OWNER_ROLE_REVOKED",
  "ROLE_CHANGED",
  "USER_ROLE_UPDATED",
  "ROLE_CHANGE_BLOCKED",
  "SELF_ROLE_CHANGE_BLOCKED",
];

const INVITATION_REISSUE_ACTIONS: AuditAction[] = [
  "INVITATION_REISSUED",
  "INVITATION_REISSUED_WITH_STEP_UP",
  "INVITATION_REISSUED_WITH_VERIFICATION_CODE",
  "INVITATION_REISSUED_WITH_SHORT_URL",
  "OWNER_INVITATION_REISSUED_WITH_VERIFICATION_CODE",
];

export default async function SecurityDashboardPage() {
  await requireOwner();
  const prisma = getPrisma();
  const now = new Date();
  const last24h = new Date(now.getTime() - DAY_MS);
  const last7d = new Date(now.getTime() - 7 * DAY_MS);
  const [
    loginFailed24h,
    loginBlocked24h,
    roleChanges7d,
    ownerEvents7d,
    invitationReissues7d,
    reportExports7d,
    attachmentDownloads7d,
    unauthorizedAccess7d,
    failedJobs7d,
    stepUpFailures7d,
    criticalEvents,
    highEvents,
    recentLoginFailures,
    recentRoleChanges,
    recentReportExports,
    recentInvitationReissues,
    recentAttachmentDownloads,
    recentJobFailures,
  ] = await Promise.all([
    prisma.auditLog.count({ where: { action: "LOGIN_FAILED", createdAt: { gte: last24h } } }),
    prisma.auditLog.count({ where: { action: "LOGIN_BLOCKED", createdAt: { gte: last24h } } }),
    prisma.auditLog.count({
      where: { action: { in: ROLE_CHANGE_ACTIONS }, createdAt: { gte: last7d } },
    }),
    prisma.auditLog.count({
      where: { action: { in: OWNER_ACTIONS }, createdAt: { gte: last7d } },
    }),
    prisma.auditLog.count({
      where: { action: { in: INVITATION_REISSUE_ACTIONS }, createdAt: { gte: last7d } },
    }),
    prisma.auditLog.count({
      where: { action: { in: ["REPORT_EXPORTED", "AUDIT_LOG_EXPORTED"] }, createdAt: { gte: last7d } },
    }),
    prisma.auditLog.count({
      where: { action: "LEAVE_ATTACHMENT_DOWNLOADED", createdAt: { gte: last7d } },
    }),
    prisma.auditLog.count({
      where: { action: "UNAUTHORIZED_ACCESS_BLOCKED", createdAt: { gte: last7d } },
    }),
    prisma.jobRun.count({
      where: { status: "FAILED", startedAt: { gte: last7d } },
    }),
    prisma.auditLog.count({
      where: { action: "STEP_UP_VERIFICATION_FAILED", createdAt: { gte: last7d } },
    }),
    prisma.auditLog.findMany({
      where: { severity: "CRITICAL" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.auditLog.findMany({
      where: { severity: "HIGH" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.auditLog.findMany({
      where: { action: { in: ["LOGIN_FAILED", "LOGIN_BLOCKED"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.auditLog.findMany({
      where: { action: { in: ROLE_CHANGE_ACTIONS } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.auditLog.findMany({
      where: { action: { in: ["REPORT_EXPORTED", "AUDIT_LOG_EXPORTED"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.auditLog.findMany({
      where: { action: { in: INVITATION_REISSUE_ACTIONS } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.auditLog.findMany({
      where: { action: "LEAVE_ATTACHMENT_DOWNLOADED" },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.jobRun.findMany({
      where: { status: "FAILED" },
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <section>
      <PageHeader
        eyebrow="OWNER 전용"
        title="보안 대시보드"
        description="고위험 AuditLog, 로그인 차단, 권한 변경, export, 실패한 Job을 빠르게 점검합니다."
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="24시간 로그인 실패" value={loginFailed24h} tone="warning" />
        <Metric label="24시간 로그인 차단" value={loginBlocked24h} tone="danger" />
        <Metric label="7일 권한 변경" value={roleChanges7d} tone="danger" />
        <Metric label="7일 OWNER 이벤트" value={ownerEvents7d} tone="danger" />
        <Metric label="7일 초대 재발급" value={invitationReissues7d} tone="warning" />
        <Metric label="7일 CSV export" value={reportExports7d} tone="warning" />
        <Metric label="7일 첨부 다운로드" value={attachmentDownloads7d} tone="warning" />
        <Metric label="7일 비인가 접근" value={unauthorizedAccess7d} tone="danger" />
        <Metric label="7일 실패 Job" value={failedJobs7d} tone="danger" />
        <Metric label="7일 Step-up 실패" value={stepUpFailures7d} tone="warning" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <AuditList title="최근 CRITICAL 이벤트" logs={criticalEvents} />
        <AuditList title="최근 HIGH 이벤트" logs={highEvents} />
        <AuditList title="최근 로그인 실패/차단" logs={recentLoginFailures} />
        <AuditList title="최근 권한 변경" logs={recentRoleChanges} />
        <AuditList title="최근 리포트 export" logs={recentReportExports} />
        <AuditList title="최근 초대 재발급" logs={recentInvitationReissues} />
        <AuditList title="최근 첨부 다운로드" logs={recentAttachmentDownloads} />
        <JobList title="최근 실패 Job" jobs={recentJobFailures} />
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p className="break-keep leading-relaxed">
          보안 대시보드는 앱 내부 이벤트를 빠르게 보는 화면입니다. production DB, Vercel 환경변수,
          GitHub 배포 권한을 가진 내부자의 모든 행위는 앱 코드만으로 완전히 차단할 수 없으므로,
          인프라 접근권한 통제와 정기 감사도 함께 운영해야 합니다.
        </p>
        <Link href="/admin/audit-logs?highRiskOnly=1" className="mt-3 inline-flex font-semibold text-blue-700 underline">
          고위험 AuditLog 전체 보기
        </Link>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "warning" | "danger";
}) {
  const className =
    tone === "danger"
      ? "border-red-100 bg-red-50 text-red-800"
      : "border-amber-100 bg-amber-50 text-amber-800";

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${className}`}>
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  );
}

function AuditList({
  title,
  logs,
}: {
  title: string;
  logs: Array<{
    id: string;
    action: string;
    severity: string;
    category: string;
    createdAt: Date;
  }>;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-950">{title}</h2>
      <div className="mt-3 divide-y divide-slate-100">
        {logs.length === 0 ? (
          <p className="py-3 text-sm text-slate-500">최근 이벤트가 없습니다.</p>
        ) : (
          logs.map((log) => (
            <Link
              key={log.id}
              href={`/admin/audit-logs?detailId=${log.id}`}
              className="block py-3 text-sm hover:bg-slate-50"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                  {log.severity}
                </span>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                  {log.category}
                </span>
              </div>
              <div className="mt-2 font-medium text-slate-950">{log.action}</div>
              <div className="mt-1 text-xs text-slate-500">{formatDateTime(log.createdAt)}</div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

function JobList({
  title,
  jobs,
}: {
  title: string;
  jobs: Array<{
    id: string;
    jobName: string;
    status: string;
    startedAt: Date;
  }>;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-slate-950">{title}</h2>
      <div className="mt-3 divide-y divide-slate-100">
        {jobs.length === 0 ? (
          <p className="py-3 text-sm text-slate-500">최근 실패 Job이 없습니다.</p>
        ) : (
          jobs.map((job) => (
            <Link
              key={job.id}
              href={`/admin/jobs/${job.id}`}
              className="block py-3 text-sm hover:bg-slate-50"
            >
              <div className="font-medium text-slate-950">{job.jobName}</div>
              <div className="mt-1 text-xs text-slate-500">
                {job.status} · {formatDateTime(job.startedAt)}
              </div>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
