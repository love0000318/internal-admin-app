"use client";

import type { StepUpPurpose } from "@/generated/prisma/client";
import { verifyStepUpPasswordAction } from "@/app/(app)/security/step-up-actions";
import type { KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState, useTransition } from "react";

type StepUpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purpose: StepUpPurpose;
  title?: string;
  description?: string;
  onVerified: () => void;
};

function errorMessage(error: "PASSWORD_REQUIRED" | "INVALID_PASSWORD" | "UNKNOWN") {
  if (error === "PASSWORD_REQUIRED") return "비밀번호를 입력해 주세요.";
  if (error === "INVALID_PASSWORD") {
    return "보안 확인에 실패했습니다. 비밀번호를 확인한 후 다시 시도해 주세요.";
  }
  return "보안 확인을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function StepUpDialog({
  open,
  onOpenChange,
  purpose,
  title = "보안 확인이 필요합니다.",
  description = "이 작업은 민감한 데이터나 권한에 영향을 줄 수 있습니다. 계속하려면 비밀번호를 다시 입력해 주세요.",
  onVerified,
}: StepUpDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const passwordInputId = useId();
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => passwordRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  const close = () => {
    if (!isPending) {
      setPassword("");
      setError(null);
      onOpenChange(false);
    }
  };

  const handleVerify = () => {
    setError(null);

    if (!password) {
      setError(errorMessage("PASSWORD_REQUIRED"));
      return;
    }

    startTransition(async () => {
      try {
        const result = await verifyStepUpPasswordAction({ password, purpose });

        if (!result.ok) {
          setError(errorMessage(result.error));
          return;
        }

        setPassword("");
        onOpenChange(false);
        onVerified();
      } catch {
        setError(errorMessage("UNKNOWN"));
      }
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleVerify();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex min-h-dvh items-end justify-center bg-slate-950/45 px-4 py-4 sm:items-center">
      <button
        type="button"
        aria-label="보안 확인 닫기"
        className="absolute inset-0 cursor-default"
        onClick={close}
      />
      <div
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${passwordInputId}-title`}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 id={`${passwordInputId}-title`} className="text-base font-semibold break-keep text-slate-950">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed break-keep text-slate-600">{description}</p>
          <p className="mt-2 text-xs leading-relaxed break-keep text-slate-500">
            공용 PC에서는 비밀번호 입력 후 자리를 비우지 마세요.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="grid gap-2 text-sm font-medium break-keep text-slate-700" htmlFor={passwordInputId}>
            비밀번호
            <input
              ref={passwordRef}
              id={passwordInputId}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isPending}
              className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-relaxed break-keep text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={isPending}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold break-keep text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleVerify}
            disabled={isPending}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-700 bg-blue-700 px-4 text-sm font-semibold break-keep text-white transition hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "확인 중..." : "보안 확인"}
          </button>
        </div>
      </div>
    </div>
  );
}
