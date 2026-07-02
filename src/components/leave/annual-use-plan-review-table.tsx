"use client";

import { Fragment, useState } from "react";

import {
  confirmAnnualLeaveUsePlan,
  requestAnnualLeaveUsePlanRevision,
} from "@/app/(app)/admin/leaves/promotions/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { Badge, buttonClassName } from "@/components/design-system/primitives";

type BadgeTone = "default" | "primary" | "success" | "warning" | "danger" | "info";

export type AnnualUsePlanReviewTableRow = {
  userId: string;
  planId: string | null;
  name: string;
  email: string;
  teamLabel: string;
  titleLabel: string;
  remainingAnnualDaysLabel: string;
  expiringAnnualDaysLabel: string;
  expirationDateLabel: string;
  expirationSoon: boolean;
  plannedAmountLabel: string;
  submittedAtLabel: string;
  statusLabel: string;
  statusTone: BadgeTone;
  latestReviewLabel: string | null;
  latestReviewDateLabel: string | null;
  planMemo: string | null;
  planPeriodLabel: string;
  canReview: boolean;
  items: Array<{
    id: string;
    periodLabel: string;
    usageTypeLabel: string;
    amountLabel: string;
    memoLabel: string;
  }>;
  reviewHistory: Array<{
    id: string;
    actionLabel: string;
    actionTone: BadgeTone;
    reviewerLabel: string;
    reviewedAtLabel: string;
    revisionReason: string | null;
  }>;
};

type AnnualUsePlanReviewTableProps = {
  rows: AnnualUsePlanReviewTableRow[];
  returnTo: string;
  totalCount: number;
};

function compactButtonClassName(tone: "primary" | "neutral" = "neutral") {
  return buttonClassName({
    tone,
    className: "min-h-8 px-3 py-1.5 text-xs",
  });
}

function ReviewActionPanel({
  row,
  returnTo,
  revisionOpen,
  onOpenRevision,
  onCloseRevision,
}: {
  row: AnnualUsePlanReviewTableRow;
  returnTo: string;
  revisionOpen: boolean;
  onOpenRevision: () => void;
  onCloseRevision: () => void;
}) {
  if (!row.planId || !row.canReview) {
    return (
      <p className="text-xs leading-relaxed text-slate-500">
        처리 가능한 제출 상태가 아닙니다.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      <form action={confirmAnnualLeaveUsePlan}>
        <input name="planId" type="hidden" value={row.planId} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <ConfirmSubmitButton
          className={compactButtonClassName("primary")}
          message="이 연차 사용계획을 접수 확인 완료 처리할까요?"
        >
          접수 확인 완료
        </ConfirmSubmitButton>
      </form>

      {revisionOpen ? (
        <form action={requestAnnualLeaveUsePlanRevision} className="grid gap-2">
          <input name="planId" type="hidden" value={row.planId} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <textarea
            autoFocus
            className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm leading-relaxed outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            name="revisionReason"
            placeholder="보완요청 사유"
            required
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              className={compactButtonClassName("neutral")}
              onClick={onCloseRevision}
              type="button"
            >
              취소
            </button>
            <ConfirmSubmitButton
              className={compactButtonClassName("neutral")}
              message="이 사용계획에 보완요청을 등록할까요?"
            >
              보완요청 제출
            </ConfirmSubmitButton>
          </div>
        </form>
      ) : (
        <button
          className={compactButtonClassName("neutral")}
          onClick={onOpenRevision}
          type="button"
        >
          보완요청
        </button>
      )}
    </div>
  );
}

function PlanItemsTable({ row }: { row: AnnualUsePlanReviewTableRow }) {
  if (row.items.length === 0) {
    return <p className="text-xs text-slate-500">제출된 상세 계획이 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="border-b border-slate-200 text-slate-500">
          <tr>
            <th className="px-2 py-2 font-medium">사용 기간</th>
            <th className="px-2 py-2 font-medium">사용 형태</th>
            <th className="px-2 py-2 text-right font-medium">계획일수</th>
            <th className="px-2 py-2 font-medium">사유/메모</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {row.items.map((item) => (
            <tr key={item.id}>
              <td className="whitespace-nowrap px-2 py-2 text-slate-800">
                {item.periodLabel}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-slate-700">
                {item.usageTypeLabel}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-slate-800">
                {item.amountLabel}
              </td>
              <td className="max-w-[280px] px-2 py-2 text-slate-600">
                <span className="line-clamp-2">{item.memoLabel}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewHistoryList({ row }: { row: AnnualUsePlanReviewTableRow }) {
  if (row.reviewHistory.length === 0) {
    return <p className="text-xs text-slate-500">처리 이력이 없습니다.</p>;
  }

  return (
    <ul className="grid gap-2 text-xs">
      {row.reviewHistory.map((history) => (
        <li key={history.id} className="rounded-md border border-slate-200 bg-white p-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={history.actionTone}>{history.actionLabel}</Badge>
            <span className="font-medium text-slate-700">{history.reviewerLabel}</span>
            <span className="text-slate-400">{history.reviewedAtLabel}</span>
          </div>
          {history.revisionReason ? (
            <p className="mt-2 leading-relaxed text-slate-600">
              보완요청 사유: {history.revisionReason}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function AnnualUsePlanReviewTable({
  rows,
  returnTo,
  totalCount,
}: AnnualUsePlanReviewTableProps) {
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [revisionUserId, setRevisionUserId] = useState<string | null>(null);

  return (
    <div
      className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm"
      data-testid="annual-use-plan-review-table"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
        <span>
          {rows.length}명 표시
          {rows.length !== totalCount ? ` / 전체 ${totalCount}명` : ""}
        </span>
      </div>
      <table className="w-full min-w-[1040px] table-fixed text-left text-xs">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="w-[230px] px-3 py-2 font-medium">구성원</th>
            <th className="w-[95px] px-3 py-2 text-right font-medium">잔여 연차</th>
            <th className="w-[130px] px-3 py-2 text-right font-medium">소멸 예정</th>
            <th className="w-[95px] px-3 py-2 text-right font-medium">계획일수</th>
            <th className="w-[110px] px-3 py-2 font-medium">제출일</th>
            <th className="w-[135px] px-3 py-2 font-medium">상태</th>
            <th className="w-[170px] px-3 py-2 font-medium">최근 처리</th>
            <th className="w-[100px] px-3 py-2 text-right font-medium">상세/처리</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-8 text-center text-sm text-slate-500" colSpan={8}>
                조건에 맞는 사용계획 대상자가 없습니다.
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const expanded = expandedUserId === row.userId;
              const detailId = `annual-use-plan-detail-${row.userId}`;

              return (
                <Fragment key={row.userId}>
                  <tr className={expanded ? "bg-blue-50/40" : "hover:bg-slate-50"}>
                    <td className="px-3 py-2">
                      <p className="truncate font-semibold text-slate-950">{row.name}</p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {row.teamLabel}
                        {row.titleLabel !== "-" ? ` · ${row.titleLabel}` : ""}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-400">
                        {row.email}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                      {row.remainingAnnualDaysLabel}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-1">
                        {row.expirationSoon ? <Badge tone="warning">임박</Badge> : null}
                        <span className="text-slate-800">{row.expiringAnnualDaysLabel}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {row.expirationDateLabel}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                      {row.plannedAmountLabel}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                      {row.submittedAtLabel}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={row.statusTone}>{row.statusLabel}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {row.latestReviewLabel ? (
                        <>
                          <p className="truncate font-medium text-slate-700">
                            {row.latestReviewLabel}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-400">
                            {row.latestReviewDateLabel}
                          </p>
                        </>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          처리 이력이 없습니다.
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        aria-controls={detailId}
                        aria-expanded={expanded}
                        className={compactButtonClassName(expanded ? "neutral" : "primary")}
                        onClick={() => {
                          setExpandedUserId(expanded ? null : row.userId);
                          setRevisionUserId(null);
                        }}
                        type="button"
                      >
                        {expanded ? "닫기" : "상세 보기"}
                      </button>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr id={detailId}>
                      <td className="bg-slate-50 px-3 py-3" colSpan={8}>
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(230px,0.8fr)_minmax(240px,0.7fr)]">
                          <section className="min-w-0 rounded-md border border-slate-200 bg-white p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h3 className="text-xs font-semibold text-slate-900">
                                계획 상세 내역
                              </h3>
                              <span className="text-xs text-slate-500">
                                사용 기간 {row.planPeriodLabel}
                              </span>
                            </div>
                            {row.planMemo ? (
                              <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
                                메모: {row.planMemo}
                              </p>
                            ) : null}
                            <div className="mt-3">
                              <PlanItemsTable row={row} />
                            </div>
                          </section>

                          <section className="min-w-0 rounded-md border border-slate-200 bg-white p-3">
                            <h3 className="text-xs font-semibold text-slate-900">
                              처리 이력
                            </h3>
                            <div className="mt-3">
                              <ReviewHistoryList row={row} />
                            </div>
                          </section>

                          <section className="min-w-0 rounded-md border border-slate-200 bg-white p-3">
                            <h3 className="text-xs font-semibold text-slate-900">
                              처리
                            </h3>
                            <div className="mt-3">
                              <ReviewActionPanel
                                onCloseRevision={() => setRevisionUserId(null)}
                                onOpenRevision={() => setRevisionUserId(row.userId)}
                                returnTo={returnTo}
                                revisionOpen={revisionUserId === row.userId}
                                row={row}
                              />
                            </div>
                          </section>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
