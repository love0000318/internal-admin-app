import { describe, expect, it } from "vitest";

import {
  FUTURE_ROUTE_POLICIES,
  IMPLEMENTED_ROUTE_POLICIES,
  getVisibleNavItems,
} from "@/lib/routing/roles";
import { ROLES, isMvpEnabledRole } from "@/types/roles";

describe("foundation contracts", () => {
  it("keeps the required role enum stable", () => {
    expect(ROLES).toEqual(["OWNER", "LEAD", "MANAGER", "EXTERNAL_PARTNER"]);
    expect(isMvpEnabledRole("OWNER")).toBe(true);
    expect(isMvpEnabledRole("LEAD")).toBe(true);
    expect(isMvpEnabledRole("MANAGER")).toBe(true);
    expect(isMvpEnabledRole("EXTERNAL_PARTNER")).toBe(false);
  });

  it("separates MVP routes from future expansion routes", () => {
    expect(IMPLEMENTED_ROUTE_POLICIES.map((route) => route.href)).toEqual([
      "/dashboard",
      "/profile",
      "/leaves/me",
      "/leaves/calendar",
      "/notifications",
      "/attendance/history",
      "/admin/attendance/monthly",
      "/leaves/me/requests",
      "/leaves/me/use-plan",
      "/leaves/approvals",
      "/leaves/approvals/approved",
      "/admin/leaves/settings",
      "/admin/leaves/types",
      "/admin/leaves/approval-policies",
      "/admin/leaves/grants",
      "/admin/leaves/birthday-policy",
      "/admin/leaves/annual-policy",
      "/admin/leaves/promotions",
      "/admin/leaves/holidays",
      "/admin/leaves/balances",
      "/admin/leaves/import",
      "/admin/leaves/history",
      "/organization",
      "/organization/teams",
      "/organization/employees",
      "/organization/invitations",
      "/admin/organization/permissions-preview",
      "/admin/profile-change-requests",
      "/admin/audit-logs",
      "/admin/security",
      "/admin/reports",
      "/admin/work-management",
      "/admin/jobs",
      "/forbidden",
      "/leaves/my",
      "/admin/leave-settings",
    ]);

    expect(FUTURE_ROUTE_POLICIES.map((route) => route.href)).toEqual([
      "/tasks",
      "/meeting-notes",
      "/performance",
      "/projects/issues",
      "/external/facilities",
    ]);
  });

  it("filters left navigation by role", () => {
    expect(getVisibleNavItems("OWNER").map((route) => route.href)).toEqual([
      "/dashboard",
      "/profile",
      "/leaves/me",
      "/leaves/calendar",
      "/notifications",
      "/attendance/history",
      "/admin/attendance/monthly",
      "/leaves/approvals",
      "/admin/leaves/settings",
      "/admin/leaves/balances",
      "/organization",
      "/admin/audit-logs",
      "/admin/security",
      "/admin/reports",
      "/admin/work-management",
      "/admin/jobs",
    ]);
    expect(getVisibleNavItems("LEAD").map((route) => route.href)).toEqual([
      "/dashboard",
      "/profile",
      "/leaves/me",
      "/leaves/calendar",
      "/notifications",
      "/attendance/history",
      "/admin/attendance/monthly",
      "/leaves/approvals",
      "/admin/leaves/balances",
      "/admin/reports",
    ]);
    expect(getVisibleNavItems("MANAGER").map((route) => route.href)).toEqual([
      "/dashboard",
      "/profile",
      "/leaves/me",
      "/leaves/calendar",
      "/notifications",
      "/attendance/history",
    ]);
    expect(getVisibleNavItems("EXTERNAL_PARTNER")).toEqual([]);
  });
});
