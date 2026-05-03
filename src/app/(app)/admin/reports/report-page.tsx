import Link from "next/link";

import { verifyReportExportStepUp } from "@/app/(app)/admin/reports/actions";
import { getPrisma } from "@/lib/db/prisma";
import { listReportRows, type ReportFilters } from "@/lib/reports/data";
import {
  getReportDefinition,
  sanitizeReportRows,
  type ReportType,
} from "@/lib/reports/definitions";
import { requireOwner } from "@/lib/rbac/server-guards";

type ReportPageProps = {
  reportType: ReportType;
  searchParams: Promise<ReportFilters>;
};

export async function AdminReportPage({ reportType, searchParams }: ReportPageProps) {
  await requireOwner();
  const filters = await searchParams;
  const definition = getReportDefinition(reportType);
  const [rows, teams, users, leaveTypes] = await Promise.all([
    listReportRows(reportType, filters, { limit: 100 }),
    getPrisma().team.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getPrisma().user.findMany({
      where: { status: "ACTIVE", role: { not: "EXTERNAL_PARTNER" } },
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
    <section>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">관리자 리포트</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            {definition.title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">
            {definition.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/reports"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            리포트 목록
          </Link>
          <Link
            href={exportHref}
            className="inline-flex h-10 items-center rounded-md bg-neutral-950 px-4 text-sm font-medium text-white"
          >
            CSV 내보내기
          </Link>
        </div>
      </div>

      <form
        action={verifyReportExportStepUp}
        className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4"
      >
        <input name="returnTo" type="hidden" value={returnHref} />
        <p className="text-sm font-semibold text-amber-900">
          CSV export 보안 확인
        </p>
        <p className="mt-1 text-sm leading-relaxed text-amber-800">
          CSV export는 민감한 운영 데이터가 포함될 수 있으므로 5분 이내의
          비밀번호 재인증이 필요합니다.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            name="stepUpPassword"
            type="password"
            autoComplete="current-password"
            className="h-10 min-w-0 rounded-md border border-amber-200 bg-white px-3 text-sm"
            placeholder="현재 비밀번호"
            required
          />
          <button className="h-10 rounded-md bg-amber-900 px-4 text-sm font-medium text-white">
            export 재인증
          </button>
        </div>
      </form>

      {reportType === "ANNUAL_PROMOTIONS" ? (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          연차 촉진 리포트는 운영 참고용입니다. 실제 법무/노무 판단은 별도
          검토가 필요합니다.
        </p>
      ) : null}

      <form className="mt-6 grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <input
          name="year"
          type="number"
          defaultValue={filters.year ?? new Date().getFullYear()}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
          placeholder="기준 연도"
        />
        <input
          name="from"
          type="date"
          defaultValue={filters.from ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <input
          name="to"
          type="date"
          defaultValue={filters.to ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <input
          name="q"
          defaultValue={filters.q ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
          placeholder="직원명 또는 이메일"
        />
        <select
          name="teamId"
          defaultValue={filters.teamId ?? ""}
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
          name="userId"
          defaultValue={filters.userId ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">직원 전체</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} / {user.email}
            </option>
          ))}
        </select>
        <select
          name="leaveTypeId"
          defaultValue={filters.leaveTypeId ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">휴가 유형 전체</option>
          {leaveTypes.map((leaveType) => (
            <option key={leaveType.id} value={leaveType.id}>
              {leaveType.name}
            </option>
          ))}
        </select>
        <input
          name="status"
          defaultValue={filters.status ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
          placeholder="상태"
        />
        <input
          name="source"
          defaultValue={filters.source ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
          placeholder="source"
        />
        <input
          name="eventType"
          defaultValue={filters.eventType ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
          placeholder="장부 이벤트"
        />
        <input
          name="noticeType"
          defaultValue={filters.noticeType ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
          placeholder="촉진 유형"
        />
        <input
          name="attachmentStatus"
          defaultValue={filters.attachmentStatus ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
          placeholder="증명자료 상태"
        />
        <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white md:col-span-2">
          조회
        </button>
      </form>

      <p className="mt-4 text-sm text-neutral-500">
        화면에는 최대 100건을 표시합니다. CSV는 동일 필터 기준으로 최대 5,000건까지
        내보냅니다.
      </p>

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] table-auto text-left text-sm [&_td]:break-keep [&_th]:break-keep [&_th]:whitespace-nowrap">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                {definition.columns.map((column) => (
                  <th key={column} className="px-4 py-3">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {safeRows.length === 0 ? (
                <tr>
                  <td
                    className="px-4 py-6 text-neutral-500"
                    colSpan={definition.columns.length}
                  >
                    조회된 리포트 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                safeRows.map((row, index) => (
                  <tr key={index}>
                    {definition.columns.map((column) => (
                      <td key={column} className="whitespace-nowrap px-4 py-3">
                        {row[column] ?? "-"}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
