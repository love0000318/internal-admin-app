import Link from "next/link";

type PageHeaderAction = {
  href: string;
  label: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions = [],
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: PageHeaderAction[];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-sm font-semibold text-slate-500">{eyebrow}</p>
        ) : null}
        <h1 className="mt-2 max-w-full break-keep text-2xl font-bold tracking-normal text-slate-950 sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-slate-600">
            {description}
          </p>
        ) : null}
      </div>
      {actions.length > 0 ? (
        <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:w-auto"
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
