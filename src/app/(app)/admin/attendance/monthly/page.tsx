import {
  closeAttendanceMonthAction,
  reopenAttendanceMonthAction,
} from "@/app/(app)/admin/attendance/monthly/actions";
import { redirect } from "next/navigation";
import {
  getMonthlyAttendanceSummary,
  type MonthlyAttendanceStatus,
} from "@/lib/attendance/monthly-summary";
import {
  isAttendanceMonthlyCloseEnabled,
  isAttendanceMonthlyCloseSchemaError,
} from "@/lib/attendance/monthly-close-availability";
import { getPrisma } from "@/lib/db/prisma";
import { getManagedScopeForUser } from "@/lib/organization/permissions";
import { requireOwnerOrLead } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type MonthlyAttendancePageProps = {
  searchParams: Promise<{
    year?: string;
    month?: string;
    teamId?: string;
    status?: MonthlyAttendanceStatus;
    q?: string;
    error?: string;
    success?: string;
  }>;
};

const statusLabels: Record<MonthlyAttendanceStatus, string> = {
  NORMAL: "정상",
  LATE: "지각",
  EARLY_LEAVE: "조퇴",
  ABSENT: "결근",
  ON_LEAVE: "휴가",
  MISSING_CHECK_IN: "출근 누락",
  MISSING_CHECK_OUT: "퇴근 누락",
  HOLIDAY: "휴일",
};

const errorMessages: Record<string, string> = {
  "step-up-required": "마감/해제는 현재 비밀번호 확인이 필요합니다.",
  warnings: "누락/이상 근태 또는 수정 요청 대기가 있습니다. 확인 후 강제 마감을 선택하세요.",
  "not-closed": "마감 완료 상태인 월만 마감 해제할 수 있습니다.",
  "db-not-ready": "근태 월별 마감 기능은 데이터베이스 준비가 필요합니다.",
};

export default async function MonthlyAttendancePage({
  searchParams,
}: MonthlyAttendancePageProps) {
  const actor = await requireOwnerOrLead();
  const params = await searchParams;
  const now = new Date();
  const year = Number.parseInt(params.year ?? `${now.getUTCFullYear()}`, 10);
  const month = Number.parseInt(params.month ?? `${now.getUTCMonth() + 1}`, 10);

  if (!isAttendanceMonthlyCloseEnabled()) {
    return <MonthlyCloseUnavailableNotice year={year} month={month} />;
  }

  const prisma = getPrisma();
  const scope = await getManagedScopeForUser(actor, "ATTENDANCE");

  if (scope.scope !== "ALL" && scope.scope !== "MANAGED_TEAMS") {
    redirect("/forbidden");
  }

  let teams: Array<{ id: string; name: string }>;
  let selectedTeamId: string | null = null;
  let selectedStatus: MonthlyAttendanceStatus | null = null;
  let summary: Awaited<ReturnType<typeof getMonthlyAttendanceSummary>>;

  try {
    teams = await prisma.team.findMany({
      where: {
        status: "ACTIVE",
        ...(scope.scope === "MANAGED_TEAMS" ? { id: { in: scope.teamIds } } : {}),
      },
      orderBy: { name: "asc" },
    });
    selectedTeamId =
      params.teamId && teams.some((team) => team.id === params.teamId)
        ? params.teamId
        : null;
    selectedStatus =
      params.status && params.status in statusLabels ? params.status : null;
    summary = await getMonthlyAttendanceSummary({
      year,
      month,
      actor,
      teamId: selectedTeamId,
      status: selectedStatus,
    });
  } catch (error) {
    if (isAttendanceMonthlyCloseSchemaError(error)) {
      return <MonthlyCloseUnavailableNotice year={year} month={month} />;
    }

    throw error;
  }
  const query = (params.q ?? "").trim().toLowerCase();
  const rows = query
    ? summary.rows.filter(
        (row) =>
          row.employeeName.toLowerCase().includes(query) ||
          (row.teamName ?? "").toLowerCase().includes(query),
      )
    : summary.rows;
  const warningRows = rows.filter((row) => row.warnings.length > 0);
  const isOwner = actor.role === "OWNER";

  return (
    <section className="min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">근태</p>
          <h1 className="mt-2 break-keep text-2xl font-semibold tracking-normal">
            근태 마감
          </h1>
          <p className="mt-2 max-w-3xl break-keep text-sm text-neutral-600">
            월별 근태 이상, 휴가일, 수정 요청 대기를 확인합니다. OWNER만 Step-up 후
            마감과 마감 해제가 가능합니다.
          </p>
        </div>
        <span className="inline-flex min-h-10 items-center rounded-full border border-neutral-200 px-4 text-sm font-semibold text-neutral-700">
          {summary.closeStatus === "CLOSED"
            ? "마감 완료"
            : summary.closeStatus === "REOPENED"
              ? "재오픈됨"
              : "마감 전"}
        </span>
      </div>

      {params.error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessages[params.error] ?? "요청을 처리할 수 없습니다."}
        </p>
      ) : null}
      {params.success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          변경 사항이 저장되었습니다.
        </p>
      ) : null}

      <form className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
        <input
          name="year"
          type="number"
          defaultValue={year}
          className="h-10 w-full min-w-0 rounded-md border px-3 text-sm"
        />
        <input
          name="month"
          type="number"
          min={1}
          max={12}
          defaultValue={month}
          className="h-10 w-full min-w-0 rounded-md border px-3 text-sm"
        />
        <select
          name="teamId"
          defaultValue={selectedTeamId ?? ""}
          className="h-10 w-full min-w-0 rounded-md border px-3 text-sm"
        >
          <option value="">팀 전체</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={selectedStatus ?? ""}
          className="h-10 w-full min-w-0 rounded-md border px-3 text-sm"
        >
          <option value="">상태 전체</option>
          {Object.entries(statusLabels).map(([status, label]) => (
            <option key={status} value={status}>
              {label}
            </option>
          ))}
        </select>
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="직원/팀 검색"
          className="h-10 w-full min-w-0 rounded-md border px-3 text-sm"
        />
        <button className="min-h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
          조회
        </button>
      </form>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="정상" value={summary.summary.normalCount} />
        <SummaryCard title="지각" value={summary.summary.lateCount} />
        <SummaryCard title="조퇴" value={summary.summary.earlyLeaveCount} />
        <SummaryCard title="결근" value={summary.summary.absentCount} />
        <SummaryCard title="퇴근 누락" value={summary.summary.missingCheckOutCount} />
        <SummaryCard title="출근 누락" value={summary.summary.missingCheckInCount} />
        <SummaryCard title="휴가" value={summary.summary.onLeaveCount} />
        <SummaryCard title="수정 요청 대기" value={summary.summary.changeRequestPendingCount} />
      </div>

      {isOwner ? (
        <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">월 마감 처리</h2>
          <p className="mt-1 break-keep text-sm text-neutral-600">
            누락/이상 근태가 있으면 기본 마감은 차단됩니다. 운영 확인 후 강제 마감을
            선택할 수 있습니다.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <form action={closeAttendanceMonthAction} className="grid gap-3 rounded-lg border border-neutral-200 p-3">
              <input name="year" type="hidden" value={year} />
              <input name="month" type="hidden" value={month} />
              <textarea
                name="memo"
                placeholder="마감 메모"
                className="min-h-20 rounded-md border px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 text-sm">
                <input name="forceCloseWithWarnings" type="checkbox" value="true" />
                경고가 있어도 확인 후 마감
              </label>
              <input
                name="stepUpPassword"
                type="password"
                autoComplete="current-password"
                placeholder="현재 비밀번호"
                className="h-10 rounded-md border px-3 text-sm"
              />
              <button className="min-h-10 rounded-md bg-neutral-950 px-4 text-sm font-semibold text-white">
                월 마감
              </button>
            </form>
            <form action={reopenAttendanceMonthAction} className="grid gap-3 rounded-lg border border-red-100 bg-red-50 p-3">
              <input name="year" type="hidden" value={year} />
              <input name="month" type="hidden" value={month} />
              <textarea
                name="memo"
                placeholder="마감 해제 사유"
                className="min-h-20 rounded-md border border-red-200 bg-white px-3 py-2 text-sm"
              />
              <input
                name="stepUpPassword"
                type="password"
                autoComplete="current-password"
                placeholder="현재 비밀번호"
                className="h-10 rounded-md border border-red-200 bg-white px-3 text-sm"
              />
              <button className="min-h-10 rounded-md bg-red-700 px-4 text-sm font-semibold text-white">
                마감 해제
              </button>
            </form>
          </div>
        </section>
      ) : null}

      <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">이상 근태 목록</h2>
        <div className="mt-4 grid gap-3">
          {warningRows.slice(0, 20).map((row) => (
            <AttendanceMobileCard key={`${row.userId}:${row.workDate}:warning`} row={row} />
          ))}
          {warningRows.length === 0 ? (
            <p className="text-sm text-neutral-500">이상 근태가 없습니다.</p>
          ) : null}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-100 p-4">
          <h2 className="text-lg font-semibold">전체 근태 목록</h2>
        </div>
        <div className="md:hidden">
          <div className="grid gap-3 p-4">
            {rows.slice(0, 80).map((row) => (
              <AttendanceMobileCard key={`${row.userId}:${row.workDate}`} row={row} />
            ))}
          </div>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-3">일자</th>
                <th className="px-4 py-3">직원</th>
                <th className="px-4 py-3">팀</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">출근</th>
                <th className="px-4 py-3">퇴근</th>
                <th className="px-4 py-3">근무분</th>
                <th className="px-4 py-3">휴가</th>
                <th className="px-4 py-3">경고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.slice(0, 300).map((row) => (
                <tr key={`${row.userId}:${row.workDate}`}>
                  <td className="px-4 py-3">{row.workDate}</td>
                  <td className="px-4 py-3 font-medium">{row.employeeName}</td>
                  <td className="px-4 py-3">{row.teamName ?? "-"}</td>
                  <td className="px-4 py-3">{statusLabels[row.status]}</td>
                  <td className="px-4 py-3">{formatTime(row.checkInAt)}</td>
                  <td className="px-4 py-3">{formatTime(row.checkOutAt)}</td>
                  <td className="px-4 py-3">{row.workedMinutes ?? "-"}</td>
                  <td className="px-4 py-3">{row.approvedLeaveInfo ?? "-"}</td>
                  <td className="px-4 py-3">{row.warnings.join(", ") || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function MonthlyCloseUnavailableNotice({
  year,
  month,
}: {
  year: number;
  month: number;
}) {
  return (
    <section className="min-w-0">
      <p className="text-sm font-medium text-neutral-500">근태</p>
      <h1 className="mt-2 break-keep text-2xl font-semibold tracking-normal">
        근태 마감
      </h1>
      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm">
        <p className="text-base font-semibold">
          근태 월별 마감 기능은 데이터베이스 준비가 필요합니다. 관리자에게 문의해 주세요.
        </p>
        <p className="mt-2 text-sm">
          현재 조회 월: {year}년 {month}월. 기본 출퇴근/근태 이력 화면은 계속 사용할 수 있습니다.
        </p>
      </div>
    </section>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-neutral-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-neutral-950">{value}</p>
    </div>
  );
}

function AttendanceMobileCard({
  row,
}: {
  row: Awaited<ReturnType<typeof getMonthlyAttendanceSummary>>["rows"][number];
}) {
  return (
    <article className="rounded-lg border border-neutral-200 p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-neutral-950">{row.employeeName}</p>
          <p className="mt-1 text-neutral-500">
            {row.workDate} · {row.teamName ?? "팀 없음"}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700">
          {statusLabels[row.status]}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">출근/퇴근</dt>
          <dd>
            {formatTime(row.checkInAt)} / {formatTime(row.checkOutAt)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">휴가</dt>
          <dd>{row.approvedLeaveInfo ?? "-"}</dd>
        </div>
        {row.warnings.length > 0 ? (
          <div className="rounded-md bg-amber-50 p-2 text-amber-800">
            {row.warnings.join(", ")}
          </div>
        ) : null}
      </dl>
    </article>
  );
}

function formatTime(value: Date | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(value);
}
