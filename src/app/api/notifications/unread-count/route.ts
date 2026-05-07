import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { countUnreadNotifications } from "@/lib/notifications/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const unreadCount = await countUnreadNotifications(user.id);

  return NextResponse.json({ ok: true, unreadCount });
}
