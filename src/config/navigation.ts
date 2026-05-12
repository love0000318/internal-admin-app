import type { Role } from "@/lib/rbac/roles";
import { features } from "@/config/features";

export type NavigationIconKey =
  | "dashboard"
  | "profile"
  | "notifications"
  | "leave"
  | "calendar"
  | "approval"
  | "attendance"
  | "work"
  | "organization"
  | "reports"
  | "audit"
  | "security"
  | "jobs"
  | "settings";

export type NavigationItem = {
  id: string;
  label: string;
  href: string;
  iconKey?: NavigationIconKey;
  allowedRoles: Role[];
  enabled?: boolean;
  matchPatterns?: string[];
};

export type NavigationSection = {
  id: string;
  label: string;
  iconKey?: NavigationIconKey;
  items: NavigationItem[];
};

const INTERNAL_ROLES: Role[] = ["OWNER", "LEAD", "MANAGER"];
const OWNER_ONLY: Role[] = ["OWNER"];
const OWNER_LEAD: Role[] = ["OWNER", "LEAD"];
export const navigationSections: NavigationSection[] = [
  {
    id: "home",
    label: "홈",
    iconKey: "dashboard",
    items: [
      {
        id: "dashboard",
        label: "대시보드",
        href: "/dashboard",
        iconKey: "dashboard",
        allowedRoles: INTERNAL_ROLES,
      },
    ],
  },
  {
    id: "personal",
    label: "개인",
    iconKey: "profile",
    items: [
      {
        id: "profile",
        label: "내 프로필",
        href: "/profile",
        iconKey: "profile",
        allowedRoles: INTERNAL_ROLES,
        matchPatterns: ["/profile"],
      },
      {
        id: "notifications",
        label: "알림센터",
        href: "/notifications",
        iconKey: "notifications",
        allowedRoles: INTERNAL_ROLES,
      },
    ],
  },
  {
    id: "leave",
    label: "휴가",
    iconKey: "leave",
    items: [
      {
        id: "my-leaves",
        label: "휴가 현황",
        href: "/leaves/me",
        iconKey: "leave",
        allowedRoles: INTERNAL_ROLES,
        matchPatterns: ["/leaves/me", "/leaves/my"],
      },
      {
        id: "leave-calendar",
        label: "휴가 캘린더",
        href: "/leaves/calendar",
        iconKey: "calendar",
        allowedRoles: INTERNAL_ROLES,
      },
      {
        id: "leave-approvals",
        label: "휴가 승인 요청",
        href: "/leaves/approvals",
        iconKey: "approval",
        allowedRoles: OWNER_LEAD,
      },
      {
        id: "leave-operations",
        label: "휴가 운영",
        href: "/admin/leaves/settings",
        iconKey: "settings",
        allowedRoles: OWNER_ONLY,
        matchPatterns: [
          "/admin/leaves/settings",
          "/admin/leaves/types",
          "/admin/leaves/grants",
          "/admin/leaves/annual-policy",
          "/admin/leaves/birthday-policy",
          "/admin/leaves/holidays",
          "/admin/leaves/promotions",
          "/admin/leaves/import",
          "/admin/leaves/history",
        ],
      },
      {
        id: "leave-balances",
        label: "구성원 휴가 현황",
        href: "/admin/leaves/balances",
        iconKey: "organization",
        allowedRoles: OWNER_LEAD,
      },
    ],
  },
  {
    id: "attendance",
    label: "근태",
    iconKey: "attendance",
    items: [
      {
        id: "attendance-history",
        label: "출퇴근/근태",
        href: "/attendance/history",
        iconKey: "attendance",
        allowedRoles: INTERNAL_ROLES,
      },
      {
        id: "attendance-monthly",
        label: "근태 마감",
        href: "/admin/attendance/monthly",
        iconKey: "approval",
        allowedRoles: OWNER_LEAD,
        enabled: features.attendanceMonthlyClose,
      },
    ],
  },
  {
    id: "work",
    label: "업무",
    iconKey: "work",
    items: [
      {
        id: "work-management",
        label: "업무 관리",
        href: "/admin/work-management",
        iconKey: "work",
        allowedRoles: OWNER_ONLY,
      },
    ],
  },
  {
    id: "organization",
    label: "조직",
    iconKey: "organization",
    items: [
      {
        id: "organization",
        label: "조직 관리",
        href: "/organization",
        iconKey: "organization",
        allowedRoles: OWNER_ONLY,
        matchPatterns: ["/organization"],
      },
      {
        id: "permissions-preview",
        label: "권한 미리보기",
        href: "/admin/organization/permissions-preview",
        iconKey: "security",
        allowedRoles: OWNER_ONLY,
        enabled: features.permissionPreview,
      },
    ],
  },
  {
    id: "reports",
    label: "리포트/감사",
    iconKey: "reports",
    items: [
      {
        id: "reports",
        label: "운영 리포트",
        href: "/admin/reports",
        iconKey: "reports",
        allowedRoles: OWNER_LEAD,
        enabled: features.adminReports,
      },
      {
        id: "audit-logs",
        label: "감사 로그",
        href: "/admin/audit-logs",
        iconKey: "audit",
        allowedRoles: OWNER_ONLY,
      },
    ],
  },
  {
    id: "security",
    label: "보안/시스템",
    iconKey: "security",
    items: [
      {
        id: "security",
        label: "보안 현황",
        href: "/admin/security",
        iconKey: "security",
        allowedRoles: OWNER_ONLY,
      },
      {
        id: "jobs",
        label: "자동화 작업",
        href: "/admin/jobs",
        iconKey: "jobs",
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
      items: section.items.filter(
        (item) => item.allowedRoles.includes(role) && item.enabled !== false,
      ),
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

  return new Set(
    activeSectionId
      ? [activeSectionId]
      : sections.slice(0, 2).map((section) => section.id),
  );
}
