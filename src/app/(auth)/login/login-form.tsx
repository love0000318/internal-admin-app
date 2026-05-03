"use client";

import { useActionState } from "react";

import { loginAction, type LoginFormState } from "@/app/(auth)/login/actions";

const initialState: LoginFormState = {
  error: null,
};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid min-w-0 gap-1.5">
        <label className="text-sm font-semibold text-slate-800" htmlFor="phone">
          전화번호
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100 sm:text-sm"
          required
        />
      </div>
      <div className="grid min-w-0 gap-1.5">
        <label className="text-sm font-semibold text-slate-800" htmlFor="password">
          비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100 sm:text-sm"
          required
        />
      </div>
      <label
        className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800"
        htmlFor="rememberMe"
      >
        <input
          id="rememberMe"
          name="rememberMe"
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-700 focus:ring-blue-700"
        />
        <span className="grid min-w-0 gap-1 leading-relaxed">
          <span className="break-keep font-semibold">
            이 기기에서 자동 로그인 유지
          </span>
          <span className="break-keep text-xs text-slate-500">
            공용 PC나 다른 사람과 함께 사용하는 기기에서는 선택하지 마세요.
          </span>
        </span>
      </label>
      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          전화번호 또는 비밀번호가 올바르지 않습니다.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {pending ? "로그인 중" : "로그인"}
      </button>
    </form>
  );
}
