"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { dateOnlyToDate } from "@/lib/leave/calculate-business-days";
import type { DateOnly } from "@/lib/leave/types";
import { getPrisma } from "@/lib/db/prisma";
import {
  companyHolidaySchema,
  leaveAdjustmentSchema,
  leavePolicyUpdateSchema,
  optionalNumber,
  optionalString,
} from "@/lib/leave/validation";
import { recordLeaveAdjustmentLedger } from "@/lib/leave/ledger";
import { requireOwner } from "@/lib/rbac/server-guards";

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getRequiredFormValue(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function redirectToSettings(error: string): never {
  redirect(`/admin/leaves/settings?error=${error}`);
}

function redirectToHolidays(error: string): never {
  redirect(`/admin/leaves/holidays?error=${error}`);
}

function redirectToBalances(error: string): never {
  redirect(`/admin/leaves/balances?error=${error}`);
}

export async function updateLeavePolicy(formData: FormData) {
  const actor = await requireOwner();
  const parsed = leavePolicyUpdateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: optionalString(formData.get("description")),
    maxDaysPerYear: optionalNumber(formData.get("maxDaysPerYear")),
    minRequestDays: optionalNumber(formData.get("minRequestDays")),
    maxRequestDays: optionalNumber(formData.get("maxRequestDays")),
  });

  if (!parsed.success) {
    redirectToSettings("invalid");
  }

  const minRequestDays = parsed.data.minRequestDays ?? null;
  const maxRequestDays = parsed.data.maxRequestDays ?? null;
  if (
    minRequestDays !== null &&
    maxRequestDays !== null &&
    minRequestDays > maxRequestDays
  ) {
    redirectToSettings("invalid-range");
  }

  const prisma = getPrisma();
  const before = await prisma.leavePolicy.findUnique({
    where: { id: parsed.data.id },
  });

  if (!before) {
    redirectToSettings("not-found");
  }

  const deductsAnnual = checked(formData, "deductsAnnualBalance");
  const after = await prisma.leavePolicy.update({
    where: { id: before.id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      deductsAnnual,
      deductsAnnualBalance: deductsAnnual,
      requiresAttachment: checked(formData, "requiresAttachment"),
      isEnabled: checked(formData, "isEnabled"),
      maxDaysPerYear: parsed.data.maxDaysPerYear ?? null,
      minRequestDays,
      maxRequestDays,
      maxDaysPerRequest: maxRequestDays,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "LEAVE_POLICY_UPDATED",
      targetType: "LEAVE_POLICY",
      targetId: after.id,
      metadata: toJsonValue({
        leavePolicyId: after.id,
        before: {
          name: before.name,
          deductsAnnualBalance: before.deductsAnnualBalance,
          requiresAttachment: before.requiresAttachment,
          maxDaysPerYear: before.maxDaysPerYear,
          minRequestDays: before.minRequestDays,
          maxRequestDays: before.maxRequestDays,
          isEnabled: before.isEnabled,
        },
        after: {
          name: after.name,
          deductsAnnualBalance: after.deductsAnnualBalance,
          requiresAttachment: after.requiresAttachment,
          maxDaysPerYear: after.maxDaysPerYear,
          minRequestDays: after.minRequestDays,
          maxRequestDays: after.maxRequestDays,
          isEnabled: after.isEnabled,
        },
      }),
    },
  });

  revalidatePath("/admin/leaves/settings");
  redirect("/admin/leaves/settings?success=policy-updated");
}

export async function createCompanyHoliday(formData: FormData) {
  const actor = await requireOwner();
  const parsed = companyHolidaySchema.safeParse({
    date: formData.get("date"),
    name: formData.get("name"),
  });

  if (!parsed.success) {
    redirectToHolidays("invalid");
  }

  const prisma = getPrisma();
  const existing = await prisma.companyHoliday.findUnique({
    where: { date: dateOnlyToDate(parsed.data.date as DateOnly) },
  });

  if (existing?.isEnabled) {
    redirectToHolidays("duplicate");
  }

  const holiday = existing
    ? await prisma.companyHoliday.update({
        where: { id: existing.id },
        data: {
          name: parsed.data.name,
          isPaidHoliday: checked(formData, "isPaidHoliday"),
          isEnabled: true,
        },
      })
    : await prisma.companyHoliday.create({
        data: {
          date: dateOnlyToDate(parsed.data.date as DateOnly),
          name: parsed.data.name,
          isPaidHoliday: checked(formData, "isPaidHoliday"),
          isEnabled: true,
        },
      });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: existing ? "COMPANY_HOLIDAY_UPDATED" : "COMPANY_HOLIDAY_CREATED",
      targetType: "COMPANY_HOLIDAY",
      targetId: holiday.id,
      metadata: toJsonValue({
        companyHolidayId: holiday.id,
        before: existing
          ? {
              name: existing.name,
              isPaidHoliday: existing.isPaidHoliday,
              isEnabled: existing.isEnabled,
            }
          : null,
        after: {
          date: parsed.data.date,
          name: holiday.name,
          isPaidHoliday: holiday.isPaidHoliday,
          isEnabled: holiday.isEnabled,
        },
      }),
    },
  });

  revalidatePath("/admin/leaves/holidays");
  redirect("/admin/leaves/holidays?success=holiday-created");
}

export async function updateCompanyHoliday(formData: FormData) {
  const actor = await requireOwner();
  const holidayId = getRequiredFormValue(formData, "holidayId");
  const parsed = companyHolidaySchema.safeParse({
    date: formData.get("date"),
    name: formData.get("name"),
  });

  if (!holidayId || !parsed.success) {
    redirectToHolidays("invalid");
  }

  const prisma = getPrisma();
  const before = await prisma.companyHoliday.findUnique({
    where: { id: holidayId },
  });

  if (!before) {
    redirectToHolidays("not-found");
  }

  const duplicate = await prisma.companyHoliday.findFirst({
    where: {
      id: { not: holidayId },
      date: dateOnlyToDate(parsed.data.date as DateOnly),
    },
  });

  if (duplicate) {
    redirectToHolidays("duplicate");
  }

  const holiday = await prisma.companyHoliday.update({
    where: { id: holidayId },
    data: {
      date: dateOnlyToDate(parsed.data.date as DateOnly),
      name: parsed.data.name,
      isPaidHoliday: checked(formData, "isPaidHoliday"),
      isEnabled: checked(formData, "isEnabled"),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "COMPANY_HOLIDAY_UPDATED",
      targetType: "COMPANY_HOLIDAY",
      targetId: holiday.id,
      metadata: toJsonValue({
        companyHolidayId: holiday.id,
        before: {
          date: before.date,
          name: before.name,
          isPaidHoliday: before.isPaidHoliday,
          isEnabled: before.isEnabled,
        },
        after: {
          date: holiday.date,
          name: holiday.name,
          isPaidHoliday: holiday.isPaidHoliday,
          isEnabled: holiday.isEnabled,
        },
      }),
    },
  });

  revalidatePath("/admin/leaves/holidays");
  redirect("/admin/leaves/holidays?success=holiday-updated");
}

export async function deactivateCompanyHoliday(formData: FormData) {
  const actor = await requireOwner();
  const holidayId = getRequiredFormValue(formData, "holidayId");

  if (!holidayId) {
    redirectToHolidays("invalid");
  }

  const prisma = getPrisma();
  const before = await prisma.companyHoliday.findUnique({
    where: { id: holidayId },
  });

  if (!before) {
    redirectToHolidays("not-found");
  }

  const holiday = await prisma.companyHoliday.update({
    where: { id: holidayId },
    data: { isEnabled: false },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "COMPANY_HOLIDAY_DEACTIVATED",
      targetType: "COMPANY_HOLIDAY",
      targetId: holiday.id,
      metadata: toJsonValue({
        companyHolidayId: holiday.id,
        before: { isEnabled: before.isEnabled },
        after: { isEnabled: holiday.isEnabled },
      }),
    },
  });

  revalidatePath("/admin/leaves/holidays");
  redirect("/admin/leaves/holidays?success=holiday-deactivated");
}

export async function createLeaveAdjustment(formData: FormData) {
  const actor = await requireOwner();
  const parsed = leaveAdjustmentSchema.safeParse({
    userId: formData.get("userId"),
    year: formData.get("year"),
    amount: formData.get("amount"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    redirectToBalances("invalid");
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
  });

  if (!user || user.status !== "ACTIVE") {
    redirectToBalances("user-not-found");
  }

  await prisma.$transaction(async (tx) => {
    const created = await tx.leaveAdjustment.create({
      data: {
        userId: user.id,
        fiscalYear: parsed.data.year,
        year: parsed.data.year,
        days: parsed.data.amount,
        amount: parsed.data.amount,
        reason: parsed.data.reason,
        createdById: actor.id,
        createdByUserId: actor.id,
      },
    });

    await recordLeaveAdjustmentLedger({
      tx,
      adjustment: created,
      createdByUserId: actor.id,
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        targetUserId: user.id,
        action: "LEAVE_ADJUSTMENT_CREATED",
        targetType: "LEAVE_ADJUSTMENT",
        targetId: created.id,
        metadata: toJsonValue({
          leaveAdjustmentId: created.id,
          targetUserId: user.id,
          year: parsed.data.year,
          amount: parsed.data.amount,
          reason: parsed.data.reason,
        }),
      },
    });

    return created;
  });

  revalidatePath("/admin/leaves/balances");
  redirect(`/admin/leaves/balances?success=adjustment-created&year=${parsed.data.year}`);
}
