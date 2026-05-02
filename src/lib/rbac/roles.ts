export const ROLES = [
  "OWNER",
  "LEAD",
  "MANAGER",
  "EXTERNAL_PARTNER",
] as const;

export type Role = (typeof ROLES)[number];

export const MVP_ENABLED_ROLES = ["OWNER", "LEAD", "MANAGER"] as const;

export type MvpEnabledRole = (typeof MVP_ENABLED_ROLES)[number];

export type RbacUser = {
  id: string;
  role: Role;
  status?: "INVITED" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
  teamId?: string | null;
  managedTeamIds?: string[];
};

export function isMvpEnabledRole(role: Role): role is MvpEnabledRole {
  return role !== "EXTERNAL_PARTNER";
}

export function isActiveUser(user: RbacUser): boolean {
  return user.status === undefined || user.status === "ACTIVE";
}

export function isOwner(user: RbacUser): boolean {
  return user.role === "OWNER" && isActiveUser(user);
}

export function isLead(user: RbacUser): boolean {
  return user.role === "LEAD" && isActiveUser(user);
}

export function isManager(user: RbacUser): boolean {
  return user.role === "MANAGER" && isActiveUser(user);
}
