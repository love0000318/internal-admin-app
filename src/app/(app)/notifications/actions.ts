"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getPrisma } from "@/lib/db/prisma";
import {
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/lib/notifications/notifications";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export async function markNotificationRead(formData: FormData) {
  const user = await requireRouteAccess("/notifications");
  const notificationId = formData.get("notificationId");

  if (typeof notificationId !== "string" || !notificationId) {
    redirect("/notifications?error=invalid");
  }

  await markNotificationAsRead(user.id, notificationId);
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

  revalidatePath("/notifications");
  redirect("/notifications?success=read");
}

export async function markNotificationReadAndRedirect(formData: FormData) {
  const user = await requireRouteAccess("/notifications");
  const notificationId = formData.get("notificationId");
  const linkUrl = formData.get("linkUrl");

  if (typeof notificationId !== "string" || !notificationId) {
    redirect("/notifications?error=invalid");
  }

  await markNotificationAsRead(user.id, notificationId);
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

  revalidatePath("/notifications");
  redirect(typeof linkUrl === "string" && linkUrl.startsWith("/") ? linkUrl : "/notifications");
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
