import Link from "next/link";

import { requireOwner } from "@/lib/rbac/server-guards";

const links = [
  {
    href: "/organization/teams",
    title: "조직/팀 관리",
    description: "팀을 만들고 상위 팀, 팀 리드, 상태를 관리합니다.",
  },
  {
    href: "/organization/employees",
    title: "직원 목록",
    description: "직원 정보를 조회하고 인적사항, role, 소속 팀을 수정합니다.",
  },
  {
    href: "/organization/invitations",
    title: "직원 초대",
    description: "초대 링크를 생성, 취소, 재발급합니다.",
  },
];

export default async function OrganizationPage() {
  await requireOwner();

  return (
    <section>
      <p className="text-sm font-medium text-neutral-500">OWNER 전용</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-normal">
        조직 구성 및 직원 초대
      </h1>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-neutral-400"
          >
            <h2 className="text-base font-semibold text-neutral-950">
              {link.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              {link.description}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
