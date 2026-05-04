import type { Role } from "@/lib/rbac/roles";

type UserMutationTarget = {
  id: string;
  role: Role;
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED" | "DELETED";
};

type AssertEmployeeMutationParams = {
  actorId: string;
  target: UserMutationTarget;
  nextRole: Role;
  nextStatus: UserMutationTarget["status"];
  activeOwnerCount: number;
};

export type EmployeeMutationBlockReason =
  | "SELF_DEACTIVATION_BLOCKED"
  | "SELF_OWNER_ROLE_DOWNGRADE_BLOCKED"
  | "LAST_OWNER_DEACTIVATION_BLOCKED"
  | "LAST_OWNER_ROLE_CHANGE_BLOCKED"
  | "OWNER_GRANT_TARGET_NOT_ACTIVE"
  | "OWNER_GRANT_EXTERNAL_PARTNER_BLOCKED";

export function getEmployeeMutationBlockReason({
  actorId,
  target,
  nextRole,
  nextStatus,
  activeOwnerCount,
}: AssertEmployeeMutationParams): EmployeeMutationBlockReason | null {
  if (target.id === actorId && nextStatus === "DEACTIVATED") {
    return "SELF_DEACTIVATION_BLOCKED";
  }

  if (target.id === actorId && target.role === "OWNER" && nextRole !== "OWNER") {
    return "SELF_OWNER_ROLE_DOWNGRADE_BLOCKED";
  }

  if (
    target.role === "OWNER" &&
    activeOwnerCount <= 1 &&
    nextStatus === "DEACTIVATED"
  ) {
    return "LAST_OWNER_DEACTIVATION_BLOCKED";
  }

  if (target.role === "OWNER" && activeOwnerCount <= 1 && nextRole !== "OWNER") {
    return "LAST_OWNER_ROLE_CHANGE_BLOCKED";
  }

  if (nextRole === "OWNER" && nextStatus !== "ACTIVE") {
    return "OWNER_GRANT_TARGET_NOT_ACTIVE";
  }

  if (target.role === "EXTERNAL_PARTNER" && nextRole === "OWNER") {
    return "OWNER_GRANT_EXTERNAL_PARTNER_BLOCKED";
  }

  return null;
}

export function assertCanMutateEmployee(params: AssertEmployeeMutationParams) {
  const reason = getEmployeeMutationBlockReason(params);

  if (reason) {
    throw new Error(reason);
  }
}

type TeamNode = {
  id: string;
  parentTeamId: string | null;
};

export function wouldCreateTeamCycle(
  teamId: string,
  nextParentTeamId: string | null,
  teams: TeamNode[],
) {
  if (!nextParentTeamId) {
    return false;
  }

  if (teamId === nextParentTeamId) {
    return true;
  }

  const byId = new Map(teams.map((team) => [team.id, team]));
  let current = byId.get(nextParentTeamId);

  while (current) {
    if (current.parentTeamId === teamId) {
      return true;
    }

    current = current.parentTeamId ? byId.get(current.parentTeamId) : undefined;
  }

  return false;
}
