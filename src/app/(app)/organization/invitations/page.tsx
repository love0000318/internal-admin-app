import { CopyButton } from "@/components/copy-button";
import { InvitationStatusBadge, RoleLabel } from "@/components/ui/status-badge";
import {
  cancelInvitation,
  createEmployeeInvitation,
  reissueInvitation,
} from "@/app/(app)/organization/actions";
import { roleLabel } from "@/lib/display/labels";
import { isInvitationEmailAvailable } from "@/lib/external-notifications/config";
import { toDisplayDate } from "@/lib/organization/format";
import { getPrisma } from "@/lib/db/prisma";
import { getInvitationVerificationCodeStatus } from "@/lib/auth/invitation-verification-code";
import { requireOwner } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type InvitationsPageProps = {
  searchParams: Promise<{
    inviteUrl?: string;
    longInviteUrl?: string;
    verificationCode?: string;
    error?: string;
    success?: string;
  }>;
};

const verificationCodeStatusLabels = {
  ISSUED: "인증 코드 발급됨",
  CONSUMED: "인증 코드 사용됨",
  EXPIRED: "인증 코드 만료됨",
  LOCKED: "인증 코드 잠김",
  REVOKED: "인증 코드 폐기됨",
  NEEDS_REISSUE: "인증 코드 재발급 필요",
};

export default async function InvitationsPage({
  searchParams,
}: InvitationsPageProps) {
  await requireOwner();
  const { inviteUrl, longInviteUrl, verificationCode, error, success } =
    await searchParams;
  const prisma = getPrisma();
  const canSendInvitationEmail = isInvitationEmailAvailable();
  const [teams, invitations] = await Promise.all([
    prisma.team.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
    }),
    prisma.invitation.findMany({
      include: {
        team: true,
        createdBy: true,
        employeePrejoinProfile: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <section>
      <p className="text-sm font-medium text-neutral-500">직원 초대</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-normal">
        초대 링크 관리
      </h1>
      <p className="mt-2 text-sm text-neutral-600">
        이메일이 import된 사전 인사정보와 일치하면 초대와 자동 연결됩니다.
      </p>
      {error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          초대 요청을 처리할 수 없습니다. 입력값과 중복 여부를 확인해 주세요.
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          초대 상태가 변경되었습니다.
        </p>
      ) : null}
      {inviteUrl ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">
            초대 링크가 생성되었습니다.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-emerald-800">
            초대 링크와 가입 인증 코드를 직원에게 함께 전달해 주세요. 초대 링크와 인증 코드는 가입 완료 후 다시 사용할 수 없습니다.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={inviteUrl}
              className="h-9 min-w-0 flex-1 rounded-md border border-emerald-200 bg-white px-3 text-sm"
            />
            <CopyButton value={inviteUrl} />
          </div>
          {longInviteUrl ? (
            <p className="mt-2 break-all text-xs text-emerald-700">
              긴 초대 URL도 사용할 수 있습니다: {longInviteUrl}
            </p>
          ) : null}
        </div>
      ) : null}
      {inviteUrl && verificationCode ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            가입 인증 코드는 지금 한 번만 표시됩니다.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-amber-800">
            직원에게 초대 링크와 가입 인증 코드를 함께 전달해 주세요. 코드를 분실한 경우 초대를 재발급해야 합니다.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={verificationCode}
              className="h-9 min-w-0 flex-1 rounded-md border border-amber-200 bg-white px-3 font-mono text-sm tracking-widest"
            />
            <CopyButton value={verificationCode} />
          </div>
          <div className="mt-3">
            <CopyButton
              value={`아래 링크로 접속한 뒤 가입 인증 코드를 입력해 주세요.\n\n초대 링크:\n${inviteUrl}\n\n가입 인증 코드:\n${verificationCode}`}
            />
          </div>
        </div>
      ) : null}

      <form
        action={createEmployeeInvitation}
        className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm md:grid-cols-4"
      >
        <input
          name="name"
          placeholder="이름"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
          required
        />
        <input
          name="email"
          type="email"
          placeholder="이메일"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
          required
        />
        <input
          name="title"
          placeholder="직급"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <select name="role" className="h-10 rounded-md border px-3 text-sm" required>
          <option value="MANAGER">{roleLabel("MANAGER")}</option>
          <option value="LEAD">{roleLabel("LEAD")}</option>
        </select>
        <select name="teamId" className="h-10 rounded-md border px-3 text-sm">
          <option value="">소속 팀 없음</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <label className="grid gap-1 text-xs text-neutral-500">
          입사일
          <input
            name="hireDate"
            type="date"
            className="h-10 rounded-md border px-3 text-sm text-neutral-950"
          />
        </label>
        <label className="grid gap-1 text-xs text-neutral-500">
          생일
          <input
            name="birthDate"
            type="date"
            className="h-10 rounded-md border px-3 text-sm text-neutral-950"
          />
        </label>
        <label className="flex items-start gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700 md:col-span-3">
          <input
            name="sendInvitationEmail"
            type="checkbox"
            value="true"
            disabled={!canSendInvitationEmail}
            className="mt-1 h-4 w-4 rounded border-neutral-300 disabled:opacity-50"
          />
          <span className="leading-relaxed break-keep">
            초대 이메일 발송
            <span className="block text-xs text-neutral-500">
              {canSendInvitationEmail
                ? "초대 링크와 가입 인증 코드를 직원 이메일로 함께 보냅니다."
                : "이메일 provider 환경변수가 설정되지 않아 직접 전달만 가능합니다."}
            </span>
          </span>
        </label>
        <button className="h-10 self-end rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
          초대 생성
        </button>
      </form>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">이름</th>
              <th className="px-4 py-3">이메일</th>
              <th className="px-4 py-3">역할</th>
              <th className="px-4 py-3">팀</th>
              <th className="px-4 py-3">사전 정보</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">가입 인증 코드</th>
              <th className="px-4 py-3">만료일</th>
              <th className="px-4 py-3">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {invitations.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={10}>
                  진행 중인 초대가 없습니다.
                </td>
              </tr>
            ) : (
              invitations.map((invitation) => (
                <tr key={invitation.id}>
                  <td className="px-4 py-3">
                    {invitation.name ?? invitation.expectedName}
                  </td>
                  <td className="px-4 py-3">{invitation.email}</td>
                  <td className="px-4 py-3">
                    <RoleLabel role={invitation.role} />
                  </td>
                  <td className="px-4 py-3">{invitation.team?.name ?? "-"}</td>
                  <td className="px-4 py-3">
                    {invitation.employeePrejoinProfile ? "연결됨" : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <InvitationStatusBadge status={invitation.status} />
                  </td>
                  <td className="px-4 py-3">
                    {invitation.status === "ACCEPTED" ||
                    invitation.shortTokenConsumedAt
                      ? "가입 완료"
                      : invitation.status === "CANCELLED" ||
                          invitation.shortTokenRevokedAt
                        ? "취소됨"
                        : invitation.status === "EXPIRED"
                          ? "만료됨"
                          : invitation.shortTokenHash
                            ? "단축 링크 발급됨"
                            : "재발급 필요"}
                  </td>
                  <td className="px-4 py-3">
                    {
                      verificationCodeStatusLabels[
                        getInvitationVerificationCodeStatus(invitation)
                      ]
                    }
                  </td>
                  <td className="px-4 py-3">{toDisplayDate(invitation.expiresAt)}</td>
                  <td className="px-4 py-3">
                    {invitation.status === "PENDING" ? (
                      <div className="flex gap-2">
                        <form action={cancelInvitation}>
                          <input
                            name="invitationId"
                            type="hidden"
                            value={invitation.id}
                          />
                          <button className="h-9 rounded-md border border-red-200 px-3 text-sm text-red-700">
                            취소
                          </button>
                        </form>
                        <form action={reissueInvitation}>
                          <input
                            name="invitationId"
                            type="hidden"
                            value={invitation.id}
                          />
                          <input
                            name="stepUpPassword"
                            type="password"
                            autoComplete="current-password"
                            className="mb-2 h-9 w-36 rounded-md border border-amber-200 px-2 text-sm"
                            placeholder="현재 비밀번호"
                            required
                          />
                          <button className="h-9 rounded-md border border-neutral-300 px-3 text-sm">
                            재발급
                          </button>
                        </form>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
