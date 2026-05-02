import Link from "next/link";

import { runManualJob } from "@/app/(app)/admin/jobs/actions";
import { MANUAL_JOB_OPTIONS } from "@/lib/jobs/job-names";
import { listJobRuns } from "@/lib/jobs/job-runner";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type AdminJobsPageProps = {
  searchParams: Promise<{
    jobName?: string;
    status?: string;
    triggeredBy?: string;
    dryRun?: string;
    error?: string;
  }>;
};

export default async function AdminJobsPage({ searchParams }: AdminJobsPageProps) {
  await requireOwner();
  const filters = await searchParams;
  const jobRuns = await listJobRuns(filters);

  return (
    <section>
      <div>
        <p className="text-sm font-medium text-neutral-500">운영 자동화</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">
          자동 작업 관리
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-neutral-600">
          생일 반차 지급, 연차 촉진, 연차 소멸, 장부 검증 등 운영 작업의 실행
          이력을 확인합니다.
        </p>
      </div>

      {filters.error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          실행할 수 없는 작업입니다. 위험 작업은 CLI와 문서 절차로만 실행합니다.
        </p>
      ) : null}

      <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">수동 dry-run 실행</h2>
        <p className="mt-1 text-sm text-neutral-500">
          미리보기 실행은 데이터를 변경하지 않고 대상과 결과를 확인합니다.
          LeaveLedger rebuild와 HR import는 UI에서 실행하지 않습니다.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {MANUAL_JOB_OPTIONS.map((option) => (
            <form
              key={option.jobName}
              action={runManualJob}
              className="rounded-md border border-neutral-200 p-4"
            >
              <input name="jobName" type="hidden" value={option.jobName} />
              <input name="dryRun" type="hidden" value="true" />
              <h3 className="font-medium">{option.label}</h3>
              <p className="mt-1 min-h-10 text-sm text-neutral-500">
                {option.description}
              </p>
              <button className="mt-3 h-9 rounded-md bg-neutral-950 px-3 text-sm font-medium text-white">
                dry-run 실행
              </button>
            </form>
          ))}
        </div>
      </div>

      <form className="mt-6 grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <input
          name="jobName"
          defaultValue={filters.jobName ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
          placeholder="작업명"
        />
        <select
          name="status"
          defaultValue={filters.status ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">상태 전체</option>
          <option value="RUNNING">RUNNING</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="FAILED">FAILED</option>
          <option value="PARTIAL">PARTIAL</option>
        </select>
        <select
          name="triggeredBy"
          defaultValue={filters.triggeredBy ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">실행 방식 전체</option>
          <option value="MANUAL">MANUAL</option>
          <option value="CRON">CRON</option>
          <option value="SYSTEM">SYSTEM</option>
        </select>
        <select
          name="dryRun"
          defaultValue={filters.dryRun ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">dry-run 전체</option>
          <option value="true">dry-run</option>
          <option value="false">실제 실행</option>
        </select>
        <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
          조회
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[1200px] table-auto text-left text-sm [&_td]:break-keep [&_th]:break-keep [&_th]:whitespace-nowrap">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">작업명</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">실행 방식</th>
              <th className="px-4 py-3">dry-run</th>
              <th className="px-4 py-3">시작</th>
              <th className="px-4 py-3">종료</th>
              <th className="px-4 py-3">확인</th>
              <th className="px-4 py-3">생성</th>
              <th className="px-4 py-3">수정</th>
              <th className="px-4 py-3">건너뜀</th>
              <th className="px-4 py-3">실패</th>
              <th className="px-4 py-3">상세</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {jobRuns.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={12}>
                  작업 실행 이력이 없습니다.
                </td>
              </tr>
            ) : (
              jobRuns.map((jobRun) => (
                <tr key={jobRun.id}>
                  <td className="px-4 py-3 font-medium">{jobRun.jobName}</td>
                  <td className="px-4 py-3">{jobRun.status}</td>
                  <td className="px-4 py-3">{jobRun.triggeredBy}</td>
                  <td className="px-4 py-3">{jobRun.dryRun ? "예" : "아니오"}</td>
                  <td className="px-4 py-3">{formatDateTime(jobRun.startedAt)}</td>
                  <td className="px-4 py-3">{formatDateTime(jobRun.finishedAt)}</td>
                  <td className="px-4 py-3">{jobRun.checkedCount ?? "-"}</td>
                  <td className="px-4 py-3">{jobRun.createdCount ?? "-"}</td>
                  <td className="px-4 py-3">{jobRun.updatedCount ?? "-"}</td>
                  <td className="px-4 py-3">{jobRun.skippedCount ?? "-"}</td>
                  <td className="px-4 py-3">{jobRun.failedCount ?? "-"}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/jobs/${jobRun.id}`} className="font-medium underline">
                      상세
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatDateTime(value: Date | null) {
  return value ? value.toISOString().slice(0, 16).replace("T", " ") : "-";
}
