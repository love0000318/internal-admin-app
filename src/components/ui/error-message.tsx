import type { ReactNode } from "react";

export function ErrorMessage({
  children = "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
}: {
  children?: ReactNode;
}) {
  return (
    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}
