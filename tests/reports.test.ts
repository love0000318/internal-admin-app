import { describe, expect, it } from "vitest";

import {
  escapeCsvValue,
  generateCsvReport,
  maskReportPhoneNumber,
  sanitizeCsvValue,
} from "@/lib/reports/csv";
import { sanitizeReportRow } from "@/lib/reports/definitions";
import { assertCanExportReport } from "@/lib/reports/permissions";

describe("admin report CSV security", () => {
  it("includes UTF-8 BOM for Korean Excel compatibility", () => {
    const csv = generateCsvReport({
      headers: ["직원 이름"],
      rows: [{ "직원 이름": "양현지" }],
    });

    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("escapes commas, quotes, and newlines", () => {
    expect(escapeCsvValue('a,"b"\nc')).toBe('"a,""b""\nc"');
  });

  it("defends against CSV injection prefixes", () => {
    expect(sanitizeCsvValue("=HYPERLINK(\"http://example.com\")")).toMatch(/^'/);
    expect(sanitizeCsvValue("+SUM(1,2)")).toBe("'+SUM(1,2)");
    expect(sanitizeCsvValue("-10+20")).toBe("'-10+20");
    expect(sanitizeCsvValue("@cmd")).toBe("'@cmd");
  });

  it("keeps report exports on an allowlist", () => {
    const row = sanitizeReportRow(
      {
        "직원 이름": "양현지",
        "직원 이메일": "user@example.com",
        passwordHash: "secret",
        tokenHash: "token",
        fileKey: "private/path",
        residentIdEncrypted: "encrypted",
      },
      "HR_ONBOARDING",
    );

    expect(row).toHaveProperty("이름");
    expect(row).not.toHaveProperty("passwordHash");
    expect(row).not.toHaveProperty("tokenHash");
    expect(row).not.toHaveProperty("fileKey");
    expect(row).not.toHaveProperty("residentIdEncrypted");
  });

  it("masks phone numbers in HR reports", () => {
    expect(maskReportPhoneNumber("01012345678")).toBe("010****5678");
    expect(maskReportPhoneNumber(null)).toBe("-");
  });

  it("allows only OWNER to export reports", () => {
    expect(() =>
      assertCanExportReport({ id: "owner", role: "OWNER", status: "ACTIVE" }, "LEAVE_USAGE"),
    ).not.toThrow();
    expect(() =>
      assertCanExportReport(
        { id: "manager", role: "MANAGER", status: "ACTIVE" },
        "LEAVE_USAGE",
      ),
    ).toThrow("reports-forbidden");
  });
});
