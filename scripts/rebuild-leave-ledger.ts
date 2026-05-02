import { Prisma } from "../src/generated/prisma/client";
import { getPrisma } from "../src/lib/db/prisma";
import {
  recordAnnualAutoLedger,
  recordLeaveAdjustmentLedger,
  recordLeaveGrantCreatedLedger,
  recordLeaveGrantRevokedLedger,
  recordLeaveRequestApprovedLedger,
  recordLeaveRequestCancelledLedger,
  recordLeaveRequestPendingLedger,
  recordLeaveRequestRejectedLedger,
  recordLeaveRequestWithdrawnLedger,
} from "../src/lib/leave/ledger";
import { loadLocalEnv } from "./env";

function shouldReset() {
  return process.argv.includes("--reset");
}

async function main() {
  loadLocalEnv();
  const prisma = getPrisma();
  const reset = shouldReset();

  if (reset) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("--reset is blocked in production.");
    }

    await prisma.leaveLedger.deleteMany();
  }

  const currentYear = new Date().getUTCFullYear();
  const [users, adjustments, grants, requests] = await Promise.all([
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      include: {
        profile: true,
        employmentProfile: true,
      },
    }),
    prisma.leaveAdjustment.findMany(),
    prisma.leaveGrant.findMany(),
    prisma.leaveRequest.findMany({
      include: {
        grantUsages: true,
      },
    }),
  ]);

  let annualProcessed = 0;
  let adjustmentProcessed = 0;
  let grantProcessed = 0;
  let revokedProcessed = 0;
  let requestProcessed = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const user of users) {
        const hireDate =
          user.employmentProfile?.hireDate ??
          user.profile?.hireDate ??
          user.hireDate ??
          null;
        await recordAnnualAutoLedger({
          tx,
          userId: user.id,
          hireDate,
          year: currentYear,
        });
        annualProcessed += 1;
      }

      for (const adjustment of adjustments) {
        await recordLeaveAdjustmentLedger({
          tx,
          adjustment,
          createdByUserId: adjustment.createdByUserId ?? adjustment.createdById,
        });
        adjustmentProcessed += 1;
      }

      for (const grant of grants) {
        await recordLeaveGrantCreatedLedger({ tx, grant });
        grantProcessed += 1;

        if (grant.status === "REVOKED") {
          await recordLeaveGrantRevokedLedger({
            tx,
            grant,
            actorId: grant.revokedByUserId ?? grant.grantedByUserId,
          });
          revokedProcessed += 1;
        }
      }

      for (const request of requests) {
        await recordLeaveRequestPendingLedger({ tx, leaveRequest: request });

        if (request.status === "APPROVED") {
          await recordLeaveRequestApprovedLedger({
            tx,
            leaveRequest: request,
            actorId: request.reviewerId ?? request.userId,
          });
        } else if (request.status === "REJECTED") {
          await recordLeaveRequestRejectedLedger({
            tx,
            leaveRequest: request,
            actorId: request.reviewerId ?? request.userId,
          });
        } else if (request.status === "WITHDRAWN") {
          await recordLeaveRequestWithdrawnLedger({
            tx,
            leaveRequest: request,
            actorId: request.userId,
          });
        } else if (request.status === "CANCELLED") {
          await recordLeaveRequestApprovedLedger({
            tx,
            leaveRequest: request,
            actorId: request.reviewerId ?? request.userId,
          });
          await recordLeaveRequestCancelledLedger({
            tx,
            leaveRequest: request,
            actorId: request.reviewerId ?? request.userId,
          });
        }

        requestProcessed += 1;
      }

      await tx.auditLog.create({
        data: {
          action: "LEAVE_LEDGER_REBUILT",
          targetType: "LEAVE_LEDGER",
          targetId: null,
          metadata: {
            reset,
            currentYear,
            usersProcessed: users.length,
            annualProcessed,
            adjustmentProcessed,
            grantProcessed,
            revokedProcessed,
            requestProcessed,
          } satisfies Prisma.InputJsonObject,
        },
      });
    },
    { timeout: 30_000 },
  );

  const totalLedgers = await prisma.leaveLedger.count();

  console.log("Leave ledger rebuild completed.");
  console.log(`Users processed: ${users.length}`);
  console.log(`Annual grants processed: ${annualProcessed}`);
  console.log(`Adjustments processed: ${adjustmentProcessed}`);
  console.log(`Grants processed: ${grantProcessed}`);
  console.log(`Revoked grants processed: ${revokedProcessed}`);
  console.log(`Requests processed: ${requestProcessed}`);
  console.log(`Ledger entries total: ${totalLedgers}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
