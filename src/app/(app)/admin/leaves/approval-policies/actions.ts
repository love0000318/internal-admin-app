"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { requireOwner } from "@/lib/rbac/server-guards";

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function textValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(formData: FormData, name: string) {
  const value = textValue(formData, name);
  return value.length > 0 ? value : null;
}

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

function redirectToPolicies(error: string): never {
  redirect(`/admin/leaves/approval-policies?error=${error}`);
}

function policyPayload(formData: FormData) {
  const name = textValue(formData, "name");
  const code = normalizeCode(textValue(formData, "code") || name);
  const approvalMode = textValue(formData, "approvalMode");
  const approverRule = textValue(formData, "approverRule");
  const appliesTo = textValue(formData, "appliesTo") || "LEAVE_REQUEST";
  const customApproverUserId = optionalText(formData, "customApproverUserId");
  const autoConfirmTiming = textValue(formData, "autoConfirmTiming") || "ON_START_DATE";

  if (!name || !code) {
    redirectToPolicies("invalid");
  }

  if (!["LEAVE_REQUEST", "LEAVE_CANCEL"].includes(appliesTo)) {
    redirectToPolicies("invalid");
  }

  if (!["NONE", "SINGLE", "SEQUENTIAL"].includes(approvalMode)) {
    redirectToPolicies("invalid");
  }

  if (!["OWNER", "TEAM_LEAD", "TEAM_LEAD_OR_OWNER", "CUSTOM_USER"].includes(approverRule)) {
    redirectToPolicies("invalid");
  }

  if (!["ON_START_DATE", "AFTER_START_DATE"].includes(autoConfirmTiming)) {
    redirectToPolicies("invalid");
  }

  if (approverRule === "CUSTOM_USER" && !customApproverUserId) {
    redirectToPolicies("custom-approver-required");
  }

  return {
    code,
    name,
    description: optionalText(formData, "description"),
    appliesTo: appliesTo as "LEAVE_REQUEST" | "LEAVE_CANCEL",
    approvalMode: approvalMode as "NONE" | "SINGLE" | "SEQUENTIAL",
    approverRule: approverRule as "OWNER" | "TEAM_LEAD" | "TEAM_LEAD_OR_OWNER" | "CUSTOM_USER",
    customApproverUserId,
    requireCommentOnReject: checked(formData, "requireCommentOnReject"),
    requireCommentOnCancel: checked(formData, "requireCommentOnCancel"),
    requireAttachmentAcceptedBeforeApproval: checked(
      formData,
      "requireAttachmentAcceptedBeforeApproval",
    ),
    autoApproveIfNoApprover: checked(formData, "autoApproveIfNoApprover"),
    autoConfirmWhenStartDatePassed: checked(formData, "autoConfirmWhenStartDatePassed"),
    autoConfirmTiming: autoConfirmTiming as "ON_START_DATE" | "AFTER_START_DATE",
    isEnabled: checked(formData, "isEnabled"),
  };
}

export async function createApprovalPolicy(formData: FormData) {
  const actor = await requireOwner();
  const payload = policyPayload(formData);
  const prisma = getPrisma();

  const existing = await prisma.approvalPolicy.findUnique({
    where: { code: payload.code },
  });

  if (existing) {
    redirectToPolicies("duplicate-code");
  }

  const created = await prisma.approvalPolicy.create({ data: payload });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "APPROVAL_POLICY_CREATED",
      targetType: "APPROVAL_POLICY",
      targetId: created.id,
      metadata: toJsonValue({
        policyId: created.id,
        code: created.code,
        after: created,
      }),
    },
  });

  revalidatePath("/admin/leaves/approval-policies");
  redirect("/admin/leaves/approval-policies?success=created");
}

export async function updateApprovalPolicy(formData: FormData) {
  const actor = await requireOwner();
  const id = textValue(formData, "id");
  const payload = policyPayload(formData);

  if (!id) {
    redirectToPolicies("invalid");
  }

  const prisma = getPrisma();
  const before = await prisma.approvalPolicy.findUnique({ where: { id } });

  if (!before) {
    redirectToPolicies("not-found");
  }

  if (before.code !== payload.code) {
    const existing = await prisma.approvalPolicy.findUnique({
      where: { code: payload.code },
    });

    if (existing) {
      redirectToPolicies("duplicate-code");
    }
  }

  const after = await prisma.approvalPolicy.update({
    where: { id },
    data: payload,
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "APPROVAL_POLICY_UPDATED",
      targetType: "APPROVAL_POLICY",
      targetId: after.id,
      metadata: toJsonValue({
        policyId: after.id,
        code: after.code,
        before,
        after,
        changedFields: Object.keys(payload).filter(
          (key) => before[key as keyof typeof before] !== after[key as keyof typeof after],
        ),
      }),
    },
  });

  revalidatePath("/admin/leaves/approval-policies");
  redirect("/admin/leaves/approval-policies?success=updated");
}

export async function deactivateApprovalPolicy(formData: FormData) {
  const actor = await requireOwner();
  const id = textValue(formData, "id");

  if (!id) {
    redirectToPolicies("invalid");
  }

  const prisma = getPrisma();
  const before = await prisma.approvalPolicy.findUnique({ where: { id } });

  if (!before) {
    redirectToPolicies("not-found");
  }

  const after = await prisma.approvalPolicy.update({
    where: { id },
    data: { isEnabled: false },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "APPROVAL_POLICY_DEACTIVATED",
      targetType: "APPROVAL_POLICY",
      targetId: after.id,
      metadata: toJsonValue({
        policyId: after.id,
        code: after.code,
        before: { isEnabled: before.isEnabled },
        after: { isEnabled: after.isEnabled },
      }),
    },
  });

  revalidatePath("/admin/leaves/approval-policies");
  redirect("/admin/leaves/approval-policies?success=deactivated");
}

export async function updateLeaveTypeApprovalPolicy(formData: FormData) {
  const actor = await requireOwner();
  const leaveTypeId = textValue(formData, "leaveTypeId");
  const approvalPolicyId = textValue(formData, "approvalPolicyId");

  if (!leaveTypeId || !approvalPolicyId) {
    redirectToPolicies("invalid");
  }

  const prisma = getPrisma();
  const before = await prisma.leaveTypeDefinition.findUnique({
    where: { id: leaveTypeId },
    include: { approvalPolicy: true },
  });
  const policy = await prisma.approvalPolicy.findUnique({
    where: { id: approvalPolicyId },
  });

  if (!before || !policy || !policy.isEnabled) {
    redirectToPolicies("not-found");
  }

  const after = await prisma.leaveTypeDefinition.update({
    where: { id: leaveTypeId },
    data: { approvalPolicyId },
    include: { approvalPolicy: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "LEAVE_TYPE_APPROVAL_POLICY_UPDATED",
      targetType: "LEAVE_TYPE",
      targetId: after.id,
      metadata: toJsonValue({
        leaveTypeId: after.id,
        leaveTypeCode: after.code,
        before: { approvalPolicyId: before.approvalPolicyId },
        after: { approvalPolicyId: after.approvalPolicyId },
        policyId: approvalPolicyId,
      }),
    },
  });

  revalidatePath("/admin/leaves/approval-policies");
  redirect("/admin/leaves/approval-policies?success=linked");
}
