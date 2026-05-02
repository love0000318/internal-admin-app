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
        <label className="text-sm font-medium text-neutral-800" htmlFor="phone">
          전화번호
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          className="h-11 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-base outline-none focus:border-neutral-900 sm:text-sm"
          required
        />
      </div>
      <div className="grid min-w-0 gap-1.5">
        <label
          className="text-sm font-medium text-neutral-800"
          htmlFor="password"
        >
          비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="h-11 w-full min-w-0 rounded-md border border-neutral-300 px-3 text-base outline-none focus:border-neutral-900 sm:text-sm"
          required
        />
      </div>
      <label
        className="flex min-w-0 items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm text-neutral-800"
        htmlFor="rememberMe"
      >
        <input
          id="rememberMe"
          name="rememberMe"
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-neutral-950 focus:ring-neutral-900"
        />
        <span className="grid min-w-0 gap-1 leading-relaxed">
          <span className="font-medium">이 기기에서 자동 로그인 유지</span>
          <span className="text-xs text-neutral-500">
            공용 PC나 다른 사람과 함께 사용하는 기기에서는 선택하지 마세요.
          </span>
        </span>
      </label>
      {state.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-md bg-neutral-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-400"
      >
        {pending ? "로그인 중" : "로그인"}
      </button>
    </form>
  );
}
