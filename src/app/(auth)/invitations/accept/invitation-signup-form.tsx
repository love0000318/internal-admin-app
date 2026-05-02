"use client";

import { useActionState } from "react";

import {
  acceptInvitationAction,
  type AcceptInvitationFormState,
} from "@/app/(auth)/invitations/accept/actions";

const initialState: AcceptInvitationFormState = {
  error: null,
};

type InvitationSignupFormProps = {
  token: string;
};

export function InvitationSignupForm({ token }: InvitationSignupFormProps) {
  const [state, formAction, pending] = useActionState(
    acceptInvitationAction,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-4">
      <input name="token" type="hidden" value={token} />
      <div className="grid gap-1.5">
        <label className="text-sm font-medium text-neutral-800" htmlFor="name">
          이름
        </label>
        <input
          id="name"
          name="name"
          autoComplete="name"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-900"
          required
        />
      </div>
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
          htmlFor="verificationCode"
        >
          가입 인증 코드
        </label>
        <input
          id="verificationCode"
          name="verificationCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-900"
          required
        />
        <p className="text-xs leading-relaxed text-neutral-500">
          총괄 관리자가 전달한 1회용 가입 인증 코드를 입력해 주세요.
        </p>
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
          autoComplete="new-password"
          className="h-10 rounded-md border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-900"
          required
        />
      </div>
      <div className="grid gap-1.5">
        <label
          className="text-sm font-medium text-neutral-800"
          htmlFor="passwordConfirm"
        >
          비밀번호 확인
        </label>
        <input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
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
        {pending ? "가입 처리 중" : "가입 완료"}
      </button>
    </form>
  );
}
