import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="min-h-screen bg-neutral-100 px-6 py-16 text-neutral-950">
      <section className="mx-auto max-w-xl rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-neutral-500">Not Found</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">
          요청한 정보를 찾을 수 없습니다.
        </h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          주소가 바뀌었거나 접근 가능한 리소스가 아닐 수 있습니다.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex h-10 items-center rounded-md bg-neutral-950 px-4 text-sm font-medium text-white"
        >
          대시보드로 이동
        </Link>
      </section>
    </main>
  );
}
