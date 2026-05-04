import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  calculateReverseAdjustmentAmount,
  classifyLeaveBalanceDifference,
  createLeaveImportBatchFromWorkbook,
  leaveImportReverseIdempotencyKey,
  parseExcelDateCell,
  parseLeaveImportWorkbook,
  validateLeaveImportBatch,
} from "@/lib/leave/import";

function workbookBuffer(rows: unknown[][], sheetName = "Sheet1") {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

describe("leave import helpers", () => {
  it("calculates reverse adjustment amounts without deleting original records", () => {
    expect(calculateReverseAdjustmentAmount(2)).toBe(-2);
    expect(calculateReverseAdjustmentAmount(-1.5)).toBe(1.5);
    expect(calculateReverseAdjustmentAmount(0)).toBe(0);
  });

  it("builds deterministic reverse idempotency keys", () => {
    expect(
      leaveImportReverseIdempotencyKey({
        batchId: "batch1",
        rowId: "row2",
        userId: "user3",
        year: 2026,
      }),
    ).toBe("reverse-leave-import:batch1:user3:2026:row2");
  });

  it("classifies reconciliation balance differences", () => {
    expect(classifyLeaveBalanceDifference({ diff: 0 })).toEqual({
      status: "NORMAL",
      reasonCodes: [],
    });
    expect(classifyLeaveBalanceDifference({ diff: -1 })).toEqual({
      status: "DIFF",
      reasonCodes: ["REMAINING_DIFF"],
    });
    expect(classifyLeaveBalanceDifference({ diff: 0, duplicateLeaveRequestCount: 1 })).toEqual({
      status: "DUPLICATE_SUSPECT",
      reasonCodes: ["DUPLICATE_LEAVE_REQUEST"],
    });
    expect(classifyLeaveBalanceDifference({ diff: 0, hasUnknownRows: true })).toEqual({
      status: "NEEDS_REVIEW",
      reasonCodes: ["UNKNOWN_ROW_EXCLUDED"],
    });
  });

  it("converts Excel serial dates to date-only values", () => {
    expect(parseExcelDateCell(46028)?.toISOString().slice(0, 10)).toBe("2026-01-06");
    expect(parseExcelDateCell(46146)?.toISOString().slice(0, 10)).toBe("2026-05-04");
  });

  it("detects flexible leave balance headers with aliases", () => {
    const buffer = workbookBuffer([
      ["employeeName", "email", "phone", "team", "year", "granted", "used", "pending", "remaining"],
      ["Test User", "test@example.com", "010-1234-5678", "Ops", 2026, 15, 4, 1, 10],
    ]);

    const parsed = parseLeaveImportWorkbook({ buffer, requestedType: "MONTHLY_ANNUAL_USAGE" });

    expect(parsed.importType).toBe("MONTHLY_ANNUAL_USAGE");
    expect(parsed.targetYear).toBe(2026);
    expect(parsed.rows[0].name).toBe("Test User");
    expect(parsed.rows[0].email).toBe("test@example.com");
    expect(parsed.rows[0].phone).toBe("010-1234-5678");
    expect(parsed.rows[0].teamName).toBe("Ops");
    expect(parsed.rows[0].remainingAnnualDays).toBe(10);
    expect(parsed.rows[0].monthlyUsageJson?.referenceYear).toBe(2026);
  });

  it("uses selected reference year instead of employee hire year when monthly file has no year column", () => {
    const buffer = workbookBuffer([
      ["employeeName", "employeeNumber", "hireDate", "granted", "remaining"],
      ["Test User", "E001", new Date("2019-03-01T00:00:00.000Z"), 15, 9.5],
    ]);

    const parsed = parseLeaveImportWorkbook({
      buffer,
      requestedType: "MONTHLY_ANNUAL_USAGE",
      selectedYear: 2026,
    });

    expect(parsed.targetYear).toBe(2026);
    expect(parsed.rows[0].referenceYear).toBe(2026);
  });

  it("flags mixed or mismatched reference years instead of silently using an old year", () => {
    const buffer = workbookBuffer([
      ["employeeName", "employeeNumber", "year", "granted", "remaining"],
      ["Old Year", "TEST-001", 2019, 15, 14],
      ["Current Year", "TEST-002", 2026, 15, 13],
    ]);

    const parsed = parseLeaveImportWorkbook({
      buffer,
      requestedType: "MONTHLY_ANNUAL_USAGE",
      selectedYear: 2026,
    });

    expect(parsed.targetYear).toBe(2019);
    expect(parsed.rows.some((row) => row.errors.length > 0)).toBe(true);
  });

  it("rejects non half-day unit and duplicate balance rows", () => {
    const buffer = workbookBuffer([
      ["employeeName", "employeeNumber", "year", "granted", "used", "remaining"],
      ["Test User", "TEST-001", 2026, 15, 1, 13.25],
      ["Test User", "TEST-001", 2026, 15, 2, 13],
    ]);

    const parsed = parseLeaveImportWorkbook({ buffer, requestedType: "MONTHLY_ANNUAL_USAGE" });

    expect(parsed.rows[0].errors.length).toBeGreaterThan(0);
    expect(parsed.rows[1].errors.length).toBeGreaterThan(0);
  });

  it("matches balance import rows by email and normalized phone before preview", async () => {
    const buffer = workbookBuffer([
      ["employeeName", "email", "phone", "team", "year", "granted", "used", "remaining"],
      ["Email User", "mail@example.com", null, "Ops", 2026, 15, 5, 10],
      ["Phone User", null, "010-9999-0000", "Ops", 2026, 15, 4, 11],
    ]);
    type CreatedImportData = {
      matchedCount?: number;
      rows?: { create?: Array<{ matchedUserId: string | null; matchStatus: string }> };
      targetYear?: number | null;
    };
    const captured: { data?: CreatedImportData } = {};
    const prisma = {
      user: {
        findMany: async () => [
          {
            id: "user-email",
            name: "Email User",
            email: "mail@example.com",
            phone: null,
            status: "ACTIVE",
            profile: null,
            employmentProfile: null,
            team: { name: "Ops", code: null },
          },
          {
            id: "user-phone",
            name: "Phone User",
            email: "phone@example.com",
            phone: "01099990000",
            status: "ACTIVE",
            profile: null,
            employmentProfile: null,
            team: { name: "Ops", code: null },
          },
        ],
      },
      leaveTypeDefinition: { findMany: async () => [] },
      leaveImportBatch: {
        findFirst: async () => null,
        create: async ({ data }: { data: CreatedImportData }) => {
          captured.data = data;
          return { id: "batch1" };
        },
      },
      auditLog: { create: async () => ({ id: "audit1" }) },
    };

    await createLeaveImportBatchFromWorkbook({
      actorUserId: "owner1",
      fileName: "leave-balance.xlsx",
      fileSize: buffer.length,
      buffer,
      requestedType: "MONTHLY_ANNUAL_USAGE",
      selectedYear: 2026,
      prisma: prisma as never,
    });

    expect(captured.data?.targetYear).toBe(2026);
    expect(captured.data?.matchedCount).toBe(2);
    expect(captured.data?.rows?.create?.map((row) => row.matchedUserId)).toEqual(["user-email", "user-phone"]);
    expect(captured.data?.rows?.create?.every((row) => row.matchStatus === "MATCHED")).toBe(true);
  });

  it("blocks unmatched and unknown detailed rows during validation", async () => {
    const prisma = {
      leaveImportBatch: {
        findUnique: async () => ({
          id: "batch1",
          importType: "DETAILED_LEAVE_USAGE",
          targetYear: 2026,
          rows: [
            {
              id: "row1",
              batchId: "batch1",
              rowNumber: 2,
              matchStatus: "UNMATCHED",
              matchedUserId: null,
              errors: [],
              warnings: [],
              mappedLeaveTypeId: null,
              mappedStatus: "UNKNOWN",
              startDate: null,
              endDate: null,
              amountDays: null,
              applied: false,
            },
          ],
        }),
      },
      leaveRequest: { findFirst: async () => null },
      leaveLedger: { findUnique: async () => null },
    };

    const validation = await validateLeaveImportBatch("batch1", prisma as never);

    expect(validation.errorRows).toBe(1);
    expect(validation.rows[0].canApply).toBe(false);
  });

  it("warns on duplicate detailed rows without allowing double ledger creation", async () => {
    const date = new Date("2026-05-04T00:00:00.000Z");
    const prisma = {
      leaveImportBatch: {
        findUnique: async () => ({
          id: "batch1",
          importType: "DETAILED_LEAVE_USAGE",
          targetYear: 2026,
          rows: [
            {
              id: "row1",
              batchId: "batch1",
              rowNumber: 2,
              matchStatus: "MATCHED",
              matchedUserId: "user1",
              errors: [],
              warnings: [],
              mappedLeaveTypeId: "type1",
              mappedStatus: "APPROVED",
              startDate: date,
              endDate: date,
              amountDays: 1,
              applied: false,
            },
          ],
        }),
      },
      leaveRequest: { findFirst: async () => ({ id: "existing-request" }) },
      leaveLedger: { findUnique: async () => null },
    };

    const validation = await validateLeaveImportBatch("batch1", prisma as never);

    expect(validation.errorRows).toBe(0);
    expect(validation.duplicateSuspectRows).toBe(1);
    expect(validation.rows[0].applyMode).toBe("SKIP_DUPLICATE");
  });

  it("excludes cancelled detailed rows from used ledger estimates", async () => {
    const date = new Date("2026-05-04T00:00:00.000Z");
    const prisma = {
      leaveImportBatch: {
        findUnique: async () => ({
          id: "batch1",
          importType: "DETAILED_LEAVE_USAGE",
          targetYear: 2026,
          rows: [
            {
              id: "row1",
              batchId: "batch1",
              rowNumber: 2,
              matchStatus: "MATCHED",
              matchedUserId: "user1",
              errors: [],
              warnings: [],
              mappedLeaveTypeId: "type1",
              mappedStatus: "CANCELLED",
              startDate: date,
              endDate: date,
              amountDays: 1,
              applied: false,
            },
          ],
        }),
      },
      leaveRequest: { findFirst: async () => null },
      leaveLedger: { findUnique: async () => null },
    };

    const validation = await validateLeaveImportBatch("batch1", prisma as never);

    expect(validation.errorRows).toBe(0);
    expect(validation.applyableRows).toBe(1);
    expect(validation.excludedRows).toBe(1);
    expect(validation.estimatedLedgerCount).toBe(0);
    expect(validation.rows[0].applyMode).toBe("SKIP_CANCELLED");
  });

  it("blocks rows when an import idempotency ledger already exists", async () => {
    const date = new Date("2026-05-04T00:00:00.000Z");
    const prisma = {
      leaveImportBatch: {
        findUnique: async () => ({
          id: "batch1",
          importType: "DETAILED_LEAVE_USAGE",
          targetYear: 2026,
          rows: [
            {
              id: "row1",
              batchId: "batch1",
              rowNumber: 2,
              matchStatus: "MATCHED",
              matchedUserId: "user1",
              errors: [],
              warnings: [],
              mappedLeaveTypeId: "type1",
              mappedStatus: "APPROVED",
              startDate: date,
              endDate: date,
              amountDays: 1,
              applied: false,
            },
          ],
        }),
      },
      leaveRequest: { findFirst: async () => null },
      leaveLedger: { findUnique: async () => ({ id: "ledger1" }) },
    };

    const validation = await validateLeaveImportBatch("batch1", prisma as never);

    expect(validation.errorRows).toBe(1);
    expect(validation.applyableRows).toBe(0);
    expect(validation.rows[0].canApply).toBe(false);
    expect(validation.rows[0].existingLedgerId).toBe("ledger1");
    expect(validation.rows[0].applyMode).toBe("BLOCKED");
  });

  it("estimates annual adjustment only when imported remaining differs", async () => {
    const prisma = {
      leaveImportBatch: {
        findUnique: async () => ({
          id: "batch1",
          importType: "MONTHLY_ANNUAL_USAGE",
          targetYear: 2026,
          rows: [
            {
              id: "row1",
              batchId: "batch1",
              rowNumber: 2,
              matchStatus: "MATCHED",
              matchedUserId: "user1",
              errors: [],
              warnings: [],
              remainingAnnualDays: 9.5,
              applied: false,
            },
          ],
        }),
      },
      leaveRequest: { findFirst: async () => null },
      leaveLedger: {
        findUnique: async () => null,
        findMany: async () => [{ eventType: "GRANTED", amount: { toNumber: () => 11 }, metadata: null }],
      },
      leaveBalance: {
        findUnique: async () => ({ remainingDays: { toNumber: () => 11 } }),
      },
    };

    const validation = await validateLeaveImportBatch("batch1", prisma as never);

    expect(validation.errorRows).toBe(0);
    expect(validation.estimatedAdjustmentCount).toBe(1);
    expect(validation.estimatedLedgerCount).toBe(1);
  });
});
