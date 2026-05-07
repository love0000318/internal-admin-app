"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type NotificationBellProps = {
  unreadCount: number;
};

type LatestNotification = {
  id: string;
  title: string;
  message: string;
  linkUrl: string | null;
  createdAt: string;
};

export function NotificationBell({ unreadCount }: NotificationBellProps) {
  const [currentUnreadCount, setCurrentUnreadCount] = useState(unreadCount);
  const [toast, setToast] = useState<LatestNotification | null>(null);
  const lastSeenCreatedAt = useRef(new Date().toISOString());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUnread = currentUnreadCount > 0;
  const badgeLabel = currentUnreadCount > 9 ? "9+" : String(currentUnreadCount);

  useEffect(() => {
    let cancelled = false;

    async function pollLatestNotifications() {
      try {
        const response = await fetch(
          `/api/notifications/latest?after=${encodeURIComponent(lastSeenCreatedAt.current)}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          unreadCount?: number;
          latest?: LatestNotification[];
        };

        if (cancelled) {
          return;
        }

        if (typeof payload.unreadCount === "number") {
          setCurrentUnreadCount(payload.unreadCount);
        }

        const latest = payload.latest ?? [];
        if (latest.length > 0) {
          const newest = latest[0];
          lastSeenCreatedAt.current = newest.createdAt;

          if (document.visibilityState === "visible") {
            setToast(newest);
            if (toastTimer.current) {
              clearTimeout(toastTimer.current);
            }
            toastTimer.current = setTimeout(() => setToast(null), 8000);
          }
        }
      } catch {
        // Polling is best-effort; the next interval will retry without blocking the app.
      }
    }

    const interval = window.setInterval(
      pollLatestNotifications,
      document.visibilityState === "visible" ? 20000 : 60000,
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  return (
    <>
      <Link
        href="/notifications"
        aria-label={
          hasUnread
            ? `알림센터, 읽지 않은 알림 ${currentUnreadCount}개`
            : "알림센터"
        }
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        <Bell
          aria-hidden="true"
          className={`h-5 w-5 ${
            hasUnread ? "motion-safe:animate-bell-shake text-slate-950" : ""
          }`}
        />
        {hasUnread ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold leading-none text-white ring-2 ring-white">
            {badgeLabel}
          </span>
        ) : null}
      </Link>

      {toast ? (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-[70] w-[calc(100vw-2rem)] max-w-sm rounded-2xl border border-blue-100 bg-white p-4 text-left shadow-xl"
        >
          <p className="break-keep text-sm font-bold text-slate-950">{toast.title}</p>
          <p className="mt-1 text-safe text-sm leading-relaxed text-slate-600">
            {toast.message}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {toast.linkUrl ? (
              <Link
                href={toast.linkUrl}
                onClick={() => setToast(null)}
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-700 px-3 text-sm font-bold text-white"
              >
                확인
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setToast(null)}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700"
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
