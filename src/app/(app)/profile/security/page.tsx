import Link from "next/link";

import { PasswordChangeForm } from "@/app/(app)/profile/security/password-change-form";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

export default async function ProfileSecurityPage() {
  await requireRouteAccess("/profile/security");

  return (
    <section className="mx-auto grid max-w-2xl gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">보안 설정</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">
            비밀번호 변경
          </h1>
        </div>
        <Link
          href="/profile"
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          내 프로필
        </Link>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <PasswordChangeForm />
      </section>
    </section>
  );
}
