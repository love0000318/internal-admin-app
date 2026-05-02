import { Prisma, type Notification, type NotificationType } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { dispatchExternalNotification } from "@/lib/external-notifications/dispatch-external-notification";
import type { RbacUser } from "@/lib/rbac/roles";
import { sanitizeNotificationMetadata } from "@/lib/security/sanitize";

export const NOTIFICATION_GROUPS = [
  "ALL",
  "UNREAD",
  "LEAVE",
  "ATTACHMENT",
  "ANNUAL_PROMOTION",
  "HR",
  "ONBOARDING",
  "REPORT",
  "JOB",
  "SYSTEM",
] as const;

export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

export type NotificationFilters = {
  group?: NotificationGroup;
};

export type CreateNotificationParams = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  linkUrl?: string | null;
  priority?: "LOW" | "NORMAL" | "HIGH";
  metadata?: Prisma.InputJsonValue;
};

export function getNotificationGroup(type: NotificationType): NotificationGroup {
  if (
    type === "LEAVE_GRANTED" ||
    type === "LEAVE_REQUESTED" ||
    type === "LEAVE_APPROVED" ||
    type === "LEAVE_AUTO_CONFIRMED" ||
    type === "LEAVE_REJECTED" ||
    type === "LEAVE_CANCELLED"
  ) {
    return "LEAVE";
  }

  if (
    type === "LEAVE_ATTACHMENT_SUBMITTED" ||
    type === "LEAVE_ATTACHMENT_ACCEPTED" ||
    type === "LEAVE_ATTACHMENT_REJECTED" ||
    type === "LEAVE_ATTACHMENT_RESUBMISSION_REQUESTED"
  ) {
    return "ATTACHMENT";
  }

  if (
    type === "ANNUAL_LEAVE_PROMOTION" ||
    type === "ANNUAL_LEAVE_USE_PLAN_REMINDER" ||
    type === "ANNUAL_LEAVE_EXPIRED"
  ) {
    return "ANNUAL_PROMOTION";
  }

  if (
    type === "HR_PROFILE_CONFIRMATION_REQUIRED" ||
    type === "HR_PROFILE_CHANGE_REQUEST_CREATED" ||
    type === "HR_PROFILE_CHANGE_REQUEST_APPROVED" ||
    type === "HR_PROFILE_CHANGE_REQUEST_REJECTED"
  ) {
    return "HR";
  }

  if (type === "INVITATION_CREATED" || type === "ONBOARDING_COMPLETED") {
    return "ONBOARDING";
  }

  if (type === "REPORT_EXPORTED") {
    return "REPORT";
  }

  if (type === "JOB_COMPLETED" || type === "JOB_FAILED") {
    return "JOB";
  }

  return "SYSTEM";
}

export async function createNotification(params: CreateNotificationParams) {
  const notification = await getPrisma().notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      priority: params.priority ?? "NORMAL",
      title: params.title,
      message: params.message,
      linkUrl: params.linkUrl ?? null,
      metadata: params.metadata ? sanitizeNotificationMetadata(params.metadata) : Prisma.JsonNull,
    },
  });

  await dispatchExternalNotification({
    ...params,
    recipientUserId: params.userId,
    context: {
      ...(params.metadata && typeof params.metadata === "object" ? params.metadata : {}),
      notificationId: notification.id,
    },
  });

  return notification;
}

export async function createNotifications(params: CreateNotificationParams[]) {
  if (params.length === 0) {
    return { count: 0 };
  }

  const result = await getPrisma().notification.createMany({
    data: params.map((notification) => ({
      userId: notification.userId,
      type: notification.type,
      priority: notification.priority ?? "NORMAL",
      title: notification.title,
      message: notification.message,
      linkUrl: notification.linkUrl ?? null,
      metadata: notification.metadata
        ? sanitizeNotificationMetadata(notification.metadata)
        : Prisma.JsonNull,
    })),
  });

  await Promise.all(
    params.map((notification) =>
      dispatchExternalNotification({
        ...notification,
        recipientUserId: notification.userId,
        context:
          notification.metadata && typeof notification.metadata === "object"
            ? (notification.metadata as Record<string, unknown>)
            : undefined,
      }),
    ),
  );

  return result;
}

export async function createNotificationOnce(params: CreateNotificationParams) {
  const deduplicationKey =
    params.metadata && typeof params.metadata === "object"
      ? (params.metadata as Record<string, unknown>).deduplicationKey
      : null;

  if (typeof deduplicationKey === "string") {
    const existing = await getPrisma().notification.findFirst({
      where: {
        userId: params.userId,
        type: params.type,
        linkUrl: params.linkUrl ?? null,
        metadata: {
          path: ["deduplicationKey"],
          equals: deduplicationKey,
        },
      },
    });

    if (existing) {
      return existing;
    }
  }

  return createNotification(params);
}

export async function listMyNotifications(
  userId: string,
  filters: NotificationFilters = {},
) {
  const notifications = await getPrisma().notification.findMany({
    where: {
      userId,
      ...(filters.group === "UNREAD" ? { readAt: null } : {}),
    },
    orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  if (!filters.group || filters.group === "ALL" || filters.group === "UNREAD") {
    return notifications;
  }

  return notifications.filter(
    (notification) => getNotificationGroup(notification.type) === filters.group,
  );
}

export async function countUnreadNotifications(userId: string) {
  return getPrisma().notification.count({
    where: {
      userId,
      readAt: null,
    },
  });
}

export function assertCanViewNotification(actor: RbacUser, notification: Notification) {
  if (actor.id !== notification.userId) {
    throw new Error("notification-forbidden");
  }
}

export async function markNotificationAsRead(userId: string, notificationId: string) {
  return getPrisma().notification.updateMany({
    where: {
      id: notificationId,
      userId,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });
}

export async function markAllNotificationsAsRead(userId: string) {
  return getPrisma().notification.updateMany({
    where: {
      userId,
      readAt: null,
    },
    data: {
      readAt: new Date(),
    },
  });
}
