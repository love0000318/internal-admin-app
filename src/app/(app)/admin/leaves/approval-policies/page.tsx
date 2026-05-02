import Link from "next/link";

import {
  createApprovalPolicy,
  deactivateApprovalPolicy,
  updateApprovalPolicy,
  updateLeaveTypeApprovalPolicy,
} from "@/app/(app)/admin/leaves/approval-policies/actions";
import { getPrisma } from "@/lib/db/prisma";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type ApprovalPoliciesPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

const approvalModeLabels = {
  NONE: "자동 승인",
  SINGLE: "단일 승인",
  SEQUENTIAL: "순차 승인(후순위)",
};

const approverRuleLabels = {
  OWNER: "OWNER",
  TEAM_LEAD: "담당 리드",
  TEAM_LEAD_OR_OWNER: "담당 리드 또는 OWNER",
  CUSTOM_USER: "지정 승인자",
};

const appliesToLabels = {
  LEAVE_REQUEST: "휴가 요청",
  LEAVE_CANCEL: "휴가 취소",
};

const autoConfirmTimingLabels = {
  AFTER_START_DATE: "휴가 시작일 다음 날",
};

function message(kind?: string) {
  if (!kind) {
    return null;
  }

  const messages: Record<string, string> = {
    created: "승인 정책이 생성되었습니다.",
    updated: "승인 정책이 수정되었습니다.",
    deactivated: "승인 정책이 비활성화되었습니다.",
    linked: "휴가 유형에 승인 정책이 연결되었습니다.",
  };

  return messages[kind] ?? "처리가 완료되었습니다.";
}

function errorMessage(kind?: string) {
  if (!kind) {
    return null;
  }

  const messages: Record<string, string> = {
    invalid: "입력값을 확인해 주세요.",
    "duplicate-code": "이미 사용 중인 정책 코드입니다.",
    "not-found": "대상을 찾을 수 없습니다.",
    "custom-approver-required": "지정 승인자 정책에는 승인자를 선택해야 합니다.",
  };

  return messages[kind] ?? "처리 중 오류가 발생했습니다.";
}

function PolicyFields({
  policy,
  users,
}: {
  policy?: {
    id?: string;
    code?: string;
    name?: string;
    description?: string | null;
    appliesTo?: string;
    approvalMode?: string;
    approverRule?: string;
    customApproverUserId?: string | null;
    requireCommentOnReject?: boolean;
    requireCommentOnCancel?: boolean;
    requireAttachmentAcceptedBeforeApproval?: boolean;
    autoApproveIfNoApprover?: boolean;
    autoConfirmWhenStartDatePassed?: boolean;
    autoConfirmTiming?: string;
    isEnabled?: boolean;
  };
  users: Array<{ id: string; name: string; email: string; role: string }>;
}) {
  return (
    <div className="grid gap-2">
      {policy?.id ? <input name="id" type="hidden" value={policy.id} /> : null}
      <div className="grid gap-2 md:grid-cols-2">
        <input
          name="name"
          defaultValue={policy?.name ?? ""}
          className="h-9 rounded-md border px-2"
          placeholder="정책명"
          required
        />
        <input
          name="code"
          defaultValue={policy?.code ?? ""}
          className="h-9 rounded-md border px-2"
          placeholder="정책 코드"
        />
      </div>
      <input
        name="description"
        defaultValue={policy?.description ?? ""}
        className="h-9 rounded-md border px-2"
        placeholder="설명"
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <select
          name="appliesTo"
          defaultValue={policy?.appliesTo ?? "LEAVE_REQUEST"}
          className="h-9 rounded-md border px-2"
        >
          {Object.entries(appliesToLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="approvalMode"
          defaultValue={policy?.approvalMode ?? "SINGLE"}
          className="h-9 rounded-md border px-2"
        >
          {Object.entries(approvalModeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="approverRule"
          defaultValue={policy?.approverRule ?? "TEAM_LEAD_OR_OWNER"}
          className="h-9 rounded-md border px-2"
        >
          {Object.entries(approverRuleLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="customApproverUserId"
          defaultValue={policy?.customApproverUserId ?? ""}
          className="h-9 rounded-md border px-2"
        >
          <option value="">지정 승인자 없음</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.role})
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
        <label className="flex items-center gap-2">
          <input
            name="requireCommentOnReject"
            type="checkbox"
            defaultChecked={policy?.requireCommentOnReject ?? true}
          />
          반려 사유 필수
        </label>
        <label className="flex items-center gap-2">
          <input
            name="requireCommentOnCancel"
            type="checkbox"
            defaultChecked={policy?.requireCommentOnCancel ?? true}
          />
          취소 사유 필수
        </label>
        <label className="flex items-center gap-2">
          <input
            name="autoApproveIfNoApprover"
            type="checkbox"
            defaultChecked={policy?.autoApproveIfNoApprover ?? false}
          />
          승인자 없으면 자동 승인
        </label>
        <label className="flex items-center gap-2">
          <input
            name="requireAttachmentAcceptedBeforeApproval"
            type="checkbox"
            defaultChecked={policy?.requireAttachmentAcceptedBeforeApproval ?? false}
          />
          증명자료 확인 후 승인
        </label>
        <label className="flex items-center gap-2">
          <input name="isEnabled" type="checkbox" defaultChecked={policy?.isEnabled ?? true} />
          사용
        </label>
      </div>
      <div className="grid gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm md:grid-cols-[1fr_220px]">
        <label className="flex items-center gap-2">
          <input
            name="autoConfirmWhenStartDatePassed"
            type="checkbox"
            defaultChecked={policy?.autoConfirmWhenStartDatePassed ?? true}
          />
          휴가 시작일 경과 시 자동 확정
        </label>
        <select
          name="autoConfirmTiming"
          defaultValue="AFTER_START_DATE"
          className="h-9 rounded-md border px-2"
        >
          {Object.entries(autoConfirmTimingLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-500 md:col-span-2">
          상급자의 별도 승인이 없더라도 설정된 시점이 지나면 승인 대기 휴가를 시스템이 자동 확정합니다.
        </p>
      </div>
    </div>
  );
}

export default async function ApprovalPoliciesPage({
  searchParams,
}: ApprovalPoliciesPageProps) {
  await requireOwner();
  const { error, success } = await searchParams;
  const prisma = getPrisma();
  const [policies, leaveTypes, users] = await Promise.all([
    prisma.approvalPolicy.findMany({
      orderBy: [{ isEnabled: "desc" }, { createdAt: "asc" }],
      include: {
        leaveType: true,
        customApprover: true,
        assignedLeaveTypes: { orderBy: { code: "asc" } },
      },
    }),
    prisma.leaveTypeDefinition.findMany({
      orderBy: { code: "asc" },
      include: { approvalPolicy: true },
    }),
    prisma.user.findMany({
      where: {
        status: "ACTIVE",
        role: { in: ["OWNER", "LEAD"] },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
  ]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">휴가 관리</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">휴가 승인 정책</h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-600">
            휴가 유형별로 승인 필요 여부와 승인자 규칙을 설정합니다. 순차 승인은 확장 구조만
            준비되어 있으며, 현재 운영 흐름은 자동 승인 또는 단일 승인 중심입니다.
          </p>
        </div>
        <Link
          href="/admin/leaves/settings"
          className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
        >
          휴가 관리 설정으로 이동
        </Link>
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage(error)}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {message(success)}
        </p>
      ) : null}

      <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">승인 정책 생성</h2>
        <form action={createApprovalPolicy} className="mt-4 space-y-3">
          <PolicyFields users={users} />
          <button className="h-9 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
            정책 생성
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[1200px] table-auto text-left text-sm [&_td]:break-keep [&_th]:break-keep [&_th]:whitespace-nowrap">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">정책</th>
              <th className="px-4 py-3">승인 방식</th>
              <th className="px-4 py-3">승인자 규칙</th>
              <th className="px-4 py-3">증명자료</th>
              <th className="px-4 py-3">연결 휴가 유형</th>
              <th className="px-4 py-3">사용 여부</th>
              <th className="px-4 py-3">수정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {policies.map((policy) => (
              <tr key={policy.id} className="align-top">
                <td className="px-4 py-3">
                  <p className="font-medium">{policy.name}</p>
                  <p className="text-xs text-neutral-500">{policy.code}</p>
                  {policy.description ? (
                    <p className="mt-1 text-xs text-neutral-500">{policy.description}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {approvalModeLabels[policy.approvalMode]}
                  {policy.approvalMode === "SEQUENTIAL" ? (
                    <p className="text-xs text-amber-700">실제 다단계 승인은 후순위입니다.</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {approverRuleLabels[policy.approverRule]}
                  {policy.customApprover ? (
                    <p className="text-xs text-neutral-500">지정: {policy.customApprover.name}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {policy.requireAttachmentAcceptedBeforeApproval
                    ? "확인 완료 후 승인"
                    : "경고만 표시"}
                </td>
                <td className="px-4 py-3">
                  {policy.assignedLeaveTypes.length > 0
                    ? policy.assignedLeaveTypes.map((leaveType) => leaveType.name).join(", ")
                    : "-"}
                </td>
                <td className="px-4 py-3">{policy.isEnabled ? "사용" : "미사용"}</td>
                <td className="px-4 py-3">
                  <form action={updateApprovalPolicy} className="grid min-w-[760px] gap-3">
                    <PolicyFields policy={policy} users={users} />
                    <div className="flex gap-2">
                      <button className="h-9 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
                        저장
                      </button>
                    </div>
                  </form>
                  {policy.isEnabled ? (
                    <form action={deactivateApprovalPolicy} className="mt-2">
                      <input name="id" type="hidden" value={policy.id} />
                      <button className="h-9 rounded-md border border-red-200 px-4 text-sm font-medium text-red-700">
                        비활성화
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">휴가 유형별 정책 연결</h2>
        <div className="mt-4 grid gap-3">
          {leaveTypes.map((leaveType) => (
            <form
              key={leaveType.id}
              action={updateLeaveTypeApprovalPolicy}
              className="grid gap-2 rounded-md border border-neutral-200 p-3 md:grid-cols-[1fr_280px_auto]"
            >
              <input name="leaveTypeId" type="hidden" value={leaveType.id} />
              <div>
                <p className="font-medium">{leaveType.name}</p>
                <p className="text-xs text-neutral-500">
                  {leaveType.code} · 현재 정책: {leaveType.approvalPolicy?.name ?? "기본 정책"}
                </p>
              </div>
              <select
                name="approvalPolicyId"
                defaultValue={leaveType.approvalPolicyId ?? ""}
                className="h-9 rounded-md border px-2 text-sm"
              >
                <option value="">정책 선택</option>
                {policies
                  .filter((policy) => policy.isEnabled)
                  .map((policy) => (
                    <option key={policy.id} value={policy.id}>
                      {policy.name}
                    </option>
                  ))}
              </select>
              <button className="h-9 rounded-md border border-neutral-300 px-4 text-sm font-medium">
                연결
              </button>
            </form>
          ))}
        </div>
      </div>
    </section>
  );
}
