import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  SELF_PASSWORD_CHANGE_AUDIT_ACTION,
  SELF_PASSWORD_CHANGE_AUDIT_EVENT,
  SelfPasswordChangeError,
  changeOwnPassword,
} from "@/lib/auth/self-password-change";
import type { Role } from "@/lib/rbac/roles";

type UserRecord = {
  id: string;
  role: Role;
  status: string;
  passwordHash: string | null;
};

type AuditData = {
  actorId: string | null;
  actorUserId: string | null;
  targetUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
};

type PrismaMock = {
  user: {
    findUnique(args: {
      where: { id: string };
      select?: Record<string, boolean>;
    }): Promise<UserRecord | null>;
    update(args: {
      where: { id: string };
      data: { passwordHash: string };
    }): Promise<UserRecord>;
  };
  auditLog: {
    create(args: { data: AuditData }): Promise<AuditData>;
  };
  $transaction<T>(callback: (tx: PrismaMock) => Promise<T>): Promise<T>;
};

describe("self password change", () => {
  it("allows an active logged-in user to change their own password", async () => {
    const currentPassword = ["Current", "Credential", "1!"].join("");
    const newPassword = ["Next", "Credential", "1!"].join("");
    const initialPasswordHash = await hashPassword(currentPassword);
    const { auditLogs, getStoredPasswordHash, prisma } = createPrismaMock({
      passwordHash: initialPasswordHash,
    });

    await changeOwnPassword({
      prisma: prisma as never,
      actor: { id: "user-1", role: "MANAGER", status: "ACTIVE" },
      currentPassword,
      newPassword,
      confirmNewPassword: newPassword,
      requestContext: {
        ipAddress: "203.0.113.10",
        userAgent: "Unit Test",
      },
    });

    const storedPasswordHash = getStoredPasswordHash();

    expect(storedPasswordHash).not.toBe(initialPasswordHash);
    expect(storedPasswordHash).not.toBe(newPassword);
    expect(storedPasswordHash).not.toBe(currentPassword);
    expect(await verifyPassword(newPassword, storedPasswordHash)).toBe(true);
    expect(await verifyPassword(currentPassword, storedPasswordHash)).toBe(false);
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({
      actorId: "user-1",
      actorUserId: "user-1",
      targetUserId: "user-1",
      action: SELF_PASSWORD_CHANGE_AUDIT_ACTION,
      targetType: "USER",
      targetId: "user-1",
      ipAddress: "203.0.113.10",
      userAgent: "Unit Test",
    });
    expect(auditLogs[0].metadata).toMatchObject({
      event: SELF_PASSWORD_CHANGE_AUDIT_EVENT,
      actorUserId: "user-1",
      targetUserId: "user-1",
      changedFields: ["passwordCredential"],
      changeMode: "SELF_SERVICE_CURRENT_PASSWORD",
    });
    expect(JSON.stringify(auditLogs)).not.toContain(currentPassword);
    expect(JSON.stringify(auditLogs)).not.toContain(newPassword);
    expect(JSON.stringify(auditLogs)).not.toContain(storedPasswordHash);
    expect(JSON.stringify(auditLogs)).not.toContain("passwordHash");
  });

  it("rejects an incorrect current password", async () => {
    const currentPassword = ["Current", "Credential", "1!"].join("");
    const initialPasswordHash = await hashPassword(currentPassword);
    const { auditLogs, getStoredPasswordHash, prisma } = createPrismaMock({
      passwordHash: initialPasswordHash,
    });

    await expect(
      changeOwnPassword({
        prisma: prisma as never,
        actor: { id: "user-1", role: "MANAGER", status: "ACTIVE" },
        currentPassword: ["Wrong", "Credential", "1!"].join(""),
        newPassword: ["Next", "Credential", "1!"].join(""),
        confirmNewPassword: ["Next", "Credential", "1!"].join(""),
      }),
    ).rejects.toMatchObject(
      new SelfPasswordChangeError("CURRENT_PASSWORD_INVALID"),
    );

    expect(getStoredPasswordHash()).toBe(initialPasswordHash);
    expect(auditLogs).toEqual([]);
  });

  it("rejects mismatched new password confirmation before hashing", async () => {
    const currentPassword = ["Current", "Credential", "1!"].join("");
    const initialPasswordHash = await hashPassword(currentPassword);
    const { auditLogs, getStoredPasswordHash, prisma } = createPrismaMock({
      passwordHash: initialPasswordHash,
    });

    await expect(
      changeOwnPassword({
        prisma: prisma as never,
        actor: { id: "user-1", role: "MANAGER", status: "ACTIVE" },
        currentPassword,
        newPassword: ["Next", "Credential", "1!"].join(""),
        confirmNewPassword: ["Other", "Credential", "1!"].join(""),
      }),
    ).rejects.toMatchObject(new SelfPasswordChangeError("PASSWORD_MISMATCH"));

    expect(getStoredPasswordHash()).toBe(initialPasswordHash);
    expect(auditLogs).toEqual([]);
  });

  it("rejects a new password that does not satisfy the project password policy", async () => {
    const currentPassword = ["Current", "Credential", "1!"].join("");
    const initialPasswordHash = await hashPassword(currentPassword);
    const { auditLogs, getStoredPasswordHash, prisma } = createPrismaMock({
      passwordHash: initialPasswordHash,
    });

    await expect(
      changeOwnPassword({
        prisma: prisma as never,
        actor: { id: "user-1", role: "MANAGER", status: "ACTIVE" },
        currentPassword,
        newPassword: "password",
        confirmNewPassword: "password",
      }),
    ).rejects.toMatchObject(new SelfPasswordChangeError("PASSWORD_POLICY"));

    expect(getStoredPasswordHash()).toBe(initialPasswordHash);
    expect(auditLogs).toEqual([]);
  });

  it("does not trust a client-provided target user id", async () => {
    const currentPassword = ["Current", "Credential", "1!"].join("");
    const initialPasswordHash = await hashPassword(currentPassword);
    const { auditLogs, getStoredPasswordHash, prisma } = createPrismaMock({
      passwordHash: initialPasswordHash,
    });

    await expect(
      changeOwnPassword({
        prisma: prisma as never,
        actor: { id: "user-1", role: "OWNER", status: "ACTIVE" },
        currentPassword,
        newPassword: ["Next", "Credential", "1!"].join(""),
        confirmNewPassword: ["Next", "Credential", "1!"].join(""),
        targetUserIdFromClient: "user-2",
      }),
    ).rejects.toMatchObject(new SelfPasswordChangeError("FORBIDDEN"));

    expect(getStoredPasswordHash()).toBe(initialPasswordHash);
    expect(auditLogs).toEqual([]);
  });
});

function createPrismaMock(
  overrides: Partial<UserRecord> = {},
  userId = "user-1",
) {
  let storedPasswordHash = overrides.passwordHash ?? "old-hash";
  const auditLogs: AuditData[] = [];
  const user: UserRecord = {
    id: userId,
    role: "MANAGER",
    status: "ACTIVE",
    passwordHash: storedPasswordHash,
    ...overrides,
  };
  const prisma: PrismaMock = {
    user: {
      async findUnique(args) {
        if (args.where.id !== user.id) {
          return null;
        }

        return {
          ...user,
          passwordHash: storedPasswordHash,
        };
      },
      async update(args) {
        if (args.where.id !== user.id) {
          throw new Error("Target user not found.");
        }

        storedPasswordHash = args.data.passwordHash;
        return {
          ...user,
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
