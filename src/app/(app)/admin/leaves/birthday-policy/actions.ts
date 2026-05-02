"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  BIRTHDAY_HALF_DAY_CODE,
  normalizeBirthdayPolicyInput,
} from "@/lib/leave/birthday-half-day";
import { requireOwner } from "@/lib/rbac/server-guards";

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function numberValue(formData: FormData, name: string) {
  const value = formData.get(name);
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;

  return parsed;
}

function redirectToPolicy(error: string): never {
  redirect(`/admin/leaves/birthday-policy?error=${error}`);
}

export async function updateBirthdayLeavePolicy(formData: FormData) {
  const actor = await requireOwner();
  let normalized: ReturnType<typeof normalizeBirthdayPolicyInput>;

  try {
    normalized = normalizeBirthdayPolicyInput({
      isEnabled: checked(formData, "isEnabled"),
      grantAmount: numberValue(formData, "grantAmount"),
      grantDaysBefore: numberValue(formData, "grantDaysBefore"),
      usableDaysFromBirthday: numberValue(formData, "usableDaysFromBirthday"),
      adjustGrantDateToPreviousBusinessDay: checked(
        formData,
        "adjustGrantDateToPreviousBusinessDay",
      ),
      notifyEmployee: checked(formData, "notifyEmployee"),
    });
  } catch {
    redirectToPolicy("invalid");
  }

  const prisma = getPrisma();
  const leaveType = await prisma.leaveTypeDefinition.findUnique({
    where: { code: BIRTHDAY_HALF_DAY_CODE },
  });

  if (!leaveType) {
    redirectToPolicy("leave-type-not-found");
  }

  const before = await prisma.birthdayLeavePolicy.findFirst({
    orderBy: { createdAt: "asc" },
  });
  const after = before
    ? await prisma.birthdayLeavePolicy.update({
        where: { id: before.id },
        data: {
          leaveTypeId: leaveType.id,
          grantUnit: "DAY",
          ...normalized,
        },
      })
    : await prisma.birthdayLeavePolicy.create({
        data: {
          leaveTypeId: leaveType.id,
          grantUnit: "DAY",
          ...normalized,
        },
      });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "BIRTHDAY_LEAVE_POLICY_UPDATED",
      targetType: "LEAVE_POLICY",
      targetId: after.id,
      metadata: toJsonValue({
        before: before
          ? {
              isEnabled: before.isEnabled,
              grantAmount: before.grantAmount,
              grantDaysBefore: before.grantDaysBefore,
              usableDaysFromBirthday: before.usableDaysFromBirthday,
              adjustGrantDateToPreviousBusinessDay:
                before.adjustGrantDateToPreviousBusinessDay,
              notifyEmployee: before.notifyEmployee,
            }
          : null,
        after: {
          isEnabled: after.isEnabled,
          grantAmount: after.grantAmount,
          grantDaysBefore: after.grantDaysBefore,
          usableDaysFromBirthday: after.usableDaysFromBirthday,
          adjustGrantDateToPreviousBusinessDay:
            after.adjustGrantDateToPreviousBusinessDay,
          notifyEmployee: after.notifyEmployee,
          leaveTypeId: after.leaveTypeId,
        },
      }),
    },
  });

  revalidatePath("/admin/leaves/birthday-policy");
  redirect("/admin/leaves/birthday-policy?success=updated");
}
