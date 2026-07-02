import {
  AnnualUsePlanReviewPanel,
  buildAnnualUsePlanReviewReturnTo,
} from "@/components/leave/annual-use-plan-review-panel";
import { getPrisma } from "@/lib/db/prisma";
import { todayInSeoul } from "@/lib/leave/calculate-business-days";
import { listAnnualUsePlanReviewRows } from "@/lib/leave/annual-use-plan-review";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

export const dynamic = "force-dynamic";

type AnnualPromotionsReportPageProps = {
  searchParams: Promise<{
    year?: string;
    success?: string;
    error?: string;
    status?: string;
    team?: string;
    sort?: string;
  }>;
};

function yearFromParam(value: string | undefined) {
  const fallback = Number(todayInSeoul().slice(0, 4));
  const year = Number(value ?? fallback);

  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : fallback;
}

export default async function AnnualPromotionsReportPage({
  searchParams,
}: AnnualPromotionsReportPageProps) {
  const actor = await requireRouteAccess("/admin/reports/leaves/promotions");
  const params = await searchParams;
  const year = yearFromParam(params.year);
  const rows = await listAnnualUsePlanReviewRows({
    actor,
    year,
    prisma: getPrisma(),
  });
  const returnTo = buildAnnualUsePlanReviewReturnTo({
    basePath: "/admin/reports/leaves/promotions",
    year,
    status: params.status,
    team: params.team,
    sort: params.sort,
  });

  return (
    <AnnualUsePlanReviewPanel
      basePath="/admin/reports/leaves/promotions"
      backHref="/admin/reports"
      error={params.error}
      returnTo={returnTo}
      rows={rows}
      sort={params.sort}
      statusFilter={params.status}
      success={params.success}
      teamFilter={params.team}
      year={year}
    />
  );
}
