"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  getUsePlanContext,
  scheduleUsePlanReminderNotices,
  validateUsePlanItems,
} from "@/lib/leave/annual-promotion";
import { requireRouteAccess } from "@/lib/rbac/server-guards";
import type { DateOnly, HalfDayPeriod } from "@/lib/leave/types";

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
    plannedDate: DateOnly;
    amount: number;
    halfDayPeriod: HalfDayPeriod | null;
    memo: string | null;
  }> = [];

  for (let index = 0; index < 5; index += 1) {
    const plannedDate = stringValue(formData, `plannedDate_${index}`);
    const amountValue = stringValue(formData, `amount_${index}`);
    const amount = Number(amountValue);
    const halfDayPeriod = stringValue(formData, `halfDayPeriod_${index}`);
    const memo = stringValue(formData, `memo_${index}`);

    if (!plannedDate && !amountValue) {
      continue;
    }

    if (!plannedDate || !Number.isFinite(amount)) {
      redirectToUsePlan("invalid-item");
    }

    items.push({
      plannedDate: plannedDate as DateOnly,
      amount,
      halfDayPeriod:
        halfDayPeriod === "AM" || halfDayPeriod === "PM" ? halfDayPeriod : null,
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
  let totalPlannedAmount: number;

  try {
    totalPlannedAmount = validateUsePlanItems({
      items,
      maxAmount: context.expiringAmount,
    });
  } catch {
    redirectToUsePlan("invalid-item");
  }

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
      data: items.map((item) => ({
        usePlanId: savedPlan.id,
        plannedDate: new Date(`${item.plannedDate}T00:00:00.000Z`),
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
