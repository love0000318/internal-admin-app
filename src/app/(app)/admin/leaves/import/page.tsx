import Link from "next/link";

import { Card, EmptyState, buttonClassName } from "@/components/design-system/primitives";
import { MobileCardList, ResponsiveTable } from "@/components/design-system/responsive";
import { LeaveAdminNav } from "@/components/leave/leave-admin-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getPrisma } from "@/lib/db/prisma";
import { requireOwner } from "@/lib/rbac/server-guards";

import { uploadLeaveImportAction } from "./actions";

export const dynamic = "force-dynamic";

type ImportPageProps = {
  searchParams: Promise<{ error?: string }>;
};

function errorMessage(code?: string) {
  if (code === "missing-file") return "업로드할 .xlsx 파일을 선택해 주세요.";
  if (code === "invalid-file-type") return ".xlsx 파일만 업로드할 수 있습니다.";
  if (code === "file-too-large") return "파일 크기가 허용 한도를 초과했습니다.";
  if (code === "missing-batch") return "반영할 import batch를 찾을 수 없습니다.";
  return null;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PARSED: "파싱 완료",
    VALIDATED: "검증 가능",
    APPLIED: "반영 완료",
    REVERSED: "반영 취소",
    CANCELLED: "취소",
    FAILED: "실패",
  };
  return labels[status] ?? status;
}

function typeLabel(type: string) {
  return type === "MONTHLY_ANNUAL_USAGE" ? "휴가 현황/월별 연차" : "휴가 사용 상세";
}

export default async function LeaveImportPage({ searchParams }: ImportPageProps) {
  await requireOwner();
  const params = await searchParams;
  const prisma = getPrisma();
  const batches = await prisma.leaveImportBatch.findMany({
    include: {
      uploadedBy: { select: { name: true } },
      appliedBy: { select: { name: true } },
      reversedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const message = errorMessage(params.error);

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="휴가 관리"
        title="휴가 현황 일괄 업로드"
        description="구성원별 휴가 보유, 사용, 잔여 현황이 담긴 엑셀 파일을 업로드해 시스템 휴가 장부에 조정값으로 반영합니다. 업로드 후 바로 반영되지 않으며, 미리보기와 오류 확인 후 총괄 관리자가 최종 반영해야 합니다."
        actions={[{ href: "/admin/leaves/import/template", label: "엑셀 템플릿 다운로드" }]}
      />
      <LeaveAdminNav activeHref="/admin/leaves/import" />

      {message ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium break-keep text-red-700">
          {message}
        </p>
      ) : null}

      <Card>
        <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <h2 className="text-sm font-semibold break-keep text-blue-900">운영 반영 원칙</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed break-keep text-blue-800">
            <li>휴가 사용 상세 내역이 있다면 먼저 반영하고, 이후 휴가 현황/월별 연차 파일로 잔여 연차를 비교합니다.</li>
            <li>엑셀 업로드는 기존 휴가 요청이나 장부를 덮어쓰지 않고, 잔여 차이만 LeaveAdjustment와 LeaveLedger 조정 이벤트로 기록합니다.</li>
            <li>직원 매칭 실패, 동명이인, 오류 행, UNKNOWN 상태, 중복 의심 행은 자동 반영되지 않습니다.</li>
            <li>최종 반영과 차이 보정에는 Step-up 재인증이 필요합니다.</li>
          </ol>
        </div>

        <form action={uploadLeaveImportAction} className="grid gap-4 md:grid-cols-[240px_1fr_auto] md:items-end">
          <label className="grid gap-2 text-sm font-medium break-keep text-slate-700">
            업로드 유형
            <select
              name="importType"
              defaultValue="AUTO"
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="AUTO">자동 감지</option>
              <option value="MONTHLY_ANNUAL_USAGE">휴가 현황/월별 연차</option>
              <option value="DETAILED_LEAVE_USAGE">휴가 사용 상세</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium break-keep text-slate-700">
            엑셀 파일
            <input
              type="file"
              name="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              required
            />
          </label>
          <button type="submit" className={buttonClassName({ className: "w-full md:w-auto" })}>
            업로드 및 미리보기
          </button>
        </form>
        <p className="mt-4 text-sm leading-relaxed break-keep text-slate-500">
          지원 파일은 .xlsx이며 기본 최대 크기는 10MB입니다. 원본 파일은 public 폴더에 저장하지 않고 서버에서 파싱한 뒤 batch 요약과 검증 결과만 보관합니다.
        </p>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold break-keep text-slate-950">최근 import 이력</h2>
        {batches.length === 0 ? (
          <EmptyState title="아직 업로드한 휴가 import 파일이 없습니다." />
        ) : (
          <>
            <ResponsiveTable minWidth="980px">
              <thead className="border-b bg-slate-50 text-slate-600">
                <tr>
                  <th>업로드 일시</th>
                  <th>유형</th>
                  <th>파일명</th>
                  <th>상태</th>
                  <th>row</th>
                  <th>매칭</th>
                  <th>경고/오류</th>
                  <th>업로드</th>
                  <th>취소</th>
                  <th>상세</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td>{batch.createdAt.toLocaleString("ko-KR")}</td>
                    <td>{typeLabel(batch.importType)}</td>
                    <td className="max-w-[260px] truncate" title={batch.originalFileName}>
                      {batch.originalFileName}
                    </td>
                    <td>{statusLabel(batch.status)}</td>
                    <td>{batch.rowCount}</td>
                    <td>
                      {batch.matchedCount}/{batch.rowCount}
                    </td>
                    <td>
                      {batch.warningCount}/{batch.errorCount}
                    </td>
                    <td>{batch.uploadedBy.name}</td>
                    <td>{batch.reversedAt ? batch.reversedAt.toLocaleString("ko-KR") : "-"}</td>
                    <td>
                      <Link
                        className={buttonClassName({ tone: "neutral", className: "min-h-9 px-3" })}
                        href={`/admin/leaves/import/${batch.id}`}
                      >
                        미리보기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
            <MobileCardList>
              {batches.map((batch) => (
                <Card key={batch.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold break-keep text-slate-950">{typeLabel(batch.importType)}</p>
                      <p className="mt-1 text-sm break-words text-slate-500">{batch.originalFileName}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium break-keep text-slate-700">
                      {statusLabel(batch.status)}
                    </span>
                  </div>
                  <dl className="mt-4 grid gap-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="shrink-0 break-keep text-slate-500">row</dt>
                      <dd className="font-medium">{batch.rowCount}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="shrink-0 break-keep text-slate-500">매칭</dt>
                      <dd className="font-medium">
                        {batch.matchedCount}/{batch.rowCount}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="shrink-0 break-keep text-slate-500">경고/오류</dt>
                      <dd className="font-medium">
                        {batch.warningCount}/{batch.errorCount}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="shrink-0 break-keep text-slate-500">취소</dt>
                      <dd className="font-medium">
                        {batch.reversedAt ? batch.reversedAt.toLocaleDateString("ko-KR") : "-"}
                      </dd>
                    </div>
                  </dl>
                  <Link
                    className={buttonClassName({ tone: "neutral", className: "mt-4 w-full" })}
                    href={`/admin/leaves/import/${batch.id}`}
                  >
                    미리보기
                  </Link>
                </Card>
              ))}
            </MobileCardList>
          </>
        )}
      </div>
    </section>
  );
}
