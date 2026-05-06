import { getPrisma } from "@/lib/db/prisma";
import {
  assertOperationalCleanupApplyAllowed,
  isCleanupOnly,
  runOperationalCleanup,
  type CleanupMode,
  type CleanupOptions,
} from "@/lib/cleanup/operational-cleanup";

type CliOptions = CleanupOptions & {
  requestedApply: boolean;
  requestedDryRun: boolean;
};

function parseBoolean(value: string | undefined) {
  return value === "true";
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }

  return parsed;
}

function parseArgs(argv: string[]): CliOptions {
  let requestedApply = false;
  let requestedDryRun = false;
  let only = "all";
  let olderThanDays: number | undefined;
  let limit = 500;
  let verbose = false;

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    }

    if (arg === "--apply") {
      requestedApply = true;
      continue;
    }

    if (arg === "--dry-run") {
      requestedDryRun = true;
      continue;
    }

    if (arg.startsWith("--only=")) {
      only = arg.slice("--only=".length);
      continue;
    }

    if (arg.startsWith("--olderThanDays=")) {
      olderThanDays = parsePositiveInteger(
        arg.slice("--olderThanDays=".length),
        0,
      );
      continue;
    }

    if (arg.startsWith("--limit=")) {
      limit = Math.min(parsePositiveInteger(arg.slice("--limit=".length), 500), 1000);
      continue;
    }

    if (arg.startsWith("--verbose=")) {
      verbose = parseBoolean(arg.slice("--verbose=".length));
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (requestedApply && requestedDryRun) {
    throw new Error("Use either --dry-run or --apply, not both.");
  }

  if (!isCleanupOnly(only)) {
    throw new Error(`Unknown --only target: ${only}`);
  }

  const mode: CleanupMode = requestedApply ? "apply" : "dry-run";

  return {
    mode,
    requestedApply,
    requestedDryRun,
    only,
    olderThanDays,
    limit,
    verbose,
  };
}

function printResult(result: Awaited<ReturnType<typeof runOperationalCleanup>>) {
  const summary = {
    dryRun: result.dryRun,
    applied: result.applied,
    generatedAt: result.generatedAt,
    items: result.items.map((item) => ({
      target: item.target,
      action: item.action,
      retentionDays: item.retentionDays,
      candidateCount: item.candidateCount,
      affectedCount: item.affectedCount,
    })),
    warnings: result.warnings,
  };

  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertOperationalCleanupApplyAllowed(options, process.env);

  const result = await runOperationalCleanup(getPrisma(), options);
  printResult(result);
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : "Operational cleanup failed.";
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await getPrisma().$disconnect();
    } catch {
      // If DATABASE_URL was missing, Prisma was never initialized.
    }
  });
