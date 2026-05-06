"use client";

import Link from "next/link";
import { Menu } from "lucide-react";

import { NotificationBell } from "@/components/notifications/notification-bell";

export function MobileTopBar({
  unreadNotificationCount,
  onOpenMenu,
}: {
  unreadNotificationCount: number;
  onOpenMenu: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur md:hidden">
      <div className="flex h-16 min-w-0 items-center justify-between gap-2 px-4">
        <button
          type="button"
          aria-label="메뉴 열기"
          onClick={onOpenMenu}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>

        <Link
          href="/dashboard"
          className="min-w-0 flex-1 rounded-lg px-1 py-2 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          <span className="block truncate text-sm font-black tracking-wide text-slate-950">
            INTERNAL OPS
          </span>
        </Link>

        <NotificationBell unreadCount={unreadNotificationCount} />
      </div>
    </header>
  );
}
