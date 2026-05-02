import Link from "next/link";

import { getPrisma } from "@/lib/db/prisma";
import { findAnnualPromotionCandidates } from "@/lib/leave/annual-promotion";
import { dateToDateOnly, todayInSeoul } from "@/lib/leave/calculate-business-days";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type PromotionsPageProps = {
  searchParams: Promise<{ year?: string }>;
};

function statusLabel(status: string) {
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

export default async function AnnualLeavePromotionsPage({
  searchParams,
}: PromotionsPageProps) {
  await requireOwner();
  const params = await searchParams;
  const year = Number(params.year ?? todayInSeoul().slice(0, 4));
  const prisma = getPrisma();
  const [candidates, notices, plans] = await Promise.all([
    findAnnualPromotionCandidates({ year, prisma }),
    prisma.annualLeavePromotionNotice.findMany({
      where: { referenceYear: year },
      include: {
        user: { include: { team: true } },
        annualLeaveUsePlan: true,
      },
      orderBy: [{ scheduledDate: "asc" }, { createdAt: "desc" }],
    }),
    prisma.annualLeaveUsePlan.findMany({
      where: { referenceYear: year },
      include: {
        user: { include: { team: true } },
        items: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const sentCount = notices.filter((notice) => notice.status === "SENT").length;
  const scheduledCount = notices.filter((notice) => notice.status === "SCHEDULED").length;
  const submittedCount = plans.filter((plan) => plan.status === "SUBMITTED").length;
  const totalExpiringAmount = candidates.reduce(
    (sum, candidate) => sum + candidate.remainingAmount,
    0,
  );

  return (
    <section>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">휴가 관리</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            연차 촉진 관리
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">
            연차 촉진 대상자와 사용계획 제출 현황을 확인합니다. 연차 촉진
            운영은 회사 정책과 노무 검토가 필요한 영역입니다.
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
            href="/admin/leaves/history"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            휴가 장부
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

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-neutral-500">촉진 대상자</p>
          <p className="mt-2 text-2xl font-semibold">{candidates.length}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-neutral-500">알림 예정</p>
          <p className="mt-2 text-2xl font-semibold">{scheduledCount}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-neutral-500">알림 완료</p>
          <p className="mt-2 text-2xl font-semibold">{sentCount}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-neutral-500">사용계획 제출</p>
          <p className="mt-2 text-2xl font-semibold">{submittedCount}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-neutral-500">소멸 예정 합계</p>
          <p className="mt-2 text-2xl font-semibold">
            {Math.round(totalExpiringAmount * 10) / 10}일
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-100 px-4 py-3">
          <h2 className="text-base font-semibold">촉진 알림 현황</h2>
        </div>
        <table className="w-full min-w-[1100px] table-auto text-left text-sm [&_td]:break-keep [&_th]:break-keep [&_th]:whitespace-nowrap">
          <thead className="bg-neutral-50 text-neutral-500">
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
          <tbody className="divide-y divide-neutral-100">
            {notices.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={9}>
                  생성된 연차 촉진 알림이 없습니다. 운영 스크립트
                  `pnpm jobs:schedule-annual-promotion-notices -- --dry-run`으로
                  먼저 대상자를 확인하세요.
                </td>
              </tr>
            ) : (
              notices.map((notice) => (
                <tr key={notice.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{notice.user.name}</p>
                    <p className="text-xs text-neutral-500">{notice.user.email}</p>
                  </td>
                  <td className="px-4 py-3">{notice.user.team?.name ?? "-"}</td>
                  <td className="px-4 py-3">{notice.noticeType}</td>
                  <td className="px-4 py-3">
                    {notice.remainingAmount ?? "-"}일
                  </td>
                  <td className="px-4 py-3">
                    {notice.expirationDate ? dateToDateOnly(notice.expirationDate) : "-"}
                  </td>
                  <td className="px-4 py-3">{dateToDateOnly(notice.scheduledDate)}</td>
                  <td className="px-4 py-3">{statusLabel(notice.status)}</td>
                  <td className="px-4 py-3">
                    {planStatusLabel(notice.annualLeaveUsePlan?.status)}
                  </td>
                  <td className="px-4 py-3">
                    {notice.annualLeaveUsePlan?.submittedAt
                      ? notice.annualLeaveUsePlan.submittedAt.toISOString().slice(0, 10)
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
