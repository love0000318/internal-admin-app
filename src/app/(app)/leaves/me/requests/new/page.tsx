import Link from "next/link";

import { LeaveRequestForm } from "@/app/(app)/leaves/me/requests/new/leave-request-form";
import { dateToDateOnly } from "@/lib/leave/calculate-business-days";
import { listRequestableLeaveGrants } from "@/lib/leave/custom-grant-requests";
import { listLeavePolicies } from "@/lib/leave/queries";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type NewLeaveRequestPageProps = {
  searchParams: Promise<{ error?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "입력값을 확인해 주세요.",
  "disabled-policy": "선택한 휴가 유형은 현재 사용할 수 없습니다.",
  "invalid-date": "휴가 날짜 범위가 올바르지 않습니다.",
  "zero-days": "요청 가능한 휴가 일수가 없습니다.",
  "min-days": "휴가 정책의 최소 요청 일수보다 적습니다.",
  "max-days": "휴가 정책의 최대 요청 일수를 초과했습니다.",
  "attachment-required": "이 휴가 유형은 증명자료 제출이 필요합니다.",
  "invalid-file-type": "허용되지 않는 파일 형식입니다.",
  "file-too-large": "첨부파일은 최대 10MB까지 업로드할 수 있습니다.",
  "empty-file": "비어 있는 파일은 제출할 수 없습니다.",
  overlap: "같은 날짜에 승인 대기 또는 승인 완료 휴가가 있습니다.",
  balance: "잔여 연차를 초과했습니다.",
  "grant-not-found": "사용 가능한 맞춤휴가를 찾을 수 없습니다.",
  "grant-inactive": "사용할 수 없는 맞춤휴가입니다.",
  "grant-balance": "맞춤휴가 잔여 수량을 초과했습니다.",
  "grant-state": "맞춤휴가 지급 상태가 변경되었습니다. 다시 확인해 주세요.",
  "outside-grant-range": "맞춤휴가 사용 가능 기간 밖의 날짜입니다.",
  "unit-not-allowed": "선택한 사용 단위로 요청할 수 없는 맞춤휴가입니다.",
  "unsupported-unit": "시간/분 단위 맞춤휴가는 다음 단계에서 제공합니다.",
  "half-day-required": "반차 요청은 오전/오후를 선택해 주세요.",
};

export default async function NewLeaveRequestPage({
  searchParams,
}: NewLeaveRequestPageProps) {
  const actor = await requireRouteAccess("/leaves/me/requests");
  const { error } = await searchParams;
  const [policies, requestableGrants] = await Promise.all([
    listLeavePolicies(),
    listRequestableLeaveGrants(actor.id),
  ]);

  return (
    <section className="min-w-0 max-w-4xl">
      <Link
        href="/leaves/me"
        className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 sm:w-auto"
      >
        휴가 현황으로 돌아가기
      </Link>
      <h1 className="mt-3 break-keep text-2xl font-semibold tracking-normal">
        내 휴가 요청
      </h1>
      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {ERROR_MESSAGES[error] ?? "휴가 요청을 생성할 수 없습니다."}
        </p>
      ) : null}
      <LeaveRequestForm
        policies={policies}
        requestableGrants={requestableGrants.map((grant) => ({
          id: grant.id,
          remainingAmount: grant.remainingAmount,
          unit: grant.unit,
          effectiveFrom: dateToDateOnly(grant.effectiveFrom),
          expiresAt: grant.expiresAt ? dateToDateOnly(grant.expiresAt) : null,
          reason: grant.reason,
          leaveType: {
            id: grant.leaveType.id,
            code: grant.leaveType.code,
            name: grant.leaveType.name,
            allowedUnits: grant.leaveType.allowedUnits,
            attachmentPolicy: grant.leaveType.attachmentPolicy,
            attachmentDescription: grant.leaveType.attachmentDescription,
          },
        }))}
      />
    </section>
  );
}
