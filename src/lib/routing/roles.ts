import type { Role } from "@/lib/rbac/roles";

export type RoutePolicy = {
  href: string;
  label: string;
  roles: Role[];
  mvpStatus: "included" | "future";
  showInNav?: boolean;
};

export const IMPLEMENTED_ROUTE_POLICIES: RoutePolicy[] = [
  {
    href: "/dashboard",
    label: "대시보드",
    roles: ["OWNER", "LEAD", "MANAGER"],
    mvpStatus: "included",
  },
  {
    href: "/profile",
    label: "내 정보",
    roles: ["OWNER", "LEAD", "MANAGER"],
    mvpStatus: "included",
  },
  {
    href: "/leaves/me",
    label: "내 휴가",
    roles: ["OWNER", "LEAD", "MANAGER"],
    mvpStatus: "included",
  },
  {
    href: "/leaves/calendar",
    label: "휴가 캘린더",
    roles: ["OWNER", "LEAD", "MANAGER"],
    mvpStatus: "included",
  },
  {
    href: "/notifications",
    label: "알림센터",
    roles: ["OWNER", "LEAD", "MANAGER"],
    mvpStatus: "included",
  },
  {
    href: "/leaves/me/requests",
    label: "내 휴가 요청",
    roles: ["OWNER", "LEAD", "MANAGER"],
    mvpStatus: "included",
    showInNav: false,
  },
  {
    href: "/leaves/me/use-plan",
    label: "연차 사용계획",
    roles: ["OWNER", "LEAD", "MANAGER"],
    mvpStatus: "included",
    showInNav: false,
  },
  {
    href: "/leaves/approvals",
    label: "휴가 승인",
    roles: ["OWNER", "LEAD"],
    mvpStatus: "included",
  },
  {
    href: "/leaves/approvals/approved",
    label: "승인 완료 휴가",
    roles: ["OWNER", "LEAD"],
    mvpStatus: "included",
    showInNav: false,
  },
  {
    href: "/admin/leaves/settings",
    label: "휴가 관리",
    roles: ["OWNER"],
    mvpStatus: "included",
  },
  {
    href: "/admin/leaves/types",
    label: "휴가 유형 관리",
    roles: ["OWNER"],
    mvpStatus: "included",
    showInNav: false,
  },
  {
    href: "/admin/leaves/approval-policies",
    label: "승인 정책",
    roles: ["OWNER"],
    mvpStatus: "included",
    showInNav: false,
  },
  {
    href: "/admin/leaves/grants",
    label: "맞춤휴가 지급",
    roles: ["OWNER"],
    mvpStatus: "included",
    showInNav: false,
  },
  {
    href: "/admin/leaves/birthday-policy",
    label: "생일 반차 설정",
    roles: ["OWNER"],
    mvpStatus: "included",
    showInNav: false,
  },
  {
    href: "/admin/leaves/annual-policy",
    label: "연차 정책 설정",
    roles: ["OWNER"],
    mvpStatus: "included",
    showInNav: false,
  },
  {
    href: "/admin/leaves/promotions",
    label: "연차 촉진 관리",
    roles: ["OWNER"],
    mvpStatus: "included",
    showInNav: false,
  },
  {
    href: "/admin/leaves/holidays",
    label: "회사 휴일 관리",
    roles: ["OWNER"],
    mvpStatus: "included",
    showInNav: false,
  },
  {
    href: "/admin/leaves/balances",
    label: "구성원 휴가 현황",
    roles: ["OWNER", "LEAD"],
    mvpStatus: "included",
  },
  {
    href: "/admin/leaves/import",
    label: "휴가 사용내역 업로드",
    roles: ["OWNER"],
    mvpStatus: "included",
    showInNav: false,
  },
  {
    href: "/admin/leaves/history",
    label: "휴가 이력",
    roles: ["OWNER"],
    mvpStatus: "included",
    showInNav: false,
  },
  {
    href: "/organization",
    label: "조직 관리",
    roles: ["OWNER"],
    mvpStatus: "included",
  },
  {
    href: "/organization/teams",
    label: "팀 관리",
    roles: ["OWNER"],
    mvpStatus: "included",
    showInNav: false,
  },
  {
    href: "/organization/employees",
    label: "직원 목록",
    roles: ["OWNER"],
    mvpStatus: "included",
    showInNav: false,
  },
  {
    href: "/organization/invitations",
    label: "직원 초대",
    roles: ["OWNER"],
    mvpStatus: "included",
    showInNav: false,
  },
  {
    href: "/admin/profile-change-requests",
    label: "인사정보 수정 요청",
    roles: ["OWNER"],
    mvpStatus: "included",
    showInNav: false,
  },
  {
    href: "/admin/audit-logs",
    label: "감사 로그",
    roles: ["OWNER"],
    mvpStatus: "included",
  },
  {
    href: "/admin/security",
    label: "보안 대시보드",
    roles: ["OWNER"],
    mvpStatus: "included",
  },
  {
    href: "/admin/reports",
    label: "관리자 리포트",
    roles: ["OWNER"],
    mvpStatus: "included",
  },
  {
    href: "/admin/jobs",
    label: "자동 작업",
    roles: ["OWNER"],
    mvpStatus: "included",
  },
  {
    href: "/forbidden",
    label: "접근 권한 없음",
    roles: ["OWNER", "LEAD", "MANAGER", "EXTERNAL_PARTNER"],
    mvpStatus: "included",
    showInNav: false,
  },
  {
    href: "/leaves/my",
    label: "내 휴가",
    roles: ["OWNER", "LEAD", "MANAGER"],
    mvpStatus: "included",
    showInNav: false,
  },
  {
    href: "/admin/leave-settings",
    label: "휴가 설정",
    roles: ["OWNER"],
    mvpStatus: "included",
    showInNav: false,
  },
];

export const FUTURE_ROUTE_POLICIES: RoutePolicy[] = [
  {
    href: "/tasks",
    label: "업무 Task",
    roles: ["OWNER", "LEAD", "MANAGER"],
    mvpStatus: "future",
  },
  {
    href: "/meeting-notes",
    label: "회의록",
    roles: ["OWNER", "LEAD", "MANAGER"],
    mvpStatus: "future",
  },
  {
    href: "/performance",
    label: "성과 관리",
    roles: ["OWNER", "LEAD"],
    mvpStatus: "future",
  },
  {
    href: "/projects/issues",
    label: "프로젝트 이슈",
    roles: ["OWNER", "LEAD", "MANAGER"],
    mvpStatus: "future",
  },
  {
    href: "/external/facilities",
    label: "외부 시설 운영자 페이지",
    roles: ["EXTERNAL_PARTNER"],
    mvpStatus: "future",
  },
];

export const ROUTE_POLICIES = [
  ...IMPLEMENTED_ROUTE_POLICIES,
  ...FUTURE_ROUTE_POLICIES,
];

export function getVisibleNavItems(role: Role) {
  return IMPLEMENTED_ROUTE_POLICIES.filter(
    (policy) => policy.showInNav !== false && policy.roles.includes(role),
  );
}

export function getRoutePolicy(href: string) {
  return ROUTE_POLICIES.find(
    (policy) => href === policy.href || href.startsWith(`${policy.href}/`),
  );
}
