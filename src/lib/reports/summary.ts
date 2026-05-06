import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { scopedUserWhere, type ReportFilters } from "@/lib/reports/data";
import type { ReportScope } from "@/lib/reports/permissions";

export type AdminReportSummary = {
  scopeLabel: "ALL" | "MANAGED_TEAMS";
  year: number;
  month: number;
  leave: {
    approvedRequests: number;
    pendingRequests: number;
    usedDays: number;
    pendingDays: number;
    expiringLedgerEvents: number;
  };
  attendance: {
    recordCount: number | null;
    missingClockOutCount: number | null;
    status: "AVAILABLE" | "NOT_CONFIGURED";
  };
  employees: {
    total: number;
    active: number;
    invited: number;
    deactivated: number;
    pendingInvitations: number;
    expiringInvitations: number;
  };
  dataQuality: {
    warningCount: number;
    warnings: Array<{ code: string; label: string; count: number }>;
  };
  security: {
    highSeverityAuditLogs: number | null;
    blockedAccessEvents: number | null;
  };
};

function parseYear(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100
    ? parsed
    : new Date().getFullYear();
}

function parseMonth(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12
    ? parsed
    : new Date().getMonth() + 1;
}

function dateRange(year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  return { from, to };
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  return typeof value === "number" ? value : value.toNumber();
}

function scopedUserRelationWhere(filters: ReportFilters, scope: ReportScope) {
  return scopedUserWhere(filters, scope);
}

export async function getAdminReportSummary({
  filters,
  scope,
}: {
  filters: ReportFilters;
  scope: ReportScope;
}): Promise<AdminReportSummary> {
  const prisma = getPrisma();
  const year = parseYear(filters.year);
  const month = parseMonth(filters.month);
  const range = dateRange(year, month);
  const userWhere = scopedUserRelationWhere(filters, scope);
  const activeUserWhere: Prisma.UserWhereInput = {
    ...userWhere,
    role: { not: "EXTERNAL_PARTNER" },
  };
  const invitationWhere: Prisma.InvitationWhereInput =
    scope.scope === "MANAGED_TEAMS"
      ? {
          teamId: { in: scope.teamIds.length > 0 ? scope.teamIds : ["__no_visible_team__"] },
        }
      : {};

  const [
    totalEmployees,
    activeEmployees,
    invitedEmployees,
    deactivatedEmployees,
    pendingInvitations,
    expiringInvitations,
    approvedLeave,
    pendingLeave,
    expiringLedgerEvents,
    employeesWithoutTeam,
    leadsWithoutTeams,
    oversizedAdjustments,
    suspiciousUnderOneYearLedger,
    highSeverityAuditLogs,
    blockedAccessEvents,
  ] = await Promise.all([
    prisma.user.count({ where: activeUserWhere }),
    prisma.user.count({ where: { ...activeUserWhere, status: "ACTIVE" } }),
    prisma.user.count({ where: { ...activeUserWhere, status: "INVITED" } }),
    prisma.user.count({ where: { ...activeUserWhere, status: "DEACTIVATED" } }),
    prisma.invitation.count({
      where: { ...invitationWhere, status: "PENDING" },
    }),
    prisma.invitation.count({
      where: {
        ...invitationWhere,
        status: "PENDING",
        expiresAt: {
          gte: new Date(),
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    }),
    prisma.leaveRequest.aggregate({
      where: {
        status: "APPROVED",
        startDate: { lte: range.to },
        endDate: { gte: range.from },
        user: userWhere,
      },
      _count: { _all: true },
      _sum: { dayCount: true },
    }),
    prisma.leaveRequest.aggregate({
      where: {
        status: "PENDING",
        startDate: { lte: range.to },
        endDate: { gte: range.from },
        user: userWhere,
      },
      _count: { _all: true },
      _sum: { dayCount: true },
    }),
    prisma.leaveLedger.count({
      where: {
        eventType: "EXPIRED",
        referenceYear: year,
        user: userWhere,
      },
    }),
    prisma.user.count({
      where: {
        ...activeUserWhere,
        status: "ACTIVE",
        teamId: null,
      },
    }),
    scope.canViewSecurity
      ? prisma.user.count({
          where: {
            role: "LEAD",
            status: "ACTIVE",
            leadTeams: { none: {} },
          },
        })
      : Promise.resolve(0),
    prisma.leaveAdjustment.count({
      where: {
        fiscalYear: year,
        OR: [{ days: { gte: 25 } }, { days: { lte: -25 } }],
        user: userWhere,
      },
    }),
    prisma.leaveLedger.count({
      where: {
        referenceYear: year,
        source: { in: ["ANNUAL_AUTO", "SYSTEM_MIGRATION"] },
        amount: { gte: 26 },
        user: userWhere,
      },
    }),
    scope.canViewSecurity
      ? prisma.auditLog.count({
          where: {
            severity: { in: ["HIGH", "CRITICAL"] },
            createdAt: { gte: range.from, lte: range.to },
          },
        })
      : Promise.resolve(null),
    scope.canViewSecurity
      ? prisma.auditLog.count({
          where: {
            action: { in: ["UNAUTHORIZED_ACCESS_BLOCKED", "CSRF_BLOCKED"] },
            createdAt: { gte: range.from, lte: range.to },
          },
        })
      : Promise.resolve(null),
  ]);

  const warnings = [
    {
      code: "EMPLOYEE_WITHOUT_TEAM",
      label: "팀 미지정 ACTIVE 직원",
      count: employeesWithoutTeam,
    },
    {
      code: "LEAD_WITHOUT_MANAGED_TEAM",
      label: "담당 팀이 없는 LEAD",
      count: leadsWithoutTeams,
    },
    {
      code: "EXCESSIVE_LEAVE_ADJUSTMENT",
      label: "큰 휴가 조정값",
      count: oversizedAdjustments,
    },
    {
      code: "REVIEW_UNDER_ONE_YEAR_ACCRUAL",
      label: "1년 미만/연차 장부 검토 필요",
      count: suspiciousUnderOneYearLedger,
    },
  ].filter((warning) => warning.count > 0);

  return {
    scopeLabel: scope.scope,
    year,
    month,
    leave: {
      approvedRequests: approvedLeave._count._all,
      pendingRequests: pendingLeave._count._all,
      usedDays: decimalToNumber(approvedLeave._sum.dayCount),
      pendingDays: decimalToNumber(pendingLeave._sum.dayCount),
      expiringLedgerEvents,
    },
    attendance: {
      recordCount: null,
      missingClockOutCount: null,
      status: "NOT_CONFIGURED",
    },
    employees: {
      total: totalEmployees,
      active: activeEmployees,
      invited: invitedEmployees,
      deactivated: deactivatedEmployees,
      pendingInvitations,
      expiringInvitations,
    },
    dataQuality: {
      warningCount: warnings.reduce((total, warning) => total + warning.count, 0),
      warnings,
    },
    security: {
      highSeverityAuditLogs,
      blockedAccessEvents,
    },
  };
}
