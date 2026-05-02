import Link from "next/link";

import {
  createLeaveType,
  deactivateLeaveType,
  reactivateLeaveType,
  updateLeaveType,
} from "@/app/(app)/admin/leaves/types/actions";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  ATTACHMENT_POLICY_VALUES,
  LEAVE_CATEGORY_VALUES,
  LEAVE_GRANT_METHOD_VALUES,
  LEAVE_GRANT_UNIT_VALUES,
  LEAVE_USAGE_MODE_VALUES,
  LEAVE_USAGE_UNIT_VALUES,
  LEAVE_VISIBILITY_VALUES,
  UNUSED_REMAINDER_HANDLING_VALUES,
  deserializeAllowedUnits,
} from "@/lib/leave/leave-types";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type LeaveTypesPageProps = {
  searchParams: Promise<{
    category?: string;
    enabled?: string;
    attachmentPolicy?: string;
    query?: string;
    error?: string;
    success?: string;
  }>;
};

const categoryLabels = {
  ANNUAL: "연차",
  CUSTOM: "맞춤휴가",
};

const grantMethodLabels = {
  SYSTEM: "자동 지급",
  ON_REQUEST: "요청 시 부여",
  AFTER_ANNUAL_EXHAUSTED: "연차 소진 후",
  ON_HIRE_DATE: "입사일 기준",
  MANUAL: "수동 지급",
  RECURRING: "반복 지급",
  ON_TENURE: "근속 기준",
};

const grantUnitLabels = {
  DAY: "일",
  HOUR: "시간",
  MINUTE: "분",
};

const usageModeLabels = {
  USE_ALL_AT_ONCE: "한 번에 모두 사용",
  SPLIT_ALLOWED: "나눠 사용 가능",
};

const usageUnitLabels = {
  FULL_DAY: "하루종일",
  HALF_DAY: "반차",
  HOUR: "시간",
  MINUTE: "분",
};

const remainderLabels = {
  KEEP_REMAINING: "잔여 유지",
  EXPIRE_REMAINING: "잔여 소멸",
};

const attachmentPolicyLabels = {
  NOT_REQUIRED: "불필요",
  REQUIRED_BEFORE_REQUEST: "요청 전 필수",
  REQUIRED_AFTER_REQUEST: "요청 후 제출",
  OPTIONAL: "선택 제출",
};

const visibilityLabels = {
  PUBLIC_AS_LEAVE: "휴가로만 공개",
  PUBLIC_WITH_TYPE: "휴가명 공개",
  PRIVATE_TO_APPROVERS: "승인자에게만 공개",
};

function statusMessage(kind?: string) {
  if (!kind) {
    return null;
  }

  const messages: Record<string, string> = {
    created: "휴가 유형이 생성되었습니다.",
    updated: "휴가 유형이 수정되었습니다.",
    deactivated: "휴가 유형이 비활성화되었습니다.",
    reactivated: "휴가 유형이 다시 활성화되었습니다.",
  };

  return messages[kind] ?? "처리가 완료되었습니다.";
}

function errorMessage(kind?: string) {
  if (!kind) {
    return null;
  }

  const messages: Record<string, string> = {
    invalid: "입력값을 확인해 주세요.",
    "duplicate-code": "이미 사용 중인 휴가 코드입니다.",
    "not-found": "요청한 휴가 유형을 찾을 수 없습니다.",
  };

  return messages[kind] ?? "처리 중 오류가 발생했습니다.";
}

function optionList<T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
) {
  return values.map((value) => (
    <option key={value} value={value}>
      {labels[value]}
    </option>
  ));
}

function allowedUnitText(value: string) {
  return deserializeAllowedUnits(value)
    .map((unit) => usageUnitLabels[unit as keyof typeof usageUnitLabels] ?? unit)
    .join(", ");
}

function checkedUnits(value: string) {
  return new Set(deserializeAllowedUnits(value));
}

function CommonPolicyFields({
  prefix,
  defaults,
}: {
  prefix: "create" | "update";
  defaults?: {
    isEnabled: boolean;
    isPaid: boolean;
    paidRate: number;
    grantMethod: string;
    grantAmount: number | null;
    grantUnit: string;
    usageMode: string;
    allowedUnits: string;
    unusedRemainderHandling: string;
    deductsAnnualBalance: boolean;
    attachmentPolicy: string;
    attachmentDescription: string | null;
    includeHolidayInDeduction: boolean;
    visibility: string;
  };
}) {
  const units = checkedUnits(defaults?.allowedUnits ?? "FULL_DAY");

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            name="isEnabled"
            type="checkbox"
            defaultChecked={defaults?.isEnabled ?? true}
          />
          사용
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            name="isPaid"
            type="checkbox"
            defaultChecked={defaults?.isPaid ?? true}
          />
          유급
        </label>
        <label className="text-sm">
          유급 비율
          <input
            name="paidRate"
            type="number"
            step="0.1"
            min="0"
            max="1"
            defaultValue={defaults?.paidRate ?? 1}
            className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
            required
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            name="deductsAnnualBalance"
            type="checkbox"
            defaultChecked={defaults?.deductsAnnualBalance ?? false}
          />
          연차 차감
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm">
          부여 방식
          <select
            name="grantMethod"
            defaultValue={defaults?.grantMethod ?? "MANUAL"}
            className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
          >
            {optionList(LEAVE_GRANT_METHOD_VALUES, grantMethodLabels)}
          </select>
        </label>
        <label className="text-sm">
          부여 수량
          <input
            name="grantAmount"
            type="number"
            step="0.5"
            min="0.5"
            defaultValue={defaults?.grantAmount ?? ""}
            className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
            placeholder="선택"
          />
        </label>
        <label className="text-sm">
          부여 단위
          <select
            name="grantUnit"
            defaultValue={defaults?.grantUnit ?? "DAY"}
            className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
          >
            {optionList(LEAVE_GRANT_UNIT_VALUES, grantUnitLabels)}
          </select>
        </label>
        <label className="text-sm">
          사용 방식
          <select
            name="usageMode"
            defaultValue={defaults?.usageMode ?? "SPLIT_ALLOWED"}
            className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
          >
            {optionList(LEAVE_USAGE_MODE_VALUES, usageModeLabels)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <fieldset className="min-w-0 rounded-md border border-neutral-200 p-3 lg:col-span-2">
          <legend className="px-1 text-sm font-medium">사용 가능 단위</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {LEAVE_USAGE_UNIT_VALUES.map((unit) => (
              <label key={`${prefix}-${unit}`} className="flex items-center gap-2 text-sm">
                <input
                  name="allowedUnits"
                  type="checkbox"
                  value={unit}
                  defaultChecked={units.has(unit)}
                />
                {usageUnitLabels[unit]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="text-sm">
          미사용 잔여 처리
          <select
            name="unusedRemainderHandling"
            defaultValue={defaults?.unusedRemainderHandling ?? "KEEP_REMAINING"}
            className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
          >
            {optionList(UNUSED_REMAINDER_HANDLING_VALUES, remainderLabels)}
          </select>
        </label>
        <label className="text-sm">
          공개 범위
          <select
            name="visibility"
            defaultValue={defaults?.visibility ?? "PUBLIC_WITH_TYPE"}
            className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
          >
            {optionList(LEAVE_VISIBILITY_VALUES, visibilityLabels)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="text-sm">
          증명자료 정책
          <select
            name="attachmentPolicy"
            defaultValue={defaults?.attachmentPolicy ?? "NOT_REQUIRED"}
            className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
          >
            {optionList(ATTACHMENT_POLICY_VALUES, attachmentPolicyLabels)}
          </select>
        </label>
        <label className="text-sm md:col-span-2">
          증명자료 안내문
          <input
            name="attachmentDescription"
            defaultValue={defaults?.attachmentDescription ?? ""}
            className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
            placeholder="휴가 요청 시 직원에게 안내됩니다."
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          name="includeHolidayInDeduction"
          type="checkbox"
          defaultChecked={defaults?.includeHolidayInDeduction ?? false}
        />
        휴일 포함 차감
      </label>
    </>
  );
}

export default async function LeaveTypesPage({
  searchParams,
}: LeaveTypesPageProps) {
  await requireOwner();
  const params = await searchParams;
  const where: Prisma.LeaveTypeDefinitionWhereInput = {};

  if (params.category === "ANNUAL" || params.category === "CUSTOM") {
    where.category = params.category;
  }

  if (params.enabled === "true") {
    where.isEnabled = true;
  }

  if (params.enabled === "false") {
    where.isEnabled = false;
  }

  if (
    params.attachmentPolicy &&
    ATTACHMENT_POLICY_VALUES.includes(
      params.attachmentPolicy as (typeof ATTACHMENT_POLICY_VALUES)[number],
    )
  ) {
    where.attachmentPolicy =
      params.attachmentPolicy as Prisma.EnumAttachmentPolicyFilter["equals"];
  }

  if (params.query?.trim()) {
    const query = params.query.trim();
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { code: { contains: query.toUpperCase(), mode: "insensitive" } },
    ];
  }

  const leaveTypes = await getPrisma().leaveTypeDefinition.findMany({
    where,
    orderBy: [
      { isSystemRequired: "desc" },
      { isEnabled: "desc" },
      { category: "asc" },
      { name: "asc" },
    ],
  });
  const success = statusMessage(params.success);
  const error = errorMessage(params.error);

  return (
    <section className="min-w-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">휴가 관리</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            휴가 유형 관리
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">
            회사가 운영하는 연차와 맞춤휴가의 사용 방식과 정책을 설정합니다.
            시스템 기본 휴가는 1차 MVP 기능과 연결되어 있어 일부 항목의 수정이
            제한됩니다.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link
            href="/admin/leaves/settings"
            className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap break-keep rounded-md border border-neutral-300 px-4 text-sm font-medium sm:w-auto"
          >
            휴가 정책 설정
          </Link>
          <Link
            href="/admin/leaves/grants"
            className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap break-keep rounded-md border border-neutral-300 px-4 text-sm font-medium sm:w-auto"
          >
            맞춤휴가 지급
          </Link>
          <Link
            href="/admin/leaves/holidays"
            className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap break-keep rounded-md border border-neutral-300 px-4 text-sm font-medium sm:w-auto"
          >
            회사 휴일 관리
          </Link>
          <Link
            href="/admin/leaves/balances"
            className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap break-keep rounded-md border border-neutral-300 px-4 text-sm font-medium sm:w-auto"
          >
            직원별 휴가 보유 현황
          </Link>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </p>
      ) : null}

      <form
        action="/admin/leaves/types"
        className="mt-6 grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-5"
      >
        <input
          name="query"
          defaultValue={params.query ?? ""}
          placeholder="휴가명, 코드 검색"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <select
          name="category"
          defaultValue={params.category ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">구분 전체</option>
          <option value="ANNUAL">연차</option>
          <option value="CUSTOM">맞춤휴가</option>
        </select>
        <select
          name="enabled"
          defaultValue={params.enabled ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">사용 여부 전체</option>
          <option value="true">사용</option>
          <option value="false">미사용</option>
        </select>
        <select
          name="attachmentPolicy"
          defaultValue={params.attachmentPolicy ?? ""}
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        >
          <option value="">증명자료 정책 전체</option>
          {optionList(ATTACHMENT_POLICY_VALUES, attachmentPolicyLabels)}
        </select>
        <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
          필터 적용
        </button>
      </form>

      <form
        action={createLeaveType}
        className="mt-6 grid gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
      >
        <div>
          <h2 className="text-lg font-semibold">맞춤휴가 생성</h2>
          <p className="mt-1 text-sm text-neutral-500">
            사용하지 않는 휴가 유형은 삭제하지 않고 비활성화됩니다.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm">
            휴가명
            <input
              name="name"
              className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
              required
            />
          </label>
          <label className="text-sm">
            코드
            <input
              name="code"
              className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2 uppercase"
              placeholder="REFRESH"
              pattern="[A-Z0-9_]+"
              required
            />
          </label>
          <label className="text-sm">
            구분
            <select
              name="category"
              defaultValue="CUSTOM"
              className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
            >
              {optionList(LEAVE_CATEGORY_VALUES, categoryLabels)}
            </select>
          </label>
          <label className="text-sm">
            설명
            <input
              name="description"
              className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
            />
          </label>
        </div>
        <CommonPolicyFields prefix="create" />
        <button className="h-10 justify-self-start rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
          휴가 유형 생성
        </button>
      </form>

      <div className="mt-6 rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[1500px] table-auto text-left text-sm [&_td]:break-keep [&_th]:break-keep [&_th]:whitespace-nowrap">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">휴가명</th>
              <th className="px-4 py-3">코드</th>
              <th className="px-4 py-3">구분</th>
              <th className="px-4 py-3">사용</th>
              <th className="px-4 py-3">유급</th>
              <th className="px-4 py-3">유급 비율</th>
              <th className="px-4 py-3">부여 방식</th>
              <th className="px-4 py-3">사용 방식</th>
              <th className="px-4 py-3">사용 가능 단위</th>
              <th className="px-4 py-3">증명자료</th>
              <th className="px-4 py-3">연차 차감</th>
              <th className="px-4 py-3">시스템 기본</th>
              <th className="px-4 py-3">수정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {leaveTypes.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={13}>
                  등록된 휴가 유형이 없습니다.
                </td>
              </tr>
            ) : (
              leaveTypes.map((leaveType) => (
                <tr key={leaveType.id} className="align-top">
                  <td className="px-4 py-3 font-medium">{leaveType.name}</td>
                  <td className="px-4 py-3">{leaveType.code}</td>
                  <td className="px-4 py-3">{categoryLabels[leaveType.category]}</td>
                  <td className="px-4 py-3">
                    {leaveType.isEnabled ? "사용" : "미사용"}
                  </td>
                  <td className="px-4 py-3">{leaveType.isPaid ? "유급" : "무급"}</td>
                  <td className="px-4 py-3">{leaveType.paidRate}</td>
                  <td className="px-4 py-3">
                    {grantMethodLabels[leaveType.grantMethod]}
                  </td>
                  <td className="px-4 py-3">
                    {usageModeLabels[leaveType.usageMode]}
                  </td>
                  <td className="px-4 py-3">
                    {allowedUnitText(leaveType.allowedUnits)}
                  </td>
                  <td className="px-4 py-3">
                    {attachmentPolicyLabels[leaveType.attachmentPolicy]}
                  </td>
                  <td className="px-4 py-3">
                    {leaveType.deductsAnnualBalance ? "차감" : "미차감"}
                  </td>
                  <td className="px-4 py-3">
                    {leaveType.isSystemRequired ? "시스템 기본" : "관리자 생성"}
                  </td>
                  <td className="px-4 py-3">
                    <form action={updateLeaveType} className="grid min-w-[720px] max-w-[780px] gap-3">
                      <input name="id" type="hidden" value={leaveType.id} />
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <label className="text-sm">
                          휴가명
                          <input
                            name="name"
                            defaultValue={leaveType.name}
                            className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
                            required
                          />
                        </label>
                        <label className="text-sm">
                          코드
                          {leaveType.isSystemRequired ? (
                            <>
                              <input name="code" type="hidden" value={leaveType.code} />
                              <input
                                value={leaveType.code}
                                className="mt-1 h-9 w-full rounded-md border border-neutral-200 bg-neutral-50 px-2"
                                disabled
                              />
                            </>
                          ) : (
                            <input
                              name="code"
                              defaultValue={leaveType.code}
                              className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2 uppercase"
                              pattern="[A-Z0-9_]+"
                              required
                            />
                          )}
                        </label>
                        <label className="text-sm">
                          구분
                          {leaveType.isSystemRequired ? (
                            <>
                              <input
                                name="category"
                                type="hidden"
                                value={leaveType.category}
                              />
                              <input
                                value={categoryLabels[leaveType.category]}
                                className="mt-1 h-9 w-full rounded-md border border-neutral-200 bg-neutral-50 px-2"
                                disabled
                              />
                            </>
                          ) : (
                            <select
                              name="category"
                              defaultValue={leaveType.category}
                              className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
                            >
                              {optionList(LEAVE_CATEGORY_VALUES, categoryLabels)}
                            </select>
                          )}
                        </label>
                        <label className="text-sm">
                          설명
                          <input
                            name="description"
                            defaultValue={leaveType.description ?? ""}
                            className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2"
                          />
                        </label>
                      </div>
                      {leaveType.isSystemRequired ? (
                        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                          시스템 기본 휴가는 1차 MVP 기능과 연결되어 있어 코드와
                          구분을 변경할 수 없습니다. 비활성화가 필요하면 운영 영향을
                          먼저 확인하세요.
                        </p>
                      ) : null}
                      <CommonPolicyFields
                        prefix="update"
                        defaults={{
                          isEnabled: leaveType.isEnabled,
                          isPaid: leaveType.isPaid,
                          paidRate: leaveType.paidRate,
                          grantMethod: leaveType.grantMethod,
                          grantAmount: leaveType.grantAmount,
                          grantUnit: leaveType.grantUnit,
                          usageMode: leaveType.usageMode,
                          allowedUnits: leaveType.allowedUnits,
                          unusedRemainderHandling: leaveType.unusedRemainderHandling,
                          deductsAnnualBalance: leaveType.deductsAnnualBalance,
                          attachmentPolicy: leaveType.attachmentPolicy,
                          attachmentDescription: leaveType.attachmentDescription,
                          includeHolidayInDeduction:
                            leaveType.includeHolidayInDeduction,
                          visibility: leaveType.visibility,
                        }}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button className="h-9 rounded-md bg-neutral-950 px-3 text-sm font-medium text-white">
                          저장
                        </button>
                        {leaveType.isEnabled ? (
                          <button
                            formAction={deactivateLeaveType}
                            className="h-9 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700"
                          >
                            비활성화
                          </button>
                        ) : (
                          <button
                            formAction={reactivateLeaveType}
                            className="h-9 rounded-md border border-green-200 px-3 text-sm font-medium text-green-700"
                          >
                            다시 사용
                          </button>
                        )}
                      </div>
                    </form>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </section>
  );
}
