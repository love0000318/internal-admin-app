import {
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationReadAndRedirect,
} from "@/app/(app)/notifications/actions";
import { Badge, buttonClassName, Card, EmptyState } from "@/components/design-system/primitives";
import { ResponsiveTabs, ResponsiveTable } from "@/components/design-system/responsive";
import { PaginationControls } from "@/components/ui/pagination";
import type { NotificationPriority } from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/db/prisma";
import { LEAVE_STATUS_LABELS } from "@/lib/leave/labels";
import {
  NOTIFICATION_GROUPS,
  NOTIFICATION_PRIORITIES,
  countUnreadNotifications,
  getNotificationGroup,
  listMyNotifications,
  normalizeNotificationPriority,
  type NotificationGroup,
} from "@/lib/notifications/notifications";
import { buildPaginationHref, parsePagination } from "@/lib/pagination";
import { requireRouteAccess } from "@/lib/rbac/server-guards";
import {
  BellRing,
  CalendarCheck2,
  ClipboardCheck,
  FileClock,
  ShieldAlert,
} from "lucide-react";

export const dynamic = "force-dynamic";

type NotificationsPageProps = {
  searchParams: Promise<{
    group?: string;
    priority?: string;
    success?: string;
    error?: string;
    page?: string;
    pageSize?: string;
  }>;
};

const groupLabels: Record<NotificationGroup, string> = {
  ALL: "전체",
  UNREAD: "읽지 않음",
  LEAVE: "휴가",
  ATTACHMENT: "증빙자료",
  ANNUAL_PROMOTION: "연차 촉진",
  HR: "인사정보",
  ONBOARDING: "온보딩",
  ATTENDANCE: "근태",
  ACCOUNT: "계정",
  SECURITY: "보안",
  REPORT: "리포트",
  JOB: "작업",
  SYSTEM: "시스템",
};

const priorityLabels: Record<NotificationPriority, string> = {
  LOW: "낮음",
  NORMAL: "보통",
  HIGH: "높음",
  CRITICAL: "긴급",
};

type PriorityTone = "default" | "primary" | "warning" | "danger";
type StateTone = "default" | "primary" | "success" | "warning" | "danger" | "info";
type NotificationState = { label: string; tone: StateTone };

function priorityTone(priority: string | null | undefined): PriorityTone {
  const normalizedPriority = normalizeNotificationPriority(priority);

  if (normalizedPriority === "CRITICAL") {
    return "danger";
  }

  if (normalizedPriority === "HIGH") {
    return "warning";
  }

  if (normalizedPriority === "LOW") {
    return "default";
  }

  return "primary";
}

function priorityLabel(priority: string | null | undefined) {
  return priorityLabels[normalizeNotificationPriority(priority)];
}

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object"
    ? (metadata as Record<string, unknown>)
    : {};
}

function metadataString(metadata: unknown, key: string) {
  const value = metadataRecord(metadata)[key];

  return typeof value === "string" ? value : null;
}

function stateToneForLeave(status: string): StateTone {
  switch (status) {
    case "APPROVED":
      return "success";
    case "REJECTED":
    case "CANCELLED":
    case "WITHDRAWN":
      return "default";
    default:
      return "warning";
  }
}

function actionLabel(type: string) {
  if (type === "LEAVE_REQUEST_CREATED" || type === "LEAVE_REQUESTED") {
    return "검토하기";
  }

  if (type.startsWith("ANNUAL_LEAVE_PROMOTION")) {
    return "작성하기";
  }

  return "상세 보기";
}

async function getNotificationStates(
  notifications: Awaited<ReturnType<typeof listMyNotifications>>,
) {
  const prisma = getPrisma();
  const leaveRequestIds = [
    ...new Set(
      notifications
        .map((notification) => metadataString(notification.metadata, "leaveRequestId"))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const annualNoticeIds = [
    ...new Set(
      notifications
        .map((notification) =>
          metadataString(notification.metadata, "annualLeavePromotionNoticeId"),
        )
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const [leaveRequests, annualNotices] = await Promise.all([
    leaveRequestIds.length > 0
      ? prisma.leaveRequest.findMany({
          where: { id: { in: leaveRequestIds } },
          select: { id: true, status: true },
        })
      : [],
    annualNoticeIds.length > 0
      ? prisma.annualLeavePromotionNotice.findMany({
          where: { id: { in: annualNoticeIds } },
          select: {
            id: true,
            status: true,
            readAt: true,
            submittedAt: true,
            adminConfirmedAt: true,
            annualLeaveUsePlan: { select: { status: true, submittedAt: true } },
          },
        })
      : [],
  ]);
  const leaveStatusById = new Map(leaveRequests.map((request) => [request.id, request.status]));
  const annualNoticeById = new Map(annualNotices.map((notice) => [notice.id, notice]));
  const states = new Map<string, NotificationState>();

  for (const notification of notifications) {
    const leaveRequestId = metadataString(notification.metadata, "leaveRequestId");
    const annualNoticeId = metadataString(
      notification.metadata,
      "annualLeavePromotionNoticeId",
    );
    const leaveStatus = leaveRequestId ? leaveStatusById.get(leaveRequestId) : null;
    const annualNotice = annualNoticeId ? annualNoticeById.get(annualNoticeId) : null;

    if (leaveStatus) {
      states.set(notification.id, {
        label: LEAVE_STATUS_LABELS[leaveStatus],
        tone: stateToneForLeave(leaveStatus),
      });
      continue;
    }

    if (annualNotice) {
      if (annualNotice.submittedAt || annualNotice.annualLeaveUsePlan?.status === "SUBMITTED") {
        states.set(notification.id, { label: "제출 완료", tone: "success" });
      } else if (annualNotice.status === "SKIPPED") {
        states.set(notification.id, { label: "제출 확인됨", tone: "success" });
      } else if (annualNotice.status === "CANCELLED") {
        states.set(notification.id, { label: "후속 고지 취소", tone: "default" });
      } else if (annualNotice.adminConfirmedAt) {
        states.set(notification.id, { label: "관리자 확인", tone: "info" });
      } else if (annualNotice.readAt) {
        states.set(notification.id, { label: "열람 완료", tone: "primary" });
      } else {
        states.set(notification.id, { label: "제출 필요", tone: "warning" });
      }
      continue;
    }

    states.set(
      notification.id,
      notification.readAt
        ? { label: "확인 완료", tone: "success" }
        : { label: "확인 필요", tone: "warning" },
    );
  }

  return states;
}

function NotificationIcon({ group }: { group: NotificationGroup }) {
  const iconClass = "h-4 w-4";

  if (group === "LEAVE") {
    return <CalendarCheck2 aria-hidden="true" className={iconClass} />;
  }

  if (group === "ANNUAL_PROMOTION") {
    return <FileClock aria-hidden="true" className={iconClass} />;
  }

  if (group === "SECURITY") {
    return <ShieldAlert aria-hidden="true" className={iconClass} />;
  }

  if (group === "JOB") {
    return <ClipboardCheck aria-hidden="true" className={iconClass} />;
  }

  return <BellRing aria-hidden="true" className={iconClass} />;
}

export default async function NotificationsPage({
  searchParams,
}: NotificationsPageProps) {
  const user = await requireRouteAccess("/notifications");
  const params = await searchParams;
  const selectedGroup = isNotificationGroup(params.group) ? params.group : "ALL";
  const selectedPriority = isNotificationPriority(params.priority)
    ? params.priority
    : undefined;
  const pagination = parsePagination(params);
  const [notifications, unreadCount] = await Promise.all([
    listMyNotifications(user.id, {
      group: selectedGroup,
      priority: selectedPriority,
      skip: pagination.skip,
      take: pagination.take + 1,
    }),
    countUnreadNotifications(user.id),
  ]);
  const hasNextPage = notifications.length > pagination.take;
  const visibleNotifications = notifications.slice(0, pagination.take);
  const notificationStates = await getNotificationStates(visibleNotifications);
  const paginationParams = {
    group: selectedGroup === "ALL" ? undefined : selectedGroup,
    priority: selectedPriority,
    pageSize: params.pageSize,
  };

  return (
    <section className="min-w-0 space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-blue-700">알림</p>
          <h1 className="mt-2 break-keep text-2xl font-bold tracking-normal text-slate-950 sm:text-3xl">
            알림센터
          </h1>
          <p className="mt-2 max-w-3xl break-keep text-sm leading-relaxed text-slate-600">
            휴가, 근태, 계정, 보안, 작업 알림을 한곳에서 확인합니다. 알림에는
            민감한 원문 정보가 포함되지 않습니다.
          </p>
        </div>
        <form action={markAllNotificationsRead}>
          <button className={buttonClassName({ tone: "neutral", className: "w-full sm:w-auto" })}>
            모두 읽음 처리
          </button>
        </form>
      </div>

      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
          알림 처리 중 오류가 발생했습니다.
        </p>
      ) : null}

      <ResponsiveTabs
        items={NOTIFICATION_GROUPS.map((group) => ({
          href: `/notifications?group=${group}${
            selectedPriority ? `&priority=${selectedPriority}` : ""
          }`,
          label: groupLabels[group],
          active: selectedGroup === group,
        }))}
      />

      <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:max-w-xs">
        <input name="group" type="hidden" value={selectedGroup} />
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          우선순위 필터
          <select
            className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm"
            defaultValue={selectedPriority ?? ""}
            name="priority"
          >
            <option value="">전체</option>
            {NOTIFICATION_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabels[priority]}
              </option>
            ))}
          </select>
        </label>
        <button className={buttonClassName({ tone: "neutral", className: "w-full" })}>
          필터 적용
        </button>
      </form>

      <div className="grid gap-3 md:hidden">
        {visibleNotifications.length === 0 ? (
          <EmptyState
            title={
              selectedGroup === "UNREAD"
                ? "읽지 않은 알림이 없습니다."
                : "알림이 없습니다."
            }
          />
        ) : (
          visibleNotifications.map((notification) => {
            const group = getNotificationGroup(notification.type);
            const state = notificationStates.get(notification.id);

            return (
              <article
                key={notification.id}
                className={`min-w-0 rounded-2xl border bg-white p-4 shadow-sm ${
                  notification.readAt ? "border-slate-200" : "border-blue-700"
                }`}
              >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-1.5 break-keep text-xs font-medium text-slate-500">
                    <NotificationIcon group={group} />
                    {groupLabels[group]}
                  </p>
                  <h2 className="mt-1 break-keep text-base font-semibold leading-snug text-slate-950">
                    {notification.title}
                  </h2>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={priorityTone(notification.priority)}>
                    {priorityLabel(notification.priority)}
                  </Badge>
                  {state ? <Badge tone={state.tone}>{state.label}</Badge> : null}
                </div>
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
                    <button className={buttonClassName({ className: "w-full" })}>
                      {actionLabel(notification.type)}
                    </button>
                  </form>
                ) : null}
                {notification.readAt ? null : (
                  <form action={markNotificationRead}>
                    <input name="notificationId" type="hidden" value={notification.id} />
                    <button className={buttonClassName({ tone: "neutral", className: "w-full" })}>
                      읽음 처리
                    </button>
                  </form>
                )}
              </div>
              </article>
            );
          })
        )}
      </div>

      <ResponsiveTable minWidth="1100px">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th>상태</th>
            <th>처리 상태</th>
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
          {visibleNotifications.length === 0 ? (
            <tr>
              <td className="text-slate-500" colSpan={9}>
                {selectedGroup === "UNREAD"
                  ? "읽지 않은 알림이 없습니다."
                  : "알림이 없습니다."}
              </td>
            </tr>
          ) : (
            visibleNotifications.map((notification) => {
              const group = getNotificationGroup(notification.type);
              const state = notificationStates.get(notification.id);

              return (
                <tr key={notification.id} className="align-top">
                  <td>
                    {notification.readAt ? (
                      <span className="text-slate-500">읽음</span>
                    ) : (
                      <span className="font-semibold text-slate-950">읽지 않음</span>
                    )}
                  </td>
                  <td>{state ? <Badge tone={state.tone}>{state.label}</Badge> : "-"}</td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 break-keep">
                      <NotificationIcon group={group} />
                      {groupLabels[group]}
                    </span>
                  </td>
                  <td>
                    <Badge tone={priorityTone(notification.priority)}>
                      {priorityLabel(notification.priority)}
                    </Badge>
                  </td>
                  <td className="font-semibold text-slate-950">{notification.title}</td>
                  <td className="max-w-md text-safe">{notification.message}</td>
                  <td>{notification.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td>
                    {notification.linkUrl ? (
                      <form action={markNotificationReadAndRedirect}>
                        <input name="notificationId" type="hidden" value={notification.id} />
                        <button className="whitespace-nowrap break-keep font-semibold text-blue-700 underline">
                          {actionLabel(notification.type)}
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
                        <input name="notificationId" type="hidden" value={notification.id} />
                        <button className={buttonClassName({ tone: "neutral" })}>읽음 처리</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </ResponsiveTable>
      <PaginationControls
        hasNext={hasNextPage}
        hasPrevious={pagination.page > 1}
        nextHref={buildPaginationHref("/notifications", paginationParams, pagination.page + 1)}
        page={pagination.page}
        previousHref={buildPaginationHref(
          "/notifications",
          paginationParams,
          pagination.page - 1,
        )}
      />
    </section>
  );
}

function isNotificationGroup(value: string | undefined): value is NotificationGroup {
  return NOTIFICATION_GROUPS.includes(value as NotificationGroup);
}

function isNotificationPriority(value: string | undefined): value is NotificationPriority {
  return NOTIFICATION_PRIORITIES.includes(value as NotificationPriority);
}
