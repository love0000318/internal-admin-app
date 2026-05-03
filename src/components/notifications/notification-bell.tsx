import Link from "next/link";
import { Bell } from "lucide-react";

type NotificationBellProps = {
  unreadCount: number;
};

export function NotificationBell({ unreadCount }: NotificationBellProps) {
  const hasUnread = unreadCount > 0;
  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <Link
      href="/notifications"
      aria-label={
        hasUnread
          ? `알림센터, 읽지 않은 알림 ${unreadCount}개`
          : "알림센터"
      }
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
    >
      <Bell
        aria-hidden="true"
        className={`h-5 w-5 ${hasUnread ? "animate-bell-shake text-slate-950" : ""}`}
      />
      {hasUnread ? (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold leading-none text-white ring-2 ring-white">
          {badgeLabel}
        </span>
      ) : null}
    </Link>
  );
}
