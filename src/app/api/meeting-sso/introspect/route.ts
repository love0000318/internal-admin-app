import { NextRequest, NextResponse } from "next/server";

import {
  introspectMeetingSession,
  verifyMeetingClientSecret,
} from "@/lib/meeting-sso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!verifyMeetingClientSecret(request.headers.get("authorization"))) {
    return NextResponse.json({ active: false }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ active: false }, { status: 400 });
  }

  const candidate = body as { client_id?: unknown; session_ref?: unknown };
  if (
    candidate.client_id !== (process.env.MEETING_SSO_CLIENT_ID ?? "curinginnos-meeting") ||
    typeof candidate.session_ref !== "string"
  ) {
    return NextResponse.json({ active: false }, { status: 400 });
  }

  const result = await introspectMeetingSession(candidate.session_ref);
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
