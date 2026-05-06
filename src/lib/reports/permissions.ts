import { getLeaveBalanceScope } from "@/lib/leave/balance-scope";
import { isLead, isOwner, type RbacUser } from "@/lib/rbac/roles";

export type ReportScope =
  | {
      scope: "ALL";
      userIds: string[];
      teamIds: string[];
      canViewSecurity: true;
      canExport: true;
    }
  | {
      scope: "MANAGED_TEAMS";
      userIds: string[];
      teamIds: string[];
      canViewSecurity: false;
      canExport: false;
    };

export function canViewReports(actor: RbacUser) {
  return isOwner(actor) || isLead(actor);
}

export function assertCanViewReports(actor: RbacUser) {
  if (!canViewReports(actor)) {
    throw new Error("reports-forbidden");
  }
}

export async function getReportScope(actor: RbacUser): Promise<ReportScope> {
  assertCanViewReports(actor);

  const balanceScope = await getLeaveBalanceScope(actor);

  if (isOwner(actor)) {
    return {
      scope: "ALL",
      userIds: balanceScope.userIds,
      teamIds: balanceScope.teamIds,
      canViewSecurity: true,
      canExport: true,
    };
  }

  return {
    scope: "MANAGED_TEAMS",
    userIds: balanceScope.userIds,
    teamIds: balanceScope.teamIds,
    canViewSecurity: false,
    canExport: false,
  };
}

export function assertCanExportReport(actor: RbacUser, reportType: string) {
  void reportType;
  if (!isOwner(actor)) {
    throw new Error("reports-forbidden");
  }
}
