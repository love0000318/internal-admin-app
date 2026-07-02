"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getPrisma } from "@/lib/db/prisma";
import { getUserLeaveBalance } from "@/lib/leave/queries";
import {
  buildAnnualUsePlanReviewAuditMetadata,
  canReviewAnnualUsePlan,
  deriveAnnualUsePlanReviewState,
  hydrateAnnualUsePlanReviewActor,
  listAnnualUsePlanReviewLogs,
  notifyAnnualUsePlanReviewConfirmed,
  notifyAnnualUsePlanRevisionRequested,
  sanitizeRevisionReason,
} from "@/lib/leave/annual-use-plan-review";
import { USE_PLAN_NOTICE_TYPES } from "@/lib/notifications/annual-use-plan-notifications";
import { requireOwnerOrLead } from "@/lib/rbac/server-guards";

function stringValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function redirectToPromotions(referenceYear: number, result: string): never {
  redirect(`/admin/leaves/promotions?year=${referenceYear}&result=${result}`);
}

async function getReviewablePlan(planId: string) {
  const prisma = getPrisma();
  const actor = await requireOwnerOrLead();
  const scopedActor = await hydrateAnnualUsePlanReviewActor(actor, prisma);
  const plan = await prisma.annualLeaveUsePlan.findUnique({
    where: { id: planId },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          status: true,
          teamId: true,
          name: true,
        },
      },
    },
  });

  if (!plan) {
    redirect("/admin/leaves/promotions?result=not-found");
  }

  if (!canReviewAnnualUsePlan(scopedActor, plan.user)) {
    redirect("/forbidden");
  }

  return { actor, plan, prisma };
}

export async function confirmAnnualLeaveUsePlan(formData: FormData) {
  const planId = stringValue(formData, "planId");

  if (!planId) {
    redirect("/admin/leaves/promotions?result=invalid");
  }

  const { actor, plan, prisma } = await getReviewablePlan(planId);
  const [logs, balance] = await Promise.all([
    listAnnualUsePlanReviewLogs({ planIds: [plan.id], prisma }),
    getUserLeaveBalance({ userId: plan.userId, year: plan.referenceYear, prisma }),
  ]);
  const currentState = deriveAnnualUsePlanReviewState({ plan, logs });

  if (!currentState.canReviewerAct) {
    redirectToPromotions(plan.referenceYear, "not-reviewable");
  }

  const reviewedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.annualLeavePromotionNotice.updateMany({
      where: {
        userId: plan.userId,
        referenceYear: plan.referenceYear,
        noticeType: { in: USE_PLAN_NOTICE_TYPES },
      },
      data: {
        annualLeaveUsePlanId: plan.id,
        submittedAt: plan.submittedAt ?? reviewedAt,
        adminConfirmedAt: reviewedAt,
        adminConfirmedByUserId: actor.id,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        targetUserId: plan.userId,
        action: "ANNUAL_LEAVE_USE_PLAN_UPDATED",
        targetType: "ANNUAL_LEAVE_USE_PLAN",
        targetId: plan.id,
        metadata: buildAnnualUsePlanReviewAuditMetadata({
          annualLeaveUsePlanId: plan.id,
          userId: plan.userId,
          referenceYear: plan.referenceYear,
          actionType: "CONFIRMED",
          previousStatus: currentState.status,
          nextStatus: "CONFIRMED",
          reviewerUserId: actor.id,
          reviewedAt,
          totalPlannedAmount: plan.totalPlannedAmount,
          remainingDays: balance.remainingDays,
        }),
      },
    });

    await notifyAnnualUsePlanReviewConfirmed({
      plan,
      reviewerName: actor.name,
      reviewedAt,
      prisma: tx,
    });
  });

  revalidatePath("/admin/leaves/promotions");
  revalidatePath("/admin/reports/leaves/promotions");
  revalidatePath("/leaves/me/use-plan");

  redirectToPromotions(plan.referenceYear, "confirmed");
}

export async function requestAnnualLeaveUsePlanRevision(formData: FormData) {
  const planId = stringValue(formData, "planId");
  const revisionReason = sanitizeRevisionReason(
    stringValue(formData, "revisionReason"),
  );

  if (!planId) {
    redirect("/admin/leaves/promotions?result=invalid");
  }

  const { actor, plan, prisma } = await getReviewablePlan(planId);

  if (!revisionReason) {
    redirectToPromotions(plan.referenceYear, "revision-reason-required");
  }

  const logs = await listAnnualUsePlanReviewLogs({ planIds: [plan.id], prisma });
  const currentState = deriveAnnualUsePlanReviewState({ plan, logs });

  if (!currentState.canReviewerAct) {
    redirectToPromotions(plan.referenceYear, "not-reviewable");
  }

  const reviewedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        targetUserId: plan.userId,
        action: "ANNUAL_LEAVE_USE_PLAN_UPDATED",
        targetType: "ANNUAL_LEAVE_USE_PLAN",
        targetId: plan.id,
        metadata: buildAnnualUsePlanReviewAuditMetadata({
          annualLeaveUsePlanId: plan.id,
          userId: plan.userId,
          referenceYear: plan.referenceYear,
          actionType: "REVISION_REQUESTED",
          previousStatus: currentState.status,
          nextStatus: "REVISION_REQUESTED",
          reviewerUserId: actor.id,
          reviewedAt,
          revisionReason,
          totalPlannedAmount: plan.totalPlannedAmount,
        }),
      },
    });

    await notifyAnnualUsePlanRevisionRequested({
      plan,
      reviewerName: actor.name,
      reviewedAt,
      revisionReason,
      prisma: tx,
    });
  });

  revalidatePath("/admin/leaves/promotions");
  revalidatePath("/admin/reports/leaves/promotions");
  revalidatePath("/leaves/me/use-plan");

  redirectToPromotions(plan.referenceYear, "revision-requested");
}
