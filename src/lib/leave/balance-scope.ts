import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { getReviewableTeamIdsForLead } from "@/lib/leave/review";
import { isLead, isManager, isOwner, type RbacUser } from "@/lib/rbac/roles";

export type LeaveBalanceScope =
  | {
      scope: "ALL";
      userIds: string[];
      teamIds: string[];
    }
  | {
      scope: "MANAGED_TEAMS";
      userIds: string[];
      teamIds: string[];
    }
  | {
      scope: "SELF";
      userIds: string[];
      teamIds: string[];
    }
  | {
      scope: "NONE";
      userIds: string[];
      teamIds: string[];
    };

type BalanceScopeDb = PrismaClient | Prisma.TransactionClient;

export function collectDescendantTeamIds({
  teams,
  rootTeamIds,
}: {
  teams: Array<{ id: string; parentTeamId: string | null; status?: string }>;
  rootTeamIds: string[];
}) {
  const activeTeamIds = new Set(
    teams.filter((team) => team.status !== "INACTIVE").map((team) => team.id),
  );
  const visible = new Set(rootTeamIds.filter((teamId) => activeTeamIds.has(teamId)));
  let changed = true;
  let guard = 0;

  while (changed && guard < teams.length + 1) {
    changed = false;
    guard += 1;

    for (const team of teams) {
      if (
        team.status !== "INACTIVE" &&
        team.parentTeamId &&
        visible.has(team.parentTeamId) &&
        !visible.has(team.id)
      ) {
        visible.add(team.id);
        changed = true;
      }
    }
  }

  return [...visible];
}

export async function getLeaveBalanceScope(
  actor: RbacUser,
  prisma: BalanceScopeDb = getPrisma(),
): Promise<LeaveBalanceScope> {
  if (isOwner(actor)) {
    const [users, teams] = await Promise.all([
      prisma.user.findMany({
        where: { status: "ACTIVE", role: { not: "EXTERNAL_PARTNER" } },
        select: { id: true },
      }),
      prisma.team.findMany({
        where: { status: "ACTIVE" },
        select: { id: true },
      }),
    ]);

    return {
      scope: "ALL",
      userIds: users.map((user) => user.id),
      teamIds: teams.map((team) => team.id),
    };
  }

  if (isLead(actor)) {
    const teamIds = await getReviewableTeamIdsForLead(actor.id, prisma);
    const users = await prisma.user.findMany({
      where: {
        status: "ACTIVE",
        role: { not: "EXTERNAL_PARTNER" },
        teamId: { in: teamIds },
      },
      select: { id: true },
    });

    return {
      scope: "MANAGED_TEAMS",
      userIds: users.map((user) => user.id),
      teamIds,
    };
  }

  if (isManager(actor)) {
    return {
      scope: "SELF",
      userIds: [actor.id],
      teamIds: actor.teamId ? [actor.teamId] : [],
    };
  }

  return {
    scope: "NONE",
    userIds: [],
    teamIds: [],
  };
}

export async function getVisibleLeaveBalanceUserIds(
  actor: RbacUser,
  prisma: BalanceScopeDb = getPrisma(),
) {
  const scope = await getLeaveBalanceScope(actor, prisma);

  return scope.userIds;
}

export function assertCanViewLeaveBalances(actor: RbacUser) {
  if (!isOwner(actor) && !isLead(actor)) {
    throw new Error("접근 권한이 없습니다.");
  }
}

export async function assertCanViewUserLeaveBalance(
  actor: RbacUser,
  targetUserId: string,
  prisma: BalanceScopeDb = getPrisma(),
) {
  const scope = await getLeaveBalanceScope(actor, prisma);

  if (!scope.userIds.includes(targetUserId)) {
    throw new Error("접근 권한이 없습니다.");
  }

  return scope;
}
