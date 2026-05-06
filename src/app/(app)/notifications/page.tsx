import {
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationReadAndRedirect,
} from "@/app/(app)/notifications/actions";
import { Badge, buttonClassName, Card, EmptyState } from "@/components/design-system/primitives";
import { ResponsiveTabs, ResponsiveTable } from "@/components/design-system/responsive";
import {
  NOTIFICATION_GROUPS,
  countUnreadNotifications,
  getNotificationGroup,
  listMyNotifications,
  type NotificationGroup,
} from "@/lib/notifications/notifications";
import { requireRouteAccess } from "@/lib/rbac/server-guards";
import type { NotificationPriority } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

type NotificationsPageProps = {
  searchParams: Promise<{ group?: string; success?: string; error?: string }>;
};

const groupLabels: Record<NotificationGroup, string> = {
  ALL: "전체",
  UNREAD: "읽지 않음",
  LEAVE: "휴가",
  ATTACHMENT: "증명자료",
  ANNUAL_PROMOTION: "연차 촉진",
  HR: "인사정보",
  ONBOARDING: "온보딩",
  REPORT: "리포트",
  JOB: "Job",
  SYSTEM: "시스템",
};

const priorityLabels = {
  LOW: "낮음",
  NORMAL: "보통",
  HIGH: "높음",
};

const notificationPriorityLabels: Record<NotificationPriority, string> = {
  ...priorityLabels,
  CRITICAL: "긴급",
};

type PriorityTone = "default" | "primary" | "warning" | "danger";

function normalizePriority(priority: string | null | undefined): NotificationPriority {
  if (
    priority === "LOW" ||
    priority === "NORMAL" ||
    priority === "HIGH" ||
    priority === "CRITICAL"
  ) {
    return priority;
  }

  return "NORMAL";
}

function priorityTone(priority: string | null | undefined): PriorityTone {
  const normalizedPriority = normalizePriority(priority);

  if (normalizedPriority === "CRITICAL") {
    return "danger" as const;
  }

  if (normalizedPriority === "HIGH") {
    return "warning" as const;
  }

  if (normalizedPriority === "LOW") {
    return "default" as const;
  }

  return "primary" as const;
}

function priorityLabel(priority: string | null | undefined) {
  return notificationPriorityLabels[normalizePriority(priority)];
}

export default async function NotificationsPage({
  searchParams,
}: NotificationsPageProps) {
  const user = await requireRouteAccess("/notifications");
  const params = await searchParams;
  const selectedGroup = isNotificationGroup(params.group) ? params.group : "ALL";
  const [notifications, unreadCount] = await Promise.all([
    listMyNotifications(user.id, { group: selectedGroup }),
    countUnreadNotifications(user.id),
  ]);

  return (
    <section className="min-w-0 space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-blue-700">알림</p>
          <h1 className="mt-2 break-keep text-2xl font-bold tracking-normal text-slate-950 sm:text-3xl">
            알림센터
          </h1>
          <p className="mt-2 max-w-3xl break-keep text-sm leading-relaxed text-slate-600">
            휴가, 증명자료, 연차 촉진, 인사정보, 자동 작업 관련 알림을 한곳에서 확인합니다.
          </p>
        </div>
        <form action={markAllNotificationsRead}>
          <button className={buttonClassName({ tone: "neutral", className: "w-full sm:w-auto" })}>
            모두 읽음 처리
          </button>
        </form>
      </div>

      <Card className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="break-keep text-sm font-medium text-slate-500">읽지 않은 알림</p>
          <p className="mt-1 text-3xl font-bold text-slate-950">{unreadCount}</p>
        </div>
        <Badge tone={unreadCount > 0 ? "danger" : "success"}>
          {unreadCount > 0 ? "확인 필요" : "모두 확인됨"}
        </Badge>
      </Card>

      {params.success ? (
        <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          알림을 처리했습니다.
        </p>
      ) : null}
      {params.error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          처리 중 오류가 발생했습니다.
        </p>
      ) : null}

      <ResponsiveTabs
        items={NOTIFICATION_GROUPS.map((group) => ({
          href: `/notifications?group=${group}`,
          label: groupLabels[group],
          active: selectedGroup === group,
        }))}
      />

      <div className="grid gap-3 md:hidden">
        {notifications.length === 0 ? (
          <EmptyState
            title={
              selectedGroup === "UNREAD"
                ? "읽지 않은 알림이 없습니다."
                : "알림이 없습니다."
            }
          />
        ) : (
          notifications.map((notification) => (
            <article
              key={notification.id}
              className={`min-w-0 rounded-2xl border bg-white p-4 shadow-sm ${
                notification.readAt ? "border-slate-200" : "border-blue-700"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-keep text-xs font-medium text-slate-500">
                    {groupLabels[getNotificationGroup(notification.type)]}
                  </p>
                  <h2 className="mt-1 break-keep text-base font-semibold leading-snug text-slate-950">
                    {notification.title}
                  </h2>
                </div>
                <Badge tone={priorityTone(notification.priority)}>
                  {priorityLabel(notification.priority)}
                </Badge>
              </div>
              <p className="mt-2 text-safe text-sm leading-relaxed text-slate-600">
                {notification.message}
              </p>
              <p className="mt-3 text-xs text-slate-500">
                {notification.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {notification.linkUrl ? (
                  <form action={markNotificationReadAndRedirect}>
                    <input name="notificationId" type="hidden" value={notification.id} />
                    <input name="linkUrl" type="hidden" value={notification.linkUrl} />
                    <button className={buttonClassName({ className: "w-full" })}>
                      이동
                    </button>
                  </form>
                ) : null}
                {notification.readAt ? null : (
                  <form action={markNotificationRead}>
                    <input
                      name="notificationId"
                      type="hidden"
                      value={notification.id}
                    />
                    <button className={buttonClassName({ tone: "neutral", className: "w-full" })}>
                      읽음 처리
                    </button>
                  </form>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      <ResponsiveTable minWidth="1100px">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th>상태</th>
            <th>그룹</th>
            <th>우선순위</th>
            <th>제목</th>
            <th>내용</th>
            <th>생성일</th>
            <th>이동</th>
            <th>처리</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {notifications.length === 0 ? (
            <tr>
              <td className="text-slate-500" colSpan={8}>
                {selectedGroup === "UNREAD"
                  ? "읽지 않은 알림이 없습니다."
                  : "알림이 없습니다."}
              </td>
            </tr>
          ) : (
            notifications.map((notification) => (
              <tr key={notification.id} className="align-top">
                <td>
                  {notification.readAt ? (
                    <span className="text-slate-500">읽음</span>
                  ) : (
                    <span className="font-semibold text-slate-950">
                      읽지 않음
                    </span>
                  )}
                </td>
                <td>{groupLabels[getNotificationGroup(notification.type)]}</td>
                <td>
                  <Badge tone={priorityTone(notification.priority)}>
                    {priorityLabel(notification.priority)}
                  </Badge>
                </td>
                <td className="font-semibold text-slate-950">
                  {notification.title}
                </td>
                <td className="max-w-md text-safe">{notification.message}</td>
                <td>
                  {notification.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </td>
                <td>
                  {notification.linkUrl ? (
                    <form action={markNotificationReadAndRedirect}>
                      <input name="notificationId" type="hidden" value={notification.id} />
                      <input name="linkUrl" type="hidden" value={notification.linkUrl} />
                      <button className="whitespace-nowrap break-keep font-semibold text-blue-700 underline">
                        이동
                      </button>
                    </form>
                  ) : (
                    "-"
                  )}
                </td>
                <td>
                  {notification.readAt ? (
                    "-"
                  ) : (
                    <form action={markNotificationRead}>
                      <input
                        name="notificationId"
                        type="hidden"
                        value={notification.id}
                      />
                      <button className={buttonClassName({ tone: "neutral" })}>
                        읽음 처리
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </ResponsiveTable>
    </section>
  );
}

function isNotificationGroup(value: string | undefined): value is NotificationGroup {
  return NOTIFICATION_GROUPS.includes(value as NotificationGroup);
}
