"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { DesktopSidebar } from "@/components/layout/DesktopSidebar";
import { MobileNavDrawer } from "@/components/layout/MobileNavDrawer";
import { MobileTopBar } from "@/components/layout/MobileTopBar";
import { PageContainer } from "@/components/layout/PageContainer";
import { TopBar } from "@/components/layout/TopBar";
import type { NavigationSection } from "@/config/navigation";
import type { AuthenticatedUser } from "@/lib/auth/types";

export function AppShell({
  user,
  navigationSections,
  unreadNotificationCount,
  children,
}: {
  user: AuthenticatedUser;
  navigationSections: NavigationSection[];
  unreadNotificationCount: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
      <MobileTopBar
        unreadNotificationCount={unreadNotificationCount}
        onOpenMenu={() => setMobileMenuOpen(true)}
      />
      <MobileNavDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        sections={navigationSections}
        pathname={pathname}
        user={user}
      />

      <div className="flex min-h-screen min-w-0">
        <DesktopSidebar sections={navigationSections} pathname={pathname} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            user={user}
            unreadNotificationCount={unreadNotificationCount}
          />
          <main className="min-w-0 flex-1 overflow-x-hidden">
            <PageContainer>{children}</PageContainer>
          </main>
        </div>
      </div>
    </div>
  );
}
