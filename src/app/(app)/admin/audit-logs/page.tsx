import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getPrisma } from "@/lib/db/prisma";
import {
  auditActionLabel,
  leaveRequestStatusLabel,
  leaveTypeLabel,
} from "@/lib/display/labels";
import { formatDateTime } from "@/lib/display/format";
import { redactAuditValue, stringifyRedactedAuditValue } from "@/lib/audit/redact";
import { requireOwner } from "@/lib/rbac/server-guards";
import type { AuditAction } from "@/generated/prisma/enums";
import { AuditAction as AuditActionEnum } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

type AuditLogsPageProps = {
  searchParams: Promise<{
    action?: string;
    actorId?: string;
    targetUserId?: string;
    startDate?: string;
    endDate?: string;
    q?: string;
    detailId?: string;
  }>;
};

function getMetadataObject(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

function getStringMetadata(metadata: unknown, key: string) {
  const value = getMetadataObject(metadata)[key];

  return typeof value === "string" ? value : null;
}

function isAuditAction(value: string | undefined): value is AuditAction {
  return Boolean(value && Object.values(AuditActionEnum).includes(value as AuditAction));
}

function buildDetailHref(params: Record<string, string | undefined>, detailId: string) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  search.set("detailId", detailId);

  return `/admin/audit-logs?${search.toString()}`;
}

export default async function AuditLogsPage({ searchParams }: AuditLogsPageProps) {
  await requireOwner();
  const filters = await searchParams;
  const prisma = getPrisma();
  const where = {
    ...(isAuditAction(filters.action) ? { action: filters.action } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.targetUserId ? { targetUserId: filters.targetUserId } : {}),
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
  const [rawLogs, users, teams, leaveRequests] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.team.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.leaveRequest.findMany({
      select: { id: true, user: { select: { name: true } }, type: true, status: true },
      take: 300,
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const userMap = new Map(users.map((user) => [user.id, user]));
  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const leaveRequestMap = new Map(leaveRequests.map((request) => [request.id, request]));
  const keyword = filters.q?.trim().toLowerCase();
  const logs = keyword
    ? rawLogs.filter((log) => {
        const metadata = stringifyRedactedAuditValue(log.metadata);
        const actorName = log.actor?.name ?? "";
        const targetUserName = log.targetUserId
          ? (userMap.get(log.targetUserId)?.name ?? "")
          : "";

        return `${auditActionLabel(log.action)} ${actorName} ${targetUserName} ${metadata}`
          .toLowerCase()
          .includes(keyword);
      })
    : rawLogs;
  const selectedLog = filters.detailId
    ? logs.find((log) => log.id === filters.detailId)
    : null;

  return (
    <section>
      <PageHeader
        eyebrow="관리자"
        title="감사 로그"
        description="권한 변경, 초대, 조직, 휴가 정책 및 휴가 승인 이력을 조회합니다."
      />

      <form className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm md:grid-cols-6">
        <select
          name="action"
          defaultValue={filters.action ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">action 전체</option>
          {Object.values(AuditActionEnum).map((action) => (
            <option key={action} value={action}>
              {auditActionLabel(action)}
            </option>
          ))}
        </select>
        <select
          name="actorId"
          defaultValue={filters.actorId ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">actor 전체</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.email})
            </option>
          ))}
        </select>
        <select
          name="targetUserId"
          defaultValue={filters.targetUserId ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">targetUser 전체</option>
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
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <input
          name="endDate"
          type="date"
          defaultValue={filters.endDate ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <input
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="키워드 검색"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white md:col-span-6">
          필터 적용
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        {logs.length === 0 ? (
          <div className="p-4">
            <EmptyState title="감사 로그가 없습니다." />
          </div>
        ) : (
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-3">발생일시</th>
                <th className="px-4 py-3">actor</th>
                <th className="px-4 py-3">action</th>
                <th className="px-4 py-3">targetUser</th>
                <th className="px-4 py-3">targetTeam</th>
                <th className="px-4 py-3">targetLeaveRequest</th>
                <th className="px-4 py-3">요약</th>
                <th className="px-4 py-3">상세</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {logs.map((log) => {
                const targetTeamId =
                  log.targetType === "TEAM"
                    ? log.targetId
                    : getStringMetadata(log.metadata, "targetTeamId");
                const leaveRequestId =
                  log.targetType === "LEAVE_REQUEST"
                    ? log.targetId
                    : getStringMetadata(log.metadata, "leaveRequestId");
                const targetUser = log.targetUserId
                  ? userMap.get(log.targetUserId)
                  : null;
                const team = targetTeamId ? teamMap.get(targetTeamId) : null;
                const leaveRequest = leaveRequestId
                  ? leaveRequestMap.get(leaveRequestId)
                  : null;

                return (
                  <tr key={log.id} className="align-top">
                    <td className="px-4 py-3">{formatDateTime(log.createdAt)}</td>
                    <td className="px-4 py-3">{log.actor?.name ?? "-"}</td>
                    <td className="px-4 py-3 font-medium">
                      {auditActionLabel(log.action)}
                    </td>
                    <td className="px-4 py-3">
                      {targetUser ? `${targetUser.name} (${targetUser.email})` : "-"}
                    </td>
                    <td className="px-4 py-3">{team?.name ?? targetTeamId ?? "-"}</td>
                    <td className="px-4 py-3">
                      {leaveRequest
                        ? `${leaveRequest.user.name} · ${leaveTypeLabel(leaveRequest.type)} · ${leaveRequestStatusLabel(leaveRequest.status)}`
                        : leaveRequestId ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      {buildAuditSummary(log.metadata)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={buildDetailHref(filters, log.id)}
                        className="font-medium underline"
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
        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">감사 로그 상세</h2>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <Detail label="action" value={auditActionLabel(selectedLog.action)} />
            <Detail label="actorUserId" value={selectedLog.actorUserId ?? "-"} />
            <Detail label="targetUserId" value={selectedLog.targetUserId ?? "-"} />
            <Detail label="createdAt" value={formatDateTime(selectedLog.createdAt)} />
          </dl>
          <pre className="mt-4 max-h-[520px] overflow-auto rounded-md bg-neutral-950 p-4 text-xs leading-5 text-neutral-50">
            {stringifyRedactedAuditValue(redactAuditValue(selectedLog.metadata))}
          </pre>
          <p className="mt-3 text-xs text-neutral-500">
            TODO: 기존 metadata에 민감정보가 남아 있다면 데이터 정리 migration을
            별도로 수행해야 합니다.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function buildAuditSummary(metadata: unknown) {
  const safe = redactAuditValue(metadata);

  if (!safe || typeof safe !== "object") {
    return "-";
  }

  const record = safe as Record<string, unknown>;
  const changedFields = Array.isArray(record.changedFields)
    ? record.changedFields.join(", ")
    : null;
  const beforeStatus = typeof record.beforeStatus === "string" ? record.beforeStatus : null;
  const afterStatus = typeof record.afterStatus === "string" ? record.afterStatus : null;

  if (beforeStatus || afterStatus) {
    return `${beforeStatus ?? "-"} -> ${afterStatus ?? "-"}`;
  }

  if (changedFields) {
    return `변경 필드: ${changedFields}`;
  }

  return Object.keys(record).slice(0, 3).join(", ") || "-";
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="mt-1 break-all font-medium">{value}</dd>
    </div>
  );
}
