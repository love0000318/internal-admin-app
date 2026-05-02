import { AdminReportPage } from "@/app/(app)/admin/reports/report-page";
import type { ReportFilters } from "@/lib/reports/data";

export const dynamic = "force-dynamic";

export default function LeaveUsageReportPage({
  searchParams,
}: {
  searchParams: Promise<ReportFilters>;
}) {
  return <AdminReportPage reportType="LEAVE_USAGE" searchParams={searchParams} />;
}
