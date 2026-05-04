import type { ReactNode } from "react";

type Tone = "default" | "primary" | "success" | "warning" | "danger" | "info";

const badgeTone: Record<Tone, string> = {
  default: "border-slate-200 bg-slate-50 text-slate-700",
  primary: "border-blue-200 bg-blue-50 text-blue-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-red-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
};

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}

export function PageSection({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`min-w-0 max-w-full space-y-4 ${className}`}>{children}</div>;
}

export function buttonClassName({
  tone = "primary",
  className = "",
}: {
  tone?: "primary" | "neutral" | "danger";
  className?: string;
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-white text-red-700 hover:bg-red-50"
      : tone === "neutral"
        ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        : "border-blue-700 bg-blue-700 text-white hover:bg-blue-800";

  return `inline-flex min-h-10 max-w-full min-w-0 items-center justify-center rounded-lg border px-4 py-2 text-center text-sm font-semibold leading-tight break-keep whitespace-normal transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:whitespace-nowrap ${toneClass} ${className}`;
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex min-h-6 max-w-full min-w-0 items-center whitespace-nowrap break-keep rounded-full border px-2 text-xs font-medium leading-tight ${badgeTone[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
      <p className="break-keep font-semibold text-slate-900">{title}</p>
      {description ? (
        <p className="mt-2 break-keep text-sm leading-relaxed text-slate-500">{description}</p>
      ) : null}
    </div>
  );
}
