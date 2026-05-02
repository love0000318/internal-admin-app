import type { Role } from "@/lib/rbac/roles";

type UserMutationTarget = {
  id: string;
  role: Role;
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
};

type AssertEmployeeMutationParams = {
  actorId: string;
  target: UserMutationTarget;
  nextRole: Role;
  nextStatus: UserMutationTarget["status"];
  activeOwnerCount: number;
};

export function assertCanMutateEmployee({
  actorId,
  target,
  nextRole,
  nextStatus,
  activeOwnerCount,
}: AssertEmployeeMutationParams) {
  if (target.id === actorId && nextStatus === "DEACTIVATED") {
    throw new Error("자기 자신의 계정을 비활성화할 수 없습니다.");
  }

  if (target.id === actorId && target.role === "OWNER" && nextRole !== "OWNER") {
    throw new Error("자기 자신의 role을 낮출 수 없습니다.");
  }

  if (
    target.role === "OWNER" &&
    activeOwnerCount <= 1 &&
    nextStatus === "DEACTIVATED"
  ) {
    throw new Error("마지막 OWNER 계정을 비활성화할 수 없습니다.");
  }

  if (target.role === "OWNER" && activeOwnerCount <= 1 && nextRole !== "OWNER") {
    throw new Error("마지막 OWNER의 role을 변경할 수 없습니다.");
  }

  if (target.role !== "OWNER" && nextRole === "OWNER") {
    throw new Error("이번 단계에서는 OWNER role 부여를 지원하지 않습니다.");
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
