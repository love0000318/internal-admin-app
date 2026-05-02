import Link from "next/link";
import { notFound } from "next/navigation";

import { getJobRunDetail } from "@/lib/jobs/job-runner";
import { sanitizeJobSummary } from "@/lib/jobs/sanitize";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

export default async function JobRunDetailPage({
  params,
}: {
  params: Promise<{ jobRunId: string }>;
}) {
  await requireOwner();
  const { jobRunId } = await params;
  const jobRun = await getJobRunDetail(jobRunId);

  if (!jobRun) {
    notFound();
  }

  return (
    <section>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">자동 작업 관리</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            작업 실행 상세
          </h1>
        </div>
        <Link
          href="/admin/jobs"
          className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
        >
          목록으로
        </Link>
      </div>

      <dl className="mt-6 grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 text-sm shadow-sm md:grid-cols-2">
        <Info label="작업명" value={jobRun.jobName} />
        <Info label="상태" value={jobRun.status} />
        <Info label="실행 방식" value={jobRun.triggeredBy} />
        <Info label="실행자" value={jobRun.triggeredByUser?.name ?? "-"} />
        <Info label="dry-run" value={jobRun.dryRun ? "예" : "아니오"} />
        <Info label="시작일시" value={formatDateTime(jobRun.startedAt)} />
        <Info label="종료일시" value={formatDateTime(jobRun.finishedAt)} />
        <Info label="확인 수" value={jobRun.checkedCount ?? "-"} />
        <Info label="생성 수" value={jobRun.createdCount ?? "-"} />
        <Info label="수정 수" value={jobRun.updatedCount ?? "-"} />
        <Info label="건너뜀 수" value={jobRun.skippedCount ?? "-"} />
        <Info label="실패 수" value={jobRun.failedCount ?? "-"} />
      </dl>

      <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">처리 요약</h2>
        <pre className="mt-3 overflow-x-auto rounded-md bg-neutral-950 p-4 text-xs text-white">
          {JSON.stringify(sanitizeJobSummary(jobRun.resultSummary ?? {}), null, 2)}
        </pre>
      </div>

      {jobRun.errorSummary ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <h2 className="font-semibold">오류 요약</h2>
          <p className="mt-2">{jobRun.errorSummary}</p>
        </div>
      ) : null}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function formatDateTime(value: Date | null) {
  return value ? value.toISOString().slice(0, 16).replace("T", " ") : "-";
}
