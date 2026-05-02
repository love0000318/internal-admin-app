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
import {
  ANNUAL_USE_PLAN_USAGE_TYPES,
  type AnnualUsePlanUsageType,
} from "@/lib/leave/annual-use-plan-calculator";
import { listEnabledCompanyHolidayDateOnlys } from "@/lib/leave/queries";
import { requireRouteAccess } from "@/lib/rbac/server-guards";
import type { DateOnly } from "@/lib/leave/types";

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

function parseItems(formData: FormData) {
  const items: Array<{
    plannedStartDate: DateOnly;
    plannedEndDate: DateOnly;
    usageType: AnnualUsePlanUsageType;
    memo: string | null;
  }> = [];

  for (let index = 0; index < 5; index += 1) {
    const plannedStartDate = stringValue(formData, `plannedStartDate_${index}`);
    const plannedEndDate = stringValue(formData, `plannedEndDate_${index}`);
    const usageType = stringValue(formData, `usageType_${index}`);
    const memo = stringValue(formData, `memo_${index}`);

    if (!plannedStartDate && !plannedEndDate && !memo) {
      continue;
    }

    if (
      !plannedStartDate ||
      !plannedEndDate ||
      !ANNUAL_USE_PLAN_USAGE_TYPES.includes(usageType as AnnualUsePlanUsageType)
    ) {
      redirectToUsePlan("invalid-item");
    }

    items.push({
      plannedStartDate: plannedStartDate as DateOnly,
      plannedEndDate: plannedEndDate as DateOnly,
      usageType: usageType as AnnualUsePlanUsageType,
      memo: memo || null,
    });
  }

  return items;
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

  if (context.expiringAmount <= 0) {
    redirectToUsePlan("no-expiring-balance");
  }

  if (context.plan?.status === "SUBMITTED") {
    redirectToUsePlan("already-submitted");
  }

  const items = parseItems(formData);
  const holidayDates =
    items.length > 0
      ? await listEnabledCompanyHolidayDateOnlys(
          items.reduce(
            (min, item) =>
              item.plannedStartDate < min ? item.plannedStartDate : min,
            items[0].plannedStartDate,
          ),
          items.reduce(
            (max, item) => (item.plannedEndDate > max ? item.plannedEndDate : max),
            items[0].plannedEndDate,
          ),
          prisma,
        )
      : [];
  let validated: ReturnType<typeof validateAnnualUsePlanItems>;

  try {
    validated = validateAnnualUsePlanItems({
      items,
      maxAmount: context.expiringAmount,
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
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        targetUserId: actor.id,
        action: "ANNUAL_LEAVE_USE_PLAN_SUBMITTED",
        targetType: "ANNUAL_LEAVE_USE_PLAN",
        targetId: savedPlan.id,
        metadata: toJsonValue({
          userId: actor.id,
          referenceYear: year,
          totalPlannedAmount,
          itemCount: items.length,
        }),
      },
    });

    return savedPlan;
  });

  await scheduleUsePlanReminderNotices({ usePlanId: plan.id, prisma });
  revalidatePath("/leaves/me/use-plan");
  revalidatePath("/admin/leaves/promotions");
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
      metadata: { userId: actor.id },
    },
  });

  revalidatePath("/leaves/me/use-plan");
  revalidatePath("/admin/leaves/promotions");
  redirect("/leaves/me/use-plan?success=cancelled");
}
