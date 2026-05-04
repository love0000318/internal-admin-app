import { describe, expect, it } from "vitest";

import {
  calculateReverseAdjustmentAmount,
  classifyLeaveBalanceDifference,
  createLeaveImportBatchFromWorkbook,
  leaveImportReverseIdempotencyKey,
  mapLeaveImportStatus,
  mapLeaveTypeCode,
  parseExcelDateCell,
  parseLeaveImportWorkbook,
  validateLeaveImportBatch,
} from "@/lib/leave/import";
import * as XLSX from "xlsx";

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
    expect(
      classifyLeaveBalanceDifference({
        diff: 0,
        duplicateLeaveRequestCount: 1,
      }),
    ).toEqual({
      status: "DUPLICATE_SUSPECT",
      reasonCodes: ["DUPLICATE_LEAVE_REQUEST"],
    });
    expect(
      classifyLeaveBalanceDifference({
        diff: 0,
        hasUnknownRows: true,
      }),
    ).toEqual({
      status: "NEEDS_REVIEW",
      reasonCodes: ["UNKNOWN_ROW_EXCLUDED"],
    });
  });

  it("converts Excel serial dates to date-only values", () => {
    expect(parseExcelDateCell(46028)?.toISOString().slice(0, 10)).toBe("2026-01-06");
    expect(parseExcelDateCell(46146)?.toISOString().slice(0, 10)).toBe("2026-05-04");
  });

  it("detects and parses monthly annual usage sheets", () => {
    const buffer = workbookBuffer(
      [
        [
          "이름",
          "사번",
          "입사일",
          "잔여 연차",
          "1월",
          "2월",
          "3월",
          "4월",
          "5월",
          "6월",
          "7월",
          "8월",
          "9월",
          "10월",
          "11월",
          "12월",
        ],
        ["홍길동", "E001", 46028, 9.5, 1, 0, 0.5, null, null, null, null, null, null, null, null, null],
      ],
      "월별 연차 사용 내역",
    );

    const parsed = parseLeaveImportWorkbook({ buffer });

    expect(parsed.importType).toBe("MONTHLY_ANNUAL_USAGE");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].remainingAnnualDays).toBe(9.5);
    expect(parsed.rows[0].monthlyUsageJson?.["3월"]).toBe(0.5);
  });

  it("detects flexible leave balance headers with aliases", () => {
    const buffer = workbookBuffer([
      ["직원명", "회사이메일", "휴대폰", "팀", "기준연도", "총 부여", "사용연차", "승인대기", "잔여연차"],
      ["김철수", "kim@example.com", "010-1234-5678", "테스트팀", 2026, 15, 4, 1, 10],
    ]);

    const parsed = parseLeaveImportWorkbook({ buffer, requestedType: "MONTHLY_ANNUAL_USAGE" });

    expect(parsed.importType).toBe("MONTHLY_ANNUAL_USAGE");
    expect(parsed.targetYear).toBe(2026);
    expect(parsed.rows[0].name).toBe("김철수");
    expect(parsed.rows[0].email).toBe("kim@example.com");
    expect(parsed.rows[0].phone).toBe("010-1234-5678");
    expect(parsed.rows[0].teamName).toBe("테스트팀");
    expect(parsed.rows[0].remainingAnnualDays).toBe(10);
    expect(parsed.rows[0].monthlyUsageJson?.["총 부여"]).toBe(15);
    expect(parsed.rows[0].monthlyUsageJson?.["사용"]).toBe(4);
    expect(parsed.rows[0].monthlyUsageJson?.["승인대기"]).toBe(1);
  });

  it("rejects non half-day unit and duplicate balance rows", () => {
    const buffer = workbookBuffer([
      ["직원명", "사번", "기준연도", "총부여", "사용", "잔여"],
      ["홍길동", "TEST-001", 2026, 15, 1, 13.25],
      ["홍길동", "TEST-001", 2026, 15, 2, 13],
    ]);

    const parsed = parseLeaveImportWorkbook({ buffer, requestedType: "MONTHLY_ANNUAL_USAGE" });

    expect(parsed.rows[0].errors).toContain("잔여 연차 값은 0.5일 단위로 입력해야 합니다.");
    expect(parsed.rows[1].errors).toContain("같은 직원과 기준연도 조합이 2행에도 있습니다.");
  });

  it("matches balance import rows by email and normalized phone before preview", async () => {
    const buffer = workbookBuffer([
      ["직원명", "회사이메일", "전화번호", "팀", "기준연도", "총부여", "사용", "잔여"],
      ["김이메일", "mail@example.com", null, "운영팀", 2026, 15, 5, 10],
      ["박전화", null, "010-9999-0000", "운영팀", 2026, 15, 4, 11],
    ]);
    type CreatedImportData = {
      matchedCount?: number;
      rows?: { create?: Array<{ matchedUserId: string | null; matchStatus: string }> };
    };
    const captured: { data?: CreatedImportData } = {};
    const prisma = {
      user: {
        findMany: async () => [
          {
            id: "user-email",
            name: "김이메일",
            email: "mail@example.com",
            phone: null,
            status: "ACTIVE",
            profile: null,
            employmentProfile: null,
            team: { name: "운영팀", code: null },
          },
          {
            id: "user-phone",
            name: "박전화",
            email: "phone@example.com",
            phone: "01099990000",
            status: "ACTIVE",
            profile: null,
            employmentProfile: null,
            team: { name: "운영팀", code: null },
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
      prisma: prisma as never,
    });

    expect(captured.data?.matchedCount).toBe(2);
    expect(captured.data?.rows?.create?.map((row) => row.matchedUserId)).toEqual(["user-email", "user-phone"]);
    expect(captured.data?.rows?.create?.every((row) => row.matchStatus === "MATCHED")).toBe(true);
  });

  it("detects detail headers after guide rows", () => {
    const buffer = workbookBuffer([
      ["안내", null, null],
      ["아래부터 데이터입니다.", null, null],
      [
        "사번",
        "이름",
        "회사내이름",
        "조직",
        "휴가 시작일",
        "휴가 종료일",
        "항목",
        "사용시간(일)",
        "사용시간(시간)",
        "상태",
        "증명자료",
      ],
      ["E001", "홍길동", "길동", "운영팀", 46028, 46028, "연차", 1, "8시간", "승인완료", "제출완료"],
    ]);

    const parsed = parseLeaveImportWorkbook({ buffer });

    expect(parsed.importType).toBe("DETAILED_LEAVE_USAGE");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].mappedLeaveTypeCode).toBe("ANNUAL");
    expect(parsed.rows[0].mappedStatus).toBe("APPROVED");
  });

  it("maps leave type and status conservatively", () => {
    expect(mapLeaveTypeCode("예비군 훈련 (학생, 기본 훈련: 1일)")).toBe("RESERVE_FORCES");
    expect(mapLeaveTypeCode("민방위 휴가 (4시간 교육 해당)")).toBe("CIVIL_DEFENSE");
    expect(mapLeaveImportStatus({ statusRaw: "", evidenceStatusRaw: "제출완료" })).toBe("UNKNOWN");
    expect(mapLeaveImportStatus({ statusRaw: "휴가취소" })).toBe("CANCELLED");
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
    expect(validation.rows[0].errors).toContain("직원을 찾을 수 없습니다.");
    expect(validation.rows[0].errors).toContain("휴가 상태를 확인해야 합니다.");
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
    expect(validation.rows[0].warnings).toContain("동일한 휴가 사용내역이 이미 존재할 수 있습니다.");
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
