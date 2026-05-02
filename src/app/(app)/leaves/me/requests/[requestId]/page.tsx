import Link from "next/link";
import { notFound } from "next/navigation";

import { submitLeaveAttachment } from "@/app/(app)/leaves/attachments/actions";
import { withdrawLeaveRequest } from "@/app/(app)/leaves/actions";
import { getPrisma } from "@/lib/db/prisma";
import {
  formatAttachmentSubmittedAt,
  getAttachmentStatusLabel,
} from "@/lib/leave/attachments";
import { toNumber } from "@/lib/leave/balance";
import { dateToDateOnly } from "@/lib/leave/calculate-business-days";
import {
  formatLeaveDays,
  HALF_DAY_PERIOD_LABELS,
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
} from "@/lib/leave/labels";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type LeaveRequestDetailPageProps = {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  "not-pending": "PENDING 상태의 휴가 요청만 철회할 수 있습니다.",
  "attachment-required": "제출할 증명자료 파일을 선택해 주세요.",
  "invalid-file-type": "허용되지 않는 파일 형식입니다.",
  "file-too-large": "첨부파일은 최대 10MB까지 업로드할 수 있습니다.",
  "attachment-closed": "현재 상태에서는 증명자료를 추가 제출할 수 없습니다.",
};

const SUCCESS_MESSAGES: Record<string, string> = {
  created: "휴가 요청을 생성했습니다.",
  withdrawn: "휴가 요청을 철회했습니다.",
  "attachment-submitted": "증명자료를 제출했습니다.",
};

export default async function LeaveRequestDetailPage({
  params,
  searchParams,
}: LeaveRequestDetailPageProps) {
  const actor = await requireRouteAccess("/leaves/me/requests");
  const { requestId } = await params;
  const { error, success } = await searchParams;
  const leaveRequest = await getPrisma().leaveRequest.findFirst({
    where: {
      id: requestId,
      userId: actor.id,
    },
    include: {
      reviewer: true,
      customLeaveType: true,
      grantUsages: {
        include: {
          leaveGrant: {
            include: {
              leaveType: true,
            },
          },
        },
      },
      attachments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        include: { reviewedBy: true },
      },
    },
  });

  if (!leaveRequest) {
    notFound();
  }

  return (
    <section className="max-w-3xl">
      <Link href="/leaves/me" className="text-sm font-medium underline">
        휴가 현황으로 돌아가기
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-normal">
        휴가 요청 상세
      </h1>
      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {ERROR_MESSAGES[error] ?? "요청을 처리할 수 없습니다."}
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {SUCCESS_MESSAGES[success] ?? "요청 상태가 저장되었습니다."}
        </p>
      ) : null}

      <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
        <dl className="grid gap-4 text-sm md:grid-cols-2">
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
          <Detail
            label="상태"
            value={`${LEAVE_STATUS_LABELS[leaveRequest.status]}${
              leaveRequest.approvalSource === "AUTO_START_DATE" ? " · 자동 확정" : ""
            }`}
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
            label="증명자료 상태"
            value={getAttachmentStatusLabel(leaveRequest.attachmentStatus)}
          />
          <Detail label="생성일" value={dateToDateOnly(leaveRequest.createdAt)} />
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
            label="승인/반려 코멘트"
            value={leaveRequest.reviewComment ?? leaveRequest.rejectReason ?? "-"}
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
        <h2 className="text-base font-semibold">증명자료</h2>
        <p className="mt-1 text-sm text-neutral-500">
          제출한 자료는 인증된 사용자만 확인할 수 있으며 public 경로에 노출되지 않습니다.
        </p>
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
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium">
                      {attachment.originalFileName ?? attachment.fileName}
                    </p>
                    <p className="text-neutral-500">
                      상태: {attachment.status} · 제출일:{" "}
                      {formatAttachmentSubmittedAt(attachment.submittedAt)}
                    </p>
                    {attachment.reviewComment ? (
                      <p className="mt-1 text-red-700">
                        검토 의견: {attachment.reviewComment}
                      </p>
                    ) : null}
                  </div>
                  {attachment.fileKey ? (
                    <Link
                      href={`/api/leave-attachments/${attachment.id}/download`}
                      className="text-sm font-medium underline"
                    >
                      다운로드
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {["PENDING", "APPROVED"].includes(leaveRequest.status) ? (
          <form
            action={submitLeaveAttachment}
            className="mt-5 grid gap-3 rounded-md bg-neutral-50 p-4"
          >
            <input name="requestId" type="hidden" value={leaveRequest.id} />
            <label className="grid gap-1 text-sm font-medium">
              증명자료 파일
              <input
                name="attachmentFile"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-normal"
                required
              />
            </label>
            <button className="h-10 w-full rounded-md bg-neutral-950 px-4 text-sm font-medium text-white md:w-40">
              증명자료 제출
            </button>
          </form>
        ) : null}
      </div>

      {leaveRequest.status === "PENDING" ? (
        <form action={withdrawLeaveRequest} className="mt-4">
          <input name="requestId" type="hidden" value={leaveRequest.id} />
          <button className="h-10 rounded-md border border-red-200 px-4 text-sm font-medium text-red-700">
            요청 철회
          </button>
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
