import { AppShell } from "@/components/layout/app-shell";
import { getNavigationForRole } from "@/config/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { countUnreadNotifications } from "@/lib/notifications/notifications";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireCurrentUser();
  const navigationSections = getNavigationForRole(user.role);
  const unreadNotificationCount = await countUnreadNotifications(user.id);

  return (
    <AppShell
      user={user}
      navigationSections={navigationSections}
      unreadNotificationCount={unreadNotificationCount}
    >
      {children}
    </AppShell>
  );
}
