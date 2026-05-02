import { hashInvitationToken, isInvitationExpired } from "@/lib/auth/invitation-token";
import {
  hashInvitationShortToken,
  isInvitationShortTokenFormat,
  validateInvitationShortTokenRecord,
} from "@/lib/auth/invitation-short-token";
import { getPrisma } from "@/lib/db/prisma";
import { InvitationSignupForm } from "@/app/(auth)/invitations/accept/invitation-signup-form";
import { roleLabel } from "@/lib/display/labels";

export const dynamic = "force-dynamic";

type InvitationsAcceptPageProps = {
  searchParams: Promise<{
    token?: string;
    shortToken?: string;
  }>;
};

async function getInvitationByToken(token: string) {
  return getPrisma().invitation.findUnique({
    where: {
      tokenHash: hashInvitationToken(token),
    },
    include: {
      team: true,
      employeePrejoinProfile: true,
    },
  });
}

async function getInvitationByShortToken(shortToken: string) {
  if (!isInvitationShortTokenFormat(shortToken)) {
    return null;
  }

  return getPrisma().invitation.findUnique({
    where: {
      shortTokenHash: hashInvitationShortToken(shortToken),
    },
    include: {
      team: true,
      employeePrejoinProfile: true,
    },
  });
}

export default async function InvitationsAcceptPage({
  searchParams,
}: InvitationsAcceptPageProps) {
  const { token, shortToken } = await searchParams;
  const invitation = token
    ? await getInvitationByToken(token)
    : shortToken
      ? await getInvitationByShortToken(shortToken)
      : null;
  const isUsed =
    invitation?.status === "ACCEPTED" ||
    !!invitation?.acceptedAt ||
    !!invitation?.usedAt;
  const unavailable =
    (!token && !shortToken) ||
    !invitation ||
    invitation.status !== "PENDING" ||
    isInvitationExpired(invitation.expiresAt) ||
    (shortToken
      ? !validateInvitationShortTokenRecord(invitation).ok
      : false);

  return (
    <main className="flex min-h-screen items-center justify-center overflow-x-hidden bg-neutral-100 px-4 py-6 text-neutral-950 sm:py-10">
      <section className="w-full max-w-xl rounded-lg border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-medium text-neutral-500">초대 수락</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">
          회원가입
        </h1>
        {unavailable ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {isUsed
              ? "이미 사용된 초대 링크입니다."
              : "유효하지 않거나 만료된 초대 링크입니다."}
          </p>
        ) : (
          <>
            <dl className="mt-5 grid gap-3 rounded-md bg-neutral-50 p-4 text-sm">
              <div className="grid gap-1 sm:grid-cols-[7rem_1fr] sm:items-center">
                <dt className="text-neutral-500">이름</dt>
                <dd className="min-w-0 break-words font-medium text-neutral-900 sm:text-right">
                  {invitation.expectedName}
                </dd>
              </div>
              <div className="grid gap-1 sm:grid-cols-[7rem_1fr] sm:items-center">
                <dt className="text-neutral-500">이메일</dt>
                <dd className="min-w-0 break-all font-medium text-neutral-900 sm:text-right">
                  {invitation.email}
                </dd>
              </div>
              <div className="grid gap-1 sm:grid-cols-[7rem_1fr] sm:items-center">
                <dt className="text-neutral-500">역할</dt>
                <dd className="min-w-0 break-words font-medium text-neutral-900 sm:text-right">
                  {roleLabel(invitation.role)}
                </dd>
              </div>
              <div className="grid gap-1 sm:grid-cols-[7rem_1fr] sm:items-center">
                <dt className="text-neutral-500">사전 인사정보</dt>
                <dd className="min-w-0 break-words font-medium text-neutral-900 sm:text-right">
                  {invitation.employeePrejoinProfile ? "연결됨" : "없음"}
                </dd>
              </div>
            </dl>
            <div className="mt-5">
              <InvitationSignupForm token={token} shortToken={shortToken} />
            </div>
          </>
        )}
      </section>
    </main>
  );
}
