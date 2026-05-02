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
      <div className="grid gap-1.5">
        <label className="text-sm font-medium text-neutral-800" htmlFor="phone">
          전화번호
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-900"
          required
        />
      </div>
      <div className="grid gap-1.5">
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
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-900"
          required
        />
      </div>
      {state.error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-400"
      >
        {pending ? "로그인 중" : "로그인"}
      </button>
    </form>
  );
}
