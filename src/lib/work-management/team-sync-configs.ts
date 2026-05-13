import { getPrisma } from "@/lib/db/prisma";

export const CLICKUP_SUPPORTED_TEAM_NAMES = [
  "서비스팀",
  "CS팀",
  "카메라팀",
  "IoT&Trainer팀",
] as const;

export const CLICKUP_SYNC_SCOPE_OPTIONS = [
  "TASKS_AND_DOCS",
  "TASKS_ONLY",
  "DOCS_ONLY",
] as const;

export type ClickUpSyncScope = (typeof CLICKUP_SYNC_SCOPE_OPTIONS)[number];

export function normalizeClickUpSyncScope(value: FormDataEntryValue | string | null | undefined) {
  return CLICKUP_SYNC_SCOPE_OPTIONS.includes(value as ClickUpSyncScope)
    ? (value as ClickUpSyncScope)
    : "TASKS_AND_DOCS";
}

export type ClickUpTeamSyncSettings = Awaited<
  ReturnType<typeof listClickUpTeamSyncSettings>
>;

export async function listClickUpTeamSyncSettings() {
  const prisma = getPrisma();
  const teams = await prisma.team.findMany({
    where: {
      name: { in: [...CLICKUP_SUPPORTED_TEAM_NAMES] },
      status: "ACTIVE",
    },
    include: {
      clickUpTeamSyncConfigs: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
  });
  const teamByName = new Map(teams.map((team) => [team.name, team]));
  const targets = CLICKUP_SUPPORTED_TEAM_NAMES.map((targetName) => {
    const team = teamByName.get(targetName) ?? null;
    const config = team?.clickUpTeamSyncConfigs[0] ?? null;

    return {
      targetName,
      team: team
        ? {
            id: team.id,
            name: team.name,
            status: team.status,
          }
        : null,
      config,
      needsTeamMapping: !team,
      isConfigured: Boolean(config?.clickUpListId),
      isEnabled: Boolean(config?.isEnabled),
    };
  });
  const activeConfigCount = targets.filter(
    (target) => target.config?.isEnabled && target.config.clickUpListId,
  ).length;
  const configuredTeamCount = targets.filter((target) => target.config?.clickUpListId).length;
  const lastTaskSyncedAt =
    targets
      .map((target) => target.config?.lastTaskSyncedAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  return {
    targets,
    activeConfigCount,
    configuredTeamCount,
    lastTaskSyncedAt,
  };
}
