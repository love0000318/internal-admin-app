"use server";

import { redirect } from "next/navigation";

import { requireOwner } from "@/lib/rbac/server-guards";
import { createStepUpVerification } from "@/lib/security/step-up";

function appendStatusParam(url: string, key: "error" | "success", value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${key}=${encodeURIComponent(value)}`;
}

export async function verifyReportExportStepUp(formData: FormData) {
  const actor = await requireOwner();
  const password = formData.get("stepUpPassword");
  const returnTo = formData.get("returnTo");

  if (typeof password !== "string" || !password) {
    redirect(
      typeof returnTo === "string"
        ? appendStatusParam(returnTo, "error", "step-up-required")
        : "/admin/reports?error=step-up-required",
    );
  }

  const stepUp = await createStepUpVerification({
    userId: actor.id,
    purpose: "REPORT_EXPORT",
    password,
  });

  if (!stepUp) {
    redirect(
      typeof returnTo === "string"
        ? appendStatusParam(returnTo, "error", "step-up-required")
        : "/admin/reports?error=step-up-required",
    );
  }

  redirect(
    typeof returnTo === "string"
      ? appendStatusParam(returnTo, "success", "step-up-verified")
      : "/admin/reports?success=step-up-verified",
  );
}
