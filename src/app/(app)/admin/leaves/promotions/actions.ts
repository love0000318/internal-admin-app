"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AnnualUsePlanReviewError,
  reviewAnnualUsePlan,
  type AnnualUsePlanReviewActionType,
} from "@/lib/leave/annual-use-plan-review";
import { requireOwnerOrLead } from "@/lib/rbac/server-guards";

function stringValue(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value.trim() : "";
}

function safeReturnTo(value: string) {
  if (
    value === "/admin/leaves/promotions" ||
    value.startsWith("/admin/leaves/promotions?") ||
    value === "/admin/reports/leaves/promotions" ||
    value.startsWith("/admin/reports/leaves/promotions?")
  ) {
    return value;
  }

  return "/admin/reports/leaves/promotions";
}

function withSearchParam(path: string, key: string, value: string) {
  const separator = path.includes("?") ? "&" : "?";

  return `${path}${separator}${key}=${encodeURIComponent(value)}`;
}

async function handleAnnualUsePlanReview(
  formData: FormData,
  actionType: AnnualUsePlanReviewActionType,
) {
  const actor = await requireOwnerOrLead();
  const planId = stringValue(formData, "planId");
  const revisionReason = stringValue(formData, "revisionReason");
  const returnTo = safeReturnTo(stringValue(formData, "returnTo"));

  if (!planId) {
    redirect(withSearchParam(returnTo, "error", "invalid"));
  }

  try {
    await reviewAnnualUsePlan({
      actor,
      planId,
      actionType,
      revisionReason: revisionReason || null,
    });
  } catch (error) {
    const code =
      error instanceof AnnualUsePlanReviewError ? error.code : "review-failed";
    redirect(withSearchParam(returnTo, "error", code));
  }

  revalidatePath("/admin/leaves/promotions");
  revalidatePath("/admin/reports/leaves/promotions");
  revalidatePath("/leaves/me/use-plan");
  revalidatePath("/notifications");

  redirect(
    withSearchParam(
      returnTo,
      "success",
      actionType === "CONFIRMED" ? "confirmed" : "revision-requested",
    ),
  );
}

export async function confirmAnnualLeaveUsePlan(formData: FormData) {
  await handleAnnualUsePlanReview(formData, "CONFIRMED");
}

export async function requestAnnualLeaveUsePlanRevision(formData: FormData) {
  await handleAnnualUsePlanReview(formData, "REVISION_REQUESTED");
}
