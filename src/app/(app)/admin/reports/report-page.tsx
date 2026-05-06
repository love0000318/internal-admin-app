import Link from "next/link";

import { verifyReportExportStepUp } from "@/app/(app)/admin/reports/actions";
import { getPrisma } from "@/lib/db/prisma";
import { listReportRows, type ReportFilters } from "@/lib/reports/data";
import {
  getReportDefinition,
  sanitizeReportRows,
  type ReportType,
} from "@/lib/reports/definitions";
import { getReportScope } from "@/lib/reports/permissions";
import { requireOwnerOrLead } from "@/lib/rbac/server-guards";

type ReportPageProps = {
  reportType: ReportType;
  searchParams: Promise<ReportFilters>;
};

export async function AdminReportPage({ reportType, searchParams }: ReportPageProps) {
  const actor = await requireOwnerOrLead();
  const filters = await searchParams;
  const scope = await getReportScope(actor);
  const definition = getReportDefinition(reportType);
  const [rows, teams, users, leaveTypes] = await Promise.all([
    listReportRows(reportType, filters, { limit: 100, scope }),
    getPrisma().team.findMany({
      where: {
        status: "ACTIVE",
        ...(scope.scope === "MANAGED_TEAMS" ? { id: { in: scope.teamIds } } : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getPrisma().user.findMany({
      where: {
        status: "ACTIVE",
        role: { not: "EXTERNAL_PARTNER" },
        ...(scope.scope === "MANAGED_TEAMS" ? { id: { in: scope.userIds } } : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    getPrisma().leaveTypeDefinition.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const safeRows = sanitizeReportRows(rows, reportType);
  const exportHref = buildExportHref(reportType, filters);
  const returnHref = buildReportHref(definition.path, filters);

  return (
    <section className="min-w-0 space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">운영 리포트</p>
          <h1 className="mt-2 break-keep text-2xl font-semibold tracking-normal text-slate-950">
            {definition.title}
          </h1>
          <p className="mt-2 max-w-3xl break-keep text-sm leading-relaxed text-slate-600">
            {definition.description}
          </p>
        </div>
        <div className="grid gap-2 sm:flex">
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold"
            href="/admin/reports"
          >
            리포트 목록
          </Link>
          {scope.canExport ? (
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white"
              href={exportHref}
            >
              CSV export
            </Link>
          ) : null}
        </div>
      </div>

      {scope.canExport ? (
        <form
          action={verifyReportExportStepUp}
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
        >
          <input name="returnTo" type="hidden" value={returnHref} />
          <p className="text-sm font-semibold text-amber-900">CSV export 보안 확인</p>
          <p className="mt-1 text-sm leading-relaxed text-amber-800">
            CSV export는 OWNER Step-up 재인증 후에만 허용됩니다. 민감정보 원문은
            export하지 않습니다.
          </p>
          <div className="mt-3 grid gap-2 sm:flex">
            <input
              autoComplete="current-password"
              className="h-11 min-w-0 rounded-lg border border-amber-200 bg-white px-3 text-sm"
              name="stepUpPassword"
              placeholder="현재 비밀번호"
              required
              type="password"
            />
            <button className="min-h-11 rounded-lg bg-amber-900 px-4 text-sm font-semibold text-white">
              export 재인증
            </button>
          </div>
        </form>
      ) : (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          LEAD 리포트는 담당 범위 조회만 제공하며 CSV export는 비활성화되어 있습니다.
        </p>
      )}

      <form className="grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <input
          className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
          defaultValue={filters.year ?? new Date().getFullYear()}
          name="year"
          placeholder="기준연도"
          type="number"
        />
        <input
          className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
          defaultValue={filters.from ?? ""}
          name="from"
          type="date"
        />
        <input
          className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
          defaultValue={filters.to ?? ""}
          name="to"
          type="date"
        />
        <input
          className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
          defaultValue={filters.q ?? ""}
          name="q"
          placeholder="직원명 또는 이메일"
        />
        <select
          className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
          defaultValue={filters.teamId ?? ""}
          name="teamId"
        >
          <option value="">팀 전체</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <select
          className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
          defaultValue={filters.userId ?? ""}
          name="userId"
        >
          <option value="">직원 전체</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} / {user.email}
            </option>
          ))}
        </select>
        <select
          className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
          defaultValue={filters.leaveTypeId ?? ""}
          name="leaveTypeId"
        >
          <option value="">휴가 유형 전체</option>
          {leaveTypes.map((leaveType) => (
            <option key={leaveType.id} value={leaveType.id}>
              {leaveType.name}
            </option>
          ))}
        </select>
        <input
          className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
          defaultValue={filters.status ?? ""}
          name="status"
          placeholder="상태"
        />
        <input
          className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
          defaultValue={filters.source ?? ""}
          name="source"
          placeholder="source"
        />
        <input
          className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
          defaultValue={filters.eventType ?? ""}
          name="eventType"
          placeholder="장부 이벤트"
        />
        <input
          className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
          defaultValue={filters.noticeType ?? ""}
          name="noticeType"
          placeholder="촉진 유형"
        />
        <input
          className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
          defaultValue={filters.attachmentStatus ?? ""}
          name="attachmentStatus"
          placeholder="증명자료 상태"
        />
        <button className="min-h-11 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white md:col-span-2">
          조회
        </button>
      </form>

      <p className="text-sm text-slate-500">
        화면에는 최대 100건을 표시합니다. OWNER CSV export는 같은 필터 기준으로 최대
        5,000건까지 내보냅니다.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1200px] table-auto text-left text-sm [&_td]:break-keep [&_th]:break-keep [&_th]:whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              {definition.columns.map((column) => (
                <th className="px-4 py-3" key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {safeRows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={definition.columns.length}>
                  조회된 리포트 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              safeRows.map((row, index) => (
                <tr key={index}>
                  {definition.columns.map((column) => (
                    <td className="whitespace-nowrap px-4 py-3" key={column}>
                      {row[column] ?? "-"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function buildExportHref(reportType: ReportType, filters: ReportFilters) {
  const params = new URLSearchParams();
  params.set("reportType", reportType);

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, String(value));
    }
  });

  return `/admin/reports/export?${params.toString()}`;
}

function buildReportHref(path: string, filters: ReportFilters) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, String(value));
    }
  });

  const search = params.toString();
  return search ? `${path}?${search}` : path;
}
