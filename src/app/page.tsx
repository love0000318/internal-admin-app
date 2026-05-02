import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-full items-center justify-center bg-neutral-100 px-4 py-10 text-neutral-950">
      <section className="w-full max-w-2xl rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-neutral-500">Internal Ops MVP</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">
          1단계 기반 설계
        </h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          현재 단계는 Prisma schema, Role/타입, seed 초안, 라우트 확장 포인트를
          정리하는 초기 기반입니다.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-10 items-center rounded-md bg-neutral-950 px-4 text-sm font-medium text-white"
        >
          라우트 구조 보기
        </Link>
      </section>
    </main>
  );
}
