import { buildCalendarSubscriptionIcs } from "@/lib/calendar-subscriptions/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");

  if (!token) {
    return new Response("Not found", { status: 404 });
  }

  const ics = await buildCalendarSubscriptionIcs(token);

  if (!ics) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="internal-ops-leaves.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
