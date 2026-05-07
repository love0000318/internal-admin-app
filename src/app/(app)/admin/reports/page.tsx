import Link from "next/link";

import { Badge, Card } from "@/components/design-system/primitives";
import { PageHeader } from "@/components/layout/PageHeader";
import { featureUnavailableMessage, features } from "@/config/features";
import { isPrismaSchemaPreparationError } from "@/lib/db/schema-errors";
import type { ReportFilters } from "@/lib/reports/data";
import { REPORT_DEFINITIONS } from "@/lib/reports/definitions";
import { getReportScope } from "@/lib/reports/permissions";
import { getAdminReportSummary } from "@/lib/reports/summary";
import { requireOwnerOrLead } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

const reportOrder = [
  "LEAVE_USAGE",
  "LEAVE_LEDGER",
  "LEAVE_GRANTS",
  "BIRTHDAY_HALF_DAYS",
  "ANNUAL_PROMOTIONS",
  "LEAVE_ATTACHMENTS",
  "HR_ONBOARDING",
  "PROFILE_CONFIRMATIONS",
] as const;

type AdminReportsPageProps = {
  searchParams: Promise<ReportFilters>;
};

export default async function AdminReportsPage({ searchParams }: AdminReportsPageProps) {
  const actor = await requireOwnerOrLead();
  const filters = await searchParams;

  if (!features.adminReports) {
    return <ReportsUnavailableNotice />;
  }

  const scope = await getReportScope(actor);
  let summary: Awaited<ReturnType<typeof getAdminReportSummary>>;

  try {
    summary = await getAdminReportSummary({ filters, scope });
  } catch (error) {
    if (isPrismaSchemaPreparationError(error)) {
      return <ReportsUnavailableNotice />;
    }

    throw error;
  }

  const visibleReportTypes =
    scope.scope === "ALL"
      ? reportOrder
      : reportOrder.filter((reportType) =>
          ["LEAVE_USAGE", "LEAVE_LEDGER", "LEAVE_GRANTS", "BIRTHDAY_HALF_DAYS"].includes(
            reportType,
          ),
        );

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        description={
          scope.scope === "ALL"
            ? "휴가, 직원, 데이터 이상, 보안/감사 요약을 안전한 범위에서 확인합니다."
            : "담당 팀과 하위 팀 범위의 휴가/직원 요약만 표시합니다."
        }
        eyebrow="관리자"
        title="운영 리포트"
      />

      <form className="grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="min-w-0 text-sm font-medium text-slate-700">
          기준연도
          <input
            className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
            defaultValue={filters.year ?? summary.year}
            name="year"
            type="number"
          />
        </label>
        <label className="min-w-0 text-sm font-medium text-slate-700">
          기준월
          <input
            className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
            defaultValue={filters.month ?? summary.month}
            max={12}
            min={1}
            name="month"
            type="number"
          />
        </label>
        <label className="min-w-0 text-sm font-medium text-slate-700 lg:col-span-2">
          직원 검색
          <input
            className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
            defaultValue={filters.q ?? ""}
            name="q"
            placeholder="이름 또는 이메일"
          />
        </label>
        <button className="min-h-11 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white sm:col-span-2 lg:col-span-4">
          리포트 조회
        </button>
      </form>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="사용 완료 휴가" value={`${summary.leave.usedDays}일`} />
        <SummaryCard label="승인 대기 휴가" value={`${summary.leave.pendingDays}일`} />
        <SummaryCard label="ACTIVE 직원" value={`${summary.employees.active}명`} />
        <SummaryCard label="데이터 검토 필요" value={`${summary.dataQuality.warningCount}건`} />
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">휴가 리포트</h2>
            <Badge tone="primary">
              {summary.scopeLabel === "ALL" ? "전체" : "담당 범위"}
            </Badge>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric label="승인 완료 요청" value={`${summary.leave.approvedRequests}건`} />
            <Metric label="승인 대기 요청" value={`${summary.leave.pendingRequests}건`} />
            <Metric label="사용 완료" value={`${summary.leave.usedDays}일`} />
            <Metric label="소멸 장부 이벤트" value={`${summary.leave.expiringLedgerEvents}건`} />
          </dl>
        </Card>

        <Card className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-950">근태 리포트</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            근태 월별 마감/근태 상세 모델은 현재 안정 커밋에 없으므로, 이번 복구에서는
            TODO 상태로 표시합니다. 급여/수당 계산은 포함하지 않습니다.
          </p>
        </Card>

        <Card className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-950">직원 리포트</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Metric label="전체 직원" value={`${summary.employees.total}명`} />
            <Metric label="초대 상태" value={`${summary.employees.invited}명`} />
            <Metric label="비활성 직원" value={`${summary.employees.deactivated}명`} />
            <Metric label="대기 초대" value={`${summary.employees.pendingInvitations}건`} />
          </dl>
        </Card>

        <Card className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-950">데이터 이상 리포트</h2>
          {summary.dataQuality.warnings.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">현재 기준 검토 필요 항목이 없습니다.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {summary.dataQuality.warnings.map((warning) => (
                <li
                  className="flex items-start justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
                  key={warning.code}
                >
                  <span>{warning.label}</span>
                  <strong>{warning.count}건</strong>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {scope.canViewSecurity ? (
          <Card className="min-w-0 lg:col-span-2">
            <h2 className="text-lg font-semibold text-slate-950">보안/감사 리포트</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Metric
                label="HIGH/CRITICAL AuditLog"
                value={`${summary.security.highSeverityAuditLogs ?? 0}건`}
              />
              <Metric
                label="차단된 접근 이벤트"
                value={`${summary.security.blockedAccessEvents ?? 0}건`}
              />
            </dl>
          </Card>
        ) : null}
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {visibleReportTypes.map((reportType) => {
          const report = REPORT_DEFINITIONS[reportType];

          return (
            <Link
              className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
              href={report.path}
              key={report.type}
            >
              <h2 className="break-keep text-base font-semibold leading-snug text-slate-950 sm:text-lg">
                {report.title}
              </h2>
              <p className="mt-2 min-h-0 break-keep text-sm leading-relaxed text-slate-600 md:min-h-12">
                {report.description}
              </p>
              <span className="mt-4 inline-flex min-h-10 w-full items-center justify-center whitespace-nowrap break-keep rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white sm:w-fit">
                바로가기
              </span>
            </Link>
          );
        })}
      </div>

      {scope.canExport ? (
        <Card className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-950">Export</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            CSV export는 OWNER만 가능하며, 각 리포트 상세 화면에서 Step-up 재인증 후
            실행됩니다. CSV에는 passwordHash, tokenHash, 주민등록번호, 계좌번호,
            fileKey, private path를 포함하지 않습니다.
          </p>
        </Card>
      ) : null}
    </section>
  );
}

function ReportsUnavailableNotice() {
  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        description="리포트에 필요한 데이터베이스 준비 상태를 확인한 뒤 다시 사용할 수 있습니다."
        eyebrow="관리자"
        title="운영 리포트"
      />
      <Card className="border-amber-200 bg-amber-50 text-amber-900">
        <p className="font-semibold">{featureUnavailableMessage()}</p>
      </Card>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="min-w-0">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 break-words text-2xl font-bold text-slate-950">{value}</p>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-slate-50 p-3">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-lg font-semibold text-slate-950">{value}</dd>
    </div>
  );
}
