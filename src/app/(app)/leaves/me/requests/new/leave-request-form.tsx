"use client";

import { useMemo, useState } from "react";

import { createLeaveRequest } from "@/app/(app)/leaves/actions";
import { formatLeaveDays, LEAVE_TYPE_LABELS } from "@/lib/leave/labels";
import { deserializeAllowedUnits } from "@/lib/leave/leave-types";
import type { LeavePolicy, LeaveType } from "@/lib/leave/types";
import { LEAVE_TYPES } from "@/lib/leave/types";

type AttachmentPolicy =
  | "NOT_REQUIRED"
  | "REQUIRED_BEFORE_REQUEST"
  | "REQUIRED_AFTER_REQUEST"
  | "OPTIONAL";

type RequestableGrant = {
  id: string;
  remainingAmount: number;
  unit: "DAY" | "HOUR" | "MINUTE";
  effectiveFrom: string;
  expiresAt: string | null;
  reason: string;
  leaveType: {
    id: string;
    code: string;
    name: string;
    allowedUnits: string;
    attachmentPolicy: AttachmentPolicy;
    attachmentDescription: string | null;
  };
};

type LeaveRequestFormProps = {
  policies: LeavePolicy[];
  requestableGrants: RequestableGrant[];
};

const unitLabels = {
  DAY: "일",
  HOUR: "시간",
  MINUTE: "분",
};

const attachmentPolicyLabels: Record<AttachmentPolicy, string> = {
  NOT_REQUIRED: "필요 없음",
  OPTIONAL: "선택 제출",
  REQUIRED_BEFORE_REQUEST: "요청 전 필수",
  REQUIRED_AFTER_REQUEST: "요청 후 제출 필요",
};

function formatGrantAmount(amount: number, unit: "DAY" | "HOUR" | "MINUTE") {
  return `${amount}${unitLabels[unit]}`;
}

function AttachmentInput({
  required,
  description,
}: {
  required?: boolean;
  description?: string | null;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      증명자료 파일
      <input
        name="attachmentFile"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-sm font-normal"
        required={required}
      />
      <span className="break-keep text-xs font-normal leading-relaxed text-neutral-500">
        PDF, 이미지, Word 문서를 10MB 이하로 제출할 수 있습니다.
        {description ? ` ${description}` : ""}
      </span>
    </label>
  );
}

export function LeaveRequestForm({
  policies,
  requestableGrants,
}: LeaveRequestFormProps) {
  const [type, setType] = useState<LeaveType>("ANNUAL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedGrantId, setSelectedGrantId] = useState(
    requestableGrants[0]?.id ?? "",
  );
  const selectedGrant = useMemo(
    () => requestableGrants.find((grant) => grant.id === selectedGrantId),
    [requestableGrants, selectedGrantId],
  );
  const allowedUnits = selectedGrant
    ? deserializeAllowedUnits(selectedGrant.leaveType.allowedUnits)
    : [];
  const defaultUsageUnit = allowedUnits.includes("HALF_DAY")
    ? "HALF_DAY"
    : "FULL_DAY";
  const policy = useMemo(
    () => policies.find((item) => item.type === type),
    [policies, type],
  );
  const isHalfDay = type === "HALF_DAY";
  const legacyAttachmentRequired =
    type === "RESERVE_FORCES" || Boolean(policy?.requiresAttachment);
  const customAttachmentRequired =
    selectedGrant?.leaveType.attachmentPolicy === "REQUIRED_BEFORE_REQUEST";

  return (
    <div className="mt-6 grid gap-6">
      <form
        action={createLeaveRequest}
        className="grid min-w-0 gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <div>
          <h2 className="text-base font-semibold">연차/기본 휴가 요청</h2>
          <p className="mt-1 text-sm text-neutral-500">
            연차, 반차, 예비군, 병가, 경조사 휴가를 요청합니다.
          </p>
        </div>
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            휴가 유형
            <select
              name="type"
              value={type}
              onChange={(event) => {
                setType(event.target.value as LeaveType);
                if (event.target.value === "HALF_DAY") {
                  setEndDate(startDate);
                }
              }}
              className="h-11 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-base font-normal sm:text-sm"
              required
            >
              {LEAVE_TYPES.map((leaveType) => (
                <option
                  key={leaveType}
                  value={leaveType}
                  disabled={!policies.find((item) => item.type === leaveType)?.isEnabled}
                >
                  {LEAVE_TYPE_LABELS[leaveType]}
                </option>
              ))}
            </select>
          </label>
          <div className="break-keep rounded-md bg-neutral-50 px-3 py-2 text-sm leading-relaxed text-neutral-600">
            <p>
              연차 차감:{" "}
              {(policy?.deductsAnnualBalance ?? policy?.deductsAnnual)
                ? "예"
                : "아니오"}
            </p>
            <p>증명자료: {legacyAttachmentRequired ? "필요" : "필요 없음"}</p>
            {isHalfDay ? <p>요청 일수: {formatLeaveDays(0.5)}</p> : null}
          </div>
        </div>

        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            시작일
            <input
              name="startDate"
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                if (isHalfDay) {
                  setEndDate(event.target.value);
                }
              }}
              className="h-11 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-base font-normal sm:text-sm"
              required
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            종료일
            <input
              name="endDate"
              type="date"
              value={isHalfDay ? startDate : endDate}
              onChange={(event) => setEndDate(event.target.value)}
              disabled={isHalfDay}
              className="h-11 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-base font-normal disabled:bg-neutral-100 sm:text-sm"
              required
            />
          </label>
        </div>

        {isHalfDay ? (
          <label className="grid gap-1 text-sm font-medium">
            반차 구분
            <select
              name="halfDayPeriod"
              className="h-11 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-base font-normal sm:text-sm"
              required
            >
              <option value="">선택</option>
              <option value="AM">오전</option>
              <option value="PM">오후</option>
            </select>
          </label>
        ) : (
          <input name="halfDayPeriod" type="hidden" value="" />
        )}

        <label className="grid gap-1 text-sm font-medium">
          사유
          <textarea
            name="reason"
            rows={4}
            className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-base font-normal sm:text-sm"
          />
        </label>

        <AttachmentInput required={legacyAttachmentRequired} />

        <button className="h-11 w-full rounded-md bg-neutral-950 px-4 text-sm font-medium text-white md:w-40">
          요청 제출
        </button>
      </form>

      <form
        action={createLeaveRequest}
        className="grid min-w-0 gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:p-5"
      >
        <input name="requestKind" type="hidden" value="CUSTOM_GRANT" />
        <div>
          <h2 className="text-base font-semibold">맞춤휴가 요청</h2>
          <p className="mt-1 text-sm text-neutral-500">
            회사가 별도로 지급한 맞춤휴가를 사용합니다. 시간/분 단위 요청은 다음 단계에서 제공합니다.
          </p>
        </div>

        {requestableGrants.length === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-4 text-sm text-neutral-500">
            요청 가능한 맞춤휴가가 없습니다.
          </p>
        ) : (
          <>
            <label className="grid gap-1 text-sm font-medium">
              지급받은 맞춤휴가
              <select
                name="leaveGrantId"
                value={selectedGrantId}
                onChange={(event) => setSelectedGrantId(event.target.value)}
                className="h-11 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-base font-normal sm:text-sm"
                required
              >
                {requestableGrants.map((grant) => (
                  <option key={grant.id} value={grant.id}>
                    {grant.leaveType.name} - 잔여 {formatGrantAmount(grant.remainingAmount, grant.unit)}
                  </option>
                ))}
              </select>
            </label>

            {selectedGrant ? (
              <div className="break-keep rounded-md bg-neutral-50 px-3 py-3 text-sm leading-relaxed text-neutral-600">
                <p>사용 가능 기간: {selectedGrant.effectiveFrom} ~ {selectedGrant.expiresAt ?? "만료 없음"}</p>
                <p>사용 가능 단위: {allowedUnits.join(", ")}</p>
                <p>증명자료 정책: {attachmentPolicyLabels[selectedGrant.leaveType.attachmentPolicy]}</p>
                {selectedGrant.leaveType.attachmentDescription ? (
                  <p>{selectedGrant.leaveType.attachmentDescription}</p>
                ) : null}
              </div>
            ) : null}

            <label className="grid gap-1 text-sm font-medium">
              사용 단위
              <select
                key={selectedGrantId}
                name="usageUnit"
                defaultValue={defaultUsageUnit}
                className="h-11 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-base font-normal sm:text-sm"
                required
              >
                <option value="FULL_DAY" disabled={!allowedUnits.includes("FULL_DAY")}>
                  하루
                </option>
                <option value="HALF_DAY" disabled={!allowedUnits.includes("HALF_DAY")}>
                  반차
                </option>
                <option value="HOUR" disabled>
                  시간 단위는 다음 단계에서 제공
                </option>
                <option value="MINUTE" disabled>
                  분 단위는 다음 단계에서 제공
                </option>
              </select>
            </label>

            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                시작일
                <input
                  name="startDate"
                  type="date"
                  className="h-11 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-base font-normal sm:text-sm"
                  required
                />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                종료일
                <input
                  name="endDate"
                  type="date"
                  className="h-11 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-base font-normal sm:text-sm"
                  required
                />
              </label>
            </div>

            <label className="grid gap-1 text-sm font-medium">
              반차 구분
              <select
                name="halfDayPeriod"
                className="h-11 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-base font-normal sm:text-sm"
              >
                <option value="">하루 사용이면 선택하지 않음</option>
                <option value="AM">오전</option>
                <option value="PM">오후</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium">
              사유
              <textarea
                name="reason"
                rows={4}
                className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-base font-normal sm:text-sm"
              />
            </label>

            <AttachmentInput
              required={customAttachmentRequired}
              description={selectedGrant?.leaveType.attachmentDescription}
            />

            <button className="h-11 w-full rounded-md bg-neutral-950 px-4 text-sm font-medium text-white md:w-40">
              맞춤휴가 요청
            </button>
          </>
        )}
      </form>
    </div>
  );
}
