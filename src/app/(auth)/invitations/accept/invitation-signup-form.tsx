"use client";

import { useActionState } from "react";

import {
  acceptInvitationAction,
  type AcceptInvitationFormState,
} from "@/app/(auth)/invitations/accept/actions";
import { buttonClassName } from "@/components/design-system/primitives";

const initialState: AcceptInvitationFormState = {
  error: null,
};

type InvitationSignupFormProps = {
  token?: string;
  shortToken?: string;
};

export function InvitationSignupForm({
  token,
  shortToken,
}: InvitationSignupFormProps) {
  const [state, formAction, pending] = useActionState(
    acceptInvitationAction,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-4">
      {token ? <input name="token" type="hidden" value={token} /> : null}
      {shortToken ? (
        <input name="shortToken" type="hidden" value={shortToken} />
      ) : null}
      <div className="grid min-w-0 gap-1.5">
        <label className="break-keep text-sm font-semibold text-slate-800" htmlFor="name">
          이름
        </label>
        <input
          id="name"
          name="name"
          autoComplete="name"
          className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base outline-none transition focus:border-blue-700 sm:text-sm"
          required
        />
      </div>
      <div className="grid min-w-0 gap-1.5">
        <label className="break-keep text-sm font-semibold text-slate-800" htmlFor="phone">
          전화번호
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base outline-none transition focus:border-blue-700 sm:text-sm"
          required
        />
      </div>
      <div className="grid min-w-0 gap-1.5">
        <label
          className="break-keep text-sm font-semibold text-slate-800"
          htmlFor="verificationCode"
        >
          가입 인증 코드
        </label>
        <input
          id="verificationCode"
          name="verificationCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base tracking-wide outline-none transition focus:border-blue-700 sm:text-sm"
          required
        />
        <p className="break-keep text-xs leading-relaxed text-slate-500">
          총괄 관리자가 전달한 1회용 가입 인증 코드를 입력해 주세요.
        </p>
      </div>
      <div className="grid min-w-0 gap-1.5">
        <label
          className="break-keep text-sm font-semibold text-slate-800"
          htmlFor="password"
        >
          비밀번호
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base outline-none transition focus:border-blue-700 sm:text-sm"
          required
        />
      </div>
      <div className="grid min-w-0 gap-1.5">
        <label
          className="break-keep text-sm font-semibold text-slate-800"
          htmlFor="passwordConfirm"
        >
          비밀번호 확인
        </label>
        <input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          className="h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 text-base outline-none transition focus:border-blue-700 sm:text-sm"
          required
        />
      </div>
      {state.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className={buttonClassName({ className: "w-full disabled:cursor-not-allowed disabled:bg-slate-400" })}
      >
        {pending ? "가입 처리 중" : "가입 완료"}
      </button>
    </form>
  );
}
