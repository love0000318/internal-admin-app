import Link from "next/link";

import { requireCurrentUser } from "@/lib/auth/session";

export default async function ForbiddenPage() {
  await requireCurrentUser();

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-medium text-neutral-500">권한 없음</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-normal">
        접근 권한이 없습니다.
      </h1>
      <p className="mt-3 text-sm leading-6 text-neutral-600">
        이 화면은 현재 계정의 역할로 사용할 수 없습니다. 필요한 경우 OWNER에게
        권한 변경을 요청해 주세요.
      </p>
      <Link
        href="/dashboard"
        className="mt-5 inline-flex h-10 items-center rounded-md bg-neutral-950 px-4 text-sm font-medium text-white"
      >
        대시보드로 이동
      </Link>
    </section>
  );
}
