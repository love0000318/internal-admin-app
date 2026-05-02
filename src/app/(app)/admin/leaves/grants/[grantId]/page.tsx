import Link from "next/link";
import { notFound } from "next/navigation";

import { revokeLeaveGrant } from "@/app/(app)/admin/leaves/grants/actions";
import { getPrisma } from "@/lib/db/prisma";
import { dateToDateOnly } from "@/lib/leave/calculate-business-days";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type LeaveGrantDetailPageProps = {
  params: Promise<{ grantId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

const unitLabels = {
  DAY: "일",
  HOUR: "시간",
  MINUTE: "분",
};

const statusLabels = {
  ACTIVE: "사용 가능",
  REVOKED: "회수됨",
  EXPIRED: "만료됨",
};

function formatAmount(amount: number, unit: keyof typeof unitLabels) {
  return `${amount}${unitLabels[unit]}`;
}

function formatDate(value: Date | null) {
  return value ? dateToDateOnly(value) : "-";
}

function message(kind?: string) {
  if (kind === "created") {
    return "맞춤휴가가 지급되었습니다.";
  }

  if (kind === "revoked") {
    return "맞춤휴가 지급 내역이 회수되었습니다.";
  }

  return null;
}

export default async function LeaveGrantDetailPage({
  params,
  searchParams,
}: LeaveGrantDetailPageProps) {
  await requireOwner();
  const [{ grantId }, query] = await Promise.all([params, searchParams]);
  const grant = await getPrisma().leaveGrant.findUnique({
    where: { id: grantId },
    include: {
      user: { include: { team: true } },
      leaveType: true,
      grantedByUser: true,
      revokedByUser: true,
    },
  });

  if (!grant) {
    notFound();
  }

  const success = message(query.success);

  return (
    <section>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">휴가 관리</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            맞춤휴가 지급 상세
          </h1>
        </div>
        <Link
          href="/admin/leaves/grants"
          className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
        >
          지급 목록으로
        </Link>
      </div>

      {query.error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {query.error === "not-revocable"
            ? "이미 사용되었거나 승인 대기 중인 휴가가 있어 회수할 수 없습니다."
            : "처리 중 오류가 발생했습니다."}
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">지급 정보</h2>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <Field label="직원" value={`${grant.user.name} (${grant.user.email})`} />
            <Field label="전화번호" value={grant.user.phone ?? "-"} />
            <Field label="팀" value={grant.user.team?.name ?? "-"} />
            <Field label="직급" value={grant.user.title ?? "-"} />
            <Field label="휴가 유형" value={grant.leaveType.name} />
            <Field
              label="지급 수량"
              value={formatAmount(grant.grantedAmount, grant.unit)}
            />
            <Field
              label="사용 완료 수량"
              value={formatAmount(grant.usedAmount, grant.unit)}
            />
            <Field
              label="승인 대기 수량"
              value={formatAmount(grant.pendingAmount, grant.unit)}
            />
            <Field
              label="잔여 수량"
              value={formatAmount(grant.remainingAmount, grant.unit)}
            />
            <Field label="상태" value={statusLabels[grant.status]} />
            <Field label="사용 시작일" value={formatDate(grant.effectiveFrom)} />
            <Field label="만료일" value={formatDate(grant.expiresAt)} />
            <Field label="지급자" value={grant.grantedByUser.name} />
            <Field label="지급일" value={dateToDateOnly(grant.createdAt)} />
            <Field label="회수자" value={grant.revokedByUser?.name ?? "-"} />
            <Field label="회수일" value={formatDate(grant.revokedAt)} />
          </dl>
          <div className="mt-4 rounded-md bg-neutral-50 p-3 text-sm">
            <p className="font-medium">지급 사유</p>
            <p className="mt-1 text-neutral-700">{grant.reason}</p>
          </div>
          {grant.revokeReason ? (
            <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
              <p className="font-medium">회수 사유</p>
              <p className="mt-1">{grant.revokeReason}</p>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">회수 처리</h2>
          <p className="mt-2 text-sm text-neutral-600">
            회수된 맞춤휴가는 직원의 사용 가능 휴가에서 제외됩니다. 사용 완료
            또는 승인 대기 수량이 있으면 이번 단계에서는 회수할 수 없습니다.
          </p>
          {grant.status === "ACTIVE" ? (
            <form action={revokeLeaveGrant} className="mt-4 grid gap-3">
              <input name="grantId" type="hidden" value={grant.id} />
              <label className="text-sm">
                회수 사유
                <textarea
                  name="revokeReason"
                  className="mt-1 min-h-28 w-full rounded-md border border-neutral-300 px-3 py-2"
                  required
                />
              </label>
              <button className="h-10 rounded-md border border-red-200 px-4 text-sm font-medium text-red-700">
                회수하기
              </button>
            </form>
          ) : (
            <p className="mt-4 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
              이미 회수 또는 만료된 지급 내역입니다.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
