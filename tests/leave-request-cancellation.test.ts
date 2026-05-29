import { describe, expect, it } from "vitest";

import {
  assertRequesterCanCancelApprovedLeaveRequest,
  canRequesterCancelApprovedLeaveRequest,
} from "@/lib/leave/cancellation";
import { calculateLeaveLedgerBalance } from "@/lib/leave/ledger";
import { restoreLeaveGrantUsedAmount } from "@/lib/leave/custom-grant-requests";

const futureApprovedRequest = {
  status: "APPROVED" as const,
  startDate: new Date("2026-05-10T00:00:00.000Z"),
  autoConfirmedAt: null,
};

describe("requester leave cancellation", () => {
  it("allows an approved leave before its start date", () => {
    expect(
      canRequesterCancelApprovedLeaveRequest({
        leaveRequest: futureApprovedRequest,
        today: "2026-05-09",
      }),
    ).toBe(true);

    expect(() =>
      assertRequesterCanCancelApprovedLeaveRequest({
        leaveRequest: futureApprovedRequest,
        today: "2026-05-09",
      }),
    ).not.toThrow();
  });

  it("blocks cancellation on or after the start date and for completed auto-confirmed leaves", () => {
    expect(
      canRequesterCancelApprovedLeaveRequest({
        leaveRequest: futureApprovedRequest,
        today: "2026-05-10",
      }),
    ).toBe(false);
    expect(() =>
      assertRequesterCanCancelApprovedLeaveRequest({
        leaveRequest: futureApprovedRequest,
        today: "2026-05-10",
      }),
    ).toThrow("already-started");

    expect(() =>
      assertRequesterCanCancelApprovedLeaveRequest({
        leaveRequest: {
          ...futureApprovedRequest,
          autoConfirmedAt: new Date("2026-05-11T00:00:00.000Z"),
        },
        today: "2026-05-09",
      }),
    ).toThrow("already-used");
  });

  it("restores annual ledger balance when an approved leave is cancelled", () => {
    const balance = calculateLeaveLedgerBalance([
      { eventType: "GRANTED", amount: 15 },
      { eventType: "PENDING", amount: 1 },
      { eventType: "USED", amount: 1 },
      { eventType: "CANCELLED", amount: 1 },
    ]);

    expect(balance.pendingAmount).toBe(0);
    expect(balance.usedAmount).toBe(0);
    expect(balance.remainingAmount).toBe(15);
  });

  it("restores custom grant used amount for cancelled approved custom leave", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const tx = {
      leaveGrant: {
        updateMany: async (args: Record<string, unknown>) => {
          updates.push(args);
          return { count: 1 };
        },
      },
    };

    await restoreLeaveGrantUsedAmount({
      tx: tx as never,
      leaveGrantId: "grant-1",
      amount: 0.5,
    });

    expect(updates).toEqual([
      {
        where: {
          id: "grant-1",
          usedAmount: { gte: 0.5 },
        },
        data: {
          usedAmount: { decrement: 0.5 },
          remainingAmount: { increment: 0.5 },
        },
      },
    ]);
  });

  it("rejects duplicate custom grant restoration when used amount is already gone", async () => {
    const tx = {
      leaveGrant: {
        updateMany: async () => ({ count: 0 }),
      },
    };

    await expect(
      restoreLeaveGrantUsedAmount({
        tx: tx as never,
        leaveGrantId: "grant-1",
        amount: 0.5,
      }),
    ).rejects.toThrow("grant-state");
  });
});
