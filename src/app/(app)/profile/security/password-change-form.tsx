"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  PASSWORD_CHANGE_INITIAL_STATE,
  changeMyPasswordAction,
} from "@/app/(app)/profile/security/actions";

export function PasswordChangeForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    changeMyPasswordAction,
    PASSWORD_CHANGE_INITIAL_STATE,
  );

  useEffect(() => {
    if (state.successMessage) {
      formRef.current?.reset();
    }
  }, [state.successMessage]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-5">
      <div className="grid gap-2">
        <label
          className="text-sm font-semibold text-slate-800"
          htmlFor="currentPassword"
        >
          현재 비밀번호
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100 sm:text-sm"
          required
        />
      </div>

      <div className="grid gap-2">
        <label
          className="text-sm font-semibold text-slate-800"
          htmlFor="newPassword"
        >
          새 비밀번호
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100 sm:text-sm"
          required
        />
      </div>

      <div className="grid gap-2">
        <label
          className="text-sm font-semibold text-slate-800"
          htmlFor="confirmNewPassword"
        >
          새 비밀번호 확인
        </label>
        <input
          id="confirmNewPassword"
          name="confirmNewPassword"
          type="password"
          autoComplete="new-password"
          className="h-11 w-full rounded-lg border border-slate-300 px-3 text-base outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-100 sm:text-sm"
          required
        />
      </div>

      <div className="min-h-10" aria-live="polite">
        {state.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {state.error}
          </p>
        ) : null}
        {state.successMessage ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            {state.successMessage}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {pending ? "변경 중" : "비밀번호 변경"}
      </button>
    </form>
  );
}
