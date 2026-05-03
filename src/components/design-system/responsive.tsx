import Link from "next/link";
import type { ReactNode } from "react";

export type ResponsiveTabItem = {
  href: string;
  label: string;
  active?: boolean;
};

export function ResponsiveTabs({ items }: { items: ResponsiveTabItem[] }) {
  return (
    <div className="w-full overflow-x-auto">
      <nav className="flex min-w-max gap-2 whitespace-nowrap px-1 py-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`shrink-0 whitespace-nowrap break-keep rounded-xl border px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
              item.active
                ? "border-blue-700 bg-blue-700 text-white shadow-sm"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function ResponsiveTable({
  children,
  minWidth = "1100px",
}: {
  children: ReactNode;
  minWidth?: string;
}) {
  return (
    <div className="hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
      <div className="w-full overflow-x-auto">
        <table
          className="w-full table-auto text-left text-sm [&_td]:break-keep [&_td]:px-4 [&_td]:py-3 [&_th]:whitespace-nowrap [&_th]:break-keep [&_th]:px-4 [&_th]:py-3"
          style={{ minWidth }}
        >
          {children}
        </table>
      </div>
    </div>
  );
}

export function MobileCardList({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 md:hidden">{children}</div>;
}
