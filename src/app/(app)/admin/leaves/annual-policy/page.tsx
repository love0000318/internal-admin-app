import Link from "next/link";

import { updateAnnualLeavePolicy } from "@/app/(app)/admin/leaves/annual-policy/actions";
import {
  calculateAnnualLeavePromotionSchedule,
  calculateFiscalYearDateRange,
  getActiveAnnualLeavePolicy,
} from "@/lib/leave/annual-policy";
import { getPrisma } from "@/lib/db/prisma";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type AnnualLeavePolicyPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

function errorMessage(kind?: string) {
  const messages: Record<string, string> = {
    invalid: "입력값을 확인해 주세요.",
    "max-less-than-base": "최대 연차 한도는 기본 연차일수보다 작을 수 없습니다.",
    "not-found": "연차 정책을 찾을 수 없습니다.",
    "invalid-approver": "연차 촉진 승인·참조 대상은 활성 OWNER 또는 LEAD만 선택할 수 있습니다.",
  };

  return kind ? messages[kind] ?? "처리 중 오류가 발생했습니다." : null;
}

function dateInputValue(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "-";
}

function CheckField({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}

export default async function AnnualLeavePolicyPage({
  searchParams,
}: AnnualLeavePolicyPageProps) {
  await requireOwner();
  const params = await searchParams;
  const prisma = getPrisma();
  const [policy, approverCandidates] = await Promise.all([
    getActiveAnnualLeavePolicy(prisma),
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        role: { in: ["OWNER", "LEAD"] },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    }),
  ]);
  const thisYear = new Date().getFullYear();
  const fiscalRange = calculateFiscalYearDateRange(policy, thisYear);
  const promotionPreview = calculateAnnualLeavePromotionSchedule({
    expirationDate: fiscalRange.end,
    policy,
  });
  const error = errorMessage(params.error);

  return (
    <section>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">휴가 관리</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            연차 정책 설정
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">
            회계연도 기준, 반차 단위 사용, 당겨쓰기 미허용 등 현재 회사의
            연차 운영 기준을 설정합니다. 연차 정책은 취업규칙과 최신
            근로기준법 검토가 필요한 항목입니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/leaves/balances"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            직원별 현황
          </Link>
          <Link
            href="/admin/leaves/history"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            휴가 장부
          </Link>
          <Link
            href="/admin/leaves/settings"
            className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
          >
            휴가 설정
          </Link>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {params.success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          연차 정책이 저장되었습니다.
        </p>
      ) : null}

      <form
        action={updateAnnualLeavePolicy}
        className="mt-6 grid gap-6 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
      >
        <input name="id" type="hidden" value={policy.id} />

        <section className="grid gap-4">
          <div>
            <h2 className="text-base font-semibold">기본 설정</h2>
            <p className="mt-1 text-sm text-neutral-500">
              직원이 휴가를 등록하거나 취소할 때의 승인 기준과 사용 단위를 정합니다.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <CheckField
              name="isEnabled"
              label="연차 정책 사용"
              defaultChecked={policy.isEnabled}
            />
            <CheckField
              name="approvalOnRequest"
              label="휴가 등록 시 승인 요청"
              defaultChecked={policy.approvalOnRequest}
            />
            <CheckField
              name="approvalOnCancel"
              label="등록한 휴가 취소 시 승인 요청"
              defaultChecked={policy.approvalOnCancel}
            />
            <CheckField
              name="allowAdvanceUse"
              label="연차 당겨쓰기 허용"
              defaultChecked={policy.allowAdvanceUse}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="text-sm">
              부여 기준
              <select
                name="grantBasis"
                defaultValue={policy.grantBasis}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              >
                <option value="FISCAL_YEAR">회계연도 기준</option>
                <option value="HIRE_DATE">입사일 기준</option>
              </select>
            </label>
            <label className="text-sm">
              회계일 월
              <input
                name="fiscalYearStartMonth"
                type="number"
                min="1"
                max="12"
                defaultValue={policy.fiscalYearStartMonth}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              />
            </label>
            <label className="text-sm">
              회계일 일
              <input
                name="fiscalYearStartDay"
                type="number"
                min="1"
                max="31"
                defaultValue={policy.fiscalYearStartDay}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              />
            </label>
            <label className="text-sm">
              연차 사용 단위
              <select
                name="usageUnit"
                defaultValue={policy.usageUnit}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              >
                <option value="DAY">일 단위</option>
                <option value="HALF_DAY">반차 단위</option>
                <option value="HOUR">시간 단위</option>
              </select>
            </label>
          </div>
        </section>

        <section className="grid gap-4 border-t border-neutral-100 pt-5">
          <div>
            <h2 className="text-base font-semibold">연차 부여·소멸 설정</h2>
            <p className="mt-1 text-sm text-neutral-500">
              현재 기본값은 회계일 1월 1일, 월차 1일, 1년 이상자 15일,
              장기근속 추가 최대 25일 기준입니다.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <CheckField
              name="monthlyLeaveEnabled"
              label="월차 부여 사용"
              defaultChecked={policy.monthlyLeaveEnabled}
            />
            <CheckField
              name="annualLeaveEnabled"
              label="연차 부여 사용"
              defaultChecked={policy.annualLeaveEnabled}
            />
            <CheckField
              name="additionalGrantEnabled"
              label="장기근속 추가 부여"
              defaultChecked={policy.additionalGrantEnabled}
            />
            <CheckField
              name="expirationEnabled"
              label="연차·월차 자동 소멸"
              defaultChecked={policy.expirationEnabled}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="text-sm">
              월차 부여량
              <input
                name="monthlyLeaveAmount"
                type="number"
                step="0.5"
                min="0"
                defaultValue={policy.monthlyLeaveAmount}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              />
            </label>
            <label className="text-sm">
              월차 부여 방식
              <select
                name="monthlyLeaveGrantRule"
                defaultValue={policy.monthlyLeaveGrantRule}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              >
                <option value="MONTHLY_FULL_ATTENDANCE">매월 개근 시 1일</option>
                <option value="FRONTLOAD_ON_HIRE">입사 시 선부여</option>
                <option value="DISABLED">사용 안 함</option>
              </select>
            </label>
            <label className="text-sm">
              첫 회계연도 부여 방식
              <select
                name="firstFiscalYearGrantRule"
                defaultValue={policy.firstFiscalYearGrantRule}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              >
                <option value="NEEDS_CONFIRMATION">사용자 최종 확인 필요</option>
                <option value="PRORATED_BY_HIRE_DATE">입사일 비례 계산</option>
                <option value="GRANT_REMAINING_MONTHS">잔여 월 기준 부여</option>
                <option value="COMPANY_CUSTOM">회사 별도 기준</option>
              </select>
            </label>
            <label className="text-sm">
              기본 연차일수
              <input
                name="baseAnnualDays"
                type="number"
                step="0.5"
                min="0"
                defaultValue={policy.baseAnnualDays}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="text-sm">
              최대 연차 한도
              <input
                name="maxAnnualDays"
                type="number"
                step="0.5"
                min="0"
                defaultValue={policy.maxAnnualDays}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              />
            </label>
            <label className="text-sm">
              연차 소멸 개월
              <input
                name="annualExpirationMonths"
                type="number"
                min="0"
                defaultValue={policy.annualExpirationMonths}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              />
            </label>
            <label className="text-sm">
              월차 소멸 개월
              <input
                name="monthlyExpirationMonths"
                type="number"
                min="0"
                defaultValue={policy.monthlyExpirationMonths}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              />
            </label>
            <CheckField
              name="carryOverAllowed"
              label="미사용 연차 이월 허용"
              defaultChecked={policy.carryOverAllowed}
            />
          </div>
        </section>

        <section className="grid gap-4 border-t border-neutral-100 pt-5">
          <div>
            <h2 className="text-base font-semibold">연차 촉진 설정</h2>
            <p className="mt-1 text-sm text-neutral-500">
              실제 문서 발송은 구현하지 않고, 촉진 예정일과 인앱 알림 스케줄을
              관리합니다.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <CheckField
              name="promotionEnabled"
              label="스마트 연차 촉진 사용"
              defaultChecked={policy.promotionEnabled}
            />
            <CheckField
              name="memberReminderEnabled"
              label="구성원 작성 리마인드"
              defaultChecked={policy.memberReminderEnabled}
            />
            <CheckField
              name="managerReminderEnabled"
              label="관리자 작성 리마인드"
              defaultChecked={policy.managerReminderEnabled}
            />
            <label className="text-sm">
              승인·참조 대상
              <select
                name="promotionApproverUserId"
                defaultValue={policy.promotionApproverUserId ?? ""}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              >
                <option value="">미지정</option>
                {approverCandidates.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.role})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="text-sm">
              사용 계획 알림 시점
              <input
                name="usePlanReminderDaysBefore"
                type="number"
                min="0"
                defaultValue={policy.usePlanReminderDaysBefore}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              />
              <span className="mt-1 block text-xs text-neutral-500">
                사용 계획일 며칠 전 알림할지 설정합니다.
              </span>
            </label>
            <label className="text-sm">
              1년 이상자 촉진 시점
              <input
                name="annualPromotionMonthsBeforeExpiration"
                type="number"
                min="0"
                defaultValue={policy.annualPromotionMonthsBeforeExpiration}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              />
              <span className="mt-1 block text-xs text-neutral-500">
                소멸 몇 개월 전인지 입력합니다.
              </span>
            </label>
            <label className="text-sm">
              1년 미만자 월차 1차
              <input
                name="monthlyPromotionFirstMonthsBeforeExpiration"
                type="number"
                min="0"
                defaultValue={policy.monthlyPromotionFirstMonthsBeforeExpiration}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              />
            </label>
            <label className="text-sm">
              1년 미만자 월차 2차
              <input
                name="monthlyPromotionSecondMonthsBeforeExpiration"
                type="number"
                min="0"
                defaultValue={policy.monthlyPromotionSecondMonthsBeforeExpiration}
                className="mt-1 h-10 w-full rounded-md border border-neutral-300 px-3"
              />
            </label>
          </div>
        </section>

        <section className="grid gap-3 border-t border-neutral-100 pt-5">
          <h2 className="text-base font-semibold">적용 전 확인 사항</h2>
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            첫 회계연도 부여 방식은 기존 화면 문구가 일부 불명확해 현재
            “사용자 최종 확인 필요”로 둡니다. 운영 적용 전 노무 검토와 회사
            취업규칙 확인이 필요합니다.
          </p>
          <div className="grid gap-2 text-sm text-neutral-600 md:grid-cols-3">
            <p>올해 회계 기간: {fiscalRange.start} ~ {fiscalRange.end}</p>
            <p>정책 생성일: {dateInputValue(policy.createdAt)}</p>
            <p>마지막 수정일: {dateInputValue(policy.updatedAt)}</p>
          </div>
          <div className="rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
            <p className="font-medium text-neutral-800">촉진 예정일 미리보기</p>
            <ul className="mt-2 grid gap-1">
              {promotionPreview.map((item, index) => (
                <li key={`${item.noticeType}-${item.scheduledDate}-${index}`}>
                  {item.noticeType}: {item.scheduledDate}
                </li>
              ))}
            </ul>
          </div>
          <label className="text-sm">
            운영 메모
            <textarea
              name="memo"
              defaultValue={policy.memo ?? ""}
              className="mt-1 min-h-24 w-full rounded-md border border-neutral-300 px-3 py-2"
              maxLength={2000}
            />
          </label>
        </section>

        <button className="h-10 justify-self-start rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
          연차 정책 저장
        </button>
      </form>
    </section>
  );
}
