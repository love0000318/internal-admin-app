import { redirect } from "next/navigation";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center overflow-x-hidden bg-slate-100 px-4 py-6 text-slate-950 sm:py-10">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          Internal Ops
        </p>
        <h1 className="mt-2 break-keep text-2xl font-bold tracking-normal">
          로그인
        </h1>
        <p className="mt-2 break-keep text-sm leading-relaxed text-slate-500">
          사내 휴가, 근태, 알림과 조직 운영을 관리하는 서비스입니다.
        </p>
        <div className="mt-5">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
