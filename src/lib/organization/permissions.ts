import { getPrisma } from "@/lib/db/prisma";
import type { RbacUser, Role } from "@/lib/rbac/roles";

export type OrganizationResourceType =
  | "LEAVE_BALANCE"
  | "LEAVE_APPROVAL"
  | "ATTENDANCE"
  | "REPORT"
  | "EMPLOYEE_DIRECTORY"
  | "ORGANIZATION";

export type ManagedScope = {
  scope: "ALL" | "MANAGED_TEAMS" | "SELF" | "NONE";
  teamIds: string[];
  userIds: string[];
  canExport: boolean;
  canMutate: boolean;
};

export type TeamNode = {
  id: string;
  parentTeamId: string | null;
  leadUserId?: string | null;
  status?: "ACTIVE" | "INACTIVE";
};

export type OrganizationUserNode = {
  id: string;
  role: Role;
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED" | "DELETED";
  teamId: string | null;
};

type OrganizationPrisma = ReturnType<typeof getPrisma>;

function uniqueSorted(values: Iterable<string>) {
  return [...new Set(values)].sort();
}

export function isEligibleTeamLeadCandidate(user: {
  role: Role;
  status: OrganizationUserNode["status"];
}) {
  return user.status === "ACTIVE" && (user.role === "OWNER" || user.role === "LEAD");
}

export function collectDescendantTeamIds(params: {
  rootTeamIds: string[];
  teams: TeamNode[];
}) {
  const activeTeams = params.teams.filter((team) => team.status !== "INACTIVE");
  const byParent = new Map<string | null, TeamNode[]>();

  for (const team of activeTeams) {
    const children = byParent.get(team.parentTeamId) ?? [];
    children.push(team);
    byParent.set(team.parentTeamId, children);
  }

  const activeIds = new Set(activeTeams.map((team) => team.id));
  const visited = new Set<string>();
  const queue = params.rootTeamIds.filter((teamId) => activeIds.has(teamId));

  while (queue.length > 0) {
    const teamId = queue.shift();
    if (!teamId || visited.has(teamId)) {
      continue;
    }

    visited.add(teamId);

    for (const child of byParent.get(teamId) ?? []) {
      if (!visited.has(child.id)) {
        queue.push(child.id);
      }
    }
  }

  return uniqueSorted(visited);
}

export async function getDescendantTeamIds(
  teamId: string,
  prisma: OrganizationPrisma = getPrisma(),
) {
  return getDescendantTeamIdsMany([teamId], prisma);
}

export async function getDescendantTeamIdsMany(
  teamIds: string[],
  prisma: OrganizationPrisma = getPrisma(),
) {
  if (teamIds.length === 0) {
    return [];
  }

  const teams = await prisma.team.findMany({
    select: { id: true, parentTeamId: true, status: true },
  });

  return collectDescendantTeamIds({ rootTeamIds: teamIds, teams });
}

export async function getLeadManagedTeamIds(
  leadUserId: string,
  prisma: OrganizationPrisma = getPrisma(),
) {
  const teams = await prisma.team.findMany({
    where: { status: "ACTIVE", leadUserId },
    select: { id: true, parentTeamId: true, leadUserId: true, status: true },
  });
  const rootTeamIds = teams.map((team) => team.id);

  if (rootTeamIds.length === 0) {
    return [];
  }

  const allTeams = await prisma.team.findMany({
    select: { id: true, parentTeamId: true, status: true },
  });

  return collectDescendantTeamIds({ rootTeamIds, teams: allTeams });
}

export async function getLeadVisibleTeamIds(
  leadUserId: string,
  prisma: OrganizationPrisma = getPrisma(),
) {
  return getLeadManagedTeamIds(leadUserId, prisma);
}

export async function getLeadVisibleUserIds(
  leadUserId: string,
  prisma: OrganizationPrisma = getPrisma(),
) {
  const teamIds = await getLeadVisibleTeamIds(leadUserId, prisma);

  if (teamIds.length === 0) {
    return [];
  }

  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: { not: "EXTERNAL_PARTNER" },
      teamId: { in: teamIds },
    },
    select: { id: true, role: true, status: true, teamId: true },
  });

  return uniqueSorted(users.map((user) => user.id));
}

export async function canLeadManageUser(
  leadUserId: string,
  targetUserId: string,
  prisma: OrganizationPrisma = getPrisma(),
) {
  const userIds = await getLeadVisibleUserIds(leadUserId, prisma);
  return userIds.includes(targetUserId);
}

export async function getManagedScopeForUser(
  actor: RbacUser,
  resourceType: OrganizationResourceType,
  prisma: OrganizationPrisma = getPrisma(),
): Promise<ManagedScope> {
  if (actor.status !== "ACTIVE") {
    return { scope: "NONE", teamIds: [], userIds: [], canExport: false, canMutate: false };
  }

  if (actor.role === "OWNER") {
    const [teams, users] = await Promise.all([
      prisma.team.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, parentTeamId: true, status: true },
      }),
      prisma.user.findMany({
        where: { status: "ACTIVE", role: { not: "EXTERNAL_PARTNER" } },
        select: { id: true, role: true, status: true, teamId: true },
      }),
    ]);

    return {
      scope: "ALL",
      teamIds: uniqueSorted(teams.map((team) => team.id)),
      userIds: uniqueSorted(users.map((user) => user.id)),
      canExport: true,
      canMutate: true,
    };
  }

  if (actor.role === "LEAD") {
    const [teamIds, userIds] = await Promise.all([
      getLeadVisibleTeamIds(actor.id, prisma),
      getLeadVisibleUserIds(actor.id, prisma),
    ]);

    return {
      scope: "MANAGED_TEAMS",
      teamIds,
      userIds,
      canExport: false,
      canMutate: resourceType === "LEAVE_APPROVAL",
    };
  }

  if (actor.role === "MANAGER") {
    return {
      scope: "SELF",
      teamIds: [],
      userIds: [actor.id],
      canExport: false,
      canMutate: false,
    };
  }

  return { scope: "NONE", teamIds: [], userIds: [], canExport: false, canMutate: false };
}

export function describeRoleChangeImpact(params: {
  previousRole: Role;
  nextRole: Role;
  managedTeamCount: number;
  managedUserCount: number;
}) {
  if (params.previousRole === params.nextRole) {
    return "역할 변경이 없어 조회 범위 영향은 없습니다.";
  }

  if (params.previousRole === "OWNER" && params.nextRole !== "OWNER") {
    return "OWNER 권한이 해제되면 전체 관리 권한을 잃습니다. 마지막 OWNER이거나 본인 권한 해제인 경우 저장이 차단됩니다.";
  }

  if (params.nextRole === "OWNER") {
    return "OWNER가 되면 전체 직원, 조직, 휴가, 근태, 리포트 관리 권한을 갖습니다. Step-up 후에만 저장할 수 있습니다.";
  }

  if (params.nextRole === "LEAD") {
    return `LEAD가 되면 담당자로 지정된 팀과 하위 팀을 볼 수 있습니다. 현재 담당 범위는 팀 ${params.managedTeamCount}개, 직원 ${params.managedUserCount}명입니다.`;
  }

  if (params.previousRole === "LEAD" && params.nextRole === "MANAGER") {
    return "MANAGER가 되면 담당 조직 구성원 조회/승인 범위를 잃고 본인 정보와 본인 휴가만 볼 수 있습니다.";
  }

  if (params.nextRole === "EXTERNAL_PARTNER") {
    return "EXTERNAL_PARTNER는 내부 조직, 휴가, 근태, 리포트 메뉴에 접근할 수 없습니다.";
  }

  return "역할 변경 후 권한 범위가 줄어들거나 바뀔 수 있습니다. 저장 전 담당 팀과 직원 접근 범위를 확인하세요.";
}

export function describeTeamChangeImpact(params: {
  previousTeamName?: string | null;
  nextTeamName?: string | null;
  previousLeadNames: string[];
  nextLeadNames: string[];
}) {
  const previousTeam = params.previousTeamName ?? "소속 팀 없음";
  const nextTeam = params.nextTeamName ?? "소속 팀 없음";

  if (previousTeam === nextTeam) {
    return "소속 팀 변경이 없어 LEAD 가시 범위 영향은 없습니다.";
  }

  const previousLeads =
    params.previousLeadNames.length > 0 ? params.previousLeadNames.join(", ") : "없음";
  const nextLeads =
    params.nextLeadNames.length > 0 ? params.nextLeadNames.join(", ") : "없음";

  return `${previousTeam}에서 ${nextTeam}(으)로 이동하면 기존 가시 LEAD(${previousLeads}) 범위에서 빠지고 새 가시 LEAD(${nextLeads}) 범위에 포함됩니다.`;
}
