import {
  Prisma,
  type Notification,
  type NotificationPriority,
  type NotificationType,
  type PrismaClient,
} from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { dispatchExternalNotification } from "@/lib/external-notifications/dispatch-external-notification";
import type { RbacUser } from "@/lib/rbac/roles";
import { sanitizeNotificationMetadata as sanitizeNotificationMetadataValue } from "@/lib/security/sanitize";

export const NOTIFICATION_GROUPS = [
  "ALL",
  "UNREAD",
  "LEAVE",
  "ATTACHMENT",
  "ANNUAL_PROMOTION",
  "HR",
  "ONBOARDING",
  "ATTENDANCE",
  "ACCOUNT",
  "SECURITY",
  "REPORT",
  "JOB",
  "SYSTEM",
] as const;

export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

export type NotificationFilters = {
  group?: NotificationGroup;
  priority?: NotificationPriority;
  skip?: number;
  take?: number;
};

const NOTIFICATION_TYPES_BY_GROUP: Partial<Record<NotificationGroup, NotificationType[]>> = {
  LEAVE: [
    "LEAVE_GRANTED",
    "LEAVE_REQUESTED",
    "LEAVE_REQUEST_CREATED",
    "LEAVE_APPROVED",
    "LEAVE_REQUEST_APPROVED",
    "LEAVE_AUTO_CONFIRMED",
    "LEAVE_REQUEST_AUTO_CONFIRMED",
    "LEAVE_REJECTED",
    "LEAVE_REQUEST_REJECTED",
    "LEAVE_CANCELLED",
    "LEAVE_REQUEST_CANCELLED",
    "BIRTHDAY_HALF_DAY_GRANTED",
    "ANNUAL_LEAVE_EXPIRING",
    "ANNUAL_LEAVE_PROMOTION_REQUESTED",
    "ANNUAL_LEAVE_USE_PLAN_SUBMITTED",
  ],
  ATTACHMENT: [
    "LEAVE_ATTACHMENT_SUBMITTED",
    "LEAVE_ATTACHMENT_ACCEPTED",
    "LEAVE_ATTACHMENT_REJECTED",
    "LEAVE_ATTACHMENT_RESUBMISSION_REQUESTED",
  ],
  ANNUAL_PROMOTION: [
    "ANNUAL_LEAVE_PROMOTION",
    "ANNUAL_LEAVE_PROMOTION_REQUESTED",
    "ANNUAL_LEAVE_USE_PLAN_REMINDER",
    "ANNUAL_LEAVE_USE_PLAN_SUBMITTED",
    "ANNUAL_LEAVE_EXPIRED",
    "ANNUAL_LEAVE_EXPIRING",
  ],
  HR: [
    "HR_PROFILE_CONFIRMATION_REQUIRED",
    "HR_PROFILE_CHANGE_REQUEST_CREATED",
    "HR_PROFILE_CHANGE_REQUEST_APPROVED",
    "HR_PROFILE_CHANGE_REQUEST_REJECTED",
  ],
  ONBOARDING: ["INVITATION_CREATED", "ONBOARDING_COMPLETED"],
  ATTENDANCE: [
    "ATTENDANCE_MISSING_CHECK_OUT",
    "ATTENDANCE_ABSENT_DETECTED",
    "ATTENDANCE_CHANGE_REQUEST_CREATED",
    "ATTENDANCE_CHANGE_REQUEST_APPROVED",
    "ATTENDANCE_CHANGE_REQUEST_REJECTED",
    "ATTENDANCE_MONTH_CLOSED",
    "ATTENDANCE_MONTH_REOPENED",
  ],
  ACCOUNT: [
    "INVITATION_CREATED",
    "INVITATION_EXPIRING",
    "INVITATION_ACCEPTED",
    "ONBOARDING_COMPLETED",
    "PASSWORD_RESET_BY_OWNER",
    "PASSWORD_CHANGE_REQUIRED",
    "PASSWORD_CHANGED",
  ],
  SECURITY: [
    "SECURITY_EVENT",
    "OWNER_ROLE_CHANGED",
    "STEP_UP_FAILED",
    "AUDIT_LOG_EXPORTED",
  ],
  REPORT: ["REPORT_EXPORTED"],
  JOB: ["JOB_COMPLETED", "JOB_FAILED"],
};

const NON_SYSTEM_NOTIFICATION_TYPES = Object.values(NOTIFICATION_TYPES_BY_GROUP).flat();

export type CreateNotificationParams = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  linkUrl?: string | null;
  priority?: NotificationPriority;
  metadata?: Prisma.InputJsonValue;
};

export type NotifyUsersParams = Omit<CreateNotificationParams, "userId"> & {
  recipientUserIds: string[];
};

type NotificationPrisma = PrismaClient | Prisma.TransactionClient;

export const NOTIFICATION_PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;

export function normalizeNotificationPriority(
  priority: string | null | undefined,
): NotificationPriority {
  return NOTIFICATION_PRIORITIES.includes(priority as NotificationPriority)
    ? (priority as NotificationPriority)
    : "NORMAL";
}

export function sanitizeNotificationMetadata(value: unknown): Prisma.InputJsonValue {
  return sanitizeNotificationMetadataValue(value);
}

function getDeduplicationKey(metadata: Prisma.InputJsonValue | undefined) {
  return metadata && typeof metadata === "object"
    ? (metadata as Record<string, unknown>).deduplicationKey
    : null;
}

function getAnnualLeavePromotionNoticeId(metadata: unknown) {
  return metadata && typeof metadata === "object"
    ? (metadata as Record<string, unknown>).annualLeavePromotionNoticeId
    : null;
}

export function dedupeRecipientUserIds(userIds: string[]) {
  return [...new Set(userIds.filter((userId) => typeof userId === "string" && userId.length > 0))];
}

export function getNotificationGroup(type: NotificationType): NotificationGroup {
  for (const [group, types] of Object.entries(NOTIFICATION_TYPES_BY_GROUP)) {
    if (types?.includes(type)) {
      return group as NotificationGroup;
    }
  }

  return "SYSTEM";
}

export async function createNotification(params: CreateNotificationParams) {
  const notification = await getPrisma().notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      priority: normalizeNotificationPriority(params.priority),
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
      priority: normalizeNotificationPriority(notification.priority),
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

export async function createInAppNotification(
  params: CreateNotificationParams & { prisma?: NotificationPrisma },
) {
  const { prisma = getPrisma(), ...notification } = params;

  return prisma.notification.create({
    data: {
      userId: notification.userId,
      type: notification.type,
      priority: normalizeNotificationPriority(notification.priority),
      title: notification.title,
      message: notification.message,
      linkUrl: notification.linkUrl ?? null,
      metadata: notification.metadata
        ? sanitizeNotificationMetadata(notification.metadata)
        : Prisma.JsonNull,
    },
  });
}

export async function createInAppNotificationOnce(
  params: CreateNotificationParams & { prisma?: NotificationPrisma },
) {
  const { prisma = getPrisma(), ...notification } = params;
  const deduplicationKey = getDeduplicationKey(notification.metadata);

  if (typeof deduplicationKey === "string") {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: notification.userId,
        type: notification.type,
        linkUrl: notification.linkUrl ?? null,
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

  return createInAppNotification({ ...notification, prisma });
}

export async function notifyUsers(params: NotifyUsersParams) {
  const recipientUserIds = dedupeRecipientUserIds(params.recipientUserIds);

  if (recipientUserIds.length === 0) {
    return { count: 0 };
  }

  const activeRecipients = await getPrisma().user.findMany({
    where: {
      id: { in: recipientUserIds },
      status: "ACTIVE",
      role: { not: "EXTERNAL_PARTNER" },
    },
    select: { id: true },
  });

  return createNotifications(
    activeRecipients.map((recipient) => ({
      userId: recipient.id,
      type: params.type,
      priority: normalizeNotificationPriority(params.priority),
      title: params.title,
      message: params.message,
      linkUrl: params.linkUrl,
      metadata: params.metadata,
    })),
  );
}

export async function createInternalNotification(params: CreateNotificationParams) {
  return createNotification(params);
}

export async function dispatchNotification(params: NotifyUsersParams) {
  return notifyUsers(params);
}

export async function dispatchNotificationAndExternal(params: NotifyUsersParams) {
  return notifyUsers(params);
}

export async function createNotificationOnce(params: CreateNotificationParams) {
  const deduplicationKey = getDeduplicationKey(params.metadata);

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
  const groupTypes =
    filters.group && filters.group !== "ALL" && filters.group !== "UNREAD"
      ? NOTIFICATION_TYPES_BY_GROUP[filters.group]
      : undefined;
  const typeFilter =
    filters.group === "SYSTEM"
      ? { notIn: NON_SYSTEM_NOTIFICATION_TYPES }
      : groupTypes
        ? { in: groupTypes }
        : undefined;
  const notifications = await getPrisma().notification.findMany({
    where: {
      userId,
      ...(filters.group === "UNREAD" ? { readAt: null } : {}),
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
    },
    orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
    skip: filters.skip ?? 0,
    take: filters.take ?? 50,
  });

  return notifications;
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
  const prisma = getPrisma();
  const readAt = new Date();
  const result = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId,
      readAt: null,
    },
    data: {
      readAt,
    },
  });

  if (result.count > 0) {
    await markAnnualPromotionNoticeReadFromNotification({
      userId,
      notificationId,
      readAt,
      prisma,
    });
  }

  return result;
}

export async function markAllNotificationsAsRead(userId: string) {
  const prisma = getPrisma();
  const unreadNotifications = await prisma.notification.findMany({
    where: {
      userId,
      readAt: null,
    },
    select: {
      id: true,
      metadata: true,
    },
  });
  const readAt = new Date();
  const result = await prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
    },
    data: {
      readAt,
    },
  });

  const annualPromotionNoticeIds = unreadNotifications
    .map((notification) => getAnnualLeavePromotionNoticeId(notification.metadata))
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  if (annualPromotionNoticeIds.length > 0 && result.count > 0) {
    await prisma.annualLeavePromotionNotice.updateMany({
      where: {
        id: { in: annualPromotionNoticeIds },
        userId,
        readAt: null,
      },
      data: { readAt },
    });
  }

  return result;
}

export async function markAnnualPromotionNoticeReadFromNotification({
  userId,
  notificationId,
  readAt = new Date(),
  prisma = getPrisma(),
}: {
  userId: string;
  notificationId: string;
  readAt?: Date;
  prisma?: NotificationPrisma;
}) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
    select: { metadata: true },
  });
  const annualLeavePromotionNoticeId = getAnnualLeavePromotionNoticeId(
    notification?.metadata,
  );

  if (typeof annualLeavePromotionNoticeId !== "string") {
    return { count: 0 };
  }

  return prisma.annualLeavePromotionNotice.updateMany({
    where: {
      id: annualLeavePromotionNoticeId,
      userId,
      readAt: null,
    },
    data: { readAt },
  });
}
