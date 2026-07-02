"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  getUsePlanContext,
  scheduleUsePlanReminderNotices,
  validateAnnualUsePlanItems,
} from "@/lib/leave/annual-promotion";
import { parseAnnualUsePlanFormItems } from "@/lib/leave/annual-use-plan-form-data";
import {
  deriveAnnualUsePlanReviewState,
  listAnnualUsePlanReviewLogs,
  notifyAnnualUsePlanSubmittedForReview,
} from "@/lib/leave/annual-use-plan-review";
import { getUserLeaveBalance, listEnabledCompanyHolidayDateOnlys } from "@/lib/leave/queries";
import { markAnnualUsePlanNoticesSubmitted } from "@/lib/notifications/annual-use-plan-notifications";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

function stringValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function redirectToUsePlan(error: string): never {
  redirect(`/leaves/me/use-plan?error=${error}`);
}

export async function submitAnnualLeaveUsePlan(formData: FormData) {
  const actor = await requireRouteAccess("/leaves/me/use-plan");
  const year = Number(stringValue(formData, "referenceYear"));
  const memo = stringValue(formData, "memo") || null;

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    redirectToUsePlan("invalid-year");
  }

  const prisma = getPrisma();
  const context = await getUsePlanContext({ userId: actor.id, year, prisma });
  const balance = await getUserLeaveBalance({ userId: actor.id, year, prisma });
  const planAvailableAmount = Math.max(0, balance.remainingDays);
  const previousReviewLogs = context.plan
    ? await listAnnualUsePlanReviewLogs({ planIds: [context.plan.id], prisma })
    : [];
  const previousReviewState = deriveAnnualUsePlanReviewState({
    plan: context.plan,
    logs: previousReviewLogs,
  });

  if (planAvailableAmount <= 0) {
    redirectToUsePlan("no-expiring-balance");
  }

  if (
    context.plan?.status === "SUBMITTED" &&
    previousReviewState.status !== "REVISION_REQUESTED"
  ) {
    redirectToUsePlan("already-submitted");
  }

  let items: ReturnType<typeof parseAnnualUsePlanFormItems>;
  try {
    items = parseAnnualUsePlanFormItems(formData);
  } catch {
    redirectToUsePlan("invalid-item");
  }

  const holidayDates =
    items.length > 0
      ? await listEnabledCompanyHolidayDateOnlys(
          items.reduce(
            (min, item) =>
              item.plannedStartDate < min ? item.plannedStartDate : min,
            items[0].plannedStartDate,
          ),
          items.reduce(
            (max, item) =>
              item.plannedEndDate > max ? item.plannedEndDate : max,
            items[0].plannedEndDate,
          ),
          prisma,
        )
      : [];

  let validated: ReturnType<typeof validateAnnualUsePlanItems>;

  try {
    validated = validateAnnualUsePlanItems({
      items,
      maxAmount: planAvailableAmount,
      companyHolidays: holidayDates,
    });
  } catch {
    redirectToUsePlan("invalid-item");
  }

  const totalPlannedAmount = validated.totalPlannedAmount;

  const plan = await prisma.$transaction(async (tx) => {
    const savedPlan = await tx.annualLeaveUsePlan.upsert({
      where: {
        userId_referenceYear: {
          userId: actor.id,
          referenceYear: year,
        },
      },
      update: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        cancelledAt: null,
        totalPlannedAmount,
        unit: "DAY",
        memo,
      },
      create: {
        userId: actor.id,
        referenceYear: year,
        status: "SUBMITTED",
        submittedAt: new Date(),
        totalPlannedAmount,
        unit: "DAY",
        memo,
      },
    });

    await tx.annualLeaveUsePlanItem.deleteMany({
      where: { usePlanId: savedPlan.id },
    });

    await tx.annualLeaveUsePlanItem.createMany({
      data: validated.items.map((item) => ({
        usePlanId: savedPlan.id,
        plannedDate: new Date(`${item.plannedDate}T00:00:00.000Z`),
        plannedStartDate: new Date(`${item.plannedStartDate}T00:00:00.000Z`),
        plannedEndDate: new Date(`${item.plannedEndDate}T00:00:00.000Z`),
        usageType: item.usageType,
        calculatedAmount: item.calculatedAmount,
        amount: item.amount,
        unit: "DAY",
        halfDayPeriod: item.halfDayPeriod,
        memo: item.memo,
      })),
    });

    const submittedAt = savedPlan.submittedAt ?? new Date();
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        targetUserId: actor.id,
        action: "ANNUAL_LEAVE_USE_PLAN_SUBMITTED",
        targetType: "ANNUAL_LEAVE_USE_PLAN",
        targetId: savedPlan.id,
        metadata:
          previousReviewState.status === "REVISION_REQUESTED"
            ? toJsonValue({
                annualLeaveUsePlanId: savedPlan.id,
                userId: actor.id,
                referenceYear: year,
                actionType: "RESUBMITTED_AFTER_REVISION",
                previousStatus: "REVISION_REQUESTED",
                nextStatus: "RESUBMITTED_AFTER_REVISION",
                resubmittedAt: submittedAt.toISOString(),
                totalPlannedAmount,
                remainingDays: balance.remainingDays,
              })
            : toJsonValue({
                annualLeaveUsePlanId: savedPlan.id,
                userId: actor.id,
                referenceYear: year,
                actionType: "SUBMITTED",
                previousStatus: previousReviewState.status,
                nextStatus: "SUBMITTED",
                totalPlannedAmount,
                itemCount: items.length,
              }),
      },
    });

    await markAnnualUsePlanNoticesSubmitted({
      userId: actor.id,
      referenceYear: year,
      usePlan: savedPlan,
      prisma: tx,
    });

    return savedPlan;
  });

  await scheduleUsePlanReminderNotices({ usePlanId: plan.id, prisma });
  await notifyAnnualUsePlanSubmittedForReview({
    plan,
    requesterName: actor.name,
    prisma,
  });

  revalidatePath("/leaves/me/use-plan");
  revalidatePath("/admin/leaves/promotions");
  revalidatePath("/admin/reports/leaves/promotions");

  redirect("/leaves/me/use-plan?success=submitted");
}

export async function cancelAnnualLeaveUsePlan(formData: FormData) {
  const actor = await requireRouteAccess("/leaves/me/use-plan");
  const planId = stringValue(formData, "planId");

  if (!planId) {
    redirectToUsePlan("invalid");
  }

  const prisma = getPrisma();
  const updated = await prisma.annualLeaveUsePlan.updateMany({
    where: {
      id: planId,
      userId: actor.id,
      status: "SUBMITTED",
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
    },
  });

  if (updated.count === 0) {
    redirectToUsePlan("not-cancellable");
  }

  await prisma.annualLeavePromotionNotice.updateMany({
    where: {
      annualLeaveUsePlanId: planId,
      status: "SCHEDULED",
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      targetUserId: actor.id,
      action: "ANNUAL_LEAVE_USE_PLAN_CANCELLED",
      targetType: "ANNUAL_LEAVE_USE_PLAN",
      targetId: planId,
      metadata: toJsonValue({ userId: actor.id }),
    },
  });

  revalidatePath("/leaves/me/use-plan");
  revalidatePath("/admin/leaves/promotions");
  revalidatePath("/admin/reports/leaves/promotions");

  redirect("/leaves/me/use-plan?success=cancelled");
}
