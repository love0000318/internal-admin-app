import { hashInvitationToken, isInvitationExpired } from "@/lib/auth/invitation-token";
import { getPrisma } from "@/lib/db/prisma";
import { InvitationSignupForm } from "@/app/(auth)/invitations/accept/invitation-signup-form";
import { roleLabel } from "@/lib/display/labels";

export const dynamic = "force-dynamic";

type InvitationsAcceptPageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

async function getInvitation(token: string) {
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

export default async function InvitationsAcceptPage({
  searchParams,
}: InvitationsAcceptPageProps) {
  const { token } = await searchParams;
  const invitation = token ? await getInvitation(token) : null;
  const isUsed =
    invitation?.status === "ACCEPTED" ||
    !!invitation?.acceptedAt ||
    !!invitation?.usedAt;
  const unavailable =
    !token ||
    !invitation ||
    invitation.status !== "PENDING" ||
    isInvitationExpired(invitation.expiresAt);

  return (
    <main className="flex min-h-full items-center justify-center bg-neutral-100 px-4 py-10 text-neutral-950">
      <section className="w-full max-w-xl rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
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
            <dl className="mt-5 grid gap-2 rounded-md bg-neutral-50 p-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500">이름</dt>
                <dd className="font-medium text-neutral-900">
                  {invitation.expectedName}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500">이메일</dt>
                <dd className="font-medium text-neutral-900">
                  {invitation.email}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500">역할</dt>
                <dd className="font-medium text-neutral-900">
                  {roleLabel(invitation.role)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500">사전 인사정보</dt>
                <dd className="font-medium text-neutral-900">
                  {invitation.employeePrejoinProfile ? "연결됨" : "없음"}
                </dd>
              </div>
            </dl>
            <div className="mt-5">
              <InvitationSignupForm token={token} />
            </div>
          </>
        )}
      </section>
    </main>
  );
}
