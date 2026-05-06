import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardCheck,
  FileClock,
  LayoutDashboard,
  ListChecks,
  LucideIcon,
  ScrollText,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";

import type { Role } from "@/lib/rbac/roles";

export type NavigationItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  allowedRoles: Role[];
  matchPatterns?: string[];
};

export type NavigationSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavigationItem[];
};

const INTERNAL_ROLES: Role[] = ["OWNER", "LEAD", "MANAGER"];
const OWNER_ONLY: Role[] = ["OWNER"];
const OWNER_LEAD: Role[] = ["OWNER", "LEAD"];

export const navigationSections: NavigationSection[] = [
  {
    id: "home",
    label: "홈",
    icon: LayoutDashboard,
    items: [
      {
        id: "dashboard",
        label: "대시보드",
        href: "/dashboard",
        icon: LayoutDashboard,
        allowedRoles: INTERNAL_ROLES,
      },
    ],
  },
  {
    id: "personal",
    label: "개인",
    icon: UserRound,
    items: [
      {
        id: "profile",
        label: "내 프로필",
        href: "/profile",
        icon: UserRound,
        allowedRoles: INTERNAL_ROLES,
        matchPatterns: ["/profile"],
      },
      {
        id: "notifications",
        label: "알림센터",
        href: "/notifications",
        icon: Bell,
        allowedRoles: INTERNAL_ROLES,
      },
    ],
  },
  {
    id: "leave",
    label: "휴가",
    icon: CalendarDays,
    items: [
      {
        id: "my-leaves",
        label: "휴가 현황",
        href: "/leaves/me",
        icon: CalendarDays,
        allowedRoles: INTERNAL_ROLES,
        matchPatterns: ["/leaves/me", "/leaves/my"],
      },
      {
        id: "leave-calendar",
        label: "휴가 캘린더",
        href: "/leaves/calendar",
        icon: CalendarDays,
        allowedRoles: INTERNAL_ROLES,
      },
      {
        id: "leave-approvals",
        label: "휴가 승인 요청",
        href: "/leaves/approvals",
        icon: ClipboardCheck,
        allowedRoles: OWNER_LEAD,
      },
      {
        id: "leave-operations",
        label: "휴가 운영",
        href: "/admin/leaves/settings",
        icon: ListChecks,
        allowedRoles: OWNER_ONLY,
        matchPatterns: ["/admin/leaves/settings", "/admin/leaves/types", "/admin/leaves/grants", "/admin/leaves/annual-policy", "/admin/leaves/birthday-policy", "/admin/leaves/holidays", "/admin/leaves/promotions", "/admin/leaves/import", "/admin/leaves/history"],
      },
      {
        id: "leave-balances",
        label: "구성원 휴가 현황",
        href: "/admin/leaves/balances",
        icon: UsersRound,
        allowedRoles: OWNER_LEAD,
      },
    ],
  },
  {
    id: "attendance",
    label: "근태",
    icon: FileClock,
    items: [
      {
        id: "attendance-history",
        label: "출퇴근/근태",
        href: "/attendance/history",
        icon: FileClock,
        allowedRoles: INTERNAL_ROLES,
      },
      {
        id: "attendance-monthly",
        label: "근태 마감",
        href: "/admin/attendance/monthly",
        icon: ClipboardCheck,
        allowedRoles: OWNER_LEAD,
      },
    ],
  },
  {
    id: "organization",
    label: "조직",
    icon: UsersRound,
    items: [
      {
        id: "organization",
        label: "조직 관리",
        href: "/organization",
        icon: UsersRound,
        allowedRoles: OWNER_ONLY,
        matchPatterns: ["/organization"],
      },
      {
        id: "permissions-preview",
        label: "권한 미리보기",
        href: "/admin/organization/permissions-preview",
        icon: ShieldCheck,
        allowedRoles: OWNER_ONLY,
      },
    ],
  },
  {
    id: "reports",
    label: "리포트/감사",
    icon: ScrollText,
    items: [
      {
        id: "reports",
        label: "운영 리포트",
        href: "/admin/reports",
        icon: ScrollText,
        allowedRoles: OWNER_LEAD,
      },
      {
        id: "audit-logs",
        label: "감사 로그",
        href: "/admin/audit-logs",
        icon: FileClock,
        allowedRoles: OWNER_ONLY,
      },
    ],
  },
  {
    id: "security",
    label: "보안/시스템",
    icon: ShieldCheck,
    items: [
      {
        id: "security",
        label: "보안 현황",
        href: "/admin/security",
        icon: ShieldCheck,
        allowedRoles: OWNER_ONLY,
      },
      {
        id: "jobs",
        label: "자동화 작업",
        href: "/admin/jobs",
        icon: BriefcaseBusiness,
        allowedRoles: OWNER_ONLY,
      },
    ],
  },
];

export function getNavigationForRole(role?: Role | null) {
  if (!role) {
    return [];
  }

  return navigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.allowedRoles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);
}

export function isNavItemActive(pathname: string, item: NavigationItem) {
  if (pathname === item.href) {
    return true;
  }

  const patterns = item.matchPatterns ?? [item.href];
  return patterns.some(
    (pattern) => pathname === pattern || pathname.startsWith(`${pattern}/`),
  );
}

export function getActiveSectionId(
  pathname: string,
  sections: NavigationSection[],
) {
  return sections.find((section) =>
    section.items.some((item) => isNavItemActive(pathname, item)),
  )?.id;
}

export function getDefaultOpenSections(
  pathname: string,
  sections: NavigationSection[],
) {
  const activeSectionId = getActiveSectionId(pathname, sections);

  return new Set(activeSectionId ? [activeSectionId] : sections.slice(0, 2).map((section) => section.id));
}
