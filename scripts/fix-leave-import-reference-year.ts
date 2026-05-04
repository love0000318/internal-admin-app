import { Prisma, type LeaveImportStatus } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";

type Args = {
  dryRun: boolean;
  apply: boolean;
  from: number | null;
  to: number | null;
  batchId: string | null;
  includeApplied: boolean;
};

type JsonObject = Record<string, unknown>;

const REFERENCE_YEAR_KEYS = ["referenceYear", "기준연도", "湲곗??곕룄"];
const DEFAULT_MUTABLE_STATUSES: LeaveImportStatus[] = ["PARSED", "VALIDATED", "FAILED", "CANCELLED"];
const batchInclude = {
  rows: {
    select: {
      id: true,
      monthlyUsageJson: true,
      rawJson: true,
      applied: true,
    },
  },
} satisfies Prisma.LeaveImportBatchInclude;

type BatchWithRows = Prisma.LeaveImportBatchGetPayload<{ include: typeof batchInclude }>;

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: argv.includes("--dry-run"),
    apply: argv.includes("--apply"),
    from: null,
    to: null,
    batchId: null,
    includeApplied: argv.includes("--include-applied=true") || argv.includes("--include-applied"),
  };

  for (const arg of argv) {
    if (arg.startsWith("--from=")) args.from = Number(arg.slice("--from=".length));
    if (arg.startsWith("--to=")) args.to = Number(arg.slice("--to=".length));
    if (arg.startsWith("--batch-id=")) args.batchId = arg.slice("--batch-id=".length);
    if (arg.startsWith("--batchId=")) args.batchId = arg.slice("--batchId=".length);
  }

  return args;
}

function assertValidArgs(args: Args) {
  if (args.dryRun === args.apply) {
    throw new Error("Use exactly one of --dry-run or --apply.");
  }
  if (!Number.isInteger(args.from) || !Number.isInteger(args.to)) {
    throw new Error("Both --from and --to years are required.");
  }
  if ((args.from as number) < 1900 || (args.to as number) < 1900) {
    throw new Error("Year must be 1900 or later.");
  }
  if (args.apply && args.includeApplied) {
    throw new Error(
      "Applying to APPLIED batches is blocked. Reverse/cancel the applied batch and re-upload with the correct year.",
    );
  }
}

function isPlainJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getJsonReferenceYear(value: unknown) {
  if (!isPlainJsonObject(value)) return null;

  for (const key of REFERENCE_YEAR_KEYS) {
    const raw = value[key];
    if (typeof raw === "number" && Number.isInteger(raw)) return raw;
  }

  return null;
}

function setJsonReferenceYear(value: unknown, year: number) {
  const next: JsonObject = isPlainJsonObject(value) ? { ...value } : {};

  for (const key of REFERENCE_YEAR_KEYS) {
    if (key in next) next[key] = year;
  }
  next.referenceYear = year;

  return next;
}

export function classifyRowReferenceYearPatch({
  monthlyUsageJson,
  rawJson,
  from,
}: {
  monthlyUsageJson: unknown;
  rawJson: unknown;
  from: number;
}) {
  const monthlyYear = getJsonReferenceYear(monthlyUsageJson);
  const rawYear = getJsonReferenceYear(rawJson);
  const rowYear = monthlyYear ?? rawYear;

  if (rowYear === null || rowYear === from) {
    return { patchable: true, rowYear, warning: null as string | null };
  }

  return {
    patchable: false,
    rowYear,
    warning: `row reference year ${rowYear} is neither empty nor the source year ${from}; row JSON was not changed.`,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertValidArgs(args);

  const prisma = getPrisma();
  const from = args.from as number;
  const to = args.to as number;

  const baseWhere = {
    ...(args.batchId ? { id: args.batchId } : {}),
    ...(args.includeApplied ? {} : { status: { in: DEFAULT_MUTABLE_STATUSES } }),
  };

  const batches = (await prisma.leaveImportBatch.findMany({
    where: baseWhere,
    include: batchInclude,
    orderBy: { createdAt: "asc" },
  })) as BatchWithRows[];

  const allFromBatches = batches.filter((batch) => {
    if (batch.targetYear === from) return true;
    return batch.rows.some((row) => {
      const patch = classifyRowReferenceYearPatch({
        monthlyUsageJson: row.monthlyUsageJson,
        rawJson: row.rawJson,
        from,
      });
      return patch.rowYear === from;
    });
  });
  const mutableBatches = allFromBatches.filter((batch) =>
    args.includeApplied ? true : DEFAULT_MUTABLE_STATUSES.includes(batch.status),
  );
  const appliedSkippedCount = await prisma.leaveImportBatch.count({
    where: {
      ...(args.batchId ? { id: args.batchId } : {}),
      targetYear: from,
      status: "APPLIED",
    },
  });
  const reversedSkippedCount = await prisma.leaveImportBatch.count({
    where: {
      ...(args.batchId ? { id: args.batchId } : {}),
      targetYear: from,
      status: "REVERSED",
    },
  });

  const rowPatchSummary = mutableBatches.flatMap((batch) =>
    batch.rows.map((row) => ({
      batchId: batch.id,
      rowId: row.id,
      patch: classifyRowReferenceYearPatch({
        monthlyUsageJson: row.monthlyUsageJson,
        rawJson: row.rawJson,
        from,
      }),
    })),
  );
  const patchableRowCount = rowPatchSummary.filter((item) => item.patch.patchable).length;
  const warningRowCount = rowPatchSummary.filter((item) => item.patch.warning).length;

  console.log(
    JSON.stringify(
      {
        mode: args.dryRun ? "dry-run" : "apply",
        from,
        to,
        batchId: args.batchId,
        includeApplied: args.includeApplied,
        scannedBatchCount: batches.length,
        candidateBatchCount: allFromBatches.length,
        mutableBatchCount: mutableBatches.length,
        appliedBatchSkippedCount: appliedSkippedCount,
        reversedBatchSkippedCount: reversedSkippedCount,
        patchableRowCount,
        warningRowCount,
        candidates: mutableBatches.map((batch) => ({
          batchId: batch.id,
          status: batch.status,
          currentTargetYear: batch.targetYear,
          nextTargetYear: to,
          rowCount: batch.rowCount,
          warningCount: batch.warningCount,
          errorCount: batch.errorCount,
        })),
        warnings: rowPatchSummary
          .filter((item) => item.patch.warning)
          .slice(0, 50)
          .map((item) => ({
            batchId: item.batchId,
            rowId: item.rowId,
            warning: item.patch.warning,
          })),
      },
      null,
      2,
    ),
  );

  if (args.dryRun) {
    console.log("Dry-run only. No data was changed.");
    if (appliedSkippedCount > 0) {
      console.log(
        "APPLIED batches were skipped. Do not change applied batch years directly; reverse/cancel and re-upload.",
      );
    }
    return;
  }

  for (const batch of mutableBatches) {
    if (batch.status === "APPLIED" || batch.status === "REVERSED") {
      throw new Error(`Batch ${batch.id} is ${batch.status}; direct reference-year patching is blocked.`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.leaveImportBatch.update({
        where: { id: batch.id },
        data: { targetYear: to },
      });

      for (const row of batch.rows) {
        const patch = classifyRowReferenceYearPatch({
          monthlyUsageJson: row.monthlyUsageJson,
          rawJson: row.rawJson,
          from,
        });
        if (!patch.patchable) continue;

        await tx.leaveImportRow.update({
          where: { id: row.id },
          data: {
            monthlyUsageJson: setJsonReferenceYear(row.monthlyUsageJson, to) as Prisma.InputJsonValue,
            rawJson: setJsonReferenceYear(row.rawJson, to) as Prisma.InputJsonValue,
          },
        });
      }
    });
  }

  console.log(
    JSON.stringify(
      {
        updatedBatchCount: mutableBatches.length,
        patchedRowCount: patchableRowCount,
        warningRowCount,
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await getPrisma().$disconnect();
    });
}
