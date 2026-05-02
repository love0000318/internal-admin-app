import Link from "next/link";
import { notFound } from "next/navigation";

import {
  acceptLeaveAttachment,
  rejectLeaveAttachment,
  requestLeaveAttachmentResubmission,
} from "@/app/(app)/leaves/attachments/actions";
import {
  approveLeaveRequest,
  cancelApprovedLeaveRequest,
  rejectLeaveRequest,
} from "@/app/(app)/leaves/approvals/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { toNumber } from "@/lib/leave/balance";
import { dateToDateOnly } from "@/lib/leave/calculate-business-days";
import { getLeaveApprovalDetail } from "@/lib/leave/approval-queries";
import {
  formatAttachmentSubmittedAt,
  getAttachmentStatusLabel,
} from "@/lib/leave/attachments";
import {
  canReviewLeaveRequestWithPolicy,
  resolveApprovalPolicyForLeaveRequest,
  assertAttachmentRequirementForApproval,
} from "@/lib/leave/approval-policy";
import { hydrateReviewScope } from "@/lib/leave/review";
import {
  formatLeaveDays,
  HALF_DAY_PERIOD_LABELS,
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
} from "@/lib/leave/labels";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type ApprovalDetailPageProps = {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "요청값이 올바르지 않습니다.",
  "not-found": "휴가 요청을 찾을 수 없습니다.",
  "not-pending": "승인 대기 상태의 요청만 승인/반려할 수 있습니다.",
  "not-approved": "승인 완료 상태의 요청만 취소할 수 있습니다.",
  "requester-inactive": "비활성화된 직원의 요청은 승인할 수 없습니다.",
  forbidden: "접근 권한이 없습니다.",
  "balance-or-overlap": "잔여 휴가가 부족하거나 이미 승인된 휴가와 날짜가 겹칩니다.",
  "reject-comment-required": "반려 사유를 입력해 주세요.",
  "cancel-comment-required": "취소 사유를 입력해 주세요.",
  "attachment-not-found": "증명자료를 찾을 수 없습니다.",
  "attachment-comment-required": "증명자료 검토 의견을 입력해 주세요.",
};

const SUCCESS_MESSAGES: Record<string, string> = {
  approved: "휴가 요청을 승인했습니다.",
  rejected: "휴가 요청을 반려했습니다.",
  cancelled: "승인된 휴가를 취소했습니다.",
  "attachment-accepted": "증명자료를 확인 완료 처리했습니다.",
  "attachment-rejected": "증명자료를 반려했습니다.",
  "attachment-resubmission-requested": "증명자료 재제출을 요청했습니다.",
};

export default async function LeaveApprovalDetailPage({
  params,
  searchParams,
}: ApprovalDetailPageProps) {
  const actor = await requireRouteAccess("/leaves/approvals");
  const { requestId } = await params;
  const { error, success } = await searchParams;
  const leaveRequest = await getLeaveApprovalDetail({ actor, requestId });

  if (!leaveRequest) {
    notFound();
  }

  const returnTo = `/leaves/approvals/${leaveRequest.id}`;
  const scopedActor = await hydrateReviewScope(actor);
  const approvalPolicy = await resolveApprovalPolicyForLeaveRequest({ leaveRequest });
  const canReviewByPolicy = canReviewLeaveRequestWithPolicy({
    actor: scopedActor,
    leaveRequest,
    policy: approvalPolicy,
  });
  let attachmentBlockReason: string | null = null;
  try {
    assertAttachmentRequirementForApproval(leaveRequest, approvalPolicy);
  } catch {
    attachmentBlockReason = "증명자료 확인이 완료되어야 승인할 수 있습니다.";
  }

  return (
    <section className="max-w-4xl">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/leaves/approvals" className="text-sm font-medium underline">
            승인 요청 목록으로 돌아가기
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-normal">
            휴가 승인 상세
          </h1>
        </div>
        <Link
          href="/leaves/approvals/approved"
          className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
        >
          승인 완료 목록
        </Link>
      </div>

      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error === "attachment-not-accepted"
            ? "증명자료 확인이 완료되어야 승인할 수 있습니다."
            : ERROR_MESSAGES[error] ?? "요청을 처리할 수 없습니다."}
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {SUCCESS_MESSAGES[success] ?? "요청을 처리했습니다."}
        </p>
      ) : null}

      <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <dl className="grid gap-4 text-sm md:grid-cols-2">
          <Detail label="요청자 이름" value={leaveRequest.user.name} />
          <Detail label="요청자 이메일" value={leaveRequest.user.email} />
          <Detail label="요청자 전화번호" value={leaveRequest.user.phone ?? "-"} />
          <Detail label="요청자 팀" value={leaveRequest.user.team?.name ?? "-"} />
          <Detail
            label="요청자 직급"
            value={leaveRequest.user.title ?? leaveRequest.user.profile?.jobTitle ?? "-"}
          />
          <Detail
            label="휴가 유형"
            value={
              leaveRequest.requestKind === "CUSTOM_GRANT"
                ? leaveRequest.customLeaveType?.name ?? "맞춤휴가"
                : LEAVE_TYPE_LABELS[leaveRequest.type]
            }
          />
          <Detail
            label="구분"
            value={leaveRequest.requestKind === "CUSTOM_GRANT" ? "맞춤휴가" : "기본 휴가"}
          />
          <Detail label="시작일" value={dateToDateOnly(leaveRequest.startDate)} />
          <Detail label="종료일" value={dateToDateOnly(leaveRequest.endDate)} />
          <Detail
            label="반차 구분"
            value={
              leaveRequest.halfDayPeriod
                ? HALF_DAY_PERIOD_LABELS[leaveRequest.halfDayPeriod]
                : "-"
            }
          />
          <Detail
            label="요청 일수"
            value={formatLeaveDays(toNumber(leaveRequest.dayCount))}
          />
          <Detail
            label="상태"
            value={`${LEAVE_STATUS_LABELS[leaveRequest.status]}${
              leaveRequest.approvalSource === "AUTO_START_DATE" ? " · 자동 확정" : ""
            }`}
          />
          <Detail
            label="증명자료 상태"
            value={getAttachmentStatusLabel(leaveRequest.attachmentStatus)}
          />
          <Detail label="요청일" value={dateToDateOnly(leaveRequest.createdAt)} />
          <Detail
            label="승인자"
            value={
              leaveRequest.approvalSource === "AUTO_START_DATE"
                ? "시스템 자동 확정"
                : leaveRequest.reviewer?.name ?? "-"
            }
          />
          {leaveRequest.autoConfirmedAt ? (
            <Detail label="자동 확정일" value={dateToDateOnly(leaveRequest.autoConfirmedAt)} />
          ) : null}
          <Detail
            label="승인/반려/취소 일시"
            value={leaveRequest.reviewedAt ? dateToDateOnly(leaveRequest.reviewedAt) : "-"}
          />
          <Detail
            label="승인/반려/취소 코멘트"
            value={
              leaveRequest.reviewComment ??
              leaveRequest.rejectReason ??
              leaveRequest.cancelReason ??
              "-"
            }
          />
          <div className="md:col-span-2">
            <dt className="text-neutral-500">사유</dt>
            <dd className="mt-1 whitespace-pre-wrap font-medium">
              {leaveRequest.reason ?? "-"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-5 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">승인 정책</h2>
        <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
          <Detail label="정책명" value={approvalPolicy.name} />
          <Detail
            label="승인 방식"
            value={`${approvalPolicy.approvalMode} / ${approvalPolicy.approverRule}`}
          />
          <Detail
            label="현재 사용자 승인 가능 여부"
            value={canReviewByPolicy ? "가능" : "불가"}
          />
          <Detail
            label="증명자료 확인 후 승인"
            value={approvalPolicy.requireAttachmentAcceptedBeforeApproval ? "필수" : "필수 아님"}
          />
        </dl>
        {attachmentBlockReason ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {attachmentBlockReason}
          </p>
        ) : null}
      </div>

      <div className="mt-5 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">증명자료 검토</h2>
        <p className="mt-1 text-sm text-neutral-500">
          증명자료 검토는 휴가 승인/반려와 별도로 기록됩니다. 요청 후 제출 정책인 경우 승인 전 제출을 강제하지 않고 경고만 표시합니다.
        </p>
        {leaveRequest.attachmentStatus === "REQUIRED_NOT_SUBMITTED" ? (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            이 요청은 증명자료 제출이 필요하지만 아직 제출되지 않았습니다.
          </p>
        ) : null}
        {leaveRequest.attachments.length === 0 ? (
          <p className="mt-4 rounded-md bg-neutral-50 px-3 py-3 text-sm text-neutral-500">
            제출된 증명자료가 없습니다.
          </p>
        ) : (
          <div className="mt-4 grid gap-3">
            {leaveRequest.attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="rounded-md border border-neutral-200 px-3 py-3 text-sm"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-medium">
                      {attachment.originalFileName ?? attachment.fileName}
                    </p>
                    <p className="text-neutral-500">
                      상태: {attachment.status} · 제출자: {attachment.uploadedBy.name} · 제출일:{" "}
                      {formatAttachmentSubmittedAt(attachment.submittedAt)}
                    </p>
                    {attachment.reviewedBy ? (
                      <p className="text-neutral-500">
                        검토자: {attachment.reviewedBy.name}
                        {attachment.reviewedAt
                          ? ` · 검토일: ${dateToDateOnly(attachment.reviewedAt)}`
                          : ""}
                      </p>
                    ) : null}
                    {attachment.reviewComment ? (
                      <p className="mt-1 text-red-700">
                        검토 의견: {attachment.reviewComment}
                      </p>
                    ) : null}
                    {attachment.fileKey ? (
                      <Link
                        href={`/api/leave-attachments/${attachment.id}/download`}
                        className="mt-2 inline-flex text-sm font-medium underline"
                      >
                        다운로드
                      </Link>
                    ) : null}
                  </div>
                  <div className="grid gap-2 md:w-64">
                    <form action={acceptLeaveAttachment}>
                      <input name="requestId" type="hidden" value={leaveRequest.id} />
                      <input name="attachmentId" type="hidden" value={attachment.id} />
                      <button className="h-9 w-full rounded-md bg-neutral-950 px-3 text-sm font-medium text-white">
                        확인 완료
                      </button>
                    </form>
                    <form action={rejectLeaveAttachment} className="grid gap-2">
                      <input name="requestId" type="hidden" value={leaveRequest.id} />
                      <input name="attachmentId" type="hidden" value={attachment.id} />
                      <input
                        name="reviewComment"
                        placeholder="반려 사유"
                        className="h-9 rounded-md border border-neutral-300 px-3 text-sm"
                        required
                      />
                      <button className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700">
                        반려
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <form action={requestLeaveAttachmentResubmission} className="mt-4 grid gap-2">
          <input name="requestId" type="hidden" value={leaveRequest.id} />
          <label className="grid gap-1 text-sm font-medium">
            재제출 요청 사유
            <textarea
              name="reviewComment"
              rows={3}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-normal"
              required
            />
          </label>
          <button className="h-10 w-full rounded-md border border-amber-200 px-4 text-sm font-medium text-amber-800 md:w-44">
            재제출 요청
          </button>
        </form>
      </div>

      {leaveRequest.status === "PENDING" ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <form
            action={approveLeaveRequest}
            className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
          >
            <input name="requestId" type="hidden" value={leaveRequest.id} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <label className="grid gap-1 text-sm font-medium">
              승인 코멘트
              <textarea
                name="reviewComment"
                rows={3}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-normal"
              />
            </label>
            <ConfirmSubmitButton
              message="이 휴가 요청을 승인할까요?"
              className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white"
            >
              승인
            </ConfirmSubmitButton>
          </form>

          <form
            action={rejectLeaveRequest}
            className="grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
          >
            <input name="requestId" type="hidden" value={leaveRequest.id} />
            <input name="returnTo" type="hidden" value={returnTo} />
            <label className="grid gap-1 text-sm font-medium">
              반려 사유
              <textarea
                name="reviewComment"
                rows={3}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-normal"
                required
              />
            </label>
            <ConfirmSubmitButton
              message="이 휴가 요청을 반려할까요?"
              className="h-10 rounded-md border border-red-200 px-4 text-sm font-medium text-red-700"
            >
              반려
            </ConfirmSubmitButton>
          </form>
        </div>
      ) : null}

      {leaveRequest.status === "APPROVED" ? (
        <form
          action={cancelApprovedLeaveRequest}
          className="mt-5 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
        >
          <input name="requestId" type="hidden" value={leaveRequest.id} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <label className="grid gap-1 text-sm font-medium">
            승인 취소 사유
            <textarea
              name="cancelComment"
              rows={3}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-normal"
              required
            />
          </label>
          <ConfirmSubmitButton
            message="승인된 휴가를 취소할까요?"
            className="h-10 rounded-md border border-red-200 px-4 text-sm font-medium text-red-700"
          >
            승인 취소
          </ConfirmSubmitButton>
        </form>
      ) : null}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
