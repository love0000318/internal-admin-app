import Link from "next/link";

import { verifyReportExportStepUp } from "@/app/(app)/admin/reports/actions";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { stringifyRedactedAuditValue } from "@/lib/audit/redact";
import { formatDateTime } from "@/lib/display/format";
import { getPrisma } from "@/lib/db/prisma";
import { requireOwner } from "@/lib/rbac/server-guards";
import type { Prisma } from "@/generated/prisma/client";
import {
  AuditAction as AuditActionEnum,
  AuditCategory as AuditCategoryEnum,
  AuditSeverity as AuditSeverityEnum,
} from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

type AuditLogsPageProps = {
  searchParams: Promise<{
    action?: string;
    actorId?: string;
    targetUserId?: string;
    category?: string;
    severity?: string;
    entityType?: string;
    entityId?: string;
    highRiskOnly?: string;
    startDate?: string;
    endDate?: string;
    q?: string;
    detailId?: string;
    error?: string;
    success?: string;
  }>;
};

function isAuditAction(value: string | undefined): value is keyof typeof AuditActionEnum {
  return Boolean(value && Object.values(AuditActionEnum).includes(value as never));
}

function isAuditCategory(value: string | undefined): value is keyof typeof AuditCategoryEnum {
  return Boolean(value && Object.values(AuditCategoryEnum).includes(value as never));
}

function isAuditSeverity(value: string | undefined): value is keyof typeof AuditSeverityEnum {
  return Boolean(value && Object.values(AuditSeverityEnum).includes(value as never));
}

function buildHref(path: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function buildExportHref(params: Record<string, string | undefined>) {
  return buildHref("/admin/audit-logs/export", params);
}

function severityClassName(severity: string) {
  if (severity === "CRITICAL") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (severity === "HIGH") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (severity === "WARNING") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default async function AuditLogsPage({ searchParams }: AuditLogsPageProps) {
  await requireOwner();
  const filters = await searchParams;
  const prisma = getPrisma();
  const highRiskOnly = filters.highRiskOnly === "1";
  const where: Prisma.AuditLogWhereInput = {
    ...(isAuditAction(filters.action) ? { action: filters.action } : {}),
    ...(isAuditCategory(filters.category) ? { category: filters.category } : {}),
    ...(isAuditSeverity(filters.severity) ? { severity: filters.severity } : {}),
    ...(highRiskOnly ? { severity: { in: ["HIGH", "CRITICAL"] } } : {}),
    ...(filters.actorId ? { actorUserId: filters.actorId } : {}),
    ...(filters.targetUserId ? { targetUserId: filters.targetUserId } : {}),
    ...(filters.entityType ? { targetType: filters.entityType as never } : {}),
    ...(filters.entityId ? { targetId: filters.entityId } : {}),
    ...(filters.startDate || filters.endDate
      ? {
          createdAt: {
            ...(filters.startDate
              ? { gte: new Date(`${filters.startDate}T00:00:00.000+09:00`) }
              : {}),
            ...(filters.endDate
              ? { lte: new Date(`${filters.endDate}T23:59:59.999+09:00`) }
              : {}),
          },
        }
      : {}),
  };
  const [rawLogs, users] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const userMap = new Map(users.map((user) => [user.id, user]));
  const keyword = filters.q?.trim().toLowerCase();
  const logs = keyword
    ? rawLogs.filter((log) => {
        const actor = log.actorUserId ? userMap.get(log.actorUserId)?.name : log.actor?.name;
        const target = log.targetUserId ? userMap.get(log.targetUserId)?.name : "";
        const metadata = stringifyRedactedAuditValue(log.metadata);

        return `${log.action} ${log.category} ${log.severity} ${actor ?? ""} ${target ?? ""} ${metadata}`
          .toLowerCase()
          .includes(keyword);
      })
    : rawLogs;
  const selectedLog = filters.detailId
    ? logs.find((log) => log.id === filters.detailId)
    : null;
  const currentFilterHref = buildHref("/admin/audit-logs", filters);
  const exportHref = buildExportHref(filters);

  return (
    <section className="min-w-0">
      <PageHeader
        eyebrow="보안 감사"
        title="AuditLog"
        description="권한 변경, 초대, 로그인, 리포트 export 같은 보안 이벤트를 OWNER가 검토합니다."
      />

      {filters.error === "step-up-required" ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed break-keep text-amber-800">
          CSV export 전에 비밀번호 재인증이 필요합니다.
        </div>
      ) : null}
      {filters.success === "step-up-verified" ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-relaxed break-keep text-emerald-800">
          재인증이 완료되었습니다. 제한 시간 안에 export를 실행하세요.
        </div>
      ) : null}

      <form className="mt-6 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-4">
        <select
          name="category"
          defaultValue={filters.category ?? ""}
          className="h-11 w-full min-w-0 rounded-md border border-slate-300 px-3 text-sm"
        >
          <option value="">전체 카테고리</option>
          {Object.values(AuditCategoryEnum).map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <select
          name="severity"
          defaultValue={filters.severity ?? ""}
          className="h-11 w-full min-w-0 rounded-md border border-slate-300 px-3 text-sm"
        >
          <option value="">전체 심각도</option>
          {Object.values(AuditSeverityEnum).map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>
        <select
          name="action"
          defaultValue={filters.action ?? ""}
          className="h-11 w-full min-w-0 rounded-md border border-slate-300 px-3 text-sm"
        >
          <option value="">전체 액션</option>
          {Object.values(AuditActionEnum).map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </select>
        <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm break-keep">
          <input name="highRiskOnly" value="1" type="checkbox" defaultChecked={highRiskOnly} />
          고위험만 보기
        </label>
        <select
          name="actorId"
          defaultValue={filters.actorId ?? ""}
          className="h-11 w-full min-w-0 rounded-md border border-slate-300 px-3 text-sm"
        >
          <option value="">전체 수행자</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.email})
            </option>
          ))}
        </select>
        <select
          name="targetUserId"
          defaultValue={filters.targetUserId ?? ""}
          className="h-11 w-full min-w-0 rounded-md border border-slate-300 px-3 text-sm"
        >
          <option value="">전체 대상자</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.email})
            </option>
          ))}
        </select>
        <input
          name="startDate"
          type="date"
          defaultValue={filters.startDate ?? ""}
          className="h-11 w-full min-w-0 rounded-md border border-slate-300 px-3 text-sm"
        />
        <input
          name="endDate"
          type="date"
          defaultValue={filters.endDate ?? ""}
          className="h-11 w-full min-w-0 rounded-md border border-slate-300 px-3 text-sm"
        />
        <input
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="키워드 검색"
          className="h-11 w-full min-w-0 rounded-md border border-slate-300 px-3 text-sm xl:col-span-2"
        />
        <button className="min-h-11 w-full whitespace-nowrap break-keep rounded-md bg-slate-950 px-4 text-sm font-medium text-white xl:col-span-2">
          필터 적용
        </button>
      </form>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <form
          action={verifyReportExportStepUp}
          className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]"
        >
          <input type="hidden" name="returnTo" value={currentFilterHref} />
          <input
            name="stepUpPassword"
            type="password"
            required
            placeholder="CSV export 전 현재 비밀번호 재입력"
            className="h-11 w-full min-w-0 rounded-md border border-amber-200 bg-white px-3 text-sm"
          />
          <button className="min-h-11 w-full whitespace-nowrap break-keep rounded-md bg-amber-700 px-4 text-sm font-semibold text-white md:w-auto">
            Export 재인증
          </button>
          <Link
            href={exportHref}
            className="inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap break-keep rounded-md border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-800 md:w-auto"
          >
            CSV export
          </Link>
        </form>
        <p className="mt-2 text-xs leading-relaxed break-keep text-amber-800">
          AuditLog export는 OWNER 권한과 Step-up 재인증이 필요합니다.
          metadata는 sanitize된 요약만 포함합니다.
        </p>
      </div>

      <div className="mt-6 grid gap-3 md:hidden">
        {logs.length === 0 ? (
          <EmptyState title="AuditLog가 없습니다." />
        ) : (
          logs.map((log) => {
            const actor = log.actorUserId ? userMap.get(log.actorUserId) : log.actor;
            const targetUser = log.targetUserId ? userMap.get(log.targetUserId) : null;

            return (
              <article
                key={log.id}
                className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${severityClassName(log.severity)}`}
                  >
                    {log.severity}
                  </span>
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                    {log.category}
                  </span>
                </div>
                <h2 className="mt-3 break-words text-sm font-semibold text-slate-950">
                  {log.action}
                </h2>
                <dl className="mt-3 grid gap-2 text-sm">
                  <Detail label="발생 시각" value={formatDateTime(log.createdAt)} />
                  <Detail label="수행자" value={actor?.name ?? "-"} />
                  <Detail label="대상자" value={targetUser?.name ?? "-"} />
                  <Detail label="엔티티" value={`${log.targetType}:${log.targetId ?? "-"}`} />
                  <Detail label="요약" value={buildAuditSummary(log.metadata)} />
                </dl>
                <Link
                  href={buildHref("/admin/audit-logs", { ...filters, detailId: log.id })}
                  className="mt-4 inline-flex min-h-10 w-full items-center justify-center whitespace-nowrap break-keep rounded-md border border-slate-300 px-4 text-sm font-medium"
                >
                  상세 보기
                </Link>
              </article>
            );
          })
        )}
      </div>

      <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
        {logs.length === 0 ? (
          <div className="p-4">
            <EmptyState title="AuditLog가 없습니다." />
          </div>
        ) : (
          <table className="w-full min-w-[1100px] table-auto text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {[
                  "발생 시각",
                  "심각도",
                  "카테고리",
                  "액션",
                  "수행자",
                  "대상자",
                  "엔티티",
                  "요약",
                  "상세",
                ].map((heading) => (
                  <th key={heading} className="whitespace-nowrap break-keep px-4 py-3">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => {
                const actor = log.actorUserId ? userMap.get(log.actorUserId) : log.actor;
                const targetUser = log.targetUserId ? userMap.get(log.targetUserId) : null;

                return (
                  <tr key={log.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${severityClassName(log.severity)}`}
                      >
                        {log.severity}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{log.category}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      {log.action}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{actor?.name ?? "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {targetUser?.name ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {log.targetType}:{log.targetId ?? "-"}
                    </td>
                    <td className="max-w-[260px] truncate px-4 py-3">
                      {buildAuditSummary(log.metadata)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={buildHref("/admin/audit-logs", {
                          ...filters,
                          detailId: log.id,
                        })}
                        className="font-medium text-blue-700 underline"
                      >
                        상세
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedLog ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold break-keep">AuditLog 상세</h2>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <Detail label="action" value={selectedLog.action} />
            <Detail label="category" value={selectedLog.category} />
            <Detail label="severity" value={selectedLog.severity} />
            <Detail label="createdAt" value={formatDateTime(selectedLog.createdAt)} />
            <Detail label="actorUserId" value={selectedLog.actorUserId ?? "-"} />
            <Detail label="targetUserId" value={selectedLog.targetUserId ?? "-"} />
          </dl>
          <pre className="mt-4 max-h-[520px] overflow-auto rounded-md bg-slate-950 p-4 text-xs leading-5 text-slate-50">
            {stringifyRedactedAuditValue(selectedLog.metadata)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

function buildAuditSummary(metadata: unknown) {
  const text = stringifyRedactedAuditValue(metadata);

  if (!text || text === "null") {
    return "-";
  }

  return text.replace(/\s+/g, " ").slice(0, 140);
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 md:block">
      <dt className="shrink-0 whitespace-nowrap break-keep text-slate-500">
        {label}
      </dt>
      <dd className="min-w-0 text-right break-words font-medium md:mt-1 md:text-left">
        {value}
      </dd>
    </div>
  );
}
