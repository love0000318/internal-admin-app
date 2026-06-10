import { describe, expect, it, vi } from "vitest";

import { verifyPassword } from "@/lib/auth/password";
import {
  EmployeePasswordResetError,
  PASSWORD_RESET_AUDIT_ACTION,
  PASSWORD_RESET_AUDIT_EVENT,
  PASSWORD_RESET_STEP_UP_PURPOSE,
  resetEmployeePasswordByOwner,
} from "@/lib/organization/password-reset";
import type { Role } from "@/lib/rbac/roles";

type UserRecord = {
  id: string;
  email: string;
  role: Role;
  status: string;
};

type AuditData = {
  actorId: string | null;
  actorUserId: string | null;
  targetUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: unknown;
};

type PrismaMock = {
  user: {
    findUnique(args: { where: { id: string } }): Promise<UserRecord | null>;
    update(args: {
      where: { id: string };
      data: { passwordHash: string };
    }): Promise<UserRecord & { passwordHash: string }>;
  };
  auditLog: {
    create(args: { data: AuditData }): Promise<AuditData>;
  };
  $transaction<T>(callback: (tx: PrismaMock) => Promise<T>): Promise<T>;
};

describe("employee password reset", () => {
  it("allows an active OWNER to reset an employee password with audit logging", async () => {
    const temporaryPassword = ["Temp", "Credential", "1!"].join("");
    const ownerPassword = ["Owner", "Credential", "1!"].join("");
    const { auditLogs, getStoredPasswordHash, prisma } = createPrismaMock();
    const assertStepUpPassword = vi.fn(async () => undefined);

    await resetEmployeePasswordByOwner({
      prisma: prisma as never,
      actor: { id: "owner-1", role: "OWNER", status: "ACTIVE" },
      targetUserId: "employee-1",
      temporaryPassword,
      confirmTemporaryPassword: temporaryPassword,
      stepUpPassword: ownerPassword,
      assertStepUpPassword,
    });

    const storedPasswordHash = getStoredPasswordHash();

    expect(assertStepUpPassword).toHaveBeenCalledWith({
      userId: "owner-1",
      purpose: PASSWORD_RESET_STEP_UP_PURPOSE,
      password: ownerPassword,
    });
    expect(storedPasswordHash).not.toBe(temporaryPassword);
    expect(await verifyPassword(temporaryPassword, storedPasswordHash)).toBe(true);
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({
      actorId: "owner-1",
      actorUserId: "owner-1",
      targetUserId: "employee-1",
      action: PASSWORD_RESET_AUDIT_ACTION,
      targetType: "USER",
      targetId: "employee-1",
    });
    expect(auditLogs[0].metadata).toMatchObject({
      event: PASSWORD_RESET_AUDIT_EVENT,
      actorUserId: "owner-1",
      targetUserId: "employee-1",
      changedFields: ["passwordCredential"],
      resetMode: "OWNER_INPUT_TEMP_PASSWORD",
    });
    expect(JSON.stringify(auditLogs)).not.toContain(temporaryPassword);
    expect(JSON.stringify(auditLogs)).not.toContain(storedPasswordHash);
  });

  it.each<Role>(["LEAD", "MANAGER", "EXTERNAL_PARTNER"])(
    "blocks %s from resetting another user's password",
    async (role) => {
      const temporaryPassword = ["Temp", "Credential", "1!"].join("");
      const { auditLogs, getStoredPasswordHash, prisma } = createPrismaMock();
      const assertStepUpPassword = vi.fn(async () => undefined);

      await expect(
        resetEmployeePasswordByOwner({
          prisma: prisma as never,
          actor: { id: `${role.toLowerCase()}-1`, role, status: "ACTIVE" },
          targetUserId: "employee-1",
          temporaryPassword,
          confirmTemporaryPassword: temporaryPassword,
          stepUpPassword: ["Actor", "Credential", "1!"].join(""),
          assertStepUpPassword,
        }),
      ).rejects.toMatchObject(
        new EmployeePasswordResetError("FORBIDDEN"),
      );

      expect(assertStepUpPassword).not.toHaveBeenCalled();
      expect(getStoredPasswordHash()).toBe("old-hash");
      expect(auditLogs).toEqual([]);
    },
  );

  it("rejects mismatched temporary password confirmation before hashing", async () => {
    const { auditLogs, getStoredPasswordHash, prisma } = createPrismaMock();
    const assertStepUpPassword = vi.fn(async () => undefined);

    await expect(
      resetEmployeePasswordByOwner({
        prisma: prisma as never,
        actor: { id: "owner-1", role: "OWNER", status: "ACTIVE" },
        targetUserId: "employee-1",
        temporaryPassword: ["Temp", "Credential", "1!"].join(""),
        confirmTemporaryPassword: ["Other", "Credential", "1!"].join(""),
        stepUpPassword: ["Owner", "Credential", "1!"].join(""),
        assertStepUpPassword,
      }),
    ).rejects.toMatchObject(
      new EmployeePasswordResetError("PASSWORD_MISMATCH"),
    );

    expect(assertStepUpPassword).not.toHaveBeenCalled();
    expect(getStoredPasswordHash()).toBe("old-hash");
    expect(auditLogs).toEqual([]);
  });
});

function createPrismaMock(target: UserRecord | null = defaultTargetUser()) {
  let storedPasswordHash = "old-hash";
  const auditLogs: AuditData[] = [];
  const prisma: PrismaMock = {
    user: {
      async findUnique(args) {
        return target && args.where.id === target.id ? target : null;
      },
      async update(args) {
        if (!target || args.where.id !== target.id) {
          throw new Error("Target user not found.");
        }

        storedPasswordHash = args.data.passwordHash;
        return {
          ...target,
          passwordHash: storedPasswordHash,
        };
      },
    },
    auditLog: {
      async create(args) {
        auditLogs.push(args.data);
        return args.data;
      },
    },
    async $transaction(callback) {
      return callback(prisma);
    },
  };

  return {
    auditLogs,
    getStoredPasswordHash: () => storedPasswordHash,
    prisma,
  };
}

function defaultTargetUser(): UserRecord {
  return {
    id: "employee-1",
    email: "employee@example.com",
    role: "MANAGER",
    status: "ACTIVE",
  };
}
