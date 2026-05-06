"use server";

import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import {
  assertAttendanceMonthOpen,
  getYearMonthFromDate,
} from "@/lib/attendance/monthly-summary";
import { requireUser } from "@/lib/rbac/server-guards";
import { getPrisma } from "@/lib/db/prisma";
import { notifyUsers } from "@/lib/notifications/notifications";
import { canLeadManageUser } from "@/lib/organization/permissions";

function value(formData: FormData, name: string) {
  const formValue = formData.get(name);
  return typeof formValue === "string" ? formValue : "";
}

function json(input: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
}

export async function createAttendanceChangeRequestAction(formData: FormData) {
  const actor = await requireUser();

  if (actor.role === "EXTERNAL_PARTNER") {
    redirect("/forbidden");
  }

  const workDateValue = value(formData, "workDate");
  const reason = value(formData, "reason");

  if (!workDateValue || !reason) {
    redirect("/attendance/history?error=invalid");
  }

  const workDate = new Date(`${workDateValue}T00:00:00.000Z`);
  const { year, month } = getYearMonthFromDate(workDate);
  const prisma = getPrisma();

  try {
    await assertAttendanceMonthOpen({ year, month, prisma });
  } catch {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        targetUserId: actor.id,
        action: "ATTENDANCE_CHANGE_REQUEST_BLOCKED_BY_MONTH_CLOSE",
        category: "ATTENDANCE",
        severity: "WARNING",
        targetType: "ATTENDANCE_CHANGE_REQUEST",
        metadata: json({
          year,
          month,
          workDate: workDateValue,
          reasonCode: "MONTH_CLOSED",
        }),
      },
    });
    redirect("/attendance/history?error=month-closed");
  }

  const request = await prisma.attendanceChangeRequest.create({
    data: {
      userId: actor.id,
      workDate,
      reason,
      requestedCheckInAt: value(formData, "requestedCheckInAt")
        ? new Date(value(formData, "requestedCheckInAt"))
        : null,
      requestedCheckOutAt: value(formData, "requestedCheckOutAt")
        ? new Date(value(formData, "requestedCheckOutAt"))
        : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      targetUserId: actor.id,
      action: "ATTENDANCE_CHANGE_REQUEST_CREATED",
      category: "ATTENDANCE",
      targetType: "ATTENDANCE_CHANGE_REQUEST",
      targetId: request.id,
      metadata: json({ year, month, workDate: workDateValue }),
    },
  });

  const candidateReviewers = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: { in: ["OWNER", "LEAD"] },
    },
    select: { id: true, role: true },
  });
  const leadVisibility = await Promise.all(
    candidateReviewers.map(async (reviewer) => ({
      id: reviewer.id,
      canView:
        reviewer.role === "OWNER" ||
        (reviewer.role === "LEAD" && (await canLeadManageUser(reviewer.id, actor.id, prisma))),
    })),
  );

  await notifyUsers({
    recipientUserIds: leadVisibility
      .filter((reviewer) => reviewer.canView)
      .map((reviewer) => reviewer.id),
    type: "ATTENDANCE_CHANGE_REQUEST_CREATED",
    priority: "NORMAL",
    title: "근태 수정 요청이 등록되었습니다.",
    message: "구성원이 근태 기록 수정을 요청했습니다.",
    linkUrl: "/admin/attendance/change-requests",
    metadata: json({
      deduplicationKey: `attendance-change-request:${request.id}`,
      attendanceChangeRequestId: request.id,
      requesterId: actor.id,
      year,
      month,
      workDate: workDateValue,
    }),
  });

  redirect("/attendance/history?success=request-created");
}
