import { ModulePlaceholder } from "@/components/module-placeholder";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export default async function TasksPage() {
  await requireRouteAccess("/tasks");

  return <ModulePlaceholder title="업무 Task 관리" scope="future" />;
}
