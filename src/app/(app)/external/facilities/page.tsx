import { ModulePlaceholder } from "@/components/module-placeholder";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export default async function ExternalFacilitiesPage() {
  await requireRouteAccess("/external/facilities");

  return <ModulePlaceholder title="외부 스포츠 시설 운영자 전용 페이지" scope="future" />;
}
