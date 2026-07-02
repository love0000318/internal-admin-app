import { describe, expect, it } from "vitest";

import {
  calculateLeaveLedgerBalance,
  recordLeaveRequestApprovedLedger,
  recordLeaveRequestPendingLedger,
} from "@/lib/leave/ledger";

describe("calculateLeaveLedgerBalance", () => {
  it("calculates granted, pending, used, and remaining amounts", () => {
    const balance = calculateLeaveLedgerBalance([
      { eventType: "GRANTED", amount: 17 },
      { eventType: "ADJUSTED", amount: 1, metadata: { signedAmount: 1 } },
      { eventType: "PENDING", amount: 1 },
      { eventType: "USED", amount: 1 },
    ]);

    expect(balance.grantedAmount).toBe(17);
    expect(balance.adjustedAmount).toBe(1);
    expect(balance.pendingAmount).toBe(0);
    expect(balance.usedAmount).toBe(1);
    expect(balance.remainingAmount).toBe(17);
  });

  it("restores pending amount on withdrawal or rejection", () => {
    const withdrawn = calculateLeaveLedgerBalance([
      { eventType: "GRANTED", amount: 5 },
      { eventType: "PENDING", amount: 0.5 },
      { eventType: "WITHDRAWN", amount: 0.5 },
    ]);
    const rejected = calculateLeaveLedgerBalance([
      { eventType: "GRANTED", amount: 5 },
      { eventType: "PENDING", amount: 0.5 },
      { eventType: "REJECTED", amount: 0.5 },
    ]);

    expect(withdrawn.pendingAmount).toBe(0);
    expect(withdrawn.remainingAmount).toBe(5);
    expect(rejected.pendingAmount).toBe(0);
    expect(rejected.remainingAmount).toBe(5);
  });

  it("restores used amount when an approved leave is cancelled", () => {
    const balance = calculateLeaveLedgerBalance([
      { eventType: "GRANTED", amount: 5 },
      { eventType: "PENDING", amount: 1 },
      { eventType: "USED", amount: 1 },
      { eventType: "CANCELLED", amount: 1 },
    ]);

    expect(balance.pendingAmount).toBe(0);
    expect(balance.usedAmount).toBe(0);
    expect(balance.remainingAmount).toBe(5);
  });

  it("supports negative manual adjustments through signed metadata", () => {
    const balance = calculateLeaveLedgerBalance([
      { eventType: "GRANTED", amount: 10 },
      { eventType: "ADJUSTED", amount: 2, metadata: { signedAmount: -2 } },
    ]);

    expect(balance.adjustedAmount).toBe(-2);
    expect(balance.remainingAmount).toBe(8);
  });

  it("subtracts expired and revoked amounts from remaining", () => {
    const balance = calculateLeaveLedgerBalance([
      { eventType: "GRANTED", amount: 3 },
      { eventType: "EXPIRED", amount: 1 },
      { eventType: "REVOKED", amount: 0.5 },
    ]);

    expect(balance.expiredAmount).toBe(1);
    expect(balance.revokedAmount).toBe(0.5);
    expect(balance.remainingAmount).toBe(1.5);
  });
});

describe("leave request ledger sources", () => {
  it("records birthday half-day request usage as birthday ledger, not annual request ledger", async () => {
    const createdLedgers: Array<Record<string, unknown>> = [];
    const tx = {
      leaveLedger: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const ledger = { id: `ledger-${createdLedgers.length + 1}`, ...data };
          createdLedgers.push(ledger);
          return ledger;
        },
      },
      auditLog: {
        create: async () => ({}),
      },
    };
    const birthdayRequest = {
      id: "birthday-request-1",
      userId: "user-1",
      leaveTypeId: "birthday-type",
      dayCount: 0.5,
      startDate: new Date("2026-05-29T00:00:00.000Z"),
      endDate: new Date("2026-05-29T00:00:00.000Z"),
      requestKind: "CUSTOM_GRANT",
      type: "HALF_DAY",
      customLeaveType: { code: "BIRTHDAY_HALF_DAY" },
      grantUsages: [
        {
          leaveGrantId: "birthday-grant-1",
          amount: 0.5,
          unit: "DAY",
          leaveGrantSource: "BIRTHDAY_AUTO",
          leaveTypeCode: "BIRTHDAY_HALF_DAY",
        },
      ],
    };

    await recordLeaveRequestPendingLedger({
      tx: tx as never,
      leaveRequest: birthdayRequest,
    });
    await recordLeaveRequestApprovedLedger({
      tx: tx as never,
      leaveRequest: birthdayRequest,
      actorId: "owner-1",
    });

    expect(createdLedgers).toHaveLength(2);
    expect(createdLedgers.map((ledger) => ledger.source)).toEqual([
      "BIRTHDAY_AUTO",
      "BIRTHDAY_AUTO",
    ]);
    expect(createdLedgers).not.toContainEqual(
      expect.objectContaining({ source: "LEAVE_APPROVAL" }),
    );
  });

  it("keeps normal annual leave request ledger sources unchanged", async () => {
    const createdLedgers: Array<Record<string, unknown>> = [];
    const tx = {
      leaveLedger: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const ledger = { id: `ledger-${createdLedgers.length + 1}`, ...data };
          createdLedgers.push(ledger);
          return ledger;
        },
      },
      auditLog: {
        create: async () => ({}),
      },
    };
    const annualRequest = {
      id: "annual-request-1",
      userId: "user-1",
      leaveTypeId: null,
      dayCount: 1,
      startDate: new Date("2026-05-29T00:00:00.000Z"),
      endDate: new Date("2026-05-29T00:00:00.000Z"),
      requestKind: "LEGACY",
      type: "ANNUAL",
      grantUsages: [],
    };

    await recordLeaveRequestPendingLedger({
      tx: tx as never,
      leaveRequest: annualRequest,
    });
    await recordLeaveRequestApprovedLedger({
      tx: tx as never,
      leaveRequest: annualRequest,
      actorId: "owner-1",
    });

    expect(createdLedgers.map((ledger) => ledger.source)).toEqual([
      "LEAVE_REQUEST",
      "LEAVE_APPROVAL",
    ]);
  });

  it("does not label reserve forces ledger entries as annual leave deductions", async () => {
    const createdLedgers: Array<Record<string, unknown>> = [];
    const tx = {
      leaveLedger: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const ledger = { id: `ledger-${createdLedgers.length + 1}`, ...data };
          createdLedgers.push(ledger);
          return ledger;
        },
      },
      auditLog: {
        create: async () => ({}),
      },
    };
    const reserveRequest = {
      id: "reserve-request-1",
      userId: "user-1",
      leaveTypeId: "reserve-type",
      dayCount: 1,
      startDate: new Date("2026-06-15T00:00:00.000Z"),
      endDate: new Date("2026-06-15T00:00:00.000Z"),
      requestKind: "LEGACY",
      type: "RESERVE_FORCES",
      grantUsages: [],
    };

    await recordLeaveRequestPendingLedger({
      tx: tx as never,
      leaveRequest: reserveRequest,
    });
    await recordLeaveRequestApprovedLedger({
      tx: tx as never,
      leaveRequest: reserveRequest,
      actorId: "owner-1",
    });

    expect(createdLedgers).toHaveLength(2);
    expect(
      createdLedgers.map((ledger) => (ledger.metadata as Record<string, unknown>).leaveType),
    ).toEqual(["RESERVE_FORCES", "RESERVE_FORCES"]);
    expect(createdLedgers).not.toContainEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({ leaveType: "ANNUAL" }),
      }),
    );
  });
});
