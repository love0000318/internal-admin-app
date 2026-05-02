"use server";

import { redirect } from "next/navigation";

import { Prisma } from "@/generated/prisma/client";
import { createInvitationTokenPayload } from "@/lib/auth/invitation-token";
import { getPrisma } from "@/lib/db/prisma";
import {
  buildInvitationUrl,
  getAppBaseUrl,
} from "@/lib/organization/invitations";
import {
  assertCanMutateEmployee,
  wouldCreateTeamCycle,
} from "@/lib/organization/rules";
import {
  employeeUpdateSchema,
  inviteEmployeeSchema,
  isFutureDateOnly,
  normalizeOptionalDate,
  normalizeOptionalId,
  teamInputSchema,
} from "@/lib/organization/validation";
import { todayInSeoul } from "@/lib/leave/calculate-business-days";
import { requireOwner } from "@/lib/rbac/server-guards";

function getRequiredFormValue(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function metadata(
  before: unknown,
  after: unknown,
  changedFields?: string[],
): Prisma.InputJsonValue {
  return toJsonValue({
    before,
    after,
    changedFields,
  });
}

export async function createTeam(formData: FormData) {
  const actor = await requireOwner();
  const parsed = teamInputSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    parentTeamId: formData.get("parentTeamId"),
    leadUserId: formData.get("leadUserId"),
  });

  if (!parsed.success) {
    redirect("/organization/teams?error=invalid");
  }

  const prisma = getPrisma();
  const parentTeamId = normalizeOptionalId(parsed.data.parentTeamId);
  const duplicate = await prisma.team.findFirst({
    where: {
      name: parsed.data.name,
      parentTeamId,
    },
  });

  if (duplicate) {
    redirect("/organization/teams?error=duplicate");
  }

  const team = await prisma.team.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      parentTeamId,
      leadUserId: normalizeOptionalId(parsed.data.leadUserId),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "TEAM_CREATED",
      targetType: "TEAM",
      targetId: team.id,
      metadata: {
        targetTeamId: team.id,
        after: {
          name: team.name,
          parentTeamId: team.parentTeamId,
          leadUserId: team.leadUserId,
        },
      },
    },
  });

  redirect("/organization/teams?success=team-created");
}

export async function updateTeam(formData: FormData) {
  const actor = await requireOwner();
  const teamId = getRequiredFormValue(formData, "teamId");
  const parsed = teamInputSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    parentTeamId: formData.get("parentTeamId"),
    leadUserId: formData.get("leadUserId"),
    status: formData.get("status"),
  });

  if (!teamId || !parsed.success) {
    redirect("/organization/teams?error=invalid");
  }

  const prisma = getPrisma();
  const before = await prisma.team.findUnique({
    where: { id: teamId },
  });

  if (!before) {
    redirect("/organization/teams?error=not-found");
  }

  const parentTeamId = normalizeOptionalId(parsed.data.parentTeamId);
  const teams = await prisma.team.findMany({
    select: {
      id: true,
      parentTeamId: true,
    },
  });

  if (wouldCreateTeamCycle(teamId, parentTeamId, teams)) {
    redirect("/organization/teams?error=cycle");
  }

  const duplicate = await prisma.team.findFirst({
    where: {
      id: { not: teamId },
      name: parsed.data.name,
      parentTeamId,
    },
  });

  if (duplicate) {
    redirect("/organization/teams?error=duplicate");
  }

  const status = parsed.data.status ?? before.status;
  const team = await prisma.team.update({
    where: { id: teamId },
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      parentTeamId,
      leadUserId: normalizeOptionalId(parsed.data.leadUserId),
      status,
      deactivatedAt:
        status === "INACTIVE" && before.status !== "INACTIVE"
          ? new Date()
          : status === "ACTIVE"
            ? null
            : before.deactivatedAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: status === "INACTIVE" ? "TEAM_DEACTIVATED" : "TEAM_UPDATED",
      targetType: "TEAM",
      targetId: team.id,
      metadata: metadata(
        {
          name: before.name,
          description: before.description,
          parentTeamId: before.parentTeamId,
          leadUserId: before.leadUserId,
          status: before.status,
        },
        {
          name: team.name,
          description: team.description,
          parentTeamId: team.parentTeamId,
          leadUserId: team.leadUserId,
          status: team.status,
        },
        ["name", "description", "parentTeamId", "leadUserId", "status"],
      ),
    },
  });

  redirect("/organization/teams?success=team-updated");
}

export async function deactivateTeam(formData: FormData) {
  const actor = await requireOwner();
  const teamId = getRequiredFormValue(formData, "teamId");

  if (!teamId) {
    redirect("/organization/teams?error=invalid");
  }

  const prisma = getPrisma();
  const before = await prisma.team.findUnique({ where: { id: teamId } });

  if (!before) {
    redirect("/organization/teams?error=not-found");
  }

  const team = await prisma.team.update({
    where: { id: teamId },
    data: {
      status: "INACTIVE",
      deactivatedAt: before.deactivatedAt ?? new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "TEAM_DEACTIVATED",
      targetType: "TEAM",
      targetId: team.id,
      metadata: metadata(
        { status: before.status, deactivatedAt: before.deactivatedAt },
        { status: team.status, deactivatedAt: team.deactivatedAt },
        ["status", "deactivatedAt"],
      ),
    },
  });

  redirect("/organization/teams?success=team-deactivated");
}

export async function createEmployeeInvitation(formData: FormData) {
  const actor = await requireOwner();
  const parsed = inviteEmployeeSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    title: formData.get("title"),
    role: formData.get("role"),
    teamId: formData.get("teamId"),
    hireDate: formData.get("hireDate"),
    birthDate: formData.get("birthDate"),
  });

  if (!parsed.success) {
    redirect("/organization/invitations?error=invalid");
  }

  if (
    parsed.data.birthDate &&
    isFutureDateOnly(parsed.data.birthDate, todayInSeoul())
  ) {
    redirect("/organization/invitations?error=future-birth-date");
  }

  const prisma = getPrisma();
  const activeUser = await prisma.user.findFirst({
    where: {
      email: parsed.data.email,
      status: "ACTIVE",
    },
  });

  if (activeUser) {
    redirect("/organization/invitations?error=active-user");
  }

  const pendingInvitation = await prisma.invitation.findFirst({
    where: {
      email: parsed.data.email,
      status: "PENDING",
    },
  });

  if (pendingInvitation) {
    redirect("/organization/invitations?error=pending-invitation");
  }

  const prejoinProfile = await prisma.employeePrejoinProfile.findFirst({
    where: {
      OR: [
        { companyEmail: parsed.data.email },
        { personalEmail: parsed.data.email },
      ],
      sourceStatus: { in: ["IMPORTED", "INVITED"] },
    },
  });
  const prejoinTeam =
    !parsed.data.teamId && prejoinProfile?.teamName
      ? await prisma.team.findFirst({
          where: {
            name: prejoinProfile.teamName,
            status: "ACTIVE",
          },
        })
      : null;
  const nextTeamId = normalizeOptionalId(parsed.data.teamId) ?? prejoinTeam?.id ?? null;
  const nextName =
    parsed.data.name ||
    prejoinProfile?.displayName ||
    prejoinProfile?.legalName ||
    parsed.data.email;
  const nextTitle =
    parsed.data.title || prejoinProfile?.jobGrade || prejoinProfile?.title || null;
  const nextHireDate =
    normalizeOptionalDate(parsed.data.hireDate) ?? prejoinProfile?.hireDate ?? null;
  const nextBirthDate =
    normalizeOptionalDate(parsed.data.birthDate) ?? prejoinProfile?.birthDate ?? null;

  const { rawToken, tokenHash, expiresAt } = createInvitationTokenPayload();
  const invitation = await prisma.invitation.create({
    data: {
      email: parsed.data.email,
      name: nextName,
      expectedName: nextName,
      role: parsed.data.role,
      teamId: nextTeamId,
      title: nextTitle,
      jobTitle: nextTitle,
      hireDate: nextHireDate,
      birthDate: nextBirthDate,
      birthday: nextBirthDate,
      tokenHash,
      expiresAt,
      invitedByUserId: actor.id,
      createdById: actor.id,
      employeePrejoinProfileId: prejoinProfile?.id ?? null,
    },
  });

  if (prejoinProfile) {
    await prisma.employeePrejoinProfile.update({
      where: { id: prejoinProfile.id },
      data: {
        sourceStatus: "INVITED",
        linkedInvitationId: invitation.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        action: "EMPLOYEE_PREJOIN_PROFILE_LINKED_TO_INVITATION",
        targetType: "EMPLOYEE_PREJOIN_PROFILE",
        targetId: prejoinProfile.id,
        metadata: {
          prejoinProfileId: prejoinProfile.id,
          invitationId: invitation.id,
          changedFields: ["sourceStatus", "linkedInvitationId"],
        },
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "INVITATION_CREATED",
      targetType: "INVITATION",
      targetId: invitation.id,
      metadata: {
        invitationId: invitation.id,
        after: {
          email: invitation.email,
          name: invitation.expectedName,
          role: invitation.role,
          teamId: invitation.teamId,
          employeePrejoinProfileId: invitation.employeePrejoinProfileId,
        },
      },
    },
  });

  const inviteUrl = buildInvitationUrl(getAppBaseUrl(), rawToken);
  redirect(
    `/organization/invitations?success=invitation-created&inviteUrl=${encodeURIComponent(inviteUrl)}`,
  );
}

export async function cancelInvitation(formData: FormData) {
  const actor = await requireOwner();
  const invitationId = getRequiredFormValue(formData, "invitationId");

  if (!invitationId) {
    redirect("/organization/invitations?error=invalid");
  }

  const prisma = getPrisma();
  const before = await prisma.invitation.findUnique({
    where: { id: invitationId },
  });

  if (!before || before.status !== "PENDING") {
    redirect("/organization/invitations?error=not-pending");
  }

  const invitation = await prisma.invitation.update({
    where: { id: invitationId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "INVITATION_CANCELLED",
      targetType: "INVITATION",
      targetId: invitation.id,
      metadata: {
        invitationId: invitation.id,
        before: {
          status: before.status,
          email: before.email,
        },
        after: {
          status: invitation.status,
          email: invitation.email,
        },
      },
    },
  });

  redirect("/organization/invitations?success=invitation-cancelled");
}

export async function reissueInvitation(formData: FormData) {
  const actor = await requireOwner();
  const invitationId = getRequiredFormValue(formData, "invitationId");

  if (!invitationId) {
    redirect("/organization/invitations?error=invalid");
  }

  const prisma = getPrisma();
  const before = await prisma.invitation.findUnique({
    where: { id: invitationId },
  });

  if (!before || before.status !== "PENDING") {
    redirect("/organization/invitations?error=not-pending");
  }

  const { rawToken, tokenHash, expiresAt } = createInvitationTokenPayload();
  const nextInvitation = await prisma.$transaction(async (tx) => {
    await tx.invitation.update({
      where: { id: before.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    });

    return tx.invitation.create({
      data: {
        email: before.email,
        name: before.name ?? before.expectedName,
        expectedName: before.expectedName,
        role: before.role,
        teamId: before.teamId,
        title: before.title ?? before.jobTitle,
        jobTitle: before.jobTitle ?? before.title,
        hireDate: before.hireDate,
        birthDate: before.birthDate ?? before.birthday,
        birthday: before.birthday ?? before.birthDate,
        tokenHash,
        expiresAt,
        invitedByUserId: actor.id,
        createdById: actor.id,
        employeePrejoinProfileId: before.employeePrejoinProfileId,
      },
    });
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      actorUserId: actor.id,
      action: "INVITATION_REISSUED",
      targetType: "INVITATION",
      targetId: nextInvitation.id,
      metadata: {
        beforeInvitationId: before.id,
        invitationId: nextInvitation.id,
        email: nextInvitation.email,
      },
    },
  });

  const inviteUrl = buildInvitationUrl(getAppBaseUrl(), rawToken);
  redirect(
    `/organization/invitations?success=invitation-reissued&inviteUrl=${encodeURIComponent(inviteUrl)}`,
  );
}

export async function updateEmployeeProfile(formData: FormData) {
  const actor = await requireOwner();
  const userId = getRequiredFormValue(formData, "userId");
  const parsed = employeeUpdateSchema.safeParse({
    name: formData.get("name"),
    title: formData.get("title"),
    role: formData.get("role"),
    status: formData.get("status"),
    teamId: formData.get("teamId"),
    hireDate: formData.get("hireDate"),
    birthDate: formData.get("birthDate"),
  });

  if (!userId || !parsed.success) {
    redirect(`/organization/employees/${userId || ""}?error=invalid`);
  }

  if (
    parsed.data.birthDate &&
    isFutureDateOnly(parsed.data.birthDate, todayInSeoul())
  ) {
    redirect(`/organization/employees/${userId}?error=future-birth-date`);
  }

  const prisma = getPrisma();
  const before = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });

  if (!before) {
    redirect("/organization/employees?error=not-found");
  }

  const activeOwnerCount = await prisma.user.count({
    where: {
      role: "OWNER",
      status: "ACTIVE",
    },
  });

  try {
    assertCanMutateEmployee({
      actorId: actor.id,
      target: before,
      nextRole: parsed.data.role,
      nextStatus: parsed.data.status,
      activeOwnerCount,
    });
  } catch {
    redirect(`/organization/employees/${userId}?error=forbidden-change`);
  }

  const nextTeamId = normalizeOptionalId(parsed.data.teamId);
  const nextHireDate = normalizeOptionalDate(parsed.data.hireDate);
  const nextBirthDate = normalizeOptionalDate(parsed.data.birthDate);
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      name: parsed.data.name,
      title: parsed.data.title || null,
      role: parsed.data.role,
      status: parsed.data.status,
      teamId: nextTeamId,
      hireDate: nextHireDate,
      birthDate: nextBirthDate,
      deactivatedAt:
        parsed.data.status === "DEACTIVATED" && before.status !== "DEACTIVATED"
          ? new Date()
          : parsed.data.status !== "DEACTIVATED"
            ? null
            : before.deactivatedAt,
      profile: {
        upsert: {
          create: {
            teamId: nextTeamId,
            jobTitle: parsed.data.title || null,
            hireDate: nextHireDate,
            birthday: nextBirthDate,
            deactivatedAt:
              parsed.data.status === "DEACTIVATED" ? new Date() : null,
          },
          update: {
            teamId: nextTeamId,
            jobTitle: parsed.data.title || null,
            hireDate: nextHireDate,
            birthday: nextBirthDate,
            deactivatedAt:
              parsed.data.status === "DEACTIVATED" && before.status !== "DEACTIVATED"
                ? new Date()
                : parsed.data.status !== "DEACTIVATED"
                  ? null
                  : before.profile?.deactivatedAt,
          },
        },
      },
    },
  });

  if (parsed.data.status === "DEACTIVATED") {
    await prisma.session.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });
  }

  const baseMetadata = metadata(
    {
      name: before.name,
      title: before.title,
      role: before.role,
      status: before.status,
      teamId: before.teamId,
      hireDate: before.hireDate,
      birthDate: before.birthDate,
    },
    {
      name: user.name,
      title: user.title,
      role: user.role,
      status: user.status,
      teamId: user.teamId,
      hireDate: user.hireDate,
      birthDate: user.birthDate,
    },
    ["name", "title", "role", "status", "teamId", "hireDate", "birthDate"],
  );

  const actions = new Set(["USER_PROFILE_UPDATED"]);
  if (before.role !== user.role) actions.add("USER_ROLE_UPDATED");
  if (before.teamId !== user.teamId) actions.add("USER_TEAM_UPDATED");
  if (user.status === "DEACTIVATED" && before.status !== "DEACTIVATED") {
    actions.add("USER_DEACTIVATED");
  }
  if (user.status === "ACTIVE" && before.status === "DEACTIVATED") {
    actions.add("USER_REACTIVATED");
  }

  await Promise.all(
    [...actions].map((action) =>
      prisma.auditLog.create({
        data: {
          actorId: actor.id,
          actorUserId: actor.id,
          targetUserId: user.id,
          action: action as never,
          targetType: "USER",
          targetId: user.id,
          metadata: baseMetadata,
        },
      }),
    ),
  );

  redirect(`/organization/employees/${user.id}?success=employee-updated`);
}

export async function deactivateEmployee(formData: FormData) {
  formData.set("status", "DEACTIVATED");
  await updateEmployeeProfile(formData);
}

export async function updateEmployeeRole(formData: FormData) {
  await updateEmployeeProfile(formData);
}

export async function updateEmployeeTeam(formData: FormData) {
  await updateEmployeeProfile(formData);
}

export async function reactivateEmployee(formData: FormData) {
  formData.set("status", "ACTIVE");
  await updateEmployeeProfile(formData);
}
