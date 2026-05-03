import { AppShell } from "@/components/layout/app-shell";
import { requireCurrentUser } from "@/lib/auth/session";
import { countUnreadNotifications } from "@/lib/notifications/notifications";
import { getVisibleNavItems } from "@/lib/routing/roles";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireCurrentUser();
  const navItems = getVisibleNavItems(user.role);
  const unreadNotificationCount = await countUnreadNotifications(user.id);

  return (
    <AppShell
      user={user}
      navItems={navItems}
      unreadNotificationCount={unreadNotificationCount}
    >
      {children}
    </AppShell>
  );
}
