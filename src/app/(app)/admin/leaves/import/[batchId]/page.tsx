import Link from "next/link";
import { notFound } from "next/navigation";

import {
  applyLeaveImportAction,
  createLeaveImportReconciliationAdjustmentAction,
  reverseLeaveImportBatchAction,
  updateLeaveImportRowMappingAction,
} from "@/app/(app)/admin/leaves/import/actions";
import { Card, EmptyState, buttonClassName } from "@/components/design-system/primitives";
import { MobileCardList, ResponsiveTable } from "@/components/design-system/responsive";
import { LeaveAdminNav } from "@/components/leave/leave-admin-nav";
import { PageHeader } from "@/components/ui/page-header";
import { getPrisma } from "@/lib/db/prisma";
import {
  getLeaveImportBatchForPreview,
  runLeaveImportReconciliation,
  validateLeaveImportBatch,
  validateLeaveLedgerConsistencyAfterImport,
} from "@/lib/leave/import";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

function typeLabel(type: string) {
  return type === "MONTHLY_ANNUAL_USAGE" ? "휴가 현황/월별 연차" : "휴가 사용 상세";
}

function statusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    PARSED: "파싱 완료",
    VALIDATED: "검증 가능",
    APPLIED: "반영 완료",
    REVERSED: "반영 취소",
    CANCELLED: "취소",
    FAILED: "실패",
    MATCHED: "매칭",
    MULTIPLE_MATCHES: "동명이인/중복 후보",
    UNMATCHED: "미매칭",
    ERROR: "오류",
    PENDING: "승인대기",
    APPROVED: "승인완료",
    UNKNOWN: "확인 필요",
    MONTHLY_ADJUSTMENT: "잔여 보정",
    DETAIL_REQUEST: "상세 반영",
    SKIP_CANCELLED: "취소 제외",
    SKIP_DUPLICATE: "중복 제외",
    BLOCKED: "차단",
    NORMAL: "정상",
    DIFF: "차이 있음",
    DUPLICATE_SUSPECT: "중복 의심",
    NEEDS_REVIEW: "확인 필요",
    ADJUSTED: "보정 완료",
  };
  return status ? (labels[status] ?? status) : "-";
}

function jsonText(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return "-";
  return value.map((item) => String(item)).join(", ");
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "-";
  const parsed = date instanceof Date ? date : new Date(date);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toISOString().slice(0, 10);
}

function resultMessage(error?: string, success?: string) {
  if (success === "reconciliation-adjusted") {
    return { tone: "success", text: "잔여 연차 차이 보정이 LeaveAdjustment와 LeaveLedger에 기록되었습니다." };
  }
  if (success === "reversed") {
    return { tone: "success", text: "업로드 반영 취소가 역조정 LeaveAdjustment와 LeaveLedger에 기록되었습니다." };
  }
  if (success === "applied") return { tone: "success", text: "휴가 import batch가 반영되었습니다." };
  if (error === "step-up-required") {
    return { tone: "danger", text: "최종 반영, 보정, 반영 취소에는 Step-up 재인증이 필요합니다. 보안 확인 후 다시 시도해 주세요." };
  }
  if (error === "reconciliation-adjustment-failed") {
    return { tone: "danger", text: "잔여 연차 차이 보정을 생성할 수 없었습니다. 차이값, 중복 보정 여부, Step-up 상태를 확인해 주세요." };
  }
  if (error === "reverse-failed") {
    return { tone: "danger", text: "업로드 반영 취소를 처리할 수 없었습니다. APPLIED 상태, 기존 취소 여부, Step-up 상태를 확인해 주세요." };
  }
  if (error === "apply-failed") {
    return { tone: "danger", text: "오류 또는 검토가 필요한 row가 있어 batch를 반영할 수 없습니다." };
  }
  return null;
}

function rowTitle(row: { rowNumber: number; matchedUser?: { name: string } | null; name: string | null }) {
  return `${row.rowNumber}행 · ${row.matchedUser?.name ?? row.name ?? "미매칭 직원"}`;
}

export default async function LeaveImportPreviewPage({ params, searchParams }: PageProps) {
  const actor = await requireOwner();
  const { batchId } = await params;
  const query = await searchParams;
  const batch = await getLeaveImportBatchForPreview(batchId);

  if (!batch) notFound();

  const prisma = getPrisma();
  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "LEAVE_BALANCE_IMPORT_VIEWED",
      targetType: "LEAVE_IMPORT_BATCH",
      targetId: batch.id,
      metadata: {
        batchId: batch.id,
        importType: batch.importType,
        status: batch.status,
        rowCount: batch.rowCount,
      },
    },
  });
  const [users, leaveTypes, validation, consistency, reconciliation] = await Promise.all([
    prisma.user.findMany({
      where: { status: "ACTIVE", role: { not: "EXTERNAL_PARTNER" } },
      include: { team: true, profile: true },
      orderBy: { name: "asc" },
    }),
    prisma.leaveTypeDefinition.findMany({
      where: { isEnabled: true },
      orderBy: { name: "asc" },
    }),
    validateLeaveImportBatch(batchId),
    validateLeaveLedgerConsistencyAfterImport(batchId),
    runLeaveImportReconciliation(batchId),
  ]);
  const message = resultMessage(query.error, query.success);
  const validationByRowId = new Map(validation.rows.map((row) => [row.rowId, row]));
  const reconciliationByRowId = new Map(reconciliation.rows.map((row) => [row.rowId, row]));
  const applyEnabled =
    batch.status !== "APPLIED" &&
    batch.status !== "REVERSED" &&
    batch.status !== "CANCELLED" &&
    batch.status !== "FAILED" &&
    validation.errorRows === 0;
  const reverseEnabled =
    batch.status === "APPLIED" &&
    batch.importType === "MONTHLY_ANNUAL_USAGE" &&
    !batch.reversedAt;
  const reviewRows = batch.rows.filter((row) => {
    const rowValidation = validationByRowId.get(row.id);
    return row.matchStatus !== "MATCHED" || !rowValidation?.canApply;
  });

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="휴가 관리"
        title="휴가 import 미리보기"
        description="직원 매칭, 휴가 유형 매핑, 상태 매핑, 경고와 오류를 검토한 뒤 Step-up 재인증 후 최종 반영합니다."
        actions={[{ href: "/admin/leaves/import", label: "이력으로 돌아가기" }]}
      />
      <LeaveAdminNav activeHref="/admin/leaves/import" />

      {message ? (
        <p
          className={`rounded-xl border px-4 py-3 text-sm font-medium break-keep ${
            message.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["유형", typeLabel(batch.importType)],
          ["상태", statusLabel(batch.status)],
          ["전체 row", String(validation.rowCount)],
          ["반영 가능 row", String(validation.applyableRows)],
          ["오류 row", String(validation.errorRows)],
          ["경고 row", String(validation.warningRows)],
          ["미매칭 row", String(validation.unmatchedRows)],
          ["중복 의심 row", String(validation.duplicateSuspectRows)],
          ["UNKNOWN row", String(validation.unknownStatusRows)],
          ["반영 제외 row", String(validation.excludedRows)],
        ].map(([label, value]) => (
          <Card key={label}>
            <p className="text-sm font-medium break-keep text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-semibold break-keep text-slate-950">{value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="break-keep text-slate-500">업로드 관리자</p>
            <p className="font-semibold break-keep text-slate-900">{batch.uploadedBy.name}</p>
          </div>
          <div>
            <p className="break-keep text-slate-500">반영 관리자</p>
            <p className="font-semibold break-keep text-slate-900">{batch.appliedBy?.name ?? "-"}</p>
          </div>
          <div>
            <p className="break-keep text-slate-500">취소 관리자</p>
            <p className="font-semibold break-keep text-slate-900">{batch.reversedBy?.name ?? "-"}</p>
          </div>
          <div>
            <p className="break-keep text-slate-500">취소 일시</p>
            <p className="font-semibold break-keep text-slate-900">
              {batch.reversedAt ? batch.reversedAt.toLocaleString("ko-KR") : "-"}
            </p>
          </div>
        </div>
        {batch.reverseReason ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm leading-relaxed break-keep text-slate-600">
            취소 사유: {batch.reverseReason}
          </p>
        ) : null}
      </Card>

      <Card>
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="font-semibold break-keep text-slate-950">최종 반영</h2>
            <p className="mt-1 text-sm leading-relaxed break-keep text-slate-500">
              엑셀 값으로 기존 휴가 요청이나 장부를 덮어쓰지 않습니다. 잔여 차이는 조정 이벤트로 기록하고, 상세 파일은 검증된 row만 import 이력으로 생성합니다.
            </p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-5">
              <div>
                <dt className="break-keep text-slate-500">반영 예정 직원</dt>
                <dd className="font-semibold text-slate-900">{validation.estimatedEmployeeCount}명</dd>
              </div>
              <div>
                <dt className="break-keep text-slate-500">휴가 요청</dt>
                <dd className="font-semibold text-slate-900">{validation.estimatedLeaveRequestCount}건</dd>
              </div>
              <div>
                <dt className="break-keep text-slate-500">LeaveLedger</dt>
                <dd className="font-semibold text-slate-900">{validation.estimatedLedgerCount}건</dd>
              </div>
              <div>
                <dt className="break-keep text-slate-500">잔여 조정</dt>
                <dd className="font-semibold text-slate-900">{validation.estimatedAdjustmentCount}건</dd>
              </div>
              <div>
                <dt className="break-keep text-slate-500">제외/경고 row</dt>
                <dd className="font-semibold text-slate-900">{validation.excludedRows}/{validation.warningRows}</dd>
              </div>
            </dl>
          </div>
          <form action={applyLeaveImportAction} className="shrink-0">
            <input type="hidden" name="batchId" value={batch.id} />
            <button
              type="submit"
              disabled={!applyEnabled}
              className={buttonClassName({
                className: `w-full lg:w-auto ${!applyEnabled ? "cursor-not-allowed opacity-50" : ""}`,
              })}
            >
              Step-up 후 최종 반영
            </button>
          </form>
        </div>
      </Card>

      {batch.status === "APPLIED" || batch.status === "REVERSED" ? (
        <Card>
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h2 className="font-semibold break-keep text-slate-950">반영 후 결과</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  ["반영 row", `${consistency.appliedRowCount}건`],
                  ["LeaveRequest", `${consistency.generatedLeaveRequestCount}건`],
                  ["LeaveLedger", `${consistency.generatedLedgerCount}건`],
                  ["LeaveAdjustment", `${consistency.generatedAdjustmentCount}건`],
                  ["건너뜀/실패", `${consistency.skippedRowCount}/${consistency.failedRowCount}`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-sm break-keep text-slate-500">{label}</p>
                    <p className="mt-1 text-lg font-semibold break-keep text-slate-950">{value}</p>
                  </div>
                ))}
              </div>
            </div>
            {reverseEnabled ? (
              <form action={reverseLeaveImportBatchAction} className="w-full max-w-md shrink-0 rounded-xl border border-red-200 bg-red-50 p-4">
                <input type="hidden" name="batchId" value={batch.id} />
                <h3 className="text-sm font-semibold break-keep text-red-900">업로드 반영 취소</h3>
                <p className="mt-2 text-sm leading-relaxed break-keep text-red-800">
                  기존 기록을 삭제하지 않고, 원래 조정값의 반대 방향 조정 기록을 추가하여 잔여 휴가를 복구합니다. 이 작업에는 Step-up 재인증이 필요합니다.
                </p>
                <label className="mt-3 grid gap-1 text-sm font-medium break-keep text-red-900">
                  취소 사유
                  <input
                    name="reverseReason"
                    defaultValue="휴가 현황 엑셀 업로드 반영 취소"
                    className="min-h-11 w-full rounded-lg border border-red-200 bg-white px-3 text-sm text-slate-900"
                  />
                </label>
                <button type="submit" className={buttonClassName({ tone: "danger", className: "mt-3 w-full" })}>
                  업로드 반영 취소
                </button>
              </form>
            ) : null}
          </div>
        </Card>
      ) : null}

      {batch.importType === "MONTHLY_ANNUAL_USAGE" ? (
        <Card>
          <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h2 className="font-semibold break-keep text-slate-950">잔여 연차 정합성 검증</h2>
              <p className="mt-1 text-sm leading-relaxed break-keep text-slate-500">
                엑셀 잔여와 LeaveLedger 기준 시스템 잔여를 비교합니다. 차이가 남는 경우 Step-up 후 차이값만 보정할 수 있습니다.
              </p>
            </div>
            <span className="text-sm font-medium break-keep text-slate-600">기준연도 {reconciliation.year}</span>
          </div>
          {reconciliation.rows.length === 0 ? (
            <EmptyState title="검증할 월별 잔여 row가 없습니다." />
          ) : (
            <ResponsiveTable minWidth="1100px">
              <thead className="border-b bg-slate-50 text-slate-600">
                <tr>
                  <th>직원</th>
                  <th>팀</th>
                  <th>엑셀 잔여</th>
                  <th>시스템 잔여</th>
                  <th>차이</th>
                  <th>대기/사용/조정</th>
                  <th>상태</th>
                  <th>보정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reconciliation.rows.map((row) => (
                  <tr key={row.rowId}>
                    <td>{row.userName}</td>
                    <td>{row.teamName ?? "-"}</td>
                    <td>{row.excelRemainingDays ?? "-"}</td>
                    <td>{row.systemRemainingDays}</td>
                    <td className={row.diff ? "font-semibold text-red-700" : "text-slate-700"}>{row.diff ?? "-"}</td>
                    <td>
                      {row.ledgerPendingDays}/{row.ledgerUsedDays}/{row.ledgerAdjustedDays}
                    </td>
                    <td>{statusLabel(row.status)}</td>
                    <td>
                      {row.canAdjust && batch.status === "APPLIED" ? (
                        <form action={createLeaveImportReconciliationAdjustmentAction}>
                          <input type="hidden" name="batchId" value={batch.id} />
                          <input type="hidden" name="userId" value={row.userId} />
                          <input type="hidden" name="year" value={row.year} />
                          <button className={buttonClassName({ tone: "danger", className: "min-h-9 px-3" })}>
                            차이값 보정
                          </button>
                        </form>
                      ) : (
                        <span className="text-sm break-keep text-slate-500">
                          {row.adjustmentLedgerId ? "보정 완료" : "보정 없음"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          )}
        </Card>
      ) : null}

      {reviewRows.length > 0 ? (
        <Card>
          <h2 className="font-semibold break-keep text-slate-950">확인 필요 row</h2>
          <p className="mt-1 text-sm leading-relaxed break-keep text-slate-500">
            직원 미매칭, 휴가 유형 미매핑, UNKNOWN 상태, 오류 row는 반영 전 수정하거나 제외해야 합니다.
          </p>
          <div className="mt-4 grid gap-3">
            {reviewRows.slice(0, 80).map((row) => {
              const rowValidation = validationByRowId.get(row.id);
              return (
                <form
                  key={row.id}
                  action={updateLeaveImportRowMappingAction}
                  className="grid gap-3 rounded-xl border border-slate-200 p-3 md:grid-cols-[1fr_220px_220px_180px_auto] md:items-end"
                >
                  <input type="hidden" name="batchId" value={batch.id} />
                  <input type="hidden" name="rowId" value={row.id} />
                  <div className="min-w-0">
                    <p className="font-medium break-keep text-slate-950">{rowTitle(row)}</p>
                    <p className="mt-1 text-sm break-words text-slate-500">
                      {jsonText(rowValidation?.errors)} · {jsonText(rowValidation?.warnings)}
                    </p>
                  </div>
                  <label className="grid gap-1 text-sm font-medium break-keep text-slate-700">
                    직원 매칭
                    <select name="matchedUserId" defaultValue={row.matchedUserId ?? ""} className="min-h-11 w-full rounded-lg border border-slate-300 px-3">
                      <option value="">선택 안 함</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} {user.team?.name ? `· ${user.team.name}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium break-keep text-slate-700">
                    휴가 유형
                    <select name="leaveTypeId" defaultValue={row.mappedLeaveTypeId ?? ""} className="min-h-11 w-full rounded-lg border border-slate-300 px-3">
                      <option value="">변경 없음</option>
                      {leaveTypes.map((leaveType) => (
                        <option key={leaveType.id} value={leaveType.id}>
                          {leaveType.name} ({leaveType.code})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-medium break-keep text-slate-700">
                    상태
                    <select name="mappedStatus" defaultValue={row.mappedStatus ?? ""} className="min-h-11 w-full rounded-lg border border-slate-300 px-3">
                      <option value="">변경 없음</option>
                      <option value="PENDING">승인대기</option>
                      <option value="APPROVED">승인완료</option>
                      <option value="CANCELLED">취소</option>
                      <option value="UNKNOWN">확인 필요</option>
                    </select>
                  </label>
                  <button className={buttonClassName({ tone: "neutral", className: "w-full" })}>저장</button>
                </form>
              );
            })}
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="font-semibold break-keep text-slate-950">row 미리보기</h2>
        {batch.rows.length === 0 ? (
          <EmptyState title="파싱된 row가 없습니다." />
        ) : (
          <>
            <ResponsiveTable minWidth="1180px">
              <thead className="border-b bg-slate-50 text-slate-600">
                <tr>
                  <th>행</th>
                  <th>직원</th>
                  <th>팀</th>
                  <th>기간/연도</th>
                  <th>항목</th>
                  <th>엑셀 잔여</th>
                  <th>시스템/차이</th>
                  <th>매칭</th>
                  <th>상태</th>
                  <th>오류/경고</th>
                  <th>적용</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batch.rows.map((row) => {
                  const rowValidation = validationByRowId.get(row.id);
                  const reconciliationRow = reconciliationByRowId.get(row.id);
                  return (
                    <tr key={row.id}>
                      <td>{row.rowNumber}</td>
                      <td>{row.matchedUser?.name ?? row.name ?? "-"}</td>
                      <td>{row.matchedUser?.team?.name ?? row.teamName ?? "-"}</td>
                      <td>
                        {batch.importType === "MONTHLY_ANNUAL_USAGE"
                          ? batch.targetYear ?? "-"
                          : `${formatDate(row.startDate)} ~ ${formatDate(row.endDate)}`}
                      </td>
                      <td>{row.leaveTypeRaw ?? row.mappedLeaveTypeCode ?? "-"}</td>
                      <td>{row.remainingAnnualDays ?? "-"}</td>
                      <td>
                        {reconciliationRow ? `${reconciliationRow.systemRemainingDays} / ${reconciliationRow.diff ?? 0}` : "-"}
                      </td>
                      <td>{statusLabel(row.matchStatus)}</td>
                      <td>{statusLabel(row.mappedStatus ?? rowValidation?.applyMode)}</td>
                      <td className="max-w-[280px] break-words">
                        {jsonText(rowValidation?.errors)} / {jsonText(rowValidation?.warnings)}
                      </td>
                      <td>{row.applied ? "반영됨" : rowValidation?.canApply ? "가능" : "차단"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </ResponsiveTable>
            <MobileCardList>
              {batch.rows.map((row) => {
                const rowValidation = validationByRowId.get(row.id);
                const reconciliationRow = reconciliationByRowId.get(row.id);
                return (
                  <Card key={row.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold break-keep text-slate-950">{rowTitle(row)}</p>
                        <p className="mt-1 text-sm break-keep text-slate-500">
                          {row.matchedUser?.team?.name ?? row.teamName ?? "-"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium break-keep text-slate-700">
                        {row.applied ? "반영됨" : rowValidation?.canApply ? "가능" : "차단"}
                      </span>
                    </div>
                    <dl className="mt-4 grid gap-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="shrink-0 break-keep text-slate-500">매칭</dt>
                        <dd className="min-w-0 text-right font-medium break-keep">{statusLabel(row.matchStatus)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="shrink-0 break-keep text-slate-500">잔여/차이</dt>
                        <dd className="min-w-0 text-right font-medium break-keep">
                          {row.remainingAnnualDays ?? "-"} / {reconciliationRow?.diff ?? "-"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="shrink-0 break-keep text-slate-500">상태</dt>
                        <dd className="min-w-0 text-right font-medium break-keep">
                          {statusLabel(row.mappedStatus ?? rowValidation?.applyMode)}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-sm leading-relaxed break-words text-slate-500">
                      {jsonText(rowValidation?.errors)} / {jsonText(rowValidation?.warnings)}
                    </p>
                  </Card>
                );
              })}
            </MobileCardList>
          </>
        )}
      </Card>

      <div>
        <Link className={buttonClassName({ tone: "neutral" })} href="/admin/leaves/import">
          import 이력으로 돌아가기
        </Link>
      </div>
    </section>
  );
}
