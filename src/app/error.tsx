"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen bg-neutral-100 px-6 py-16 text-neutral-950">
      <section className="mx-auto max-w-xl rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-neutral-500">Error</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">
          처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
        </h1>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-5 h-10 rounded-md bg-neutral-950 px-4 text-sm font-medium text-white"
        >
          다시 시도
        </button>
      </section>
    </main>
  );
}
