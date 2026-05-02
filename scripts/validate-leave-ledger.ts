import { getPrisma } from "../src/lib/db/prisma";
import { calculateLeaveLedgerBalance } from "../src/lib/leave/ledger";
import { loadLocalEnv } from "./env";

type Issue = {
  code: string;
  message: string;
  userId?: string;
  leaveGrantId?: string;
};

function isNegative(value: number) {
  return value < -0.001;
}

async function main() {
  loadLocalEnv();
  const prisma = getPrisma();
  const issues: Issue[] = [];

  const [users, grants] = await Promise.all([
    prisma.user.findMany({ select: { id: true } }),
    prisma.leaveGrant.findMany(),
  ]);

  for (const user of users) {
    const entries = await prisma.leaveLedger.findMany({
      where: { userId: user.id },
    });
    const balance = calculateLeaveLedgerBalance(
      entries.map((entry) => ({
        eventType: entry.eventType,
        amount: entry.amount,
        metadata: entry.metadata,
      })),
    );

    if (isNegative(balance.pendingAmount)) {
      issues.push({
        code: "NEGATIVE_PENDING",
        message: `Pending amount is negative: ${balance.pendingAmount}`,
        userId: user.id,
      });
    }
    if (isNegative(balance.usedAmount)) {
      issues.push({
        code: "NEGATIVE_USED",
        message: `Used amount is negative: ${balance.usedAmount}`,
        userId: user.id,
      });
    }
    if (isNegative(balance.remainingAmount)) {
      issues.push({
        code: "NEGATIVE_REMAINING",
        message: `Remaining amount is negative: ${balance.remainingAmount}`,
        userId: user.id,
      });
    }
  }

  for (const grant of grants) {
    const entries = await prisma.leaveLedger.findMany({
      where: { leaveGrantId: grant.id },
    });
    const balance = calculateLeaveLedgerBalance(
      entries.map((entry) => ({
        eventType: entry.eventType,
        amount: entry.amount,
        metadata: entry.metadata,
      })),
    );

    const remainingDelta = Math.abs(balance.remainingAmount - grant.remainingAmount);
    const usedDelta = Math.abs(balance.usedAmount - grant.usedAmount);
    const pendingDelta = Math.abs(balance.pendingAmount - grant.pendingAmount);

    if (remainingDelta > 0.001 || usedDelta > 0.001 || pendingDelta > 0.001) {
      issues.push({
        code: "GRANT_AMOUNT_MISMATCH",
        message: `Stored grant amounts differ from ledger. stored remaining=${grant.remainingAmount}, ledger remaining=${balance.remainingAmount}, stored used=${grant.usedAmount}, ledger used=${balance.usedAmount}, stored pending=${grant.pendingAmount}, ledger pending=${balance.pendingAmount}`,
        userId: grant.userId,
        leaveGrantId: grant.id,
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      action: issues.length > 0 ? "LEAVE_LEDGER_INCONSISTENCY_FOUND" : "LEAVE_LEDGER_VALIDATED",
      targetType: "LEAVE_LEDGER",
      targetId: null,
      metadata: {
        checkedUsers: users.length,
        checkedGrants: grants.length,
        issuesFound: issues.length,
        issues: issues.slice(0, 50),
      },
    },
  });

  console.log("Leave ledger validation completed.");
  console.log(`Checked users: ${users.length}`);
  console.log(`Checked grants: ${grants.length}`);
  console.log(`Issues found: ${issues.length}`);

  for (const issue of issues.slice(0, 20)) {
    console.log(`[${issue.code}] ${issue.message}`);
  }

  if (issues.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
