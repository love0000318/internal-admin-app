import Link from "next/link";

import {
  AnnualUsePlanReviewPanel,
  buildAnnualUsePlanReviewReturnTo,
} from "@/components/leave/annual-use-plan-review-panel";
import { getPrisma } from "@/lib/db/prisma";
import { dateToDateOnly, todayInSeoul } from "@/lib/leave/calculate-business-days";
import { listAnnualUsePlanReviewRows } from "@/lib/leave/annual-use-plan-review";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type PromotionsPageProps = {
  searchParams: Promise<{
    year?: string;
    success?: string;
    error?: string;
    status?: string;
    team?: string;
    sort?: string;
  }>;
};

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

function planStatusLabel(status?: string | null) {
  switch (status) {
    case "SUBMITTED":
      return "제출 완료";
    case "CANCELLED":
      return "취소됨";
    case "DRAFT":
      return "작성 중";
    default:
      return "미제출";
  }
}

function yearFromParam(value: string | undefined) {
  const fallback = Number(todayInSeoul().slice(0, 4));
  const year = Number(value ?? fallback);

  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : fallback;
}

export default async function AnnualLeavePromotionsPage({
  searchParams,
}: PromotionsPageProps) {
  const actor = await requireOwner();
  const params = await searchParams;
  const year = yearFromParam(params.year);
  const prisma = getPrisma();
  const [rows, notices] = await Promise.all([
    listAnnualUsePlanReviewRows({ actor, year, prisma }),
    prisma.annualLeavePromotionNotice.findMany({
      where: { referenceYear: year },
      include: {
        user: { include: { team: true } },
        annualLeaveUsePlan: true,
      },
      orderBy: [{ scheduledDate: "asc" }, { createdAt: "desc" }],
    }),
  ]);
  const returnTo = buildAnnualUsePlanReviewReturnTo({
    basePath: "/admin/leaves/promotions",
    year,
    status: params.status,
    team: params.team,
    sort: params.sort,
  });

  return (
    <section className="min-w-0 space-y-8">
      <AnnualUsePlanReviewPanel
        basePath="/admin/leaves/promotions"
        backHref="/admin/leaves/annual-policy"
        error={params.error}
        returnTo={returnTo}
        rows={rows}
        sort={params.sort}
        statusFilter={params.status}
        success={params.success}
        teamFilter={params.team}
        year={year}
      />

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">촉진 알림 현황</h2>
            <p className="mt-1 text-sm text-slate-500">
              예정 고지 생성과 인앱 알림 발송 증적을 확인합니다.
            </p>
          </div>
          <Link
            className="text-sm font-semibold text-blue-700 underline"
            href="/admin/jobs"
          >
            작업 현황
          </Link>
        </div>
        <table className="w-full min-w-[1100px] table-auto text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3">직원</th>
              <th className="px-4 py-3">팀</th>
              <th className="px-4 py-3">촉진 유형</th>
              <th className="px-4 py-3">소멸 예정</th>
              <th className="px-4 py-3">소멸일</th>
              <th className="px-4 py-3">알림 예정일</th>
              <th className="px-4 py-3">알림 상태</th>
              <th className="px-4 py-3">사용계획</th>
              <th className="px-4 py-3">제출일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {notices.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={9}>
                  생성된 연차 촉진 알림이 없습니다. 운영 스크립트의 dry-run으로
                  대상자를 먼저 확인해 주세요.
                </td>
              </tr>
            ) : (
              notices.map((notice) => (
                <tr key={notice.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-950">{notice.user.name}</p>
                    <p className="text-xs text-slate-500">{notice.user.email}</p>
                  </td>
                  <td className="px-4 py-3">{notice.user.team?.name ?? "-"}</td>
                  <td className="px-4 py-3">{notice.noticeType}</td>
                  <td className="px-4 py-3">
                    {notice.remainingAmount ?? "-"}일
                  </td>
                  <td className="px-4 py-3">
                    {notice.expirationDate
                      ? dateToDateOnly(notice.expirationDate)
                      : "-"}
                  </td>
                  <td className="px-4 py-3">{dateToDateOnly(notice.scheduledDate)}</td>
                  <td className="px-4 py-3">{noticeStatusLabel(notice.status)}</td>
                  <td className="px-4 py-3">
                    {planStatusLabel(notice.annualLeaveUsePlan?.status)}
                  </td>
                  <td className="px-4 py-3">
                    {notice.annualLeaveUsePlan?.submittedAt
                      ? dateToDateOnly(notice.annualLeaveUsePlan.submittedAt)
                      : "-"}
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
