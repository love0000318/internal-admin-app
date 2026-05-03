import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { stringifyRedactedAuditValue } from "@/lib/audit/redact";
import { getPrisma } from "@/lib/db/prisma";
import { formatCsvDateTime, generateCsvReport } from "@/lib/reports/csv";
import { sanitizeAuditMetadata } from "@/lib/security/sanitize";
import { assertRecentStepUp } from "@/lib/security/step-up";
import type { Prisma } from "@/generated/prisma/client";
import {
  AuditAction as AuditActionEnum,
  AuditCategory as AuditCategoryEnum,
  AuditSeverity as AuditSeverityEnum,
} from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

function isAuditAction(value: string | null): value is keyof typeof AuditActionEnum {
  return Boolean(value && Object.values(AuditActionEnum).includes(value as never));
}

function isAuditCategory(value: string | null): value is keyof typeof AuditCategoryEnum {
  return Boolean(value && Object.values(AuditCategoryEnum).includes(value as never));
}

function isAuditSeverity(value: string | null): value is keyof typeof AuditSeverityEnum {
  return Boolean(value && Object.values(AuditSeverityEnum).includes(value as never));
}

export async function GET(request: Request) {
  const actor = await getCurrentUser();

  if (!actor) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (actor.role !== "OWNER") {
    await getPrisma().auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        targetUserId: actor.id,
        action: "UNAUTHORIZED_ACCESS_BLOCKED",
        targetType: "REPORT",
        metadata: sanitizeAuditMetadata({
          route: "/admin/audit-logs/export",
          reasonCode: "OWNER_REQUIRED",
        }),
      },
    });

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
          route: "/admin/audit-logs/export",
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
  const highRiskOnly = url.searchParams.get("highRiskOnly") === "1";
  const where: Prisma.AuditLogWhereInput = {
    ...(isAuditAction(url.searchParams.get("action"))
      ? { action: url.searchParams.get("action") as never }
      : {}),
    ...(isAuditCategory(url.searchParams.get("category"))
      ? { category: url.searchParams.get("category") as never }
      : {}),
    ...(isAuditSeverity(url.searchParams.get("severity"))
      ? { severity: url.searchParams.get("severity") as never }
      : {}),
    ...(highRiskOnly ? { severity: { in: ["HIGH", "CRITICAL"] } } : {}),
    ...(url.searchParams.get("actorId")
      ? { actorUserId: url.searchParams.get("actorId") ?? undefined }
      : {}),
    ...(url.searchParams.get("targetUserId")
      ? { targetUserId: url.searchParams.get("targetUserId") ?? undefined }
      : {}),
    ...(url.searchParams.get("startDate") || url.searchParams.get("endDate")
      ? {
          createdAt: {
            ...(url.searchParams.get("startDate")
              ? {
                  gte: new Date(
                    `${url.searchParams.get("startDate")}T00:00:00.000+09:00`,
                  ),
                }
              : {}),
            ...(url.searchParams.get("endDate")
              ? {
                  lte: new Date(
                    `${url.searchParams.get("endDate")}T23:59:59.999+09:00`,
                  ),
                }
              : {}),
          },
        }
      : {}),
  };
  const logs = await getPrisma().auditLog.findMany({
    where,
    include: {
      actor: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  const csv = generateCsvReport({
    headers: [
      "createdAt",
      "severity",
      "category",
      "action",
      "actor",
      "actorUserId",
      "targetUserId",
      "entityType",
      "entityId",
      "metadataSummary",
    ],
    rows: logs.map((log) => ({
      createdAt: formatCsvDateTime(log.createdAt),
      severity: log.severity,
      category: log.category,
      action: log.action,
      actor: log.actor?.name ?? "",
      actorUserId: log.actorUserId ?? "",
      targetUserId: log.targetUserId ?? "",
      entityType: log.targetType,
      entityId: log.targetId ?? "",
      metadataSummary: stringifyRedactedAuditValue(log.metadata).slice(0, 1000),
    })),
  });

  await getPrisma().auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "AUDIT_LOG_EXPORTED",
      targetType: "REPORT",
      metadata: sanitizeAuditMetadata({
        exportedByUserId: actor.id,
        rowCount: logs.length,
        filterSummary: Object.fromEntries(url.searchParams.entries()),
      }),
    },
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-logs-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
