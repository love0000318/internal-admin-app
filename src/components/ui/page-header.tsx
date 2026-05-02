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
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow ? (
          <p className="text-sm font-medium text-neutral-500">{eyebrow}</p>
        ) : null}
        <h1 className="mt-2 text-2xl font-semibold tracking-normal">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
            {description}
          </p>
        ) : null}
      </div>
      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="inline-flex h-10 items-center rounded-md border border-neutral-300 px-4 text-sm font-medium"
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
