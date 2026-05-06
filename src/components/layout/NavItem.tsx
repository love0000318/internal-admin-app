"use client";

import Link from "next/link";

import type { NavigationItem } from "@/config/navigation";

export function NavItem({
  item,
  active,
  onNavigate,
}: {
  item: NavigationItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`group flex min-h-11 min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
        active
          ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
      }`}
    >
      <Icon
        aria-hidden="true"
        className={`h-5 w-5 shrink-0 ${active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"}`}
      />
      <span className="min-w-0 truncate break-keep">{item.label}</span>
    </Link>
  );
}
