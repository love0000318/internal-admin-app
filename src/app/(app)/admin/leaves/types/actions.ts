"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  assertSystemRequiredLeaveTypeProtection,
  changedFields,
  leaveTypeCreateSchema,
  leaveTypeUpdateSchema,
  parseAllowedUnits,
  serializeAllowedUnits,
} from "@/lib/leave/leave-types";
import { requireOwner } from "@/lib/rbac/server-guards";

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function optionalText(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formPayload(formData: FormData) {
  return {
    id: formData.get("id"),
    code: formData.get("code"),
    name: formData.get("name"),
    description: optionalText(formData.get("description")),
    category: formData.get("category"),
    isEnabled: formData.get("isEnabled"),
    isPaid: formData.get("isPaid"),
    paidRate: formData.get("paidRate"),
    grantMethod: formData.get("grantMethod"),
    grantAmount: formData.get("grantAmount"),
    grantUnit: formData.get("grantUnit"),
    usageMode: formData.get("usageMode"),
    allowedUnits: parseAllowedUnits(formData.getAll("allowedUnits")),
    unusedRemainderHandling: formData.get("unusedRemainderHandling"),
    deductsAnnualBalance: formData.get("deductsAnnualBalance"),
    attachmentPolicy: formData.get("attachmentPolicy"),
    attachmentDescription: optionalText(formData.get("attachmentDescription")),
    includeHolidayInDeduction: formData.get("includeHolidayInDeduction"),
    visibility: formData.get("visibility"),
  };
}

function redirectToTypes(error: string): never {
  redirect(`/admin/leaves/types?error=${error}`);
}

export async function createLeaveType(formData: FormData) {
  const actor = await requireOwner();
  const parsed = leaveTypeCreateSchema.safeParse(formPayload(formData));

  if (!parsed.success) {
    redirectToTypes("invalid");
  }

  const prisma = getPrisma();
  const existing = await prisma.leaveTypeDefinition.findUnique({
    where: { code: parsed.data.code },
  });

  if (existing) {
    redirectToTypes("duplicate-code");
  }

  const leaveType = await prisma.leaveTypeDefinition.create({
    data: {
      ...parsed.data,
      allowedUnits: serializeAllowedUnits(parsed.data.allowedUnits),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "LEAVE_TYPE_CREATED",
      targetType: "LEAVE_TYPE",
      targetId: leaveType.id,
      metadata: toJsonValue({
        leaveTypeId: leaveType.id,
        code: leaveType.code,
        after: leaveType,
      }),
    },
  });

  revalidatePath("/admin/leaves/types");
  redirect("/admin/leaves/types?success=created");
}

export async function updateLeaveType(formData: FormData) {
  const actor = await requireOwner();
  const parsed = leaveTypeUpdateSchema.safeParse(formPayload(formData));

  if (!parsed.success) {
    redirectToTypes("invalid");
  }

  const prisma = getPrisma();
  const before = await prisma.leaveTypeDefinition.findUnique({
    where: { id: parsed.data.id },
  });

  if (!before) {
    redirectToTypes("not-found");
  }

  assertSystemRequiredLeaveTypeProtection({
    isSystemRequired: before.isSystemRequired,
    beforeCode: before.code,
    nextCode: parsed.data.code,
    beforeCategory: before.category,
    nextCategory: parsed.data.category,
  });

  if (before.code !== parsed.data.code) {
    const existingCode = await prisma.leaveTypeDefinition.findUnique({
      where: { code: parsed.data.code },
    });

    if (existingCode) {
      redirectToTypes("duplicate-code");
    }
  }

  const updateData = {
    code: before.isSystemRequired ? before.code : parsed.data.code,
    name: parsed.data.name,
    description: parsed.data.description,
    category: before.isSystemRequired ? before.category : parsed.data.category,
    isEnabled: parsed.data.isEnabled,
    isPaid: parsed.data.isPaid,
    paidRate: parsed.data.paidRate,
    grantMethod: parsed.data.grantMethod,
    grantAmount: parsed.data.grantAmount,
    grantUnit: parsed.data.grantUnit,
    usageMode: parsed.data.usageMode,
    allowedUnits: serializeAllowedUnits(parsed.data.allowedUnits),
    unusedRemainderHandling: parsed.data.unusedRemainderHandling,
    deductsAnnualBalance: parsed.data.deductsAnnualBalance,
    attachmentPolicy: parsed.data.attachmentPolicy,
    attachmentDescription: parsed.data.attachmentDescription,
    includeHolidayInDeduction: parsed.data.includeHolidayInDeduction,
    visibility: parsed.data.visibility,
  };
  const after = await prisma.leaveTypeDefinition.update({
    where: { id: before.id },
    data: updateData,
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "LEAVE_TYPE_UPDATED",
      targetType: "LEAVE_TYPE",
      targetId: after.id,
      metadata: toJsonValue({
        leaveTypeId: after.id,
        code: after.code,
        changedFields: changedFields(before, after),
        before,
        after,
      }),
    },
  });

  revalidatePath("/admin/leaves/types");
  redirect("/admin/leaves/types?success=updated");
}

export async function deactivateLeaveType(formData: FormData) {
  const actor = await requireOwner();
  const id = formData.get("id");

  if (typeof id !== "string" || !id) {
    redirectToTypes("invalid");
  }

  const prisma = getPrisma();
  const before = await prisma.leaveTypeDefinition.findUnique({ where: { id } });

  if (!before) {
    redirectToTypes("not-found");
  }

  const after = await prisma.leaveTypeDefinition.update({
    where: { id: before.id },
    data: { isEnabled: false },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "LEAVE_TYPE_DEACTIVATED",
      targetType: "LEAVE_TYPE",
      targetId: after.id,
      metadata: toJsonValue({
        leaveTypeId: after.id,
        code: after.code,
        before: { isEnabled: before.isEnabled },
        after: { isEnabled: after.isEnabled },
        systemRequired: after.isSystemRequired,
      }),
    },
  });

  revalidatePath("/admin/leaves/types");
  redirect("/admin/leaves/types?success=deactivated");
}

export async function reactivateLeaveType(formData: FormData) {
  const actor = await requireOwner();
  const id = formData.get("id");

  if (typeof id !== "string" || !id) {
    redirectToTypes("invalid");
  }

  const prisma = getPrisma();
  const before = await prisma.leaveTypeDefinition.findUnique({ where: { id } });

  if (!before) {
    redirectToTypes("not-found");
  }

  const after = await prisma.leaveTypeDefinition.update({
    where: { id: before.id },
    data: { isEnabled: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "LEAVE_TYPE_REACTIVATED",
      targetType: "LEAVE_TYPE",
      targetId: after.id,
      metadata: toJsonValue({
        leaveTypeId: after.id,
        code: after.code,
        before: { isEnabled: before.isEnabled },
        after: { isEnabled: after.isEnabled },
      }),
    },
  });

  revalidatePath("/admin/leaves/types");
  redirect("/admin/leaves/types?success=reactivated");
}
