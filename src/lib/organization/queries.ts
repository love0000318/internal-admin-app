import { getPrisma } from "@/lib/db/prisma";

export async function listTeams() {
  return getPrisma().team.findMany({
    include: {
      parent: true,
      lead: true,
      members: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

export async function getTeamDetail(teamId: string) {
  return getPrisma().team.findUnique({
    where: { id: teamId },
    include: {
      parent: true,
      children: true,
      lead: true,
      members: true,
    },
  });
}

export async function listEmployees() {
  return getPrisma().user.findMany({
    include: {
      team: true,
      profile: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getEmployeeDetail(userId: string) {
  return getPrisma().user.findUnique({
    where: { id: userId },
    include: {
      team: true,
      profile: true,
    },
  });
}
