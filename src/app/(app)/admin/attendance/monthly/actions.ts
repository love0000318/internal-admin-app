"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  assertValidYearMonth,
  getMonthlyAttendanceSummary,
} from "@/lib/attendance/monthly-summary";
import {
  isAttendanceMonthlyCloseEnabled,
  isAttendanceMonthlyCloseSchemaError,
} from "@/lib/attendance/monthly-close-availability";
import { notifyUsers } from "@/lib/notifications/notifications";
import { requireOwner } from "@/lib/rbac/server-guards";
import { assertStepUpPassword } from "@/lib/security/step-up";

function formValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function parseYearMonth(formData: FormData) {
  const year = Number.parseInt(formValue(formData, "year"), 10);
  const month = Number.parseInt(formValue(formData, "month"), 10);
  assertValidYearMonth(year, month);
  return { year, month };
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function monthlyPath(year: number, month: number) {
  return `/admin/attendance/monthly?year=${year}&month=${month}`;
}

export async function closeAttendanceMonthAction(formData: FormData) {
  const actor = await requireOwner();
  const prisma = getPrisma();
  const { year, month } = parseYearMonth(formData);
  const memo = formValue(formData, "memo") || null;
  const forceCloseWithWarnings =
    formValue(formData, "forceCloseWithWarnings") === "true";

  if (!isAttendanceMonthlyCloseEnabled()) {
    redirect(`${monthlyPath(year, month)}&error=db-not-ready`);
  }

  try {
    await assertStepUpPassword({
      userId: actor.id,
      purpose: "POLICY_CHANGE",
      password: formValue(formData, "stepUpPassword"),
    });
  } catch {
    redirect(`${monthlyPath(year, month)}&error=step-up-required`);
  }

  const summary = await getMonthlyAttendanceSummary({
    year,
    month,
    actor,
    prisma,
  });
  const warningCount =
    summary.summary.missingCheckInCount +
    summary.summary.missingCheckOutCount +
    summary.summary.absentCount +
    summary.summary.changeRequestPendingCount;

  if (warningCount > 0 && !forceCloseWithWarnings) {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        action: "ATTENDANCE_MONTH_CLOSE_BLOCKED",
        category: "ATTENDANCE",
        severity: "WARNING",
        targetType: "ATTENDANCE_MONTHLY_CLOSE",
        metadata: json({
          year,
          month,
          reasonCode: "MONTH_HAS_WARNINGS",
          summaryCounts: summary.summary,
        }),
      },
    });
    redirect(`${monthlyPath(year, month)}&error=warnings`);
  }

  let close;

  try {
    close = await prisma.attendanceMonthlyClose.upsert({
      where: { year_month: { year, month } },
      create: {
        year,
        month,
        status: "CLOSED",
        closedByUserId: actor.id,
        closedAt: new Date(),
        reopenedByUserId: null,
        reopenedAt: null,
        memo,
      },
      update: {
        status: "CLOSED",
        closedByUserId: actor.id,
        closedAt: new Date(),
        reopenedByUserId: null,
        reopenedAt: null,
        memo,
      },
    });
  } catch (error) {
    if (isAttendanceMonthlyCloseSchemaError(error)) {
      redirect(`${monthlyPath(year, month)}&error=db-not-ready`);
    }

    throw error;
  }

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "ATTENDANCE_MONTH_CLOSED",
      category: "ATTENDANCE",
      severity: warningCount > 0 ? "WARNING" : "INFO",
      targetType: "ATTENDANCE_MONTHLY_CLOSE",
      targetId: close.id,
      metadata: json({
        year,
        month,
        summaryCounts: summary.summary,
        forceCloseWithWarnings,
        warningCount,
      }),
    },
  });

  const administrators = await prisma.user.findMany({
    where: { status: "ACTIVE", role: { in: ["OWNER", "LEAD"] } },
    select: { id: true },
  });

  await notifyUsers({
    recipientUserIds: administrators.map((admin) => admin.id),
    type: "ATTENDANCE_MONTH_CLOSED",
    priority: warningCount > 0 ? "HIGH" : "NORMAL",
    title: "근태 월별 마감이 완료되었습니다.",
    message: `${year}년 ${month}월 근태가 마감되었습니다.`,
    linkUrl: monthlyPath(year, month),
    metadata: json({
      deduplicationKey: `attendance-month-closed:${year}-${month}:${close.id}`,
      year,
      month,
      warningCount,
      forceCloseWithWarnings,
    }),
  });

  revalidatePath("/admin/attendance/monthly");
  redirect(`${monthlyPath(year, month)}&success=closed`);
}

export async function reopenAttendanceMonthAction(formData: FormData) {
  const actor = await requireOwner();
  const prisma = getPrisma();
  const { year, month } = parseYearMonth(formData);
  const memo = formValue(formData, "memo") || null;

  if (!isAttendanceMonthlyCloseEnabled()) {
    redirect(`${monthlyPath(year, month)}&error=db-not-ready`);
  }

  try {
    await assertStepUpPassword({
      userId: actor.id,
      purpose: "POLICY_CHANGE",
      password: formValue(formData, "stepUpPassword"),
    });
  } catch {
    redirect(`${monthlyPath(year, month)}&error=step-up-required`);
  }

  let before;

  try {
    before = await prisma.attendanceMonthlyClose.findUnique({
      where: { year_month: { year, month } },
    });
  } catch (error) {
    if (isAttendanceMonthlyCloseSchemaError(error)) {
      redirect(`${monthlyPath(year, month)}&error=db-not-ready`);
    }

    throw error;
  }

  if (!before || before.status !== "CLOSED") {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        action: "ATTENDANCE_MONTH_REOPEN_BLOCKED",
        category: "ATTENDANCE",
        severity: "WARNING",
        targetType: "ATTENDANCE_MONTHLY_CLOSE",
        targetId: before?.id,
        metadata: json({
          year,
          month,
          reasonCode: "MONTH_NOT_CLOSED",
        }),
      },
    });
    redirect(`${monthlyPath(year, month)}&error=not-closed`);
  }

  let close;

  try {
    close = await prisma.attendanceMonthlyClose.update({
      where: { year_month: { year, month } },
      data: {
        status: "REOPENED",
        reopenedByUserId: actor.id,
        reopenedAt: new Date(),
        memo,
      },
    });
  } catch (error) {
    if (isAttendanceMonthlyCloseSchemaError(error)) {
      redirect(`${monthlyPath(year, month)}&error=db-not-ready`);
    }

    throw error;
  }

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "ATTENDANCE_MONTH_REOPENED",
      category: "ATTENDANCE",
      severity: "WARNING",
      targetType: "ATTENDANCE_MONTHLY_CLOSE",
      targetId: close.id,
      metadata: json({ year, month }),
    },
  });

  const administrators = await prisma.user.findMany({
    where: { status: "ACTIVE", role: { in: ["OWNER", "LEAD"] } },
    select: { id: true },
  });

  await notifyUsers({
    recipientUserIds: administrators.map((admin) => admin.id),
    type: "ATTENDANCE_MONTH_REOPENED",
    priority: "HIGH",
    title: "근태 월별 마감이 해제되었습니다.",
    message: `${year}년 ${month}월 근태 마감이 해제되었습니다.`,
    linkUrl: monthlyPath(year, month),
    metadata: json({
      deduplicationKey: `attendance-month-reopened:${year}-${month}:${close.id}`,
      year,
      month,
    }),
  });

  revalidatePath("/admin/attendance/monthly");
  redirect(`${monthlyPath(year, month)}&success=reopened`);
}
