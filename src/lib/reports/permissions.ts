import { isOwner, type RbacUser } from "@/lib/rbac/roles";

export function assertCanViewReports(actor: RbacUser) {
  if (!isOwner(actor)) {
    throw new Error("reports-forbidden");
  }
}

export function assertCanExportReport(actor: RbacUser, reportType: string) {
  void reportType;
  assertCanViewReports(actor);
}
