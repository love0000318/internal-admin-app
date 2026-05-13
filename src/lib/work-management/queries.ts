import { Prisma } from "@/generated/prisma/client";
import type { WorkTaskInternalStatus } from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/db/prisma";
import {
  WORK_TASK_INTERNAL_STATUS_OPTIONS,
  normalizeWorkTaskInternalStatus,
} from "@/lib/work-management/labels";
import { listClickUpTeamSyncSettings } from "@/lib/work-management/team-sync-configs";

export type WorkManagementFilters = {
  sourceTeamId?: string;
  sourceListId?: string;
  teamId?: string;
  status?: string;
  workDate?: string;
  q?: string;
};

export function parseDateOnlyInput(value: FormDataEntryValue | string | null | undefined) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Invalid date format.");
  }

  return new Date(`${value}T00:00:00.000Z`);
}

function trimmedString(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function buildTaskWhere(filters: WorkManagementFilters): Prisma.ClickUpTaskMirrorWhereInput {
  const clauses: Prisma.ClickUpTaskMirrorWhereInput[] = [];
  const status = normalizeWorkTaskInternalStatus(filters.status);
  const teamId = trimmedString(filters.teamId);
  const sourceTeamId = trimmedString(filters.sourceTeamId);
  const sourceListId = trimmedString(filters.sourceListId);
  const query = trimmedString(filters.q);
  const localStateFilter: Prisma.WorkTaskLocalStateWhereInput = {};

  if (sourceTeamId) {
    clauses.push({ sourceTeamId });
  }

  if (sourceListId) {
    clauses.push({ sourceListId });
  }

  if (status) {
    localStateFilter.internalStatus = status;
  }

  if (teamId) {
    localStateFilter.teamId = teamId;
  }

  if (filters.workDate) {
    localStateFilter.workDate = parseDateOnlyInput(filters.workDate);
  }

  if (Object.keys(localStateFilter).length > 0) {
    clauses.push({
      localState: {
        is: localStateFilter,
      },
    });
  }

  if (query) {
    clauses.push({
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { descriptionSummary: { contains: query, mode: "insensitive" } },
        { clickUpStatus: { contains: query, mode: "insensitive" } },
      ],
    });
  }

  return clauses.length > 0 ? { AND: clauses } : {};
}

export async function listWorkManagementDashboard(filters: WorkManagementFilters = {}) {
  const prisma = getPrisma();
  const where = buildTaskWhere(filters);
  const [
    tasks,
    teams,
    recentDocs,
    recentActivities,
    totalTasks,
    localStateCounts,
    openChanges,
    teamSyncSettings,
    relationCandidates,
    sourceListRows,
  ] = await Promise.all([
      prisma.clickUpTaskMirror.findMany({
        where,
        include: {
          sourceTeam: { select: { id: true, name: true } },
          sourceConfig: {
            select: {
              id: true,
              displayName: true,
              clickUpWorkspaceId: true,
              clickUpSpaceId: true,
              clickUpFolderId: true,
              clickUpListId: true,
              clickUpListName: true,
            },
          },
          localState: {
            include: {
              team: { select: { id: true, name: true } },
              updatedByUser: { select: { id: true, name: true } },
            },
          },
          documentLinks: {
            include: {
              document: true,
            },
            orderBy: { createdAt: "desc" },
            take: 3,
          },
          changeRequests: {
            include: {
              document: true,
              checkedByUser: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 5,
          },
          childRelations: {
            include: {
              relatedTask: {
                select: {
                  id: true,
                  name: true,
                  clickUpStatus: true,
                  sourceTeamName: true,
                  sourceListName: true,
                  localState: {
                    select: {
                      internalStatus: true,
                      team: { select: { id: true, name: true } },
                    },
                  },
                },
              },
              createdByUser: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
          parentRelations: {
            include: {
              parentTask: {
                select: {
                  id: true,
                  name: true,
                  clickUpStatus: true,
                  sourceTeamName: true,
                  sourceListName: true,
                  localState: {
                    select: {
                      internalStatus: true,
                      team: { select: { id: true, name: true } },
                    },
                  },
                },
              },
              createdByUser: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
          _count: {
            select: {
              documentLinks: true,
              changeRequests: true,
              activities: true,
              childRelations: true,
              parentRelations: true,
            },
          },
        },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
        take: 50,
      }),
      prisma.team.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.clickUpDocMirror.findMany({
        orderBy: [{ lastSyncedAt: "desc" }, { updatedAt: "desc" }],
        take: 20,
      }),
      prisma.workTaskActivity.findMany({
        include: {
          task: { select: { id: true, name: true } },
          actor: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      prisma.clickUpTaskMirror.count(),
      prisma.workTaskLocalState.groupBy({
        by: ["internalStatus"],
        _count: { _all: true },
      }),
      prisma.workTaskChangeRequest.count({
        where: { status: "OPEN" },
      }),
      listClickUpTeamSyncSettings(),
      prisma.clickUpTaskMirror.findMany({
        orderBy: [{ lastSyncedAt: "desc" }, { updatedAt: "desc" }],
        take: 100,
        select: {
          id: true,
          name: true,
          sourceTeamName: true,
          sourceListName: true,
          clickUpStatus: true,
        },
      }),
      prisma.clickUpTaskMirror.findMany({
        where: { sourceListId: { not: null } },
        select: {
          sourceListId: true,
          sourceListName: true,
        },
        take: 1000,
      }),
    ]);
  const statusCounts = Object.fromEntries(
    WORK_TASK_INTERNAL_STATUS_OPTIONS.map((status) => [status, 0]),
  ) as Record<WorkTaskInternalStatus, number>;

  for (const count of localStateCounts) {
    statusCounts[count.internalStatus] = count._count._all;
  }
  const sourceListMap = new Map<string, string | null>();

  for (const row of sourceListRows) {
    if (row.sourceListId && !sourceListMap.has(row.sourceListId)) {
      sourceListMap.set(row.sourceListId, row.sourceListName);
    }
  }

  return {
    tasks,
    teams,
    recentDocs,
    recentActivities,
    teamSyncSettings,
    relationCandidates,
    sourceLists: Array.from(sourceListMap.entries()).map(([id, name]) => ({
      id,
      name,
    })),
    totalTasks,
    statusCounts,
    openChanges,
  };
}

export type WorkManagementDashboardData = Awaited<
  ReturnType<typeof listWorkManagementDashboard>
>;
