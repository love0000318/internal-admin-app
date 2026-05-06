"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

import type { NavigationSection } from "@/config/navigation";
import { getDefaultOpenSections } from "@/config/navigation";
import { NavSection } from "@/components/layout/NavSection";
import { RoleLabel } from "@/components/ui/status-badge";
import type { AuthenticatedUser } from "@/lib/auth/types";

export function MobileNavDrawer({
  open,
  onClose,
  sections,
  pathname,
  user,
}: {
  open: boolean;
  onClose: () => void;
  sections: NavigationSection[];
  pathname: string;
  user: AuthenticatedUser;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const defaultOpenSections = getDefaultOpenSections(pathname, sections);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="메뉴 닫기"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[340px] flex-col overflow-hidden bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
              INTERNAL OPS
            </p>
            <p className="mt-1 truncate break-keep text-sm font-semibold text-slate-700">
              사내 관리 서비스
            </p>
            <div className="mt-3 flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold text-slate-900">
                {user.name}
              </span>
              <RoleLabel role={user.role} />
            </div>
          </div>
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <nav
          aria-label="모바일 주 메뉴"
          className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3"
        >
          {sections.map((section) => (
            <NavSection
              key={section.id}
              section={section}
              pathname={pathname}
              defaultOpen={defaultOpenSections.has(section.id)}
              accordion
              onNavigate={onClose}
            />
          ))}
        </nav>
      </aside>
    </div>
  );
}
