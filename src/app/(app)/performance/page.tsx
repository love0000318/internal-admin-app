import { ModulePlaceholder } from "@/components/module-placeholder";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export default async function PerformancePage() {
  await requireRouteAccess("/performance");

  return <ModulePlaceholder title="업무 성과 관리" scope="future" />;
}
