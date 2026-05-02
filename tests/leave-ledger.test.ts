import { describe, expect, it } from "vitest";

import { calculateLeaveLedgerBalance } from "@/lib/leave/ledger";

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
