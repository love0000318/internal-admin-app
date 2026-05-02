"use server";

import { redirect } from "next/navigation";

import { destroyCurrentSession, getCurrentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

export async function logoutAction() {
  const user = await getCurrentUser();

  if (user) {
    await getPrisma().auditLog.create({
      data: {
        actorId: user.id,
        actorUserId: user.id,
        targetUserId: user.id,
        action: "LOGOUT",
        targetType: "SESSION",
        targetId: user.id,
      },
    });
  }

  await destroyCurrentSession();
  if (user) {
    await getPrisma().auditLog.create({
      data: {
        actorId: user.id,
        actorUserId: user.id,
        targetUserId: user.id,
        action: "SESSION_REVOKED",
        targetType: "SESSION",
        targetId: user.id,
      },
    });
  }
  redirect("/login");
}
