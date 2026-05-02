import { redirect } from "next/navigation";

import { requireOwner } from "@/lib/rbac/server-guards";

export default async function AdminOrganizationRedirectPage() {
  await requireOwner();
  redirect("/organization");
}
