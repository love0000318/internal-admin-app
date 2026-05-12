import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { markNotificationAsRead } from "@/lib/notifications/notifications";
import { canAccessRoute } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ notificationId: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!canAccessRoute(user, "/notifications")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { notificationId } = await context.params;

  if (!notificationId) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const result = await markNotificationAsRead(user.id, notificationId);

  if (result.count === 0) {
    return NextResponse.json({ ok: false, error: "not-found" }, { status: 404 });
  }

  await getPrisma().auditLog.create({
    data: {
      actorId: user.id,
      actorUserId: user.id,
      action: "NOTIFICATION_MARKED_READ",
      targetType: "NOTIFICATION",
      targetId: notificationId,
      metadata: { notificationId, source: "notification-bell" },
    },
  });

  return NextResponse.json({ ok: true });
}
