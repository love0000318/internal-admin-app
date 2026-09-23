import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import {
  issueMeetingTicket,
  resolveMeetingAccess,
  validateMeetingAuthorizeRequest,
} from "@/lib/meeting-sso";
import {
  hashSessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const cfg = validateMeetingAuthorizeRequest({
      clientId: params.get("client_id"),
      redirectUri: params.get("redirect_uri"),
      state: params.get("state"),
      nonce: params.get("nonce"),
    });

    const cookieStore = await cookies();
    const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!rawToken) {
      return NextResponse.redirect(new URL("/login", request.url), 303);
    }

    const session = await getPrisma().session.findUnique({
      where: { tokenHash: hashSessionToken(rawToken) },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      session.user.status !== "ACTIVE"
    ) {
      return NextResponse.redirect(new URL("/login", request.url), 303);
    }

    const user = {
      id: session.user.id,
      phone: session.user.phone,
      name: session.user.name,
      title: session.user.title ?? session.user.profile?.jobTitle ?? null,
      role: session.user.role,
      status: session.user.status,
      teamId: session.user.teamId ?? session.user.profile?.teamId ?? null,
      managedTeamIds: [],
    };

    if (!resolveMeetingAccess(user)) {
      return new NextResponse("접근 권한이 없습니다.", { status: 403 });
    }

    const ticket = issueMeetingTicket({
      user,
      sessionRef: session.id,
      nonce: params.get("nonce")!,
    });

    const target = new URL(cfg.meetingOrigin + "/");
    target.searchParams.set("ops_ticket", ticket);
    target.searchParams.set("state", params.get("state")!);

    return NextResponse.redirect(target, 303);
  } catch {
    return new NextResponse("잘못된 회의 인증 요청입니다.", { status: 400 });
  }
}
