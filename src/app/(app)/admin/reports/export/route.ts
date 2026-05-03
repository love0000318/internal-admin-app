import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { generateCsvReport } from "@/lib/reports/csv";
import { buildFilterSummary, listReportRows, type ReportFilters } from "@/lib/reports/data";
import {
  getReportDefinition,
  isReportType,
  sanitizeReportRows,
} from "@/lib/reports/definitions";
import { assertCanExportReport } from "@/lib/reports/permissions";
import { sanitizeAuditMetadata } from "@/lib/security/sanitize";
import { assertRecentStepUp } from "@/lib/security/step-up";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await getCurrentUser();

  if (!actor) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    assertCanExportReport(actor, "REPORT");
  } catch {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  try {
    await assertRecentStepUp({
      actorUserId: actor.id,
      purpose: "REPORT_EXPORT",
    });
  } catch {
    await getPrisma().auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        targetUserId: actor.id,
        action: "REPORT_EXPORT_STEP_UP_REQUIRED",
        targetType: "REPORT",
        metadata: sanitizeAuditMetadata({
          reasonCode: "STEP_UP_REQUIRED",
        }),
      },
    });

    return NextResponse.json(
      { ok: false, error: "step-up-required" },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const reportType = url.searchParams.get("reportType");

  if (!isReportType(reportType)) {
    return NextResponse.json(
      { ok: false, error: "invalid-report-type" },
      { status: 400 },
    );
  }

  const filters = Object.fromEntries(url.searchParams.entries()) as ReportFilters;
  delete (filters as Record<string, string | undefined>).reportType;

  const definition = getReportDefinition(reportType);
  const rows = sanitizeReportRows(
    await listReportRows(reportType, filters, { limit: 5000 }),
    reportType,
  );
  const csv = generateCsvReport({ headers: definition.columns, rows });
  const fileName = buildFileName(definition.defaultFileName, filters.year);

  await getPrisma().auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "REPORT_EXPORTED",
      targetType: "REPORT",
      targetId: reportType,
      metadata: sanitizeAuditMetadata({
        reportType,
        exportedByUserId: actor.id,
        filterSummary: buildFilterSummary(filters),
        rowCount: rows.length,
        exportedAt: new Date().toISOString(),
      }),
    },
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

function buildFileName(defaultFileName: string, year: string | undefined) {
  const safeYear = year && /^\d{4}$/.test(year) ? year : new Date().getFullYear();
  return defaultFileName.replace(".csv", `-${safeYear}.csv`);
}
