import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { classifyAuditAction } from "@/lib/audit/audit-classification";
import { sanitizeAuditMetadata } from "@/lib/audit/sanitize-audit-metadata";

let prisma: PrismaClient | null = null;

export function getPrisma() {
  if (prisma) {
    return prisma;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const adapter = new PrismaPg({ connectionString });
  prisma = new PrismaClient({ adapter }).$extends({
    query: {
      auditLog: {
        async create({ args, query }) {
          const data = args.data as Record<string, unknown>;
          const classification = classifyAuditAction(data.action as never);

          data.metadata =
            data.metadata === undefined || data.metadata === null
              ? data.metadata
              : sanitizeAuditMetadata(data.metadata);
          data.beforeJson =
            data.beforeJson === undefined || data.beforeJson === null
              ? data.beforeJson
              : sanitizeAuditMetadata(data.beforeJson);
          data.afterJson =
            data.afterJson === undefined || data.afterJson === null
              ? data.afterJson
              : sanitizeAuditMetadata(data.afterJson);
          data.category = data.category ?? classification.category;
          data.severity = data.severity ?? classification.severity;

          return query(args);
        },
        async createMany({ args, query }) {
          const rows = Array.isArray(args.data) ? args.data : [args.data];

          for (const row of rows as Array<Record<string, unknown>>) {
            const classification = classifyAuditAction(row.action as never);

            row.metadata =
              row.metadata === undefined || row.metadata === null
                ? row.metadata
                : sanitizeAuditMetadata(row.metadata);
            row.beforeJson =
              row.beforeJson === undefined || row.beforeJson === null
                ? row.beforeJson
                : sanitizeAuditMetadata(row.beforeJson);
            row.afterJson =
              row.afterJson === undefined || row.afterJson === null
                ? row.afterJson
                : sanitizeAuditMetadata(row.afterJson);
            row.category = row.category ?? classification.category;
            row.severity = row.severity ?? classification.severity;
          }

          return query(args);
        },
        update() {
          throw new Error("AuditLog entries are immutable.");
        },
        updateMany() {
          throw new Error("AuditLog entries are immutable.");
        },
        upsert() {
          throw new Error("AuditLog entries are immutable.");
        },
        delete() {
          throw new Error("AuditLog entries cannot be deleted.");
        },
        deleteMany() {
          throw new Error("AuditLog entries cannot be deleted.");
        },
      },
    },
  }) as unknown as PrismaClient;

  return prisma;
}
