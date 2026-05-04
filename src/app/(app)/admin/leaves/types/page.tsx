import {
  createLeaveType,
  deactivateLeaveType,
  reactivateLeaveType,
  updateLeaveType,
} from "@/app/(app)/admin/leaves/types/actions";
import { Badge, buttonClassName, Card, EmptyState } from "@/components/design-system/primitives";
import { MobileCardList, ResponsiveTable } from "@/components/design-system/responsive";
import { LeaveAdminNav } from "@/components/leave/leave-admin-nav";
import { Prisma, type LeaveTypeDefinition } from "@/generated/prisma/client";
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

const categoryLabels: Record<(typeof LEAVE_CATEGORY_VALUES)[number], string> = {
  ANNUAL: "연차",
  CUSTOM: "맞춤휴가",
};

const grantMethodLabels: Record<(typeof LEAVE_GRANT_METHOD_VALUES)[number], string> = {
  SYSTEM: "자동 지급",
  ON_REQUEST: "요청 시 부여",
  AFTER_ANNUAL_EXHAUSTED: "연차 소진 후",
  ON_HIRE_DATE: "입사일 기준",
  MANUAL: "수동 지급",
  RECURRING: "반복 지급",
  ON_TENURE: "근속 기준",
};

const grantUnitLabels: Record<(typeof LEAVE_GRANT_UNIT_VALUES)[number], string> = {
  DAY: "일",
  HOUR: "시간",
  MINUTE: "분",
};

const usageModeLabels: Record<(typeof LEAVE_USAGE_MODE_VALUES)[number], string> = {
  USE_ALL_AT_ONCE: "한 번에 모두 사용",
  SPLIT_ALLOWED: "나누어 사용 가능",
};

const usageUnitLabels: Record<(typeof LEAVE_USAGE_UNIT_VALUES)[number], string> = {
  FULL_DAY: "하루",
  HALF_DAY: "반차",
  HOUR: "시간",
  MINUTE: "분",
};

const remainderLabels: Record<(typeof UNUSED_REMAINDER_HANDLING_VALUES)[number], string> = {
  KEEP_REMAINING: "잔여 유지",
  EXPIRE_REMAINING: "잔여 소멸",
};

const attachmentPolicyLabels: Record<(typeof ATTACHMENT_POLICY_VALUES)[number], string> = {
  NOT_REQUIRED: "불필요",
  REQUIRED_BEFORE_REQUEST: "요청 전 필수",
  REQUIRED_AFTER_REQUEST: "요청 후 제출",
  OPTIONAL: "선택 제출",
};

const visibilityLabels: Record<(typeof LEAVE_VISIBILITY_VALUES)[number], string> = {
  PUBLIC_AS_LEAVE: "휴가로만 공개",
  PUBLIC_WITH_TYPE: "휴가명 공개",
  PRIVATE_TO_APPROVERS: "승인자에게만 공개",
};

function statusMessage(kind?: string) {
  if (!kind) {
    return null;
  }

  const messages: Record<string, string> = {
    created: "휴가 유형을 생성했습니다.",
    updated: "휴가 유형을 수정했습니다.",
    deactivated: "휴가 유형을 비활성화했습니다.",
    reactivated: "휴가 유형을 다시 사용하도록 변경했습니다.",
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

function numberValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function CommonPolicyFields({
  prefix,
  defaults,
}: {
  prefix: "create" | "update";
  defaults?: Pick<
    LeaveTypeDefinition,
    | "isEnabled"
    | "isPaid"
    | "paidRate"
    | "grantMethod"
    | "grantAmount"
    | "grantUnit"
    | "usageMode"
    | "allowedUnits"
    | "unusedRemainderHandling"
    | "deductsAnnualBalance"
    | "attachmentPolicy"
    | "attachmentDescription"
    | "includeHolidayInDeduction"
    | "visibility"
  >;
}) {
  const units = checkedUnits(defaults?.allowedUnits ?? "FULL_DAY");

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="flex items-center gap-2 break-keep text-sm text-slate-700">
          <input
            name="isEnabled"
            type="checkbox"
            defaultChecked={defaults?.isEnabled ?? true}
          />
          사용
        </label>
        <label className="flex items-center gap-2 break-keep text-sm text-slate-700">
          <input
            name="isPaid"
            type="checkbox"
            defaultChecked={defaults?.isPaid ?? true}
          />
          유급
        </label>
        <label className="break-keep text-sm font-medium text-slate-800">
          유급 비율
          <input
            name="paidRate"
            type="number"
            step="0.1"
            min="0"
            max="1"
            defaultValue={numberValue(defaults?.paidRate ?? 1)}
            className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
            required
          />
        </label>
        <label className="flex items-center gap-2 break-keep text-sm text-slate-700">
          <input
            name="deductsAnnualBalance"
            type="checkbox"
            defaultChecked={defaults?.deductsAnnualBalance ?? false}
          />
          연차 차감
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="break-keep text-sm font-medium text-slate-800">
          부여 방식
          <select
            name="grantMethod"
            defaultValue={defaults?.grantMethod ?? "MANUAL"}
            className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
          >
            {optionList(LEAVE_GRANT_METHOD_VALUES, grantMethodLabels)}
          </select>
        </label>
        <label className="break-keep text-sm font-medium text-slate-800">
          부여 수량
          <input
            name="grantAmount"
            type="number"
            step="0.5"
            min="0.5"
            defaultValue={numberValue(defaults?.grantAmount)}
            className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
            placeholder="선택"
          />
        </label>
        <label className="break-keep text-sm font-medium text-slate-800">
          부여 단위
          <select
            name="grantUnit"
            defaultValue={defaults?.grantUnit ?? "DAY"}
            className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
          >
            {optionList(LEAVE_GRANT_UNIT_VALUES, grantUnitLabels)}
          </select>
        </label>
        <label className="break-keep text-sm font-medium text-slate-800">
          사용 방식
          <select
            name="usageMode"
            defaultValue={defaults?.usageMode ?? "SPLIT_ALLOWED"}
            className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
          >
            {optionList(LEAVE_USAGE_MODE_VALUES, usageModeLabels)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <fieldset className="min-w-0 rounded-xl border border-slate-200 p-3 lg:col-span-2">
          <legend className="px-1 text-sm font-semibold text-slate-800">
            사용 가능 단위
          </legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {LEAVE_USAGE_UNIT_VALUES.map((unit) => (
              <label key={`${prefix}-${unit}`} className="flex items-center gap-2 break-keep text-sm text-slate-700">
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

        <label className="break-keep text-sm font-medium text-slate-800">
          잔여 처리
          <select
            name="unusedRemainderHandling"
            defaultValue={defaults?.unusedRemainderHandling ?? "KEEP_REMAINING"}
            className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
          >
            {optionList(UNUSED_REMAINDER_HANDLING_VALUES, remainderLabels)}
          </select>
        </label>
        <label className="break-keep text-sm font-medium text-slate-800">
          공개 범위
          <select
            name="visibility"
            defaultValue={defaults?.visibility ?? "PUBLIC_WITH_TYPE"}
            className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
          >
            {optionList(LEAVE_VISIBILITY_VALUES, visibilityLabels)}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="break-keep text-sm font-medium text-slate-800">
          증명자료 정책
          <select
            name="attachmentPolicy"
            defaultValue={defaults?.attachmentPolicy ?? "NOT_REQUIRED"}
            className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
          >
            {optionList(ATTACHMENT_POLICY_VALUES, attachmentPolicyLabels)}
          </select>
        </label>
        <label className="break-keep text-sm font-medium text-slate-800">
          증명자료 안내
          <input
            name="attachmentDescription"
            defaultValue={defaults?.attachmentDescription ?? ""}
            className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
            placeholder="제출이 필요한 자료 안내"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 break-keep text-sm text-slate-700">
        <input
          name="includeHolidayInDeduction"
          type="checkbox"
          defaultChecked={defaults?.includeHolidayInDeduction ?? false}
        />
        휴일 포함 차감
      </label>
    </div>
  );
}

function LeaveTypeForm({ leaveType }: { leaveType: LeaveTypeDefinition }) {
  return (
    <form action={updateLeaveType} className="grid min-w-0 gap-4">
      <input name="id" type="hidden" value={leaveType.id} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="break-keep text-sm font-medium text-slate-800">
          휴가명
          <input
            name="name"
            defaultValue={leaveType.name}
            className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
            required
          />
        </label>
        <label className="break-keep text-sm font-medium text-slate-800">
          코드
          {leaveType.isSystemRequired ? (
            <>
              <input name="code" type="hidden" value={leaveType.code} />
              <input
                value={leaveType.code}
                className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3"
                disabled
              />
            </>
          ) : (
            <input
              name="code"
              defaultValue={leaveType.code}
              className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 uppercase"
              pattern="[A-Z0-9_]+"
              required
            />
          )}
        </label>
        <label className="break-keep text-sm font-medium text-slate-800">
          구분
          {leaveType.isSystemRequired ? (
            <>
              <input name="category" type="hidden" value={leaveType.category} />
              <input
                value={categoryLabels[leaveType.category]}
                className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3"
                disabled
              />
            </>
          ) : (
            <select
              name="category"
              defaultValue={leaveType.category}
              className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
            >
              {optionList(LEAVE_CATEGORY_VALUES, categoryLabels)}
            </select>
          )}
        </label>
        <label className="break-keep text-sm font-medium text-slate-800">
          설명
          <input
            name="description"
            defaultValue={leaveType.description ?? ""}
            className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
          />
        </label>
      </div>
      {leaveType.isSystemRequired ? (
        <p className="break-keep rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          시스템 기본 휴가는 기존 휴가 요청 기능과 연결되어 있어 코드와 구분을 변경할 수 없습니다.
        </p>
      ) : null}
      <CommonPolicyFields prefix="update" defaults={leaveType} />
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button className={buttonClassName({ className: "w-full sm:w-auto" })}>
          저장
        </button>
        {leaveType.isEnabled ? (
          <button
            formAction={deactivateLeaveType}
            className={buttonClassName({
              tone: "danger",
              className: "w-full sm:w-auto",
            })}
          >
            비활성화
          </button>
        ) : (
          <button
            formAction={reactivateLeaveType}
            className={buttonClassName({
              tone: "neutral",
              className: "w-full sm:w-auto",
            })}
          >
            다시 사용
          </button>
        )}
      </div>
    </form>
  );
}

export default async function LeaveTypesPage({
  searchParams,
}: LeaveTypesPageProps) {
  await requireOwner();
  const params = await searchParams;
  const where: Prisma.LeaveTypeDefinitionWhereInput = {};

  if (
    params.category &&
    LEAVE_CATEGORY_VALUES.includes(
      params.category as (typeof LEAVE_CATEGORY_VALUES)[number],
    )
  ) {
    where.category = params.category as Prisma.EnumLeaveCategoryFilter["equals"];
  }

  if (params.enabled === "true" || params.enabled === "false") {
    where.isEnabled = params.enabled === "true";
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
    <section className="min-w-0 space-y-5">
      <div className="space-y-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-blue-700">휴가 관리</p>
          <h1 className="mt-2 break-keep text-2xl font-bold tracking-normal text-slate-950 sm:text-3xl">
            휴가 유형 관리
          </h1>
          <p className="mt-2 max-w-3xl break-keep text-sm leading-relaxed text-slate-600">
            회사가 운영하는 연차와 맞춤휴가의 지급 방식, 사용 단위, 공개 범위, 증명자료 정책을 관리합니다.
          </p>
        </div>
        <LeaveAdminNav activeHref="/admin/leaves/types" />
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </p>
      ) : null}

      <Card>
        <form
          action="/admin/leaves/types"
          className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"
        >
          <input
            name="query"
            defaultValue={params.query ?? ""}
            placeholder="휴가명, 코드 검색"
            className="h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm"
          />
          <select
            name="category"
            defaultValue={params.category ?? ""}
            className="h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm"
          >
            <option value="">구분 전체</option>
            <option value="ANNUAL">연차</option>
            <option value="CUSTOM">맞춤휴가</option>
          </select>
          <select
            name="enabled"
            defaultValue={params.enabled ?? ""}
            className="h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm"
          >
            <option value="">사용 여부 전체</option>
            <option value="true">사용</option>
            <option value="false">미사용</option>
          </select>
          <select
            name="attachmentPolicy"
            defaultValue={params.attachmentPolicy ?? ""}
            className="h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-sm"
          >
            <option value="">증명자료 정책 전체</option>
            {optionList(ATTACHMENT_POLICY_VALUES, attachmentPolicyLabels)}
          </select>
          <button className={buttonClassName({ className: "w-full" })}>
            필터 적용
          </button>
        </form>
      </Card>

      <Card>
        <form action={createLeaveType} className="grid gap-4">
          <div className="min-w-0">
            <h2 className="break-keep text-lg font-semibold text-slate-950">
              맞춤휴가 생성
            </h2>
            <p className="mt-1 break-keep text-sm text-slate-500">
              사용하지 않는 휴가 유형은 삭제하지 않고 비활성화합니다.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="break-keep text-sm font-medium text-slate-800">
              휴가명
              <input
                name="name"
                className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
                required
              />
            </label>
            <label className="break-keep text-sm font-medium text-slate-800">
              코드
              <input
                name="code"
                className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3 uppercase"
                placeholder="REFRESH"
                pattern="[A-Z0-9_]+"
                required
              />
            </label>
            <label className="break-keep text-sm font-medium text-slate-800">
              구분
              <select
                name="category"
                defaultValue="CUSTOM"
                className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
              >
                {optionList(LEAVE_CATEGORY_VALUES, categoryLabels)}
              </select>
            </label>
            <label className="break-keep text-sm font-medium text-slate-800">
              설명
              <input
                name="description"
                className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-300 px-3"
              />
            </label>
          </div>
          <CommonPolicyFields prefix="create" />
          <button className={buttonClassName({ className: "w-full sm:w-auto" })}>
            휴가 유형 생성
          </button>
        </form>
      </Card>

      {leaveTypes.length === 0 ? (
        <EmptyState title="등록된 휴가 유형이 없습니다." />
      ) : (
        <>
          <MobileCardList>
            {leaveTypes.map((leaveType) => (
              <Card key={leaveType.id} className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-keep text-base font-semibold text-slate-950">
                      {leaveType.name}
                    </h2>
                    <p className="mt-1 break-all font-mono text-xs text-slate-500">
                      {leaveType.code}
                    </p>
                  </div>
                  <Badge tone={leaveType.isEnabled ? "success" : "default"}>
                    {leaveType.isEnabled ? "사용" : "미사용"}
                  </Badge>
                </div>
                <dl className="grid gap-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 whitespace-nowrap break-keep text-slate-500">
                      구분
                    </dt>
                    <dd className="text-right">{categoryLabels[leaveType.category]}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 whitespace-nowrap break-keep text-slate-500">
                      유급
                    </dt>
                    <dd className="text-right">
                      {leaveType.isPaid ? "유급" : "무급"} · {numberValue(leaveType.paidRate)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 whitespace-nowrap break-keep text-slate-500">
                      사용 단위
                    </dt>
                    <dd className="break-keep text-right">
                      {allowedUnitText(leaveType.allowedUnits)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 whitespace-nowrap break-keep text-slate-500">
                      증명자료
                    </dt>
                    <dd className="break-keep text-right">
                      {attachmentPolicyLabels[leaveType.attachmentPolicy]}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 whitespace-nowrap break-keep text-slate-500">
                      연차 차감
                    </dt>
                    <dd className="text-right">
                      {leaveType.deductsAnnualBalance ? "차감" : "미차감"}
                    </dd>
                  </div>
                </dl>
                <details className="rounded-xl border border-slate-200 p-3">
                  <summary className="cursor-pointer whitespace-nowrap break-keep text-sm font-semibold">
                    수정
                  </summary>
                  <div className="mt-4">
                    <LeaveTypeForm leaveType={leaveType} />
                  </div>
                </details>
              </Card>
            ))}
          </MobileCardList>

          <ResponsiveTable minWidth="1500px">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th>휴가명</th>
                <th>코드</th>
                <th>구분</th>
                <th>사용</th>
                <th>유급</th>
                <th>부여 방식</th>
                <th>사용 방식</th>
                <th>사용 가능 단위</th>
                <th>증명자료</th>
                <th>연차 차감</th>
                <th>시스템 기본</th>
                <th className="min-w-[760px]">수정</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leaveTypes.map((leaveType) => (
                <tr key={leaveType.id} className="align-top">
                  <td className="font-semibold text-slate-950">{leaveType.name}</td>
                  <td className="font-mono text-xs">{leaveType.code}</td>
                  <td>{categoryLabels[leaveType.category]}</td>
                  <td>{leaveType.isEnabled ? "사용" : "미사용"}</td>
                  <td>{leaveType.isPaid ? "유급" : "무급"}</td>
                  <td>{grantMethodLabels[leaveType.grantMethod]}</td>
                  <td>{usageModeLabels[leaveType.usageMode]}</td>
                  <td>{allowedUnitText(leaveType.allowedUnits)}</td>
                  <td>{attachmentPolicyLabels[leaveType.attachmentPolicy]}</td>
                  <td>{leaveType.deductsAnnualBalance ? "차감" : "미차감"}</td>
                  <td>
                    {leaveType.isSystemRequired ? "시스템 기본" : "관리자 생성"}
                  </td>
                  <td>
                    <LeaveTypeForm leaveType={leaveType} />
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        </>
      )}
    </section>
  );
}
