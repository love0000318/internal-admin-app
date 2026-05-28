"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getPrisma } from "@/lib/db/prisma";
import {
  markAllNotificationsAsRead,
  markNotificationAsRead,
  normalizeNotificationRedirectPath,
} from "@/lib/notifications/notifications";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export async function markNotificationRead(formData: FormData) {
  const user = await requireRouteAccess("/notifications");
  const notificationId = formData.get("notificationId");

  if (typeof notificationId !== "string" || !notificationId) {
    redirect("/notifications?error=invalid");
  }

  const result = await markNotificationAsRead(user.id, notificationId);

  if (result.count === 0) {
    redirect("/notifications?error=forbidden");
  }

  if (result.wasUpdated) {
    await getPrisma().auditLog.create({
      data: {
        actorId: user.id,
        actorUserId: user.id,
        action: "NOTIFICATION_MARKED_READ",
        targetType: "NOTIFICATION",
        targetId: notificationId,
        metadata: { notificationId },
      },
    });
  }

  revalidatePath("/notifications");
  redirect("/notifications?success=read");
}

export async function markNotificationReadAndRedirect(formData: FormData) {
  const user = await requireRouteAccess("/notifications");
  const notificationId = formData.get("notificationId");

  if (typeof notificationId !== "string" || !notificationId) {
    redirect("/notifications?error=invalid");
  }

  const result = await markNotificationAsRead(user.id, notificationId);

  if (result.count === 0) {
    redirect("/notifications?error=forbidden");
  }

  if (result.wasUpdated) {
    await getPrisma().auditLog.create({
      data: {
        actorId: user.id,
        actorUserId: user.id,
        action: "NOTIFICATION_MARKED_READ",
        targetType: "NOTIFICATION",
        targetId: notificationId,
        metadata: { notificationId },
      },
    });
  }

  revalidatePath("/notifications");
  redirect(
    normalizeNotificationRedirectPath(result.notification?.linkUrl) ??
      "/notifications?success=read",
  );
}

export async function markAllNotificationsRead() {
  const user = await requireRouteAccess("/notifications");
  const result = await markAllNotificationsAsRead(user.id);

  await getPrisma().auditLog.create({
    data: {
      actorId: user.id,
      actorUserId: user.id,
      action: "ALL_NOTIFICATIONS_MARKED_READ",
      targetType: "NOTIFICATION",
      targetId: user.id,
      metadata: { count: result.count },
    },
  });

  revalidatePath("/notifications");
  redirect("/notifications?success=all-read");
}
