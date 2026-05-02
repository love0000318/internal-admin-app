import { redirect } from "next/navigation";

import { requireRouteAccess } from "@/lib/rbac/server-guards";

export default async function MyLeaveRequestsPage() {
  await requireRouteAccess("/leaves/me/requests");
  redirect("/leaves/me");
}
