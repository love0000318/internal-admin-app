import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("release readiness", () => {
  it("ships an initial Prisma migration for the MVP schema", () => {
    const migrationPath = join(
      root,
      "prisma/migrations/20260501000000_init/migration.sql",
    );

    expect(existsSync(migrationPath)).toBe(true);

    const migrationSql = readFileSync(migrationPath, "utf8");

    expect(migrationSql).toContain('CREATE TABLE "User"');
    expect(migrationSql).toContain('CREATE TABLE "Invitation"');
    expect(migrationSql).toContain('CREATE TABLE "Session"');
    expect(migrationSql).toContain('CREATE TABLE "LeaveRequest"');
    expect(migrationSql).toContain('CREATE TABLE "AuditLog"');
  });

  it("documents all production-critical environment variables", () => {
    const envExample = readProjectFile(".env.example");

    for (const key of [
      "DATABASE_URL",
      "APP_BASE_URL",
      "NODE_ENV",
      "APP_SECRET",
      "SESSION_SECRET",
      "TOKEN_SECRET",
      "INVITATION_TOKEN_SECRET",
      "INVITATION_EXPIRES_IN_DAYS",
      "SESSION_EXPIRES_IN_DAYS",
      "SEED_OWNER_EMAIL",
      "SEED_OWNER_NAME",
      "SEED_OWNER_TITLE",
    ]) {
      expect(envExample).toContain(key);
    }
  });

  it("keeps raw invitation and session tokens out of the Prisma schema", () => {
    const schema = readProjectFile("prisma/schema.prisma");

    expect(schema).toContain("tokenHash");
    expect(schema).not.toMatch(/\brawToken\b/);
    expect(schema).not.toMatch(/\bsessionToken\b/);
    expect(schema).not.toMatch(/\binvitationToken\b/);
  });

  it("keeps core mutation files protected by server-side guards", () => {
    expect(readProjectFile("src/app/(app)/organization/actions.ts")).toContain(
      "requireOwner()",
    );
    expect(readProjectFile("src/app/(app)/admin/leaves/actions.ts")).toContain(
      "requireOwner()",
    );
    expect(readProjectFile("src/app/(app)/leaves/actions.ts")).toContain(
      'requireRouteAccess("/leaves/me")',
    );
    expect(
      readProjectFile("src/app/(app)/leaves/approvals/actions.ts"),
    ).toContain('requireRouteAccess("/leaves/approvals")');
  });
});
