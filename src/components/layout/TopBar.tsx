"use client";

import { logoutAction } from "@/app/(auth)/logout/actions";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { RoleLabel } from "@/components/ui/status-badge";
import type { AuthenticatedUser } from "@/lib/auth/types";

export function TopBar({
  user,
  unreadNotificationCount,
}: {
  user: AuthenticatedUser;
  unreadNotificationCount: number;
}) {
  return (
    <header className="hidden border-b border-slate-200 bg-white/90 backdrop-blur md:block">
      <div className="flex h-16 min-w-0 items-center justify-end gap-3 px-6 lg:px-8">
        <NotificationBell unreadCount={unreadNotificationCount} />
        <div className="flex min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <span className="max-w-48 truncate font-semibold text-slate-800">
            {user.name}
          </span>
          <RoleLabel role={user.role} />
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center whitespace-nowrap break-keep rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            로그아웃
          </button>
        </form>
      </div>
    </header>
  );
}
