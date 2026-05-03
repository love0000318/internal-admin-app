import Link from "next/link";
import type { ReactNode } from "react";

import { logoutAction } from "@/app/(auth)/logout/actions";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { RoleLabel } from "@/components/ui/status-badge";
import type { AuthenticatedUser } from "@/lib/auth/types";
import type { RoutePolicy } from "@/lib/routing/roles";

export function AppShell({
  user,
  navItems,
  unreadNotificationCount,
  children,
}: {
  user: AuthenticatedUser;
  navItems: RoutePolicy[];
  unreadNotificationCount: number;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-screen-2xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            href="/dashboard"
            className="min-w-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Internal Ops
            </p>
            <p className="truncate break-keep text-base font-bold tracking-normal text-slate-950">
              사내 관리 서비스
            </p>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            <NotificationBell unreadCount={unreadNotificationCount} />
            <div className="hidden max-w-60 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm sm:flex">
              <span className="max-w-32 truncate font-medium text-slate-800">
                {user.name}
              </span>
              <RoleLabel role={user.role} />
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="h-10 whitespace-nowrap break-keep rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>

        <nav className="border-t border-slate-100 bg-white md:hidden">
          <div className="flex min-w-0 gap-2 overflow-x-auto px-4 py-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 whitespace-nowrap break-keep rounded-full px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <div className="mx-auto flex w-full max-w-screen-2xl min-w-0">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 px-4 py-6 md:block">
          <nav className="grid gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap break-keep rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
