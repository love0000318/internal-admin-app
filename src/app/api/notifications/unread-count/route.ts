import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { countUnreadNotifications } from "@/lib/notifications/notifications";
import { canAccessRoute } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!canAccessRoute(user, "/notifications")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const unreadCount = await countUnreadNotifications(user.id);

  return NextResponse.json({ ok: true, unreadCount });
}
