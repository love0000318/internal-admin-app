import Link from "next/link";

export function PaginationControls({
  previousHref,
  nextHref,
  hasPrevious,
  hasNext,
  page,
}: {
  previousHref: string;
  nextHref: string;
  hasPrevious: boolean;
  hasNext: boolean;
  page: number;
}) {
  return (
    <nav
      aria-label="페이지 이동"
      className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-center text-sm font-medium text-slate-500 sm:text-left">
        {page}페이지
      </p>
      <div className="grid gap-2 sm:flex">
        {hasPrevious ? (
          <Link
            href={previousHref}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            이전
          </Link>
        ) : (
          <span className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-400">
            이전
          </span>
        )}
        {hasNext ? (
          <Link
            href={nextHref}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            다음
          </Link>
        ) : (
          <span className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-400">
            다음
          </span>
        )}
      </div>
    </nav>
  );
}
