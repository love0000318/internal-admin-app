import Link from "next/link";

import {
  confirmAnnualLeaveUsePlan,
  requestAnnualLeaveUsePlanRevision,
} from "@/app/(app)/admin/leaves/promotions/actions";
import { getPrisma } from "@/lib/db/prisma";
import { findAnnualPromotionCandidates } from "@/lib/leave/annual-promotion";
import {
  annualUsePlanUsageTypeLabel,
  halfDayPeriodToUsageType,
  type AnnualUsePlanUsageType,
} from "@/lib/leave/annual-use-plan-calculator";
import {
  annualUsePlanWorkflowStatusLabel,
  buildAnnualUsePlanReviewUserWhere,
  deriveAnnualUsePlanReviewState,
  formatUsePlanAmount,
  getAnnualUsePlanReviewActionType,
  groupAnnualUsePlanReviewLogsByPlanId,
  hydrateAnnualUsePlanReviewActor,
  listAnnualUsePlanReviewLogs,
  planItemDateRangeLabel,
  type AnnualUsePlanReviewLog,
  type AnnualUsePlanWorkflowStatus,
} from "@/lib/leave/annual-use-plan-review";
import { dateToDateOnly, todayInSeoul } from "@/lib/leave/calculate-business-days";
import { getUserLeaveBalance } from "@/lib/leave/queries";
import { requireOwnerOrLead } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type PromotionsPageProps = {
  searchParams: Promise<{ year?: string; result?: string }>;
};

const ACTIVE_PLAN_STATUSES: AnnualUsePlanWorkflowStatus[] = [
  "SUBMITTED",
  "CONFIRMED",
  "REVISION_REQUESTED",
  "RESUBMITTED_AFTER_REVISION",
];

function parseYear(value: string | undefined) {
  const year = Number(value ?? todayInSeoul().slice(0, 4));
  return Number.isInteger(year) && year >= 2000 && year <= 2100
    ? year
    : Number(todayInSeoul().slice(0, 4));
}

function formatDate(value: Date | null | undefined) {
  return value ? dateToDateOnly(value) : "-";
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function resultMessage(result?: string) {
  const messages: Record<string, string> = {
    confirmed: "연차 사용계획 접수 확인을 완료했습니다.",
    "revision-requested": "연차 사용계획 보완요청을 보냈습니다.",
    "revision-reason-required": "보완요청 사유를 입력해 주세요.",
    "not-reviewable": "현재 상태에서는 처리할 수 없는 사용계획입니다.",
    invalid: "요청 값을 확인해 주세요.",
    "not-found": "사용계획을 찾을 수 없습니다.",
  };

  return result ? messages[result] ?? "처리가 완료되었습니다." : null;
}

function noticeStatusLabel(status: string) {
  switch (status) {
    case "SCHEDULED":
      return "발송 예정";
    case "SENT":
      return "발송 완료";
    case "CANCELLED":
      return "취소됨";
    case "SKIPPED":
      return "제외됨";
    default:
      return status;
  }
}

function noticeTypeLabel(type: string) {
  switch (type) {
    case "ANNUAL_USE_PLAN_REQUEST":
      return "연차 사용계획 요청";
    case "ANNUAL_SECOND_NOTICE":
      return "연차 2차 고지";
    case "MONTHLY_FIRST_NOTICE":
      return "1년 미만 1차 고지";
    case "MONTHLY_SECOND_NOTICE":
      return "1년 미만 2차 고지";
    case "USE_PLAN_REMINDER":
      return "사용 예정일 알림";
    default:
      return type;
  }
}

function itemUsageType(item: {
  usageType?: AnnualUsePlanUsageType | null;
  halfDayPeriod?: "AM" | "PM" | null;
}) {
  return item.usageType ?? halfDayPeriodToUsageType(item.halfDayPeriod ?? null);
}

function itemAmount(item: { calculatedAmount?: number | null; amount: number }) {
  return item.calculatedAmount ?? item.amount;
}

function metadataRecord(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return metadata as Record<string, unknown>;
}

function metadataString(metadata: unknown, key: string) {
  const value = metadataRecord(metadata)?.[key];
  return typeof value === "string" ? value : null;
}

function auditActionLabel(log: AnnualUsePlanReviewLog) {
  const actionType = getAnnualUsePlanReviewActionType(log);

  if (actionType === "CONFIRMED") {
    return "접수 확인";
  }

  if (actionType === "REVISION_REQUESTED") {
    return "보완요청";
  }

  if (actionType === "RESUBMITTED_AFTER_REVISION") {
    return "보완 후 재제출";
  }

  if (log.action === "ANNUAL_LEAVE_USE_PLAN_SUBMITTED") {
    return "제출";
  }

  if (log.action === "ANNUAL_LEAVE_USE_PLAN_CANCELLED") {
    return "취소";
  }

  return "상태 갱신";
}

function statusBadgeClass(status: AnnualUsePlanWorkflowStatus) {
  switch (status) {
    case "CONFIRMED":
      return "bg-green-50 text-green-700";
    case "REVISION_REQUESTED":
      return "bg-amber-50 text-amber-700";
    case "RESUBMITTED_AFTER_REVISION":
      return "bg-blue-50 text-blue-700";
    case "CANCELLED":
      return "bg-neutral-100 text-neutral-500";
    case "DRAFT":
    case "NOT_SUBMITTED":
      return "bg-neutral-50 text-neutral-600";
    case "SUBMITTED":
    default:
      return "bg-indigo-50 text-indigo-700";
  }
}

export default async function AnnualLeavePromotionsPage({
  searchParams,
}: PromotionsPageProps) {
  const actor = await requireOwnerOrLead();
  const params = await searchParams;
  const year = parseYear(params.year);
  const message = resultMessage(params.result);
  const prisma = getPrisma();
  const scopedActor = await hydrateAnnualUsePlanReviewActor(actor, prisma);
  const scopedUserWhere = buildAnnualUsePlanReviewUserWhere(scopedActor);
  const [scopedUsers, allCandidates, notices, plans] = await Promise.all([
    prisma.user.findMany({
      where: scopedUserWhere,
      select: { id: true },
    }),
    findAnnualPromotionCandidates({ year, prisma }),
    prisma.annualLeavePromotionNotice.findMany({
      where: {
        referenceYear: year,
        user: scopedUserWhere,
      },
      include: {
        user: { include: { team: true } },
        annualLeaveUsePlan: true,
      },
      orderBy: [{ scheduledDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.annualLeaveUsePlan.findMany({
      where: {
        referenceYear: year,
        user: scopedUserWhere,
      },
      include: {
        user: { include: { team: true, profile: true } },
        items: {
          orderBy: [{ plannedStartDate: "asc" }, { plannedDate: "asc" }],
        },
      },
      orderBy: [{ submittedAt: "desc" }, { updatedAt: "desc" }],
    }),
  ]);
  const scopedUserIds = new Set(scopedUsers.map((user) => user.id));
  const candidates = allCandidates.filter((candidate) =>
    scopedUserIds.has(candidate.userId),
  );
  const candidateByUserId = new Map(
    candidates.map((candidate) => [candidate.userId, candidate]),
  );
  const uniqueCandidates = [...candidateByUserId.values()];
  const [reviewLogs, balanceEntries] = await Promise.all([
    listAnnualUsePlanReviewLogs({
      planIds: plans.map((plan) => plan.id),
      prisma,
    }),
    Promise.all(
      plans.map(async (plan) => {
        const balance = await getUserLeaveBalance({
          userId: plan.userId,
          year,
          prisma,
        });
        return [plan.id, Math.max(0, balance.remainingDays)] as const;
      }),
    ),
  ]);
  const logsByPlanId = groupAnnualUsePlanReviewLogsByPlanId(reviewLogs);
  const remainingByPlanId = new Map(balanceEntries);
  const stateByPlanId = new Map(
    plans.map((plan) => [
      plan.id,
      deriveAnnualUsePlanReviewState({
        plan,
        logs: logsByPlanId.get(plan.id) ?? [],
      }),
    ]),
  );
  const planByUserId = new Map(plans.map((plan) => [plan.userId, plan]));
  const sentCount = notices.filter((notice) => notice.status === "SENT").length;
  const scheduledCount = notices.filter(
    (notice) => notice.status === "SCHEDULED",
  ).length;
  const unsubmittedCount = uniqueCandidates.filter((candidate) => {
    const plan = planByUserId.get(candidate.userId);
    const status = plan ? stateByPlanId.get(plan.id)?.status : "NOT_SUBMITTED";
    return (
      status === "NOT_SUBMITTED" ||
      status === "DRAFT" ||
      status === "CANCELLED"
    );
  }).length;
  const submittedCount = plans.filter((plan) =>
    ACTIVE_PLAN_STATUSES.includes(
      stateByPlanId.get(plan.id)?.status ?? "NOT_SUBMITTED",
    ),
  ).length;
  const confirmedCount = plans.filter(
    (plan) => stateByPlanId.get(plan.id)?.status === "CONFIRMED",
  ).length;
  const revisionRequestedCount = plans.filter(
    (plan) => stateByPlanId.get(plan.id)?.status === "REVISION_REQUESTED",
  ).length;
  const resubmittedCount = plans.filter(
    (plan) => stateByPlanId.get(plan.id)?.status === "RESUBMITTED_AFTER_REVISION",
  ).length;

  return (
    <section>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">휴가 관리</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            연차촉진 사용계획 관리
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-600">
            제출된 연차 사용계획을 접수 확인하고, 계획일수와 잔여 연차를 검토합니다.
            이 확인은 실제 휴가 신청 승인과 별개이며, 직원의 연차 사용권을 제한하지
            않습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/leaves/annual-policy"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            연차 정책 설정
          </Link>
          <Link
            href="/admin/reports/leaves/promotions"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            촉진 리포트
          </Link>
        </div>
      </div>

      <form className="mt-4 flex max-w-xs gap-2">
        <input
          name="year"
          type="number"
          defaultValue={year}
          className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm"
          aria-label="기준 연도"
        />
        <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
          조회
        </button>
      </form>

      {message ? (
        <p className="mt-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
          {message}
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        {[
          ["전체 대상자", uniqueCandidates.length],
          ["미제출자", unsubmittedCount],
          ["제출자", submittedCount],
          ["확인 완료", confirmedCount],
          ["보완요청", revisionRequestedCount],
          ["보완 후 재제출", resubmittedCount],
          ["알림 발송 완료", sentCount],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
          >
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-neutral-500">
        발송 예정 알림 {scheduledCount}건, 제출 완료 사용계획 {submittedCount}건입니다.
      </p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-100 px-4 py-3">
          <h2 className="text-base font-semibold">제출된 사용계획 검토</h2>
        </div>
        <table className="w-full min-w-[1180px] table-auto text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">직원</th>
              <th className="px-4 py-3">팀</th>
              <th className="px-4 py-3">직급</th>
              <th className="px-4 py-3">잔여 연차</th>
              <th className="px-4 py-3">계획일수</th>
              <th className="px-4 py-3">제출일</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">처리자</th>
              <th className="px-4 py-3">처리일시</th>
              <th className="px-4 py-3">상세/처리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {plans.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={10}>
                  조회 조건에 맞는 연차 사용계획이 없습니다.
                </td>
              </tr>
            ) : (
              plans.map((plan) => {
                const state =
                  stateByPlanId.get(plan.id) ??
                  deriveAnnualUsePlanReviewState({ plan, logs: [] });
                const logs = logsByPlanId.get(plan.id) ?? [];
                const remainingDays = remainingByPlanId.get(plan.id) ?? 0;
                const canAct = state.canReviewerAct && plan.status === "SUBMITTED";

                return (
                  <tr key={plan.id} id={`plan-${plan.id}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{plan.user.name}</p>
                      <p className="text-xs text-neutral-500">{plan.user.email}</p>
                    </td>
                    <td className="px-4 py-3">{plan.user.team?.name ?? "-"}</td>
                    <td className="px-4 py-3">
                      {plan.user.title ?? plan.user.profile?.jobTitle ?? "-"}
                    </td>
                    <td className="px-4 py-3">{formatUsePlanAmount(remainingDays)}</td>
                    <td className="px-4 py-3">
                      {formatUsePlanAmount(plan.totalPlannedAmount)}
                    </td>
                    <td className="px-4 py-3">{formatDateTime(plan.submittedAt)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass(
                          state.status,
                        )}`}
                      >
                        {state.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">{state.reviewerName ?? "-"}</td>
                    <td className="px-4 py-3">{formatDateTime(state.reviewedAt)}</td>
                    <td className="px-4 py-3">
                      <details className="group">
                        <summary className="cursor-pointer text-sm font-medium text-neutral-950">
                          상세 보기
                        </summary>
                        <div className="mt-4 grid gap-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                          <div>
                            <h3 className="font-semibold text-neutral-950">
                              사용계획 항목
                            </h3>
                            <div className="mt-2 overflow-x-auto rounded-md border border-neutral-200 bg-white">
                              <table className="w-full min-w-[720px] text-left text-xs">
                                <thead className="bg-neutral-50 text-neutral-500">
                                  <tr>
                                    <th className="px-3 py-2">기간</th>
                                    <th className="px-3 py-2">사용 형태</th>
                                    <th className="px-3 py-2">일수</th>
                                    <th className="px-3 py-2">메모</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100">
                                  {plan.items.map((item) => (
                                    <tr key={item.id}>
                                      <td className="px-3 py-2">
                                        {planItemDateRangeLabel(item)}
                                      </td>
                                      <td className="px-3 py-2">
                                        {annualUsePlanUsageTypeLabel(
                                          itemUsageType(item),
                                        )}
                                      </td>
                                      <td className="px-3 py-2">
                                        {formatUsePlanAmount(itemAmount(item))}
                                      </td>
                                      <td className="px-3 py-2 break-words">
                                        {item.memo ?? "-"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          <div>
                            <h3 className="font-semibold text-neutral-950">
                              처리 이력
                            </h3>
                            {logs.length === 0 ? (
                              <p className="mt-2 text-sm text-neutral-500">
                                기록된 처리 이력이 없습니다.
                              </p>
                            ) : (
                              <ul className="mt-2 grid gap-2 text-xs text-neutral-700">
                                {logs.map((log) => {
                                  const reason = metadataString(
                                    log.metadata,
                                    "revisionReason",
                                  );

                                  return (
                                    <li
                                      key={log.id}
                                      className="rounded-md border border-neutral-200 bg-white p-3"
                                    >
                                      <p className="font-medium">
                                        {auditActionLabel(log)} ·{" "}
                                        {formatDateTime(log.createdAt)}
                                      </p>
                                      <p className="mt-1 text-neutral-500">
                                        처리자: {log.actor?.name ?? "-"}
                                      </p>
                                      {reason ? (
                                        <p className="mt-1 break-words">
                                          보완요청 사유: {reason}
                                        </p>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>

                          {canAct ? (
                            <div className="grid gap-3 border-t border-neutral-200 pt-4 lg:grid-cols-2">
                              <form action={confirmAnnualLeaveUsePlan}>
                                <input name="planId" type="hidden" value={plan.id} />
                                <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
                                  접수 확인
                                </button>
                              </form>
                              <form
                                action={requestAnnualLeaveUsePlanRevision}
                                className="grid gap-2"
                              >
                                <input name="planId" type="hidden" value={plan.id} />
                                <label className="text-xs font-medium text-neutral-700">
                                  보완요청 사유
                                  <textarea
                                    name="revisionReason"
                                    className="mt-1 min-h-20 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
                                    maxLength={500}
                                    required
                                  />
                                </label>
                                <button className="h-10 w-fit rounded-md border border-amber-300 px-4 text-sm font-medium text-amber-700">
                                  보완요청
                                </button>
                              </form>
                            </div>
                          ) : (
                            <p className="border-t border-neutral-200 pt-4 text-sm text-neutral-500">
                              현재 상태에서는 추가 처리 버튼이 표시되지 않습니다.
                            </p>
                          )}
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-100 px-4 py-3">
          <h2 className="text-base font-semibold">연차촉진 알림 현황</h2>
        </div>
        <table className="w-full min-w-[1120px] table-auto text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">직원</th>
              <th className="px-4 py-3">팀</th>
              <th className="px-4 py-3">촉진 유형</th>
              <th className="px-4 py-3">소멸 예정</th>
              <th className="px-4 py-3">소멸일</th>
              <th className="px-4 py-3">알림 예정일</th>
              <th className="px-4 py-3">알림 상태</th>
              <th className="px-4 py-3">사용계획 상태</th>
              <th className="px-4 py-3">제출일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {notices.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={9}>
                  생성된 연차촉진 알림이 없습니다.
                </td>
              </tr>
            ) : (
              notices.map((notice) => {
                const planState = notice.annualLeaveUsePlan
                  ? stateByPlanId.get(notice.annualLeaveUsePlan.id)
                  : null;

                return (
                  <tr key={notice.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{notice.user.name}</p>
                      <p className="text-xs text-neutral-500">{notice.user.email}</p>
                    </td>
                    <td className="px-4 py-3">{notice.user.team?.name ?? "-"}</td>
                    <td className="px-4 py-3">{noticeTypeLabel(notice.noticeType)}</td>
                    <td className="px-4 py-3">
                      {typeof notice.remainingAmount === "number"
                        ? formatUsePlanAmount(notice.remainingAmount)
                        : "-"}
                    </td>
                    <td className="px-4 py-3">{formatDate(notice.expirationDate)}</td>
                    <td className="px-4 py-3">{formatDate(notice.scheduledDate)}</td>
                    <td className="px-4 py-3">
                      {noticeStatusLabel(notice.status)}
                    </td>
                    <td className="px-4 py-3">
                      {planState?.label ??
                        annualUsePlanWorkflowStatusLabel(
                          notice.annualLeaveUsePlan?.status ?? "NOT_SUBMITTED",
                        )}
                    </td>
                    <td className="px-4 py-3">
                      {formatDateTime(notice.annualLeaveUsePlan?.submittedAt)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
