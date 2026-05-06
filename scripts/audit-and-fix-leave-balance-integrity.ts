import { getPrisma } from "@/lib/db/prisma";
import {
  calculateUnderOneYearFiscalProratedLeave,
  calculateWorkedDaysInYear,
} from "@/lib/leave/annual-policy";
import { dateToDateOnly, todayInSeoul } from "@/lib/leave/calculate-business-days";
import { toNumber } from "@/lib/leave/balance";
import type { DateOnly } from "@/lib/leave/types";

let prismaForDisconnect: ReturnType<typeof getPrisma> | null = null;

type AuditIssue = {
  issueType: string;
  maskedUserId: string;
  year: number;
  currentValue?: number;
  expectedRule: string;
  suggestedAction: string;
  reviewRequired: boolean;
};

function parseYear(args: string[]) {
  const yearArg = args.find((arg) => arg.startsWith("--year="));
  const parsed = yearArg ? Number(yearArg.split("=")[1]) : Number(todayInSeoul().slice(0, 4));

  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) {
    throw new Error("Invalid --year value.");
  }

  return parsed;
}

function assertDryRunOnly(args: string[]) {
  if (args.includes("--apply")) {
    throw new Error("This integrity audit is dry-run only. No rows were changed.");
  }
}

function maskUserId(userId: string) {
  return `${userId.slice(0, 4)}...${userId.slice(-4)}`;
}

function serviceDays(hireDate: DateOnly, asOfDate: DateOnly) {
  return calculateWorkedDaysInYear({
    hireDate,
    year: Number(asOfDate.slice(0, 4)),
    endDate: asOfDate,
  });
}

async function main() {
  const args = process.argv.slice(2);
  assertDryRunOnly(args);

  const year = parseYear(args);
  const asOfDate = todayInSeoul();
  const prisma = getPrisma();
  prismaForDisconnect = prisma;
  const issues: AuditIssue[] = [];
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: { not: "EXTERNAL_PARTNER" },
    },
    select: {
      id: true,
      hireDate: true,
      profile: { select: { hireDate: true } },
    },
  });

  for (const user of users) {
    const hireDateValue = user.hireDate ?? user.profile?.hireDate ?? null;

    if (!hireDateValue) {
      issues.push({
        issueType: "MISSING_HIRE_DATE",
        maskedUserId: maskUserId(user.id),
        year,
        expectedRule: "Active internal employees need a hire date before leave proration can be audited.",
        suggestedAction: "Confirm HR profile hire date.",
        reviewRequired: true,
      });
      continue;
    }

    const hireDate = dateToDateOnly(hireDateValue);
    const prorated = calculateUnderOneYearFiscalProratedLeave({
      hireDate,
      fiscalYear: year,
      asOfDate,
    });
    const daysInService = serviceDays(hireDate, asOfDate);

    if (daysInService >= 365 && prorated.roundedDays > 0) {
      issues.push({
        issueType: "ONE_YEAR_OR_MORE_PRORATION_DETECTED",
        maskedUserId: maskUserId(user.id),
        year,
        currentValue: prorated.roundedDays,
        expectedRule: "Employees with 365 or more service days must not receive under-one-year fiscal proration.",
        suggestedAction: "Review calculation guard before applying balances.",
        reviewRequired: true,
      });
    }

    if (daysInService < 365 && prorated.reason === "ELIGIBLE" && prorated.roundedDays <= 0) {
      issues.push({
        issueType: "UNDER_ONE_YEAR_PRORATION_MISSING",
        maskedUserId: maskUserId(user.id),
        year,
        currentValue: prorated.roundedDays,
        expectedRule: "Eligible under-one-year previous-year new hires should have rounded prorated days.",
        suggestedAction: "Review hire date and fiscal year inputs.",
        reviewRequired: true,
      });
    }
  }

  const adjustments = await prisma.leaveAdjustment.groupBy({
    by: ["userId"],
    where: { fiscalYear: year },
    _sum: { days: true },
  });

  for (const adjustment of adjustments) {
    const amount = Math.abs(toNumber(adjustment._sum.days));

    if (amount >= 25) {
      issues.push({
        issueType: "EXCESSIVE_ADJUSTMENT_DAYS",
        maskedUserId: maskUserId(adjustment.userId),
        year,
        currentValue: amount,
        expectedRule: "Large adjustments should represent verified manual/import/correction deltas only.",
        suggestedAction: "Review whether used leave or imported remaining balance was recorded as adjustment.",
        reviewRequired: true,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun: true,
        year,
        checkedUsers: users.length,
        issueCount: issues.length,
        issues,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Leave integrity audit failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaForDisconnect?.$disconnect();
  });
