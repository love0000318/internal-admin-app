type ModulePlaceholderProps = {
  title: string;
  scope: "mvp" | "future";
};

export function ModulePlaceholder({ title, scope }: ModulePlaceholderProps) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-neutral-500">
        {scope === "mvp" ? "MVP 예정 라우트" : "추후 확장 라우트"}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-normal">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-600">
        이번 1단계에서는 화면과 실제 동작을 구현하지 않고, 라우트와 권한 설계
        포인트만 남깁니다.
      </p>
    </section>
  );
}
