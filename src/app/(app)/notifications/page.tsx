import {
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationReadAndRedirect,
} from "@/app/(app)/notifications/actions";
import {
  NOTIFICATION_GROUPS,
  countUnreadNotifications,
  getNotificationGroup,
  listMyNotifications,
  type NotificationGroup,
} from "@/lib/notifications/notifications";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

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
    <section>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-500">내 알림</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">알림센터</h1>
          <p className="mt-2 text-sm text-neutral-600">
            휴가, 증명자료, 연차 촉진, 인사정보, Job과 관련된 인앱 알림을
            확인합니다.
          </p>
        </div>
        <form action={markAllNotificationsRead}>
          <button className="h-10 rounded-md border border-neutral-300 px-4 text-sm font-medium">
            모두 읽음 처리
          </button>
        </form>
      </div>

      <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-neutral-500">읽지 않은 알림</p>
        <p className="mt-1 text-2xl font-semibold">{unreadCount}</p>
      </div>

      {params.success ? (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          알림이 처리되었습니다.
        </p>
      ) : null}
      {params.error ? (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          처리 중 오류가 발생했습니다.
        </p>
      ) : null}

      <div className="mt-6 w-full overflow-x-auto">
        <div className="flex min-w-max gap-2 whitespace-nowrap pb-1">
        {NOTIFICATION_GROUPS.map((group) => (
          <a
            key={group}
            href={`/notifications?group=${group}`}
            className={`shrink-0 rounded-md border px-3 py-2 text-sm break-keep ${
              selectedGroup === group
                ? "border-neutral-950 bg-neutral-950 text-white"
                : "border-neutral-300 bg-white"
            }`}
          >
            {groupLabels[group]}
          </a>
        ))}
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:hidden">
        {notifications.length === 0 ? (
          <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500 shadow-sm">
            {selectedGroup === "UNREAD"
              ? "?쎌? ?딆? ?뚮┝???놁뒿?덈떎."
              : "?뚮┝???놁뒿?덈떎."}
          </div>
        ) : (
          notifications.map((notification) => (
            <article
              key={notification.id}
              className={`rounded-lg border bg-white p-4 shadow-sm ${
                notification.readAt ? "border-neutral-200" : "border-neutral-950"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-neutral-500">
                    {groupLabels[getNotificationGroup(notification.type)]}
                  </p>
                  <h2 className="mt-1 break-keep text-base font-semibold text-neutral-950">
                    {notification.title}
                  </h2>
                </div>
                <span
                  className={`shrink-0 whitespace-nowrap rounded px-2 py-1 text-xs ${
                    notification.priority === "HIGH"
                      ? "bg-red-50 text-red-700"
                      : notification.priority === "LOW"
                        ? "bg-neutral-100 text-neutral-500"
                        : "bg-blue-50 text-blue-700"
                  }`}
                >
                  {priorityLabels[notification.priority]}
                </span>
              </div>
              <p className="mt-2 break-keep text-sm leading-relaxed text-neutral-600">
                {notification.message}
              </p>
              <p className="mt-3 text-xs text-neutral-500">
                {notification.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {notification.linkUrl ? (
                  <form action={markNotificationReadAndRedirect}>
                    <input name="notificationId" type="hidden" value={notification.id} />
                    <input name="linkUrl" type="hidden" value={notification.linkUrl} />
                    <button className="h-10 w-full rounded-md bg-neutral-950 px-3 text-sm font-medium text-white">
                      ?대룞
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
                    <button className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm font-medium">
                      ?쎌쓬 泥섎━
                    </button>
                  </form>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      <div className="mt-6 hidden overflow-x-auto rounded-lg border border-neutral-200 bg-white shadow-sm md:block">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">그룹</th>
              <th className="px-4 py-3">우선순위</th>
              <th className="px-4 py-3">제목</th>
              <th className="px-4 py-3">내용</th>
              <th className="px-4 py-3">생성일</th>
              <th className="px-4 py-3">이동</th>
              <th className="px-4 py-3">처리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {notifications.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-neutral-500" colSpan={8}>
                  {selectedGroup === "UNREAD"
                    ? "읽지 않은 알림이 없습니다."
                    : "알림이 없습니다."}
                </td>
              </tr>
            ) : (
              notifications.map((notification) => (
                <tr key={notification.id} className="align-top">
                  <td className="px-4 py-3">
                    {notification.readAt ? (
                      <span className="text-neutral-500">읽음</span>
                    ) : (
                      <span className="font-medium text-neutral-950">읽지 않음</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {groupLabels[getNotificationGroup(notification.type)]}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-1 text-xs ${
                        notification.priority === "HIGH"
                          ? "bg-red-50 text-red-700"
                          : notification.priority === "LOW"
                            ? "bg-neutral-100 text-neutral-500"
                            : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      {priorityLabels[notification.priority]}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{notification.title}</td>
                  <td className="px-4 py-3">{notification.message}</td>
                  <td className="px-4 py-3">
                    {notification.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-3">
                    {notification.linkUrl ? (
                      <form action={markNotificationReadAndRedirect}>
                        <input name="notificationId" type="hidden" value={notification.id} />
                        <input name="linkUrl" type="hidden" value={notification.linkUrl} />
                        <button className="font-medium underline">이동</button>
                      </form>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {notification.readAt ? (
                      "-"
                    ) : (
                      <form action={markNotificationRead}>
                        <input
                          name="notificationId"
                          type="hidden"
                          value={notification.id}
                        />
                        <button className="h-8 rounded-md border border-neutral-300 px-3 text-sm">
                          읽음 처리
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function isNotificationGroup(value: string | undefined): value is NotificationGroup {
  return NOTIFICATION_GROUPS.includes(value as NotificationGroup);
}
