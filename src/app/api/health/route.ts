import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "internal-admin-app",
    time: new Date().toISOString(),
  });
}
