"use client";

import { useMemo, useState } from "react";

import { createLeaveRequest } from "@/app/(app)/leaves/actions";
import { Badge, buttonClassName, Card } from "@/components/design-system/primitives";
import { formatLeaveDays, LEAVE_TYPE_LABELS } from "@/lib/leave/labels";
import {
  isAttachmentRequiredForPolicy,
  isReserveForcesLeaveType,
  resolveAttachmentPolicyForLeaveType,
} from "@/lib/leave/legacy-request-policy";
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

const BIRTHDAY_HALF_DAY_CODE = "BIRTHDAY_HALF_DAY";
const RESERVE_FORCES_ATTACHMENT_DESCRIPTION =
  "예비군 휴가는 증명자료를 선택적으로 첨부할 수 있습니다. 증명자료가 없어도 신청할 수 있습니다.";

const unitLabels = {
  DAY: "일",
  HOUR: "시간",
  MINUTE: "분",
};

const attachmentPolicyLabels: Record<AttachmentPolicy, string> = {
  NOT_REQUIRED: "불필요",
  OPTIONAL: "선택 제출",
  REQUIRED_BEFORE_REQUEST: "요청 전 필수",
  REQUIRED_AFTER_REQUEST: "요청 후 제출",
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
    <label className="grid gap-1 text-sm font-medium text-slate-800">
      증명자료 파일
      <input
        name="attachmentFile"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700"
        required={required}
      />
      <span className="break-keep text-xs font-normal leading-relaxed text-slate-500">
        PDF, 이미지, Word 문서를 10MB 이하로 제출할 수 있습니다.
        {description ? ` ${description}` : ""}
      </span>
    </label>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-800">
      <span className="whitespace-nowrap break-keep">{label}</span>
      {children}
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
  const isSelectedBirthdayHalfDay =
    selectedGrant?.leaveType.code === BIRTHDAY_HALF_DAY_CODE;
  const allowedUnits: string[] = selectedGrant
    ? isSelectedBirthdayHalfDay
      ? ["HALF_DAY"]
      : deserializeAllowedUnits(selectedGrant.leaveType.allowedUnits)
    : [];
  const defaultUsageUnit = allowedUnits.includes("HALF_DAY")
    ? "HALF_DAY"
    : "FULL_DAY";
  const policy = useMemo(
    () => policies.find((item) => item.type === type),
    [policies, type],
  );
  const isHalfDay = type === "HALF_DAY";
  const isLegacyReserveForces = isReserveForcesLeaveType({ type });
  const legacyAttachmentPolicy: AttachmentPolicy = isLegacyReserveForces
    ? "OPTIONAL"
    : policy?.requiresAttachment
      ? "REQUIRED_BEFORE_REQUEST"
      : "NOT_REQUIRED";
  const legacyAttachmentRequired =
    isAttachmentRequiredForPolicy(legacyAttachmentPolicy);
  const selectedGrantAttachmentPolicy: AttachmentPolicy = selectedGrant
    ? resolveAttachmentPolicyForLeaveType({
        code: selectedGrant.leaveType.code,
        name: selectedGrant.leaveType.name,
        attachmentPolicy: selectedGrant.leaveType.attachmentPolicy,
      })
    : "NOT_REQUIRED";
  const customAttachmentRequired =
    isAttachmentRequiredForPolicy(selectedGrantAttachmentPolicy);
  const isSelectedReserveForcesGrant = selectedGrant
    ? isReserveForcesLeaveType({
        code: selectedGrant.leaveType.code,
        name: selectedGrant.leaveType.name,
      })
    : false;

  return (
    <div className="mt-6 grid gap-6">
      <Card className="p-0">
        <form action={createLeaveRequest} className="grid min-w-0 gap-5 p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                기본 휴가 요청
              </h2>
              <p className="mt-1 break-keep text-sm leading-relaxed text-slate-500">
                연차, 반차, 예비군, 병가, 경조사 휴가를 신청합니다.
              </p>
            </div>
            <Badge tone={(policy?.deductsAnnualBalance ?? policy?.deductsAnnual) ? "warning" : "default"}>
              {(policy?.deductsAnnualBalance ?? policy?.deductsAnnual)
                ? "연차 차감"
                : "연차 미차감"}
            </Badge>
          </div>

          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <FormField label="휴가 유형">
              <select
                name="type"
                value={type}
                onChange={(event) => {
                  setType(event.target.value as LeaveType);
                  if (event.target.value === "HALF_DAY") {
                    setEndDate(startDate);
                  }
                }}
                className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base font-normal sm:text-sm"
                required
              >
                {LEAVE_TYPES.map((leaveType) => (
                  <option
                    key={leaveType}
                    value={leaveType}
                    disabled={
                      !policies.find((item) => item.type === leaveType)?.isEnabled
                    }
                  >
                    {LEAVE_TYPE_LABELS[leaveType]}
                  </option>
                ))}
              </select>
            </FormField>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-relaxed text-slate-600">
              <p className="break-keep">
                증명자료: {legacyAttachmentRequired ? "필수" : "선택"}
              </p>
              {isLegacyReserveForces ? (
                <p className="break-keep">{RESERVE_FORCES_ATTACHMENT_DESCRIPTION}</p>
              ) : null}
              {isHalfDay ? (
                <p className="break-keep">예상 차감: {formatLeaveDays(0.5)}</p>
              ) : (
                <p className="break-keep">
                  날짜 범위에 따라 영업일 기준으로 계산됩니다.
                </p>
              )}
            </div>
          </div>

          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <FormField label="시작일">
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
                className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base font-normal sm:text-sm"
                required
              />
            </FormField>
            <FormField label="종료일">
              <input
                name="endDate"
                type="date"
                value={isHalfDay ? startDate : endDate}
                onChange={(event) => setEndDate(event.target.value)}
                disabled={isHalfDay}
                className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base font-normal disabled:bg-slate-100 sm:text-sm"
                required
              />
            </FormField>
          </div>

          {isHalfDay ? (
            <FormField label="반차 구분">
              <select
                name="halfDayPeriod"
                className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base font-normal sm:text-sm"
                required
              >
                <option value="">선택</option>
                <option value="AM">오전</option>
                <option value="PM">오후</option>
              </select>
            </FormField>
          ) : (
            <input name="halfDayPeriod" type="hidden" value="" />
          )}

          <FormField label="사유">
            <textarea
              name="reason"
              rows={4}
              className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-base font-normal sm:text-sm"
            />
          </FormField>

          <AttachmentInput
            required={legacyAttachmentRequired}
            description={
              isLegacyReserveForces ? RESERVE_FORCES_ATTACHMENT_DESCRIPTION : null
            }
          />

          <button className={buttonClassName({ className: "w-full sm:w-auto" })}>
            휴가 요청 제출
          </button>
        </form>
      </Card>

      <Card className="p-0">
        <form action={createLeaveRequest} className="grid min-w-0 gap-5 p-4 sm:p-5">
          <input name="requestKind" type="hidden" value="CUSTOM_GRANT" />
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              지급된 휴가 요청
            </h2>
            <p className="mt-1 break-keep text-sm leading-relaxed text-slate-500">
              회사가 별도로 지급한 맞춤휴가와 생일 반차를 사용합니다.
            </p>
          </div>

          {requestableGrants.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
              요청 가능한 지급 휴가가 없습니다.
            </p>
          ) : (
            <>
              <FormField label="지급된 휴가">
                <select
                  name="leaveGrantId"
                  value={selectedGrantId}
                  onChange={(event) => setSelectedGrantId(event.target.value)}
                  className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base font-normal sm:text-sm"
                  required
                >
                  {requestableGrants.map((grant) => (
                    <option key={grant.id} value={grant.id}>
                      {grant.leaveType.name} - 잔여{" "}
                      {formatGrantAmount(grant.remainingAmount, grant.unit)}
                    </option>
                  ))}
                </select>
              </FormField>

              {selectedGrant ? (
                <div className="grid gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-3 text-sm leading-relaxed text-blue-900">
                  <p className="break-keep">
                    사용 가능 기간: {selectedGrant.effectiveFrom} ~{" "}
                    {selectedGrant.expiresAt ?? "만료 없음"}
                  </p>
                  <p className="break-keep">
                    사용 가능 단위: {allowedUnits.join(", ")}
                  </p>
                  <p className="break-keep">
                    증명자료 정책:{" "}
                    {
                      attachmentPolicyLabels[selectedGrantAttachmentPolicy]
                    }
                  </p>
                  {isSelectedReserveForcesGrant ? (
                    <p className="break-keep">
                      {RESERVE_FORCES_ATTACHMENT_DESCRIPTION}
                    </p>
                  ) : null}
                  {selectedGrant.leaveType.attachmentDescription ? (
                    <p className="break-keep">
                      {selectedGrant.leaveType.attachmentDescription}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <FormField label="사용 단위">
                <select
                  key={selectedGrantId}
                  name="usageUnit"
                  defaultValue={defaultUsageUnit}
                  className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base font-normal sm:text-sm"
                  required
                >
                  <option
                    value="FULL_DAY"
                    disabled={
                      isSelectedBirthdayHalfDay ||
                      !allowedUnits.includes("FULL_DAY")
                    }
                  >
                    하루
                  </option>
                  <option
                    value="HALF_DAY"
                    disabled={!allowedUnits.includes("HALF_DAY")}
                  >
                    반차
                  </option>
                  <option value="HOUR" disabled>
                    시간 단위는 다음 단계에서 제공
                  </option>
                  <option value="MINUTE" disabled>
                    분 단위는 다음 단계에서 제공
                  </option>
                </select>
              </FormField>

              <div className="grid min-w-0 gap-4 md:grid-cols-2">
                <FormField label="시작일">
                  <input
                    name="startDate"
                    type="date"
                    className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base font-normal sm:text-sm"
                    required
                  />
                </FormField>
                <FormField label="종료일">
                  <input
                    name="endDate"
                    type="date"
                    className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base font-normal sm:text-sm"
                    required
                  />
                </FormField>
              </div>

              <FormField label="반차 구분">
                <select
                  name="halfDayPeriod"
                  className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base font-normal sm:text-sm"
                  required={isSelectedBirthdayHalfDay}
                >
                  <option value="">하루 사용이면 선택하지 않음</option>
                  <option value="AM">오전</option>
                  <option value="PM">오후</option>
                </select>
              </FormField>

              <FormField label="사유">
                <textarea
                  name="reason"
                  rows={4}
                  className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-base font-normal sm:text-sm"
                />
              </FormField>

              <AttachmentInput
                required={customAttachmentRequired}
                description={
                  isSelectedReserveForcesGrant
                    ? RESERVE_FORCES_ATTACHMENT_DESCRIPTION
                    : selectedGrant?.leaveType.attachmentDescription
                }
              />

              <button className={buttonClassName({ className: "w-full sm:w-auto" })}>
                지급 휴가 요청
              </button>
            </>
          )}
        </form>
      </Card>
    </div>
  );
}
