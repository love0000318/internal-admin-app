import { ModulePlaceholder } from "@/components/module-placeholder";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export default async function ProjectIssuesPage() {
  await requireRouteAccess("/projects/issues");

  return <ModulePlaceholder title="프로젝트 이슈 관리" scope="future" />;
}
