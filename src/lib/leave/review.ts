import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { ReviewableLeaveRequest } from "@/lib/rbac/guards";
import { isLead, type RbacUser } from "@/lib/rbac/roles";

export type ReviewableUser = {
  id: string;
  role: RbacUser["role"];
  status: NonNullable<RbacUser["status"]>;
  teamId: string | null;
};

export type ReviewableLeaveRequestLike = {
  id: string;
  userId: string;
  status: ReviewableLeaveRequest["status"];
  user: ReviewableUser;
};

export function toRequesterRbacUser(user: ReviewableUser): RbacUser {
  return {
    id: user.id,
    role: user.role,
    status: user.status,
    teamId: user.teamId,
  };
}

export function toReviewableLeaveRequest(
  leaveRequest: ReviewableLeaveRequestLike,
): ReviewableLeaveRequest {
  return {
    id: leaveRequest.id,
    status: leaveRequest.status,
    userId: leaveRequest.userId,
    user: toRequesterRbacUser(leaveRequest.user),
  };
}

export async function getReviewableTeamIdsForLead(
  leadUserId: string,
  prisma: PrismaClient | Prisma.TransactionClient = getPrisma(),
) {
  const teams = await prisma.team.findMany({
    select: {
      id: true,
      parentTeamId: true,
      leadUserId: true,
      status: true,
    },
  });
  const managed = new Set(
    teams
      .filter((team) => team.leadUserId === leadUserId && team.status === "ACTIVE")
      .map((team) => team.id),
  );
  let changed = true;

  while (changed) {
    changed = false;

    for (const team of teams) {
      if (
        team.status === "ACTIVE" &&
        team.parentTeamId &&
        managed.has(team.parentTeamId) &&
        !managed.has(team.id)
      ) {
        managed.add(team.id);
        changed = true;
      }
    }
  }

  return [...managed];
}

export async function hydrateReviewScope(
  actor: RbacUser,
  prisma: PrismaClient = getPrisma(),
): Promise<RbacUser> {
  if (!isLead(actor) || actor.managedTeamIds?.length) {
    return actor;
  }

  return {
    ...actor,
    managedTeamIds: await getReviewableTeamIdsForLead(actor.id, prisma),
  };
}

export function getReviewableRequesterWhere(actor: RbacUser): Prisma.UserWhereInput {
  if (actor.role === "OWNER") {
    return {};
  }

  if (actor.role === "LEAD") {
    return {
      id: { not: actor.id },
      teamId: { in: actor.managedTeamIds ?? [] },
    };
  }

  return { id: "__no_review_access__" };
}
