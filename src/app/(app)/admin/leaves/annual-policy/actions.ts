"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { annualLeavePolicySchema } from "@/lib/leave/annual-policy";
import { requireOwner } from "@/lib/rbac/server-guards";

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function stringValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function nullableStringValue(formData: FormData, name: string) {
  const value = stringValue(formData, name).trim();
  return value.length > 0 ? value : null;
}

function numberValue(formData: FormData, name: string) {
  const parsed = Number(stringValue(formData, name));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function redirectToPolicy(error: string): never {
  redirect(`/admin/leaves/annual-policy?error=${error}`);
}

export async function updateAnnualLeavePolicy(formData: FormData) {
  const actor = await requireOwner();
  const parsed = annualLeavePolicySchema.safeParse({
    id: stringValue(formData, "id"),
    isEnabled: checked(formData, "isEnabled"),
    grantBasis: stringValue(formData, "grantBasis"),
    fiscalYearStartMonth: numberValue(formData, "fiscalYearStartMonth"),
    fiscalYearStartDay: numberValue(formData, "fiscalYearStartDay"),
    usageUnit: stringValue(formData, "usageUnit"),
    allowAdvanceUse: checked(formData, "allowAdvanceUse"),
    approvalOnRequest: checked(formData, "approvalOnRequest"),
    approvalOnCancel: checked(formData, "approvalOnCancel"),
    monthlyLeaveEnabled: checked(formData, "monthlyLeaveEnabled"),
    monthlyLeaveAmount: numberValue(formData, "monthlyLeaveAmount"),
    monthlyLeaveGrantRule: stringValue(formData, "monthlyLeaveGrantRule"),
    firstFiscalYearGrantRule: stringValue(formData, "firstFiscalYearGrantRule"),
    annualLeaveEnabled: checked(formData, "annualLeaveEnabled"),
    baseAnnualDays: numberValue(formData, "baseAnnualDays"),
    maxAnnualDays: numberValue(formData, "maxAnnualDays"),
    additionalGrantEnabled: checked(formData, "additionalGrantEnabled"),
    expirationEnabled: checked(formData, "expirationEnabled"),
    annualExpirationMonths: numberValue(formData, "annualExpirationMonths"),
    monthlyExpirationMonths: numberValue(formData, "monthlyExpirationMonths"),
    carryOverAllowed: checked(formData, "carryOverAllowed"),
    promotionEnabled: checked(formData, "promotionEnabled"),
    promotionApproverUserId: nullableStringValue(formData, "promotionApproverUserId"),
    memberReminderEnabled: checked(formData, "memberReminderEnabled"),
    managerReminderEnabled: checked(formData, "managerReminderEnabled"),
    usePlanReminderDaysBefore: numberValue(formData, "usePlanReminderDaysBefore"),
    annualPromotionMonthsBeforeExpiration: numberValue(
      formData,
      "annualPromotionMonthsBeforeExpiration",
    ),
    monthlyPromotionFirstMonthsBeforeExpiration: numberValue(
      formData,
      "monthlyPromotionFirstMonthsBeforeExpiration",
    ),
    monthlyPromotionSecondMonthsBeforeExpiration: numberValue(
      formData,
      "monthlyPromotionSecondMonthsBeforeExpiration",
    ),
    memo: nullableStringValue(formData, "memo"),
  });

  if (!parsed.success) {
    redirectToPolicy("invalid");
  }

  const data = parsed.data;

  if (data.maxAnnualDays < data.baseAnnualDays) {
    redirectToPolicy("max-less-than-base");
  }

  const prisma = getPrisma();
  const before = await prisma.annualLeavePolicy.findUnique({
    where: { id: data.id },
  });

  if (!before) {
    redirectToPolicy("not-found");
  }

  if (data.promotionApproverUserId) {
    const approver = await prisma.user.findFirst({
      where: {
        id: data.promotionApproverUserId,
        status: "ACTIVE",
        role: { in: ["OWNER", "LEAD"] },
      },
      select: { id: true },
    });

    if (!approver) {
      redirectToPolicy("invalid-approver");
    }
  }

  const after = await prisma.annualLeavePolicy.update({
    where: { id: data.id },
    data: {
      isEnabled: data.isEnabled,
      grantBasis: data.grantBasis,
      fiscalYearStartMonth: data.fiscalYearStartMonth,
      fiscalYearStartDay: data.fiscalYearStartDay,
      usageUnit: data.usageUnit,
      allowAdvanceUse: data.allowAdvanceUse,
      approvalOnRequest: data.approvalOnRequest,
      approvalOnCancel: data.approvalOnCancel,
      monthlyLeaveEnabled: data.monthlyLeaveEnabled,
      monthlyLeaveAmount: data.monthlyLeaveAmount,
      monthlyLeaveGrantRule: data.monthlyLeaveGrantRule,
      firstFiscalYearGrantRule: data.firstFiscalYearGrantRule,
      annualLeaveEnabled: data.annualLeaveEnabled,
      baseAnnualDays: data.baseAnnualDays,
      maxAnnualDays: data.maxAnnualDays,
      additionalGrantEnabled: data.additionalGrantEnabled,
      expirationEnabled: data.expirationEnabled,
      annualExpirationMonths: data.annualExpirationMonths,
      monthlyExpirationMonths: data.monthlyExpirationMonths,
      carryOverAllowed: data.carryOverAllowed,
      promotionEnabled: data.promotionEnabled,
      promotionApproverUserId: data.promotionApproverUserId,
      memberReminderEnabled: data.memberReminderEnabled,
      managerReminderEnabled: data.managerReminderEnabled,
      usePlanReminderDaysBefore: data.usePlanReminderDaysBefore,
      annualPromotionMonthsBeforeExpiration:
        data.annualPromotionMonthsBeforeExpiration,
      monthlyPromotionFirstMonthsBeforeExpiration:
        data.monthlyPromotionFirstMonthsBeforeExpiration,
      monthlyPromotionSecondMonthsBeforeExpiration:
        data.monthlyPromotionSecondMonthsBeforeExpiration,
      memo: data.memo,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "ANNUAL_LEAVE_POLICY_UPDATED",
      targetType: "ANNUAL_LEAVE_POLICY",
      targetId: after.id,
      metadata: toJsonValue({
        before: {
          grantBasis: before.grantBasis,
          fiscalYearStartMonth: before.fiscalYearStartMonth,
          fiscalYearStartDay: before.fiscalYearStartDay,
          usageUnit: before.usageUnit,
          allowAdvanceUse: before.allowAdvanceUse,
          monthlyLeaveEnabled: before.monthlyLeaveEnabled,
          promotionEnabled: before.promotionEnabled,
        },
        after: {
          grantBasis: after.grantBasis,
          fiscalYearStartMonth: after.fiscalYearStartMonth,
          fiscalYearStartDay: after.fiscalYearStartDay,
          usageUnit: after.usageUnit,
          allowAdvanceUse: after.allowAdvanceUse,
          monthlyLeaveEnabled: after.monthlyLeaveEnabled,
          promotionEnabled: after.promotionEnabled,
        },
      }),
    },
  });

  revalidatePath("/admin/leaves/annual-policy");
  revalidatePath("/admin/leaves/balances");
  revalidatePath("/leaves/me");
  redirect("/admin/leaves/annual-policy?success=updated");
}
