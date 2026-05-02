import { ModulePlaceholder } from "@/components/module-placeholder";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export default async function MeetingNotesPage() {
  await requireRouteAccess("/meeting-notes");

  return <ModulePlaceholder title="회의록/회의 일정 관리" scope="future" />;
}
