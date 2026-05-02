import Link from "next/link";

import { confirmMyProfile } from "@/app/(app)/profile/actions";
import { getPrisma } from "@/lib/db/prisma";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

function formatDate(date?: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "-";
}

export default async function ProfileConfirmPage() {
  const actor = await requireRouteAccess("/profile/confirm");
  const user = await getPrisma().user.findUnique({
    where: { id: actor.id },
    include: {
      team: true,
      profile: true,
      employmentProfile: true,
      familyMembers: true,
      careerRecords: true,
      educationRecords: true,
    },
  });

  if (!user) {
    return (
      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        요청한 정보를 찾을 수 없습니다.
      </section>
    );
  }

  return (
    <section className="max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-medium text-neutral-500">내 정보 확인</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">
          자동 입력된 인사정보를 확인해 주세요
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          초대 가입 시 등록된 인사정보가 자동으로 입력되었습니다. 내용이
          다르면 수정 가능한 항목은 직접 수정하고, 민감정보는 변경 요청을
          제출해 주세요.
        </p>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-neutral-500">이름</dt>
            <dd className="font-medium">{user.profile?.legalName ?? user.name}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">회사 내 이름</dt>
            <dd className="font-medium">{user.profile?.displayName ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">회사 이메일</dt>
            <dd className="font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">소속 팀</dt>
            <dd className="font-medium">{user.team?.name ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">직급/직책</dt>
            <dd className="font-medium">
              {user.employmentProfile?.jobGrade ?? user.title ?? "-"}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">입사일</dt>
            <dd className="font-medium">{formatDate(user.hireDate)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">가족 정보</dt>
            <dd className="font-medium">{user.familyMembers.length}건</dd>
          </div>
          <div>
            <dt className="text-neutral-500">경력/학력 정보</dt>
            <dd className="font-medium">
              {user.careerRecords.length + user.educationRecords.length}건
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-wrap gap-2">
        <form action={confirmMyProfile}>
          <button className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white">
            확인 완료
          </button>
        </form>
        <Link
          href="/profile/edit"
          className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
        >
          수정하기
        </Link>
        <Link
          href="/profile"
          className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
        >
          상세 보기
        </Link>
      </div>
    </section>
  );
}
