"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  assertGrantRevocable,
  assertLeaveTypeGrantable,
  assertValidGrantAmount,
  assertValidGrantDates,
  buildLeaveGrantCreateData,
  leaveGrantFormSchema,
  revokeLeaveGrantSchema,
} from "@/lib/leave/grants";
import type { DateOnly } from "@/lib/leave/types";
import {
  recordLeaveGrantCreatedLedger,
  recordLeaveGrantRevokedLedger,
} from "@/lib/leave/ledger";
import { requireOwner } from "@/lib/rbac/server-guards";

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function redirectToGrants(error: string): never {
  redirect(`/admin/leaves/grants?error=${error}`);
}

function uniqueStrings(values: FormDataEntryValue[]) {
  return [...new Set(values.filter((value): value is string => typeof value === "string"))];
}

function parseGrantForm(formData: FormData) {
  return leaveGrantFormSchema.safeParse({
    userIds: uniqueStrings(formData.getAll("userIds")),
    leaveTypeId: formData.get("leaveTypeId"),
    grantedAmount: formData.get("grantedAmount"),
    unit: formData.get("unit"),
    effectiveFrom: formData.get("effectiveFrom"),
    expiresAt: formData.get("expiresAt") || null,
    reason: formData.get("reason"),
  });
}

export async function createLeaveGrant(formData: FormData) {
  const actor = await requireOwner();
  const parsed = parseGrantForm(formData);

  if (!parsed.success) {
    redirectToGrants("invalid");
  }

  const prisma = getPrisma();
  const effectiveFrom = parsed.data.effectiveFrom as DateOnly;
  const expiresAt = parsed.data.expiresAt
    ? (parsed.data.expiresAt as DateOnly)
    : null;
  const [leaveType, users] = await Promise.all([
    prisma.leaveTypeDefinition.findUnique({
      where: { id: parsed.data.leaveTypeId },
    }),
    prisma.user.findMany({
      where: {
        id: { in: parsed.data.userIds },
        status: "ACTIVE",
      },
      select: { id: true },
    }),
  ]);

  try {
    assertLeaveTypeGrantable(leaveType);
    assertValidGrantAmount(parsed.data.grantedAmount);
    assertValidGrantDates({
      effectiveFrom,
      expiresAt,
    });
  } catch {
    redirectToGrants("invalid");
  }

  if (users.length !== parsed.data.userIds.length) {
    redirectToGrants("invalid-users");
  }

  const isBulk = parsed.data.userIds.length > 1;
  const source = isBulk ? "BULK_MANUAL" : "MANUAL";
  const created = await prisma.$transaction(async (tx) => {
    const grants = [];

    for (const userId of parsed.data.userIds) {
      const grant = await tx.leaveGrant.create({
        data: buildLeaveGrantCreateData({
          userId,
          leaveTypeId: parsed.data.leaveTypeId,
          grantedAmount: parsed.data.grantedAmount,
          unit: parsed.data.unit,
          effectiveFrom,
          expiresAt,
          reason: parsed.data.reason,
          grantedByUserId: actor.id,
          source,
        }),
      });
      await recordLeaveGrantCreatedLedger({ tx, grant });
      grants.push(grant);
    }

    if (isBulk) {
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorUserId: actor.id,
          action: "LEAVE_GRANT_BULK_CREATED",
          targetType: "LEAVE_GRANT",
          targetId: null,
          metadata: toJsonValue({
            targetUserIds: parsed.data.userIds,
            count: grants.length,
            leaveTypeId: parsed.data.leaveTypeId,
            leaveTypeCode: leaveType?.code,
            grantedAmount: parsed.data.grantedAmount,
            unit: parsed.data.unit,
            effectiveFrom,
            expiresAt,
            reason: parsed.data.reason,
            source,
          }),
        },
      });
    }

    for (const grant of grants) {
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorUserId: actor.id,
          targetUserId: grant.userId,
          action: "LEAVE_GRANT_CREATED",
          targetType: "LEAVE_GRANT",
          targetId: grant.id,
          metadata: toJsonValue({
            leaveGrantId: grant.id,
            leaveTypeId: grant.leaveTypeId,
            leaveTypeCode: leaveType?.code,
            targetUserId: grant.userId,
            grantedAmount: grant.grantedAmount,
            unit: grant.unit,
            effectiveFrom,
            expiresAt,
            reason: grant.reason,
            source: grant.source,
          }),
        },
      });
    }

    return grants;
  });

  revalidatePath("/admin/leaves/grants");
  revalidatePath("/leaves/me");

  if (created.length === 1) {
    redirect(`/admin/leaves/grants/${created[0].id}?success=created`);
  }

  redirect("/admin/leaves/grants?success=bulk-created");
}

export async function createBulkLeaveGrants(formData: FormData) {
  return createLeaveGrant(formData);
}

export async function revokeLeaveGrant(formData: FormData) {
  const actor = await requireOwner();
  const parsed = revokeLeaveGrantSchema.safeParse({
    grantId: formData.get("grantId"),
    revokeReason: formData.get("revokeReason"),
  });

  if (!parsed.success) {
    redirectToGrants("revoke-reason-required");
  }

  const prisma = getPrisma();
  const before = await prisma.leaveGrant.findUnique({
    where: { id: parsed.data.grantId },
    include: { leaveType: true },
  });

  if (!before) {
    redirectToGrants("not-found");
  }

  try {
    assertGrantRevocable(before);
  } catch {
    redirectToGrants("not-revocable");
  }

  const after = await prisma.$transaction(async (tx) => {
    await recordLeaveGrantRevokedLedger({
      tx,
      grant: before,
      actorId: actor.id,
    });

    const updated = await tx.leaveGrant.update({
      where: { id: before.id },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedByUserId: actor.id,
        revokeReason: parsed.data.revokeReason,
        remainingAmount: 0,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        targetUserId: updated.userId,
        action: "LEAVE_GRANT_REVOKED",
        targetType: "LEAVE_GRANT",
        targetId: updated.id,
        metadata: toJsonValue({
          leaveGrantId: updated.id,
          leaveTypeId: updated.leaveTypeId,
          leaveTypeCode: before.leaveType.code,
          targetUserId: updated.userId,
          grantedAmount: updated.grantedAmount,
          unit: updated.unit,
          revokedAt: updated.revokedAt,
          revokeReason: updated.revokeReason,
        }),
      },
    });

    return updated;
  });

  revalidatePath("/admin/leaves/grants");
  revalidatePath(`/admin/leaves/grants/${after.id}`);
  revalidatePath("/leaves/me");
  redirect(`/admin/leaves/grants/${after.id}?success=revoked`);
}
