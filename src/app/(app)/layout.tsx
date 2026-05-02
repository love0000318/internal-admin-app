import Link from "next/link";

import { logoutAction } from "@/app/(auth)/logout/actions";
import { RoleLabel } from "@/components/ui/status-badge";
import { requireCurrentUser } from "@/lib/auth/session";
import { getVisibleNavItems } from "@/lib/routing/roles";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireCurrentUser();
  const navItems = getVisibleNavItems(user.role);

  return (
    <div className="min-h-full bg-neutral-100 text-neutral-950">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[248px_1fr]">
        <aside className="border-b border-neutral-200 bg-white md:border-b-0 md:border-r">
          <div className="flex h-full flex-col">
            <div className="border-b border-neutral-200 px-5 py-5">
              <p className="text-sm font-medium text-neutral-500">Internal Ops</p>
              <p className="mt-1 text-lg font-semibold tracking-normal">
                사내 관리 서비스
              </p>
              <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
                <span>{user.name}</span>
                <RoleLabel role={user.role} />
              </div>
            </div>
            <nav className="grid gap-1 px-3 py-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex h-10 items-center rounded-md px-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-950"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto border-t border-neutral-200 p-4">
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="h-9 w-full rounded-md border border-neutral-300 px-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100"
                >
                  로그아웃
                </button>
              </form>
            </div>
          </div>
        </aside>
        <main className="min-w-0 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
