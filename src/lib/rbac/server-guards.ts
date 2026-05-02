import { redirect } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/session";
import { getRoutePolicy } from "@/lib/routing/roles";
import { isLead, isOwner, type RbacUser, type Role } from "@/lib/rbac/roles";

export async function requireUser() {
  return requireCurrentUser();
}

export function canAccessRoute(user: RbacUser, href: string) {
  const policy = getRoutePolicy(href);

  if (!policy || policy.mvpStatus !== "included") {
    return false;
  }

  return policy.roles.includes(user.role);
}

export function assertCanAccessRoute(user: RbacUser, href: string) {
  if (!canAccessRoute(user, href)) {
    throw new Error("접근 권한이 없습니다.");
  }
}

export async function requireRole(roles: Role[]) {
  const user = await requireCurrentUser();

  if (!roles.includes(user.role)) {
    redirect("/forbidden");
  }

  return user;
}

export async function requireOwner() {
  const user = await requireCurrentUser();

  if (!isOwner(user)) {
    redirect("/forbidden");
  }

  return user;
}

export async function requireOwnerOrLead() {
  const user = await requireCurrentUser();

  if (!isOwner(user) && !isLead(user)) {
    redirect("/forbidden");
  }

  return user;
}

export async function requireRouteAccess(href: string) {
  const user = await requireCurrentUser();

  try {
    assertCanAccessRoute(user, href);
  } catch {
    redirect("/forbidden");
  }

  return user;
}
