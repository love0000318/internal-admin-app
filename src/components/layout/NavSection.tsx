"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import type { NavigationSection } from "@/config/navigation";
import { isNavItemActive } from "@/config/navigation";
import { NavItem } from "@/components/layout/NavItem";
import { NavigationIcon } from "@/components/layout/navigation-icons";

export function NavSection({
  section,
  pathname,
  defaultOpen = true,
  accordion = false,
  onNavigate,
}: {
  section: NavigationSection;
  pathname: string;
  defaultOpen?: boolean;
  accordion?: boolean;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!accordion) {
    return (
      <section className="grid gap-1" aria-labelledby={`nav-${section.id}`}>
        <div
          id={`nav-${section.id}`}
          className="flex items-center gap-2 px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-slate-400"
        >
          <NavigationIcon iconKey={section.iconKey} className="h-4 w-4" />
          <span>{section.label}</span>
        </div>
        {section.items.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            active={isNavItemActive(pathname, item)}
            onNavigate={onNavigate}
          />
        ))}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
      >
        <span className="flex min-w-0 items-center gap-2">
          <NavigationIcon
            iconKey={section.iconKey}
            className="h-5 w-5 shrink-0 text-slate-400"
          />
          <span className="truncate break-keep">{section.label}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="grid gap-1 border-t border-slate-100 p-2">
          {section.items.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              active={isNavItemActive(pathname, item)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
