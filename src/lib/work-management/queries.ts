import { Prisma } from "@/generated/prisma/client";
import type { WorkTaskInternalStatus } from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/db/prisma";
import {
  WORK_TASK_INTERNAL_STATUS_OPTIONS,
  normalizeWorkTaskInternalStatus,
} from "@/lib/work-management/labels";

export type WorkManagementFilters = {
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
  const query = trimmedString(filters.q);
  const localStateFilter: Prisma.WorkTaskLocalStateWhereInput = {};

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
  const [tasks, teams, recentDocs, recentActivities, totalTasks, localStateCounts, openChanges] =
    await Promise.all([
      prisma.clickUpTaskMirror.findMany({
        where,
        include: {
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
          _count: {
            select: {
              documentLinks: true,
              changeRequests: true,
              activities: true,
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
    ]);
  const statusCounts = Object.fromEntries(
    WORK_TASK_INTERNAL_STATUS_OPTIONS.map((status) => [status, 0]),
  ) as Record<WorkTaskInternalStatus, number>;

  for (const count of localStateCounts) {
    statusCounts[count.internalStatus] = count._count._all;
  }

  return {
    tasks,
    teams,
    recentDocs,
    recentActivities,
    totalTasks,
    statusCounts,
    openChanges,
  };
}

export type WorkManagementDashboardData = Awaited<
  ReturnType<typeof listWorkManagementDashboard>
>;
