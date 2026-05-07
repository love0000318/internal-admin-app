"use client";

import {
  BarChart3,
  Bell,
  Bot,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  LayoutDashboard,
  ScrollText,
  Settings,
  Shield,
  UserCircle,
  type LucideIcon,
} from "lucide-react";

import type { NavigationIconKey } from "@/config/navigation";

export const navigationIconMap: Record<NavigationIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  profile: UserCircle,
  notifications: Bell,
  leave: CalendarDays,
  calendar: CalendarDays,
  approval: CheckCircle2,
  attendance: Clock,
  organization: Building2,
  reports: BarChart3,
  audit: ScrollText,
  security: Shield,
  jobs: Bot,
  settings: Settings,
};

export function NavigationIcon({
  iconKey,
  className,
}: {
  iconKey?: NavigationIconKey;
  className?: string;
}) {
  if (!iconKey) {
    return null;
  }

  const Icon = navigationIconMap[iconKey];
  return <Icon aria-hidden="true" className={className} />;
}
