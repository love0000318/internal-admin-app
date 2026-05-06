import type { ReactNode } from "react";

export function PageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-5 overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      {children}
    </div>
  );
}
