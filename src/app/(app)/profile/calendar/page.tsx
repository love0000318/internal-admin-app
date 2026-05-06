import { redirect } from "next/navigation";

import { requireRouteAccess } from "@/lib/rbac/server-guards";

export default async function ProfileCalendarPage() {
  await requireRouteAccess("/profile");
  redirect("/leaves/calendar/settings");
}
