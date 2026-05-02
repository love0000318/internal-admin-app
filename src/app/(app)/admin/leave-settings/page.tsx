import { redirect } from "next/navigation";

import { requireRouteAccess } from "@/lib/rbac/server-guards";

export default async function LegacyLeaveSettingsPage() {
  await requireRouteAccess("/admin/leave-settings");
  redirect("/admin/leaves/settings");
}
