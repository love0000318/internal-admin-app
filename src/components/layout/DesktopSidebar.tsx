"use client";

import Link from "next/link";

import type { NavigationSection } from "@/config/navigation";
import { NavSection } from "@/components/layout/NavSection";

export function DesktopSidebar({
  sections,
  pathname,
}: {
  sections: NavigationSection[];
  pathname: string;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 border-r border-slate-200 bg-white md:block">
      <div className="flex h-full min-h-0 flex-col">
        <Link
          href="/dashboard"
          className="mx-4 mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
            INTERNAL OPS
          </p>
          <p className="mt-1 truncate break-keep text-sm font-semibold text-slate-700">
            사내 관리 서비스
          </p>
        </Link>

        <nav
          aria-label="주 메뉴"
          className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4"
        >
          {sections.map((section) => (
            <NavSection key={section.id} section={section} pathname={pathname} />
          ))}
        </nav>
      </div>
    </aside>
  );
}
