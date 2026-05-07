import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

function parseAfter(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const after = parseAfter(request.nextUrl.searchParams.get("after"));
  const unreadCount = await getPrisma().notification.count({
    where: {
      userId: user.id,
      readAt: null,
    },
  });
  const latest = await getPrisma().notification.findMany({
    where: {
      userId: user.id,
      ...(after ? { createdAt: { gt: after } } : {}),
    },
    select: {
      id: true,
      type: true,
      priority: true,
      title: true,
      message: true,
      linkUrl: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json({
    ok: true,
    unreadCount,
    latest: latest.map((notification) => ({
      ...notification,
      createdAt: notification.createdAt.toISOString(),
    })),
  });
}
