import { ResponsiveTabs } from "@/components/design-system/responsive";

const leaveAdminItems = [
  { href: "/admin/leaves/settings", label: "휴가 정책" },
  { href: "/admin/leaves/types", label: "휴가 유형 관리" },
  { href: "/admin/leaves/approval-policies", label: "승인 정책" },
  { href: "/admin/leaves/grants", label: "휴가 지급" },
  { href: "/admin/leaves/birthday-policy", label: "생일 반차 설정" },
  { href: "/admin/leaves/annual-policy", label: "연차 정책 설정" },
  { href: "/admin/leaves/promotions", label: "연차 촉진 관리" },
  { href: "/admin/leaves/holidays", label: "회사 휴일 관리" },
  { href: "/admin/leaves/balances", label: "구성원 휴가 현황" },
  { href: "/admin/leaves/import", label: "휴가 사용내역 업로드" },
];

export function LeaveAdminNav({ activeHref }: { activeHref: string }) {
  return (
    <ResponsiveTabs
      items={leaveAdminItems.map((item) => ({
        ...item,
        active: item.href === activeHref,
      }))}
    />
  );
}
