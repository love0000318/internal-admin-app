import crypto from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import * as XLSX from "xlsx";

import { getPrisma } from "@/lib/db/prisma";
import { toNumber } from "@/lib/leave/balance";
import { dateOnlyToDate, dateToDateOnly, todayInSeoul } from "@/lib/leave/calculate-business-days";
import { createLeaveLedgerEntry, getUserLedgerBalance, roundLeaveAmount } from "@/lib/leave/ledger";
import type { DateOnly } from "@/lib/leave/types";
import { assertRecentStepUp } from "@/lib/security/step-up";

type Db = PrismaClient | Prisma.TransactionClient;

export type ParsedLeaveImportType = "MONTHLY_ANNUAL_USAGE" | "DETAILED_LEAVE_USAGE";
export type ParsedMappedStatus = "PENDING" | "APPROVED" | "CANCELLED" | "UNKNOWN";
export type ParsedMatchStatus = "MATCHED" | "MULTIPLE_MATCHES" | "UNMATCHED" | "ERROR";

type ParsedRow = {
  rowNumber: number;
  employeeNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  companyName?: string | null;
  teamName?: string | null;
  referenceYear?: number | null;
  hireDate?: Date | null;
  leaveTypeRaw?: string | null;
  mappedLeaveTypeCode?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  amountDays?: number | null;
  amountHoursText?: string | null;
  statusRaw?: string | null;
  mappedStatus?: ParsedMappedStatus | null;
  evidenceStatusRaw?: string | null;
  remainingAnnualDays?: number | null;
  monthlyUsageJson?: Record<string, number | null> | null;
  rawJson?: Record<string, unknown> | null;
  warnings: string[];
  errors: string[];
};

type ParsedWorkbook = {
  importType: ParsedLeaveImportType;
  targetYear: number | null;
  rows: ParsedRow[];
};

type MatchableUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  employeeNumber?: string | null;
  profile?: {
    employeeNumber: string | null;
    legalName: string | null;
    displayName: string | null;
  } | null;
  employmentProfile?: {
    organizationName: string | null;
    organizationCode: string | null;
  } | null;
  team?: {
    name: string;
    code: string | null;
  } | null;
};

type LeaveImportApplyRow = {
  id: string;
  batchId: string;
  matchStatus: string;
  matchedUserId: string | null;
  errors: unknown;
  remainingAnnualDays: number | null;
  startDate: Date | null;
  endDate: Date | null;
  amountDays: number | null;
  mappedStatus: ParsedMappedStatus | null;
  mappedLeaveTypeId: string | null;
  mappedLeaveTypeCode: string | null;
  evidenceStatusRaw: string | null;
  applied: boolean;
  warnings?: unknown;
};

export type LeaveImportRowValidation = {
  rowId: string;
  rowNumber: number;
  canApply: boolean;
  applyMode: "MONTHLY_ADJUSTMENT" | "DETAIL_REQUEST" | "SKIP_CANCELLED" | "SKIP_DUPLICATE" | "BLOCKED";
  errors: string[];
  warnings: string[];
  duplicateLeaveRequestId: string | null;
  existingLedgerId: string | null;
};

export type LeaveImportBatchValidation = {
  batchId: string;
  importType: ParsedLeaveImportType;
  rowCount: number;
  applyableRows: number;
  warningRows: number;
  errorRows: number;
  unmatchedRows: number;
  duplicateSuspectRows: number;
  unknownStatusRows: number;
  excludedRows: number;
  estimatedEmployeeCount: number;
  estimatedLeaveRequestCount: number;
  estimatedLedgerCount: number;
  estimatedAdjustmentCount: number;
  rows: LeaveImportRowValidation[];
};

const MAX_IMPORT_ROWS = 5000;
const MONTHLY_HEADERS = [
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
] as const;

const BALANCE_IMPORT_ALIASES = {
  employeeName: ["직원명", "이름", "성명", "구성원명", "employeeName"],
  email: ["이메일", "회사이메일", "개인이메일", "email"],
  phone: ["전화번호", "휴대폰", "휴대전화", "phone"],
  employeeNumber: ["사번", "직원번호", "employeeNumber"],
  teamName: ["팀", "조직", "team"],
  referenceYear: ["기준연도", "연도", "year"],
  hireDate: ["입사일", "hireDate"],
  grantedDays: ["총부여", "총 부여", "부여연차", "발생연차", "기본부여", "granted", "grantedDays"],
  usedDays: ["사용", "사용연차", "사용일수", "used", "usedDays"],
  remainingDays: ["잔여", "잔여연차", "잔여 연차", "남은연차", "remaining", "remainingDays"],
  pendingDays: ["승인대기", "대기", "pending", "pendingDays"],
  adjustedDays: ["조정", "adjustment", "adjustedDays"],
} as const;

const DETAIL_HEADERS = [
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
] as const;

function normalizeHeader(value: unknown) {
  return normalizeText(value).replace(/\s+/g, "");
}

function normalizeText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function nullableText(value: unknown) {
  const text = normalizeText(value);
  return text.length > 0 ? text : null;
}

function normalizeName(value: unknown) {
  return normalizeText(value).replace(/\s+/g, "").toLowerCase();
}

function normalizePhone(value: unknown) {
  return normalizeText(value).replace(/\D/g, "");
}

function normalizeEmail(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function dateOnly(date: Date) {
  return dateToDateOnly(date);
}

export function hashLeaveImportFile(buffer: Buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function parseExcelDateCell(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return dateOnlyToDate(dateToDateOnly(value));
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const utc = Date.UTC(1899, 11, 30) + Math.round(value) * 24 * 60 * 60 * 1000;
    return dateOnlyToDate(dateToDateOnly(new Date(utc)));
  }

  const text = normalizeText(value);
  if (!text) return null;

  const normalized = text
    .replace(/[.]/g, "-")
    .replace(/[년월]/g, "-")
    .replace(/일/g, "")
    .replace(/\s+/g, "");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  return dateOnlyToDate(
    `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` as DateOnly,
  );
}

function numberCell(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = normalizeText(value).replace(/,/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function detectHeaderRow(rows: unknown[][], requiredHeaders: readonly string[]) {
  const normalizedRequired = requiredHeaders.map(normalizeHeader);

  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const headers = rows[index].map(normalizeHeader);
    const found = normalizedRequired.filter((header) => headers.includes(header));

    if (found.length >= Math.min(4, normalizedRequired.length)) {
      return index;
    }
  }

  return -1;
}

function headerIndexMap(headerRow: unknown[]) {
  const map = new Map<string, number>();
  headerRow.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (normalized) map.set(normalized, index);
  });
  return map;
}

function cell(row: unknown[], headers: Map<string, number>, header: string) {
  const index = headers.get(normalizeHeader(header));
  return index === undefined ? null : row[index];
}

function cellAny(row: unknown[], headers: Map<string, number>, aliases: readonly string[]) {
  for (const alias of aliases) {
    const value = cell(row, headers, alias);
    if (normalizeText(value)) return value;
  }

  return null;
}

function hasAnyHeader(headers: Map<string, number>, aliases: readonly string[]) {
  return aliases.some((alias) => headers.has(normalizeHeader(alias)));
}

function detectBalanceHeaderRow(rows: unknown[][]) {
  const oldHeaderRow = detectHeaderRow(rows, MONTHLY_HEADERS);
  if (oldHeaderRow >= 0) return oldHeaderRow;

  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const headers = headerIndexMap(rows[index]);
    const hasIdentifier =
      hasAnyHeader(headers, BALANCE_IMPORT_ALIASES.employeeName) ||
      hasAnyHeader(headers, BALANCE_IMPORT_ALIASES.employeeNumber) ||
      hasAnyHeader(headers, BALANCE_IMPORT_ALIASES.email) ||
      hasAnyHeader(headers, BALANCE_IMPORT_ALIASES.phone);
    const hasRemaining = hasAnyHeader(headers, BALANCE_IMPORT_ALIASES.remainingDays);
    const hasBalanceValue =
      hasAnyHeader(headers, BALANCE_IMPORT_ALIASES.grantedDays) ||
      hasAnyHeader(headers, BALANCE_IMPORT_ALIASES.usedDays) ||
      MONTHLY_HEADERS.some((header) => hasAnyHeader(headers, [header]));

    if (hasIdentifier && hasRemaining && hasBalanceValue) return index;
  }

  return -1;
}

function isHalfDayUnit(value: number | null | undefined) {
  if (value === null || value === undefined) return true;
  return Math.abs(value * 2 - Math.round(value * 2)) < 0.000001;
}

function addNumberValidation({
  label,
  value,
  errors,
  allowNegative = false,
}: {
  label: string;
  value: number | null | undefined;
  errors: string[];
  allowNegative?: boolean;
}) {
  if (value === null || value === undefined) return;
  if (!allowNegative && value < 0) errors.push(`${label}은 음수일 수 없습니다.`);
  if (!isHalfDayUnit(value)) errors.push(`${label} 값은 0.5일 단위로 입력해야 합니다.`);
}

export function mapLeaveTypeCode(raw: unknown) {
  const text = normalizeText(raw);
  const normalized = text.replace(/\s+/g, "");

  if (!normalized) return null;
  if (normalized.includes("생일") && normalized.includes("반차")) return "BIRTHDAY_HALF_DAY";
  if (normalized.includes("연차")) return "ANNUAL";
  if (normalized.includes("반차")) return "HALF_DAY";
  if (normalized.includes("포상")) return "REWARD";
  if (normalized.includes("예비군")) return "RESERVE_FORCES";
  if (normalized.includes("민방위")) return "CIVIL_DEFENSE";

  return null;
}

export function mapLeaveImportStatus({
  statusRaw,
  evidenceStatusRaw,
}: {
  statusRaw?: unknown;
  evidenceStatusRaw?: unknown;
}): ParsedMappedStatus {
  const status = normalizeText(statusRaw).replace(/\s+/g, "");
  const evidence = normalizeText(evidenceStatusRaw);

  if (status.includes("승인대기")) return "PENDING";
  if (status.includes("취소")) return "CANCELLED";
  if (status.includes("승인완료") || status.includes("사용완료") || status.includes("완료")) {
    return "APPROVED";
  }

  return evidence ? "UNKNOWN" : "UNKNOWN";
}

function parseMonthlyRows(sheetRows: unknown[][]): ParsedRow[] {
  const headerRowIndex = detectBalanceHeaderRow(sheetRows);
  if (headerRowIndex < 0) {
    throw new Error("휴가 현황 또는 월별 연차 사용 내역 header를 찾을 수 없습니다.");
  }

  const headers = headerIndexMap(sheetRows[headerRowIndex]);
  const parsedRows: ParsedRow[] = [];
  const duplicateKeys = new Map<string, number>();

  for (let index = headerRowIndex + 1; index < sheetRows.length; index += 1) {
    const row = sheetRows[index];
    const name = nullableText(cellAny(row, headers, BALANCE_IMPORT_ALIASES.employeeName));
    const employeeNumber = nullableText(cellAny(row, headers, BALANCE_IMPORT_ALIASES.employeeNumber));
    const email = nullableText(cellAny(row, headers, BALANCE_IMPORT_ALIASES.email));
    const phone = nullableText(cellAny(row, headers, BALANCE_IMPORT_ALIASES.phone));
    const teamName = nullableText(cellAny(row, headers, BALANCE_IMPORT_ALIASES.teamName));
    const referenceYear = numberCell(cellAny(row, headers, BALANCE_IMPORT_ALIASES.referenceYear));
    const grantedDays = numberCell(cellAny(row, headers, BALANCE_IMPORT_ALIASES.grantedDays));
    const usedDays = numberCell(cellAny(row, headers, BALANCE_IMPORT_ALIASES.usedDays));
    const pendingDays = numberCell(cellAny(row, headers, BALANCE_IMPORT_ALIASES.pendingDays));
    const adjustedDays = numberCell(cellAny(row, headers, BALANCE_IMPORT_ALIASES.adjustedDays));
    const remainingAnnualDays = numberCell(cellAny(row, headers, BALANCE_IMPORT_ALIASES.remainingDays));

    if (!name && !employeeNumber && !email && !phone && remainingAnnualDays === null) continue;

    const monthlyUsageJson: Record<string, number | null> = {};
    if (referenceYear !== null) monthlyUsageJson["기준연도"] = referenceYear;
    if (grantedDays !== null) monthlyUsageJson["총 부여"] = grantedDays;
    if (usedDays !== null) monthlyUsageJson["사용"] = usedDays;
    if (pendingDays !== null) monthlyUsageJson["승인대기"] = pendingDays;
    if (adjustedDays !== null) monthlyUsageJson["조정"] = adjustedDays;
    for (let month = 1; month <= 12; month += 1) {
      monthlyUsageJson[`${month}월`] = numberCell(cell(row, headers, `${month}월`));
    }

    const warnings: string[] = [];
    const errors: string[] = [];
    if (!name && !employeeNumber && !email && !phone) {
      errors.push("직원명, 사번, 이메일, 전화번호 중 하나가 필요합니다.");
    }
    if (referenceYear !== null && !Number.isInteger(referenceYear)) {
      errors.push("기준연도는 정수여야 합니다.");
    }
    if (remainingAnnualDays === null) errors.push("잔여 연차 값이 필요합니다.");
    addNumberValidation({ label: "총 부여 연차", value: grantedDays, errors });
    addNumberValidation({ label: "사용 연차", value: usedDays, errors });
    addNumberValidation({ label: "승인대기 연차", value: pendingDays, errors });
    addNumberValidation({ label: "잔여 연차", value: remainingAnnualDays, errors });
    addNumberValidation({ label: "조정 연차", value: adjustedDays, errors, allowNegative: true });
    if (grantedDays !== null && remainingAnnualDays !== null && remainingAnnualDays > grantedDays) {
      errors.push("잔여 연차가 총 부여 연차보다 큽니다.");
    }
    if (grantedDays !== null && usedDays !== null && usedDays > grantedDays) {
      warnings.push("사용 연차가 총 부여 연차보다 큽니다. 원본 파일을 확인하세요.");
    }
    if (grantedDays !== null && usedDays !== null && remainingAnnualDays !== null) {
      const expectedRemaining = roundLeaveAmount(grantedDays - usedDays + (adjustedDays ?? 0));
      if (Math.abs(expectedRemaining - remainingAnnualDays) > 0.5) {
        warnings.push("총 부여, 사용, 잔여 연차의 차이가 큽니다. 반영 전 확인하세요.");
      }
    }

    const duplicateKey = [
      normalizeText(employeeNumber),
      normalizeEmail(email),
      normalizePhone(phone),
      normalizeName(name),
      normalizeName(teamName),
      referenceYear ?? "NO_YEAR",
    ].join("|");
    if (duplicateKey.replace(/\|/g, "")) {
      const previousRowNumber = duplicateKeys.get(duplicateKey);
      if (previousRowNumber) {
        errors.push(`같은 직원과 기준연도 조합이 ${previousRowNumber}행에도 있습니다.`);
      } else {
        duplicateKeys.set(duplicateKey, index + 1);
      }
    }

    parsedRows.push({
      rowNumber: index + 1,
      employeeNumber,
      email,
      phone,
      name,
      teamName,
      referenceYear,
      hireDate: parseExcelDateCell(cellAny(row, headers, BALANCE_IMPORT_ALIASES.hireDate)),
      remainingAnnualDays,
      monthlyUsageJson,
      rawJson: {
        직원명: name,
        사번: employeeNumber,
        이메일: email ? `${email.slice(0, 2)}***` : null,
        전화번호: phone ? `${phone.slice(0, 3)}****` : null,
        팀: teamName,
        기준연도: referenceYear,
        입사일: nullableText(cellAny(row, headers, BALANCE_IMPORT_ALIASES.hireDate)),
        "총 부여": grantedDays,
        사용: usedDays,
        승인대기: pendingDays,
        조정: adjustedDays,
        "잔여 연차": remainingAnnualDays,
        ...monthlyUsageJson,
      },
      warnings,
      errors,
    });
  }

  return parsedRows;
}

function parseDetailRows(sheetRows: unknown[][]): ParsedRow[] {
  const headerRowIndex = detectHeaderRow(sheetRows, DETAIL_HEADERS);
  if (headerRowIndex < 0) {
    throw new Error("휴가 사용 상세 내역 header를 찾을 수 없습니다.");
  }

  const headers = headerIndexMap(sheetRows[headerRowIndex]);
  const parsedRows: ParsedRow[] = [];

  for (let index = headerRowIndex + 1; index < sheetRows.length; index += 1) {
    const row = sheetRows[index];
    const employeeNumber = nullableText(cell(row, headers, "사번"));
    const name = nullableText(cell(row, headers, "이름"));
    const companyName = nullableText(cell(row, headers, "회사내이름"));
    const teamName = nullableText(cell(row, headers, "조직"));
    const leaveTypeRaw = nullableText(cell(row, headers, "항목"));
    const startDate = parseExcelDateCell(cell(row, headers, "휴가 시작일"));
    const endDate = parseExcelDateCell(cell(row, headers, "휴가 종료일"));
    const amountDays = numberCell(cell(row, headers, "사용시간(일)"));
    const statusRaw = nullableText(cell(row, headers, "상태"));
    const evidenceStatusRaw = nullableText(cell(row, headers, "증명자료"));

    if (!employeeNumber && !name && !companyName && !leaveTypeRaw && !startDate && !endDate) continue;

    const warnings: string[] = [];
    const errors: string[] = [];
    if (!employeeNumber && !name && !companyName) errors.push("직원 식별 정보가 필요합니다.");
    if (!startDate || !endDate) errors.push("휴가 시작일과 종료일이 필요합니다.");
    if (startDate && endDate && dateOnly(startDate) > dateOnly(endDate)) {
      errors.push("휴가 시작일이 종료일보다 늦습니다.");
    }
    if (!amountDays || amountDays <= 0) warnings.push("사용시간(일)이 비어 있거나 0 이하입니다.");

    const mappedLeaveTypeCode = mapLeaveTypeCode(leaveTypeRaw);
    if (!mappedLeaveTypeCode) warnings.push("휴가 유형 매핑 확인이 필요합니다.");

    const mappedStatus = mapLeaveImportStatus({ statusRaw, evidenceStatusRaw });
    if (mappedStatus === "UNKNOWN") warnings.push("상태를 검토해야 합니다.");

    parsedRows.push({
      rowNumber: index + 1,
      employeeNumber,
      name,
      companyName,
      teamName,
      leaveTypeRaw,
      mappedLeaveTypeCode,
      startDate,
      endDate,
      amountDays,
      amountHoursText: nullableText(cell(row, headers, "사용시간(시간)")),
      statusRaw,
      mappedStatus,
      evidenceStatusRaw,
      rawJson: {
        사번: employeeNumber,
        이름: name,
        회사내이름: companyName,
        조직: teamName,
        "휴가 시작일": startDate ? dateOnly(startDate) : null,
        "휴가 종료일": endDate ? dateOnly(endDate) : null,
        항목: leaveTypeRaw,
        "사용시간(일)": amountDays,
        "사용시간(시간)": nullableText(cell(row, headers, "사용시간(시간)")),
        상태: statusRaw,
        증명자료: evidenceStatusRaw,
      },
      warnings,
      errors,
    });
  }

  return parsedRows;
}

export function parseLeaveImportWorkbook({
  buffer,
  requestedType,
}: {
  buffer: Buffer;
  requestedType?: ParsedLeaveImportType | "AUTO";
}): ParsedWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheets = workbook.SheetNames.map((sheetName) => ({
    sheetName,
    rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      raw: true,
      defval: null,
    }) as unknown[][],
  }));

  const monthlySheet =
    sheets.find((sheet) => sheet.sheetName.includes("월별 연차 사용 내역")) ??
    sheets.find((sheet) => detectBalanceHeaderRow(sheet.rows) >= 0);
  const detailSheet = sheets.find((sheet) => detectHeaderRow(sheet.rows, DETAIL_HEADERS) >= 0);

  const importType =
    requestedType && requestedType !== "AUTO"
      ? requestedType
      : monthlySheet
        ? "MONTHLY_ANNUAL_USAGE"
        : detailSheet
          ? "DETAILED_LEAVE_USAGE"
          : null;

  if (!importType) {
    throw new Error("지원하는 엑셀 양식을 찾을 수 없습니다.");
  }

  const rows =
    importType === "MONTHLY_ANNUAL_USAGE"
      ? parseMonthlyRows((monthlySheet ?? sheets[0]).rows)
      : parseDetailRows((detailSheet ?? sheets[0]).rows);

  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`한 번에 ${MAX_IMPORT_ROWS}행까지만 업로드할 수 있습니다.`);
  }

  const explicitYears = rows
    .map((row) => row.referenceYear)
    .filter((year): year is number => Number.isInteger(year));
  const dateYears = rows
    .map((row) => row.startDate ?? row.hireDate)
    .filter(Boolean)
    .map((date) => Number(dateOnly(date as Date).slice(0, 4)));
  const years = explicitYears.length > 0 ? explicitYears : dateYears;
  const distinctYears = Array.from(new Set(years));
  if (distinctYears.length > 1 && importType === "MONTHLY_ANNUAL_USAGE") {
    rows.forEach((row) => {
      if (row.referenceYear && row.referenceYear !== distinctYears[0]) {
        row.errors.push("하나의 파일 안에 여러 기준연도가 섞여 있습니다.");
      }
    });
  }

  return {
    importType,
    targetYear: distinctYears[0] ?? Number(todayInSeoul().slice(0, 4)),
    rows,
  };
}

function matchImportRow(row: ParsedRow, users: MatchableUser[]) {
  const employeeNumber = normalizeText(row.employeeNumber);
  if (employeeNumber) {
    const matches = users.filter(
      (user) =>
        normalizeText(user.employeeNumber) === employeeNumber ||
        normalizeText(user.profile?.employeeNumber) === employeeNumber,
    );
    if (matches.length === 1) return { status: "MATCHED" as const, userId: matches[0].id };
    if (matches.length > 1) return { status: "MULTIPLE_MATCHES" as const, userId: null };
  }

  const email = normalizeEmail(row.email);
  if (email) {
    const matches = users.filter((user) => normalizeEmail(user.email) === email);
    if (matches.length === 1) return { status: "MATCHED" as const, userId: matches[0].id };
    if (matches.length > 1) return { status: "MULTIPLE_MATCHES" as const, userId: null };
  }

  const phone = normalizePhone(row.phone);
  if (phone) {
    const matches = users.filter((user) => normalizePhone(user.phone) === phone);
    if (matches.length === 1) return { status: "MATCHED" as const, userId: matches[0].id };
    if (matches.length > 1) return { status: "MULTIPLE_MATCHES" as const, userId: null };
  }

  const companyName = normalizeName(row.companyName);
  if (companyName) {
    const matches = users.filter(
      (user) =>
        normalizeName(user.profile?.displayName) === companyName ||
        normalizeName(user.profile?.legalName) === companyName ||
        normalizeName(user.name) === companyName,
    );
    if (matches.length === 1) return { status: "MATCHED" as const, userId: matches[0].id };
    if (matches.length > 1) return { status: "MULTIPLE_MATCHES" as const, userId: null };
  }

  const name = normalizeName(row.name);
  if (name) {
    let matches = users.filter(
      (user) =>
        normalizeName(user.name) === name ||
        normalizeName(user.profile?.displayName) === name ||
        normalizeName(user.profile?.legalName) === name,
    );

    const teamName = normalizeName(row.teamName);
    if (teamName) {
      matches = matches.filter(
        (user) =>
          normalizeName(user.team?.name) === teamName ||
          normalizeName(user.team?.code) === teamName ||
          normalizeName(user.employmentProfile?.organizationName) === teamName ||
          normalizeName(user.employmentProfile?.organizationCode) === teamName,
      );
    }

    if (matches.length === 1) return { status: "MATCHED" as const, userId: matches[0].id };
    if (matches.length > 1) return { status: "MULTIPLE_MATCHES" as const, userId: null };
  }

  return { status: "UNMATCHED" as const, userId: null };
}

function monthlyCount(rows: Array<{ matchStatus: string; warnings: unknown; errors: unknown }>) {
  return {
    matchedCount: rows.filter((row) => row.matchStatus === "MATCHED").length,
    unmatchedCount: rows.filter((row) => row.matchStatus !== "MATCHED").length,
    warningCount: rows.filter((row) => Array.isArray(row.warnings) && row.warnings.length > 0).length,
    errorCount: rows.filter((row) => Array.isArray(row.errors) && row.errors.length > 0).length,
  };
}

export async function createLeaveImportBatchFromWorkbook({
  actorUserId,
  fileName,
  fileSize,
  buffer,
  requestedType = "AUTO",
  prisma = getPrisma(),
}: {
  actorUserId: string;
  fileName: string;
  fileSize?: number;
  buffer: Buffer;
  requestedType?: ParsedLeaveImportType | "AUTO";
  prisma?: PrismaClient;
}) {
  const fileHash = hashLeaveImportFile(buffer);
  const parsed = parseLeaveImportWorkbook({ buffer, requestedType });
  const [users, leaveTypes, duplicateBatch] = await Promise.all([
    prisma.user.findMany({
      where: { status: "ACTIVE", role: { not: "EXTERNAL_PARTNER" } },
      include: { profile: true, employmentProfile: true, team: true },
    }),
    prisma.leaveTypeDefinition.findMany({ where: { isEnabled: true } }),
    prisma.leaveImportBatch.findFirst({ where: { fileHash, status: { not: "CANCELLED" } } }),
  ]);

  const leaveTypeByCode = new Map(leaveTypes.map((leaveType) => [leaveType.code, leaveType]));
  const preparedRows = parsed.rows.map((row) => {
    const match = matchImportRow(row, users as MatchableUser[]);
    const leaveType = row.mappedLeaveTypeCode ? leaveTypeByCode.get(row.mappedLeaveTypeCode) : null;
    const extraWarnings = [
      duplicateBatch ? "같은 파일 해시의 import 이력이 있습니다. 중복 반영 여부를 확인하세요." : "",
      row.mappedLeaveTypeCode && !leaveType ? `휴가 유형 ${row.mappedLeaveTypeCode} 매핑이 필요합니다.` : "",
      match.status === "MULTIPLE_MATCHES" ? "직원 후보가 2명 이상입니다. 수동 확인이 필요합니다." : "",
      match.status === "UNMATCHED" ? "직원을 찾지 못했습니다." : "",
    ].filter(Boolean);
    const extraErrors: string[] = [];

    return {
      row,
      match,
      leaveType,
      warnings: [...row.warnings, ...extraWarnings],
      errors: [...row.errors, ...extraErrors],
    };
  });

  const counts = monthlyCount(
    preparedRows.map((item) => ({
      matchStatus: item.match.status,
      warnings: item.warnings,
      errors: item.errors,
    })),
  );

  const batch = await prisma.leaveImportBatch.create({
    data: {
      importType: parsed.importType,
      status: counts.errorCount > 0 ? "PARSED" : "VALIDATED",
      originalFileName: fileName,
      fileSize,
      fileHash,
      uploadedByUserId: actorUserId,
      targetYear: parsed.targetYear,
      rowCount: preparedRows.length,
      ...counts,
      rows: {
        create: preparedRows.map(({ row, match, leaveType, warnings, errors }) => ({
          rowNumber: row.rowNumber,
          matchedUserId: match.userId,
          matchStatus: match.status,
          employeeNumber: row.employeeNumber,
          name: row.name,
          companyName: row.companyName,
          teamName: row.teamName,
          hireDate: row.hireDate,
          leaveTypeRaw: row.leaveTypeRaw,
          mappedLeaveTypeId: leaveType?.id ?? null,
          mappedLeaveTypeCode: row.mappedLeaveTypeCode,
          startDate: row.startDate,
          endDate: row.endDate,
          amountDays: row.amountDays,
          amountHoursText: row.amountHoursText,
          statusRaw: row.statusRaw,
          mappedStatus: row.mappedStatus,
          evidenceStatusRaw: row.evidenceStatusRaw,
          remainingAnnualDays: row.remainingAnnualDays,
          monthlyUsageJson: row.monthlyUsageJson ? toInputJson(row.monthlyUsageJson) : Prisma.JsonNull,
          rawJson: row.rawJson ? toInputJson(row.rawJson) : Prisma.JsonNull,
          warnings: warnings.length ? warnings : Prisma.JsonNull,
          errors: errors.length ? errors : Prisma.JsonNull,
        })),
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actorUserId,
      actorUserId,
      action: "LEAVE_IMPORT_FILE_UPLOADED",
      targetType: "LEAVE_IMPORT_BATCH",
      targetId: batch.id,
      metadata: toInputJson({
        batchId: batch.id,
        importType: parsed.importType,
        rowCount: preparedRows.length,
        matchedCount: counts.matchedCount,
        unmatchedCount: counts.unmatchedCount,
        warningCount: counts.warningCount,
        errorCount: counts.errorCount,
        fileHashPrefix: fileHash.slice(0, 12),
      }),
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: actorUserId,
      actorUserId,
      action: counts.errorCount > 0 ? "LEAVE_IMPORT_PARSED" : "LEAVE_IMPORT_VALIDATED",
      targetType: "LEAVE_IMPORT_BATCH",
      targetId: batch.id,
      metadata: toInputJson({
        batchId: batch.id,
        importType: parsed.importType,
        rowCount: preparedRows.length,
        matchedCount: counts.matchedCount,
        unmatchedCount: counts.unmatchedCount,
        warningCount: counts.warningCount,
        errorCount: counts.errorCount,
      }),
    },
  });

  return batch;
}

export async function getLeaveImportBatchForPreview(batchId: string, prisma = getPrisma()) {
  return prisma.leaveImportBatch.findUnique({
    where: { id: batchId },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
      appliedBy: { select: { id: true, name: true, email: true } },
      reversedBy: { select: { id: true, name: true, email: true } },
      rows: {
        include: {
          matchedUser: {
            select: {
              id: true,
              name: true,
              email: true,
              team: { select: { name: true } },
              profile: { select: { employeeNumber: true, displayName: true, legalName: true } },
            },
          },
        },
        orderBy: { rowNumber: "asc" },
        take: 500,
      },
    },
  });
}

function jsonArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function rowIdempotencyKey(row: LeaveImportApplyRow, importType: ParsedLeaveImportType) {
  return importType === "MONTHLY_ANNUAL_USAGE"
    ? `leave-import-monthly:${row.batchId}:${row.id}`
    : `leave-import-detail:${row.batchId}:${row.id}`;
}

function readSignedLedgerAdjustment(entry: { amount: number; metadata: unknown }) {
  if (entry.metadata && typeof entry.metadata === "object") {
    const metadata = entry.metadata as Record<string, unknown>;
    if (typeof metadata.signedAmount === "number") return metadata.signedAmount;
    if (metadata.adjustmentDirection === "DECREASE") return -Math.abs(entry.amount);
  }

  return Math.abs(entry.amount);
}

export function calculateReverseAdjustmentAmount(originalSignedAmount: number) {
  const amount = roundLeaveAmount(-originalSignedAmount);
  return Object.is(amount, -0) ? 0 : amount;
}

export function leaveImportReverseIdempotencyKey({
  batchId,
  rowId,
  userId,
  year,
}: {
  batchId: string;
  rowId: string;
  userId: string;
  year: number;
}) {
  return `reverse-leave-import:${batchId}:${userId}:${year}:${rowId}`;
}

export async function findPotentialDuplicateImportedLeave(
  row: Pick<LeaveImportApplyRow, "matchedUserId" | "startDate" | "endDate" | "amountDays" | "mappedLeaveTypeId">,
  prisma: Db = getPrisma(),
) {
  if (!row.matchedUserId || !row.startDate || !row.endDate || !row.amountDays) {
    return null;
  }

  return prisma.leaveRequest.findFirst({
    where: {
      userId: row.matchedUserId,
      startDate: row.startDate,
      endDate: row.endDate,
      dayCount: new Prisma.Decimal(row.amountDays.toFixed(1)),
      ...(row.mappedLeaveTypeId ? { leaveTypeId: row.mappedLeaveTypeId } : {}),
      status: { not: "WITHDRAWN" },
    },
    select: { id: true },
  });
}

async function validateRowForApply({
  row,
  importType,
  prisma,
}: {
  row: LeaveImportApplyRow & { rowNumber?: number };
  importType: ParsedLeaveImportType;
  prisma: Db;
}): Promise<LeaveImportRowValidation> {
  const errors = jsonArray(row.errors);
  const warnings = "warnings" in row ? jsonArray((row as { warnings?: unknown }).warnings) : [];

  if (row.applied) warnings.push("이미 반영된 row입니다.");
  if (row.matchStatus !== "MATCHED" || !row.matchedUserId) {
    errors.push("직원을 찾을 수 없습니다.");
  }

  let duplicateLeaveRequestId: string | null = null;
  let existingLedgerId: string | null = null;
  let applyMode: LeaveImportRowValidation["applyMode"] =
    importType === "MONTHLY_ANNUAL_USAGE" ? "MONTHLY_ADJUSTMENT" : "DETAIL_REQUEST";

  if (importType === "MONTHLY_ANNUAL_USAGE") {
    if (row.remainingAnnualDays === null || row.remainingAnnualDays === undefined) {
      errors.push("잔여 연차 값이 필요합니다.");
    }
  } else {
    if (!row.mappedLeaveTypeId) errors.push("휴가 유형을 매핑할 수 없습니다.");
    if (!row.mappedStatus || row.mappedStatus === "UNKNOWN") {
      errors.push("휴가 상태를 확인해야 합니다.");
    }
    if (!row.amountDays || row.amountDays <= 0) {
      errors.push("사용 일수는 0보다 커야 합니다.");
    }
    if (!row.startDate || !row.endDate) {
      errors.push("휴가 시작일과 종료일이 필요합니다.");
    }
    if (row.startDate && row.endDate && dateOnly(row.startDate) > dateOnly(row.endDate)) {
      errors.push("휴가 시작일이 종료일보다 늦습니다.");
    }
    if (row.mappedStatus === "CANCELLED") {
      applyMode = "SKIP_CANCELLED";
      warnings.push("취소 상태는 사용량으로 차감하지 않습니다.");
    }

    const duplicate = await findPotentialDuplicateImportedLeave(row, prisma);
    if (duplicate) {
      duplicateLeaveRequestId = duplicate.id;
      warnings.push("동일한 휴가 사용내역이 이미 존재할 수 있습니다.");
      if (row.mappedStatus !== "CANCELLED") applyMode = "SKIP_DUPLICATE";
    }
  }

  if (!row.applied) {
    const ledger = await prisma.leaveLedger.findUnique({
      where: { idempotencyKey: rowIdempotencyKey(row, importType) },
      select: { id: true },
    });
    if (ledger) {
      existingLedgerId = ledger.id;
      errors.push("같은 idempotencyKey의 LeaveLedger가 이미 있습니다.");
    }
  }

  if (errors.length > 0) applyMode = "BLOCKED";
  if (row.applied) applyMode = "BLOCKED";

  return {
    rowId: row.id,
    rowNumber: row.rowNumber ?? 0,
    canApply: errors.length === 0,
    applyMode,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
    duplicateLeaveRequestId,
    existingLedgerId,
  };
}

export async function validateLeaveImportRow(rowId: string, prisma: Db = getPrisma()) {
  const row = await prisma.leaveImportRow.findUnique({
    where: { id: rowId },
    include: { batch: true },
  });
  if (!row) throw new Error("Import row를 찾을 수 없습니다.");

  return validateRowForApply({
    row: row as LeaveImportApplyRow & { rowNumber: number },
    importType: row.batch.importType,
    prisma,
  });
}

export async function validateLeaveImportBatch(batchId: string, prisma: Db = getPrisma()) {
  const batch = await prisma.leaveImportBatch.findUnique({
    where: { id: batchId },
    include: { rows: { orderBy: { rowNumber: "asc" } } },
  });
  if (!batch) throw new Error("Import batch를 찾을 수 없습니다.");

  const rows = await Promise.all(
    batch.rows.map((row) =>
      validateRowForApply({
        row: row as LeaveImportApplyRow & { rowNumber: number },
        importType: batch.importType,
        prisma,
      }),
    ),
  );
  const applyableRows = rows.filter((row) => row.canApply).length;
  const warningRows = rows.filter((row) => row.warnings.length > 0).length;
  const errorRows = rows.filter((row) => row.errors.length > 0).length;
  const unmatchedRows = batch.rows.filter((row) => row.matchStatus !== "MATCHED").length;
  const duplicateSuspectRows = rows.filter((row) => row.duplicateLeaveRequestId).length;
  const unknownStatusRows = batch.rows.filter((row) => row.mappedStatus === "UNKNOWN").length;
  const excludedRows = rows.filter((row) => row.applyMode === "SKIP_CANCELLED" || row.applyMode === "SKIP_DUPLICATE").length;
  const matchedUserIds = new Set(batch.rows.map((row) => row.matchedUserId).filter(Boolean));
  const targetYear = batch.targetYear ?? Number(todayInSeoul().slice(0, 4));
  const estimatedAdjustmentCount =
    batch.importType === "MONTHLY_ANNUAL_USAGE"
      ? (
          await Promise.all(
            batch.rows
              .filter(
                (row) =>
                  row.matchStatus === "MATCHED" &&
                  row.matchedUserId &&
                  row.remainingAnnualDays !== null &&
                  row.remainingAnnualDays !== undefined &&
                  !row.applied,
              )
              .map(async (row) => {
                const currentRemaining = await currentAnnualRemaining({
                  tx: prisma,
                  userId: row.matchedUserId as string,
                  year: targetYear,
                });
                return roundLeaveAmount((row.remainingAnnualDays as number) - currentRemaining) !== 0;
              }),
          )
        ).filter(Boolean).length
      : 0;

  return {
    batchId: batch.id,
    importType: batch.importType,
    rowCount: batch.rows.length,
    applyableRows,
    warningRows,
    errorRows,
    unmatchedRows,
    duplicateSuspectRows,
    unknownStatusRows,
    excludedRows,
    estimatedEmployeeCount: matchedUserIds.size,
    estimatedLeaveRequestCount:
      batch.importType === "DETAILED_LEAVE_USAGE"
        ? rows.filter((row) => row.canApply && row.applyMode !== "SKIP_DUPLICATE").length
        : 0,
    estimatedLedgerCount:
      batch.importType === "DETAILED_LEAVE_USAGE"
        ? rows.filter((row) => row.canApply && row.applyMode === "DETAIL_REQUEST").length
        : estimatedAdjustmentCount,
    estimatedAdjustmentCount,
    rows,
  } satisfies LeaveImportBatchValidation;
}

export async function recalculateLeaveBalanceAfterImport({
  userId,
  year,
  prisma = getPrisma(),
}: {
  userId: string;
  year: number;
  prisma?: Db;
}) {
  const [ledgerBalance, storedBalance] = await Promise.all([
    getUserLedgerBalance({ userId, year, prisma }),
    prisma.leaveBalance.findUnique({
      where: { userId_fiscalYear: { userId, fiscalYear: year } },
    }),
  ]);

  return {
    ledgerRemainingDays: ledgerBalance.remainingAmount,
    ledgerPendingDays: ledgerBalance.pendingAmount,
    ledgerUsedDays: ledgerBalance.usedAmount,
    ledgerAdjustedDays: ledgerBalance.adjustedAmount,
    ledgerExpiredDays: ledgerBalance.expiredAmount,
    storedRemainingDays: toNumber(storedBalance?.remainingDays),
    storedUsedDays: toNumber(storedBalance?.usedDays),
    storedPendingDays: toNumber(storedBalance?.pendingDays),
  };
}

export async function compareImportedAnnualRemainingWithSystem({
  userId,
  year,
  excelRemainingDays,
  prisma = getPrisma(),
}: {
  userId: string;
  year: number;
  excelRemainingDays?: number | null;
  prisma?: Db;
}) {
  const latestRow =
    excelRemainingDays === undefined
      ? await prisma.leaveImportRow.findFirst({
          where: {
            matchedUserId: userId,
            remainingAnnualDays: { not: null },
            batch: { importType: "MONTHLY_ANNUAL_USAGE", targetYear: year },
          },
          orderBy: { createdAt: "desc" },
        })
      : null;
  const excelRemaining = excelRemainingDays ?? latestRow?.remainingAnnualDays ?? null;
  const balance = await recalculateLeaveBalanceAfterImport({ userId, year, prisma });
  const systemRemaining = balance.ledgerRemainingDays;

  return {
    userId,
    year,
    excelRemainingDays: excelRemaining,
    systemRemainingDays: systemRemaining,
    diff:
      typeof excelRemaining === "number"
        ? roundLeaveAmount(excelRemaining - systemRemaining)
        : null,
    ...balance,
  };
}

export type LeaveImportReconciliationStatus =
  | "NORMAL"
  | "DIFF"
  | "DUPLICATE_SUSPECT"
  | "NEEDS_REVIEW"
  | "ADJUSTED";

export type LeaveImportReconciliationRow = {
  rowId: string;
  rowNumber: number;
  userId: string;
  userName: string;
  teamName: string | null;
  employeeNumber: string | null;
  year: number;
  excelRemainingDays: number | null;
  systemRemainingDays: number;
  diff: number | null;
  ledgerPendingDays: number;
  ledgerUsedDays: number;
  ledgerAdjustedDays: number;
  ledgerExpiredDays: number;
  status: LeaveImportReconciliationStatus;
  reasonCodes: string[];
  duplicateLeaveRequestIds: string[];
  duplicateLedgerIds: string[];
  adjustmentLedgerId: string | null;
  canAdjust: boolean;
};

export function classifyLeaveBalanceDifference({
  diff,
  duplicateLeaveRequestCount = 0,
  duplicateLedgerCount = 0,
  hasUnknownRows = false,
  hasCancelledUsedLedger = false,
  hasPendingUsedLedger = false,
  hasReconciliationAdjustment = false,
}: {
  diff: number | null;
  duplicateLeaveRequestCount?: number;
  duplicateLedgerCount?: number;
  hasUnknownRows?: boolean;
  hasCancelledUsedLedger?: boolean;
  hasPendingUsedLedger?: boolean;
  hasReconciliationAdjustment?: boolean;
}): {
  status: LeaveImportReconciliationStatus;
  reasonCodes: string[];
} {
  const reasonCodes: string[] = [];

  if (duplicateLeaveRequestCount > 0) reasonCodes.push("DUPLICATE_LEAVE_REQUEST");
  if (duplicateLedgerCount > 0) reasonCodes.push("DUPLICATE_LEAVE_LEDGER");
  if (hasUnknownRows) reasonCodes.push("UNKNOWN_ROW_EXCLUDED");
  if (hasCancelledUsedLedger) reasonCodes.push("CANCELLED_ROW_USED_LEDGER");
  if (hasPendingUsedLedger) reasonCodes.push("PENDING_ROW_USED_LEDGER");
  if (diff !== null && diff !== 0) reasonCodes.push("REMAINING_DIFF");
  if (hasReconciliationAdjustment) reasonCodes.push("RECONCILIATION_ADJUSTED");

  if (hasCancelledUsedLedger || hasPendingUsedLedger || hasUnknownRows) {
    return { status: "NEEDS_REVIEW", reasonCodes };
  }

  if (duplicateLeaveRequestCount > 0 || duplicateLedgerCount > 0) {
    return { status: "DUPLICATE_SUSPECT", reasonCodes };
  }

  if (hasReconciliationAdjustment) {
    return { status: diff === 0 ? "ADJUSTED" : "DIFF", reasonCodes };
  }

  if (diff !== null && diff !== 0) {
    return { status: "DIFF", reasonCodes };
  }

  return { status: "NORMAL", reasonCodes };
}

export async function findDuplicateLeaveRequestsAfterImport({
  batchId,
  userId,
  prisma = getPrisma(),
}: {
  batchId: string;
  userId?: string | null;
  prisma?: Db;
}) {
  const importedRequests = await prisma.leaveRequest.findMany({
    where: {
      importBatchId: batchId,
      ...(userId ? { userId } : {}),
    },
    select: {
      id: true,
      userId: true,
      startDate: true,
      endDate: true,
      leaveTypeId: true,
      dayCount: true,
    },
  });

  const duplicates = await Promise.all(
    importedRequests.map(async (request) => {
      const matching = await prisma.leaveRequest.findMany({
        where: {
          id: { not: request.id },
          userId: request.userId,
          startDate: request.startDate,
          endDate: request.endDate,
          leaveTypeId: request.leaveTypeId,
          dayCount: request.dayCount,
          status: { not: "WITHDRAWN" },
        },
        select: { id: true },
      });

      return {
        leaveRequestId: request.id,
        duplicateIds: matching.map((item) => item.id),
      };
    }),
  );

  return duplicates.filter((item) => item.duplicateIds.length > 0);
}

export async function findDuplicateLeaveLedgersAfterImport({
  batchId,
  userId,
  prisma = getPrisma(),
}: {
  batchId: string;
  userId?: string | null;
  prisma?: Db;
}) {
  const rows = await prisma.leaveImportRow.findMany({
    where: {
      batchId,
      ...(userId ? { matchedUserId: userId } : {}),
    },
    select: {
      id: true,
      appliedLedgerIds: true,
    },
  });
  const ledgerIds = rows.flatMap((row) => jsonArray(row.appliedLedgerIds));
  if (ledgerIds.length === 0) return [];

  const ledgers = await prisma.leaveLedger.findMany({
    where: { id: { in: ledgerIds } },
    select: {
      id: true,
      userId: true,
      idempotencyKey: true,
      eventType: true,
      leaveRequestId: true,
      leaveAdjustmentId: true,
    },
  });

  const byKey = new Map<string, string[]>();
  ledgers.forEach((ledger) => {
    if (!ledger.idempotencyKey) return;
    const ids = byKey.get(ledger.idempotencyKey) ?? [];
    ids.push(ledger.id);
    byKey.set(ledger.idempotencyKey, ids);
  });

  return Array.from(byKey.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([idempotencyKey, duplicateIds]) => ({ idempotencyKey, duplicateIds }));
}

export async function runLeaveImportReconciliation(batchId: string, prisma: Db = getPrisma()) {
  const batch = await prisma.leaveImportBatch.findUnique({
    where: { id: batchId },
    include: {
      rows: {
        include: {
          matchedUser: {
            select: {
              id: true,
              name: true,
              profile: { select: { employeeNumber: true } },
              team: { select: { name: true } },
            },
          },
        },
        orderBy: { rowNumber: "asc" },
      },
    },
  });
  if (!batch) throw new Error("Import batch를 찾을 수 없습니다.");

  const year = batch.targetYear ?? Number(todayInSeoul().slice(0, 4));
  const monthlyRows = batch.rows.filter((row) => row.matchedUserId && row.remainingAnnualDays !== null);
  const uniqueUsers = new Map<string, (typeof batch.rows)[number]>();
  monthlyRows.forEach((row) => {
    if (row.matchedUserId && !uniqueUsers.has(row.matchedUserId)) {
      uniqueUsers.set(row.matchedUserId, row);
    }
  });

  const rows: LeaveImportReconciliationRow[] = await Promise.all(
    Array.from(uniqueUsers.values()).map(async (row) => {
      const userId = row.matchedUserId as string;
      const comparison = await compareImportedAnnualRemainingWithSystem({
        userId,
        year,
        excelRemainingDays: row.remainingAnnualDays,
        prisma,
      });
      const [duplicateLeaveRequests, duplicateLedgers, adjustmentLedger] = await Promise.all([
        findDuplicateLeaveRequestsAfterImport({ batchId, userId, prisma }),
        findDuplicateLeaveLedgersAfterImport({ batchId, userId, prisma }),
        prisma.leaveLedger.findFirst({
          where: {
            userId,
            referenceYear: year,
            source: "IMPORT_RECONCILIATION_ADJUSTMENT",
            idempotencyKey: `leave-import-reconciliation:${batchId}:${userId}:${year}`,
          },
          select: { id: true },
        }),
      ]);

      const userRows = batch.rows.filter((item) => item.matchedUserId === userId);
      const hasUnknownRows = userRows.some((item) => item.mappedStatus === "UNKNOWN" && !item.applied);
      const appliedLedgerIds = userRows.flatMap((item) => jsonArray(item.appliedLedgerIds));
      const appliedLedgers =
        appliedLedgerIds.length > 0
          ? await prisma.leaveLedger.findMany({
              where: { id: { in: appliedLedgerIds } },
              select: { eventType: true, leaveRequest: { select: { status: true } } },
            })
          : [];
      const hasCancelledUsedLedger = appliedLedgers.some(
        (ledger) => ledger.eventType === "USED" && ledger.leaveRequest?.status === "CANCELLED",
      );
      const hasPendingUsedLedger = appliedLedgers.some(
        (ledger) => ledger.eventType === "USED" && ledger.leaveRequest?.status === "PENDING",
      );
      const classification = classifyLeaveBalanceDifference({
        diff: comparison.diff,
        duplicateLeaveRequestCount: duplicateLeaveRequests.length,
        duplicateLedgerCount: duplicateLedgers.length,
        hasUnknownRows,
        hasCancelledUsedLedger,
        hasPendingUsedLedger,
        hasReconciliationAdjustment: Boolean(adjustmentLedger),
      });

      return {
        rowId: row.id,
        rowNumber: row.rowNumber,
        userId,
        userName: row.matchedUser?.name ?? "직원",
        teamName: row.matchedUser?.team?.name ?? null,
        employeeNumber: row.matchedUser?.profile?.employeeNumber ?? row.employeeNumber,
        year,
        excelRemainingDays: comparison.excelRemainingDays,
        systemRemainingDays: comparison.systemRemainingDays,
        diff: comparison.diff,
        ledgerPendingDays: comparison.ledgerPendingDays,
        ledgerUsedDays: comparison.ledgerUsedDays,
        ledgerAdjustedDays: comparison.ledgerAdjustedDays,
        ledgerExpiredDays: comparison.ledgerExpiredDays,
        status: classification.status,
        reasonCodes: classification.reasonCodes,
        duplicateLeaveRequestIds: duplicateLeaveRequests.flatMap((item) => [
          item.leaveRequestId,
          ...item.duplicateIds,
        ]),
        duplicateLedgerIds: duplicateLedgers.flatMap((item) => item.duplicateIds),
        adjustmentLedgerId: adjustmentLedger?.id ?? null,
        canAdjust: comparison.diff !== null && comparison.diff !== 0 && !adjustmentLedger,
      };
    }),
  );

  return {
    batchId,
    year,
    totalEmployeeCount: rows.length,
    normalEmployeeCount: rows.filter((row) => row.status === "NORMAL" || row.status === "ADJUSTED").length,
    diffEmployeeCount: rows.filter((row) => row.status === "DIFF").length,
    duplicateSuspectEmployeeCount: rows.filter((row) => row.status === "DUPLICATE_SUSPECT").length,
    pendingEmployeeCount: rows.filter((row) => row.ledgerPendingDays > 0).length,
    needsReviewEmployeeCount: rows.filter((row) => row.status === "NEEDS_REVIEW").length,
    adjustedEmployeeCount: rows.filter((row) => row.status === "ADJUSTED").length,
    rows,
  };
}

export async function validateLeaveLedgerConsistencyAfterImport(batchId: string, prisma: Db = getPrisma()) {
  const batch = await prisma.leaveImportBatch.findUnique({
    where: { id: batchId },
    include: {
      rows: {
        include: {
          matchedUser: { select: { id: true, name: true } },
        },
        orderBy: { rowNumber: "asc" },
      },
    },
  });
  if (!batch) throw new Error("Import batch를 찾을 수 없습니다.");

  const year = batch.targetYear ?? Number(todayInSeoul().slice(0, 4));
  const appliedRows = batch.rows.filter((row) => row.applied);
  const generatedLeaveRequestIds = appliedRows
    .map((row) => row.appliedLeaveRequestId)
    .filter(Boolean) as string[];
  const generatedLedgerIds = appliedRows.flatMap((row) => jsonArray(row.appliedLedgerIds));
  const generatedAdjustmentIds =
    batch.importType === "MONTHLY_ANNUAL_USAGE"
      ? (
          await prisma.leaveLedger.findMany({
            where: {
              id: { in: generatedLedgerIds },
              leaveAdjustmentId: { not: null },
            },
            select: { leaveAdjustmentId: true },
          })
        )
          .map((ledger) => ledger.leaveAdjustmentId)
          .filter(Boolean)
      : [];

  const reconciliationRows =
    batch.importType === "MONTHLY_ANNUAL_USAGE"
      ? await Promise.all(
          appliedRows
            .filter((row) => row.matchedUserId && row.remainingAnnualDays !== null)
            .map(async (row) => ({
              rowId: row.id,
              rowNumber: row.rowNumber,
              userName: row.matchedUser?.name ?? "직원",
              ...(await compareImportedAnnualRemainingWithSystem({
                userId: row.matchedUserId as string,
                year,
                excelRemainingDays: row.remainingAnnualDays,
                prisma,
              })),
            })),
        )
      : [];

  return {
    batchId,
    appliedRowCount: appliedRows.length,
    generatedLeaveRequestCount: new Set(generatedLeaveRequestIds).size,
    generatedLedgerCount: new Set(generatedLedgerIds).size,
    generatedAdjustmentCount: new Set(generatedAdjustmentIds).size,
    skippedRowCount: batch.rows.length - appliedRows.length,
    failedRowCount: batch.rows.filter((row) => row.applied === false && jsonArray(row.errors).length > 0).length,
    reconciliationRows,
  };
}

function legacyLeaveTypeForCode(code: string | null | undefined) {
  if (code === "HALF_DAY" || code === "BIRTHDAY_HALF_DAY") return "HALF_DAY" as const;
  if (code === "RESERVE_FORCES" || code === "CIVIL_DEFENSE" || code === "REWARD") {
    return "RESERVE_FORCES" as const;
  }
  return "ANNUAL" as const;
}

function halfDayPeriodForAmount(code: string | null | undefined, amount: number | null | undefined) {
  if (code === "HALF_DAY" || code === "BIRTHDAY_HALF_DAY" || amount === 0.5) return "AM" as const;
  return null;
}

async function currentAnnualRemaining({
  tx,
  userId,
  year,
}: {
  tx: Db;
  userId: string;
  year: number;
}) {
  const balance = await recalculateLeaveBalanceAfterImport({
    userId,
    year,
    prisma: tx,
  });

  return balance.ledgerRemainingDays;
}

async function applyMonthlyRow({
  tx,
  row,
  actorUserId,
  targetYear,
}: {
  tx: Db;
  row: LeaveImportApplyRow;
  actorUserId: string;
  targetYear: number;
}) {
  if (!row.matchedUserId || row.remainingAnnualDays === null || row.remainingAnnualDays === undefined) {
    return { applied: false, ledgerIds: [] as string[], leaveRequestId: null as string | null };
  }

  const currentRemaining = await currentAnnualRemaining({
    tx,
    userId: row.matchedUserId,
    year: targetYear,
  });
  const diff = roundLeaveAmount(row.remainingAnnualDays - currentRemaining);

  if (diff === 0) {
    return { applied: true, ledgerIds: [] as string[], leaveRequestId: null };
  }

  const adjustment = await tx.leaveAdjustment.create({
    data: {
      userId: row.matchedUserId,
      fiscalYear: targetYear,
      year: targetYear,
      days: new Prisma.Decimal(diff.toFixed(1)),
      amount: new Prisma.Decimal(diff.toFixed(1)),
      reason: `엑셀 잔여 연차 import 보정 (${targetYear})`,
      createdById: actorUserId,
      createdByUserId: actorUserId,
    },
  });

  const ledger = await createLeaveLedgerEntry({
    tx,
    userId: row.matchedUserId,
    leaveAdjustmentId: adjustment.id,
    eventType: "ADJUSTED",
    amount: Math.abs(diff),
    effectiveDate: dateOnlyToDate(`${targetYear}-01-01` as DateOnly),
    referenceYear: targetYear,
    source: "IMPORT_MONTHLY_ANNUAL_USAGE",
    idempotencyKey: `leave-import-monthly:${row.batchId}:${row.id}`,
    reason: "Imported monthly annual remaining adjustment",
    metadata: {
      batchId: row.batchId,
      rowId: row.id,
      targetYear,
      signedAmount: diff,
      adjustmentDirection: diff < 0 ? "DECREASE" : "INCREASE",
    },
    createdByUserId: actorUserId,
  });

  return {
    applied: true,
    ledgerIds: ledger ? [ledger.id] : [],
    leaveRequestId: null,
  };
}

async function applyDetailRow({
  tx,
  row,
  actorUserId,
}: {
  tx: Db;
  row: LeaveImportApplyRow;
  actorUserId: string;
}) {
  if (!row.matchedUserId || !row.startDate || !row.endDate || !row.amountDays || !row.mappedStatus) {
    return { applied: false, ledgerIds: [] as string[], leaveRequestId: null as string | null };
  }
  if (row.mappedStatus === "UNKNOWN") {
    return { applied: false, ledgerIds: [], leaveRequestId: null };
  }

  const duplicate = await tx.leaveRequest.findFirst({
    where: {
      userId: row.matchedUserId,
      startDate: row.startDate,
      endDate: row.endDate,
      dayCount: new Prisma.Decimal(row.amountDays.toFixed(1)),
      ...(row.mappedLeaveTypeId ? { leaveTypeId: row.mappedLeaveTypeId } : {}),
      status: { not: "WITHDRAWN" },
    },
    select: { id: true },
  });

  if (duplicate) {
    return { applied: true, ledgerIds: [] as string[], leaveRequestId: duplicate.id };
  }

  const leaveRequest = await tx.leaveRequest.create({
    data: {
      userId: row.matchedUserId,
      type: legacyLeaveTypeForCode(row.mappedLeaveTypeCode),
      requestKind: row.mappedLeaveTypeCode === "ANNUAL" || row.mappedLeaveTypeCode === "HALF_DAY" ? "ANNUAL" : "CUSTOM_GRANT",
      leaveTypeId: row.mappedLeaveTypeId,
      status: row.mappedStatus,
      startDate: row.startDate,
      endDate: row.endDate,
      halfDayPeriod: halfDayPeriodForAmount(row.mappedLeaveTypeCode, row.amountDays),
      dayCount: new Prisma.Decimal(row.amountDays.toFixed(1)),
      reason: "엑셀 휴가 사용 내역 import",
      attachmentStatus:
        normalizeText(row.evidenceStatusRaw).includes("제출") ? "SUBMITTED" : "NOT_REQUIRED",
      approvalSource: "MANUAL",
      importBatchId: row.batchId,
      importRowId: row.id,
      importedAt: new Date(),
      isImported: true,
    },
  });

  const ledgerIds: string[] = [];
  if (row.mappedStatus === "APPROVED" || row.mappedStatus === "PENDING") {
    const ledger = await createLeaveLedgerEntry({
      tx,
      userId: row.matchedUserId,
      leaveTypeId: row.mappedLeaveTypeId,
      leaveRequestId: leaveRequest.id,
      eventType: row.mappedStatus === "APPROVED" ? "USED" : "PENDING",
      amount: row.amountDays,
      effectiveDate: row.startDate,
      referenceYear: Number(dateOnly(row.startDate).slice(0, 4)),
      source: "IMPORT_DETAILED_LEAVE_USAGE",
      idempotencyKey: `leave-import-detail:${row.batchId}:${row.id}`,
      reason: "Imported detailed leave usage",
      metadata: {
        batchId: row.batchId,
        rowId: row.id,
        importedStatus: row.mappedStatus,
        leaveTypeCode: row.mappedLeaveTypeCode,
        startDate: dateOnly(row.startDate),
        endDate: dateOnly(row.endDate),
      },
      createdByUserId: actorUserId,
    });
    if (ledger) ledgerIds.push(ledger.id);
  }

  return { applied: true, ledgerIds, leaveRequestId: leaveRequest.id };
}

export async function applyLeaveImportBatch({
  actorUserId,
  batchId,
  prisma = getPrisma(),
}: {
  actorUserId: string;
  batchId: string;
  prisma?: PrismaClient;
}) {
  await assertRecentStepUp({
    actorUserId,
    purpose: "POLICY_CHANGE",
  });

  return prisma.$transaction(async (tx) => {
    const batch = await tx.leaveImportBatch.findUnique({
      where: { id: batchId },
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });

    if (!batch) throw new Error("Import batch를 찾을 수 없습니다.");
    if (batch.status === "APPLIED") throw new Error("이미 반영된 import batch입니다.");
    if (batch.status === "CANCELLED" || batch.status === "FAILED") {
      throw new Error("반영할 수 없는 import batch입니다.");
    }

    await tx.auditLog.create({
      data: {
        actorId: actorUserId,
        actorUserId,
        action: "LEAVE_IMPORT_APPLY_STARTED",
        targetType: "LEAVE_IMPORT_BATCH",
        targetId: batch.id,
        metadata: toInputJson({
          batchId: batch.id,
          importType: batch.importType,
          rowCount: batch.rowCount,
        }),
      },
    });

    const validation = await validateLeaveImportBatch(batch.id, tx);
    await tx.auditLog.create({
      data: {
        actorId: actorUserId,
        actorUserId,
        action: "LEAVE_IMPORT_VALIDATION_RUN",
        targetType: "LEAVE_IMPORT_BATCH",
        targetId: batch.id,
        metadata: toInputJson({
          batchId: batch.id,
          rowCount: validation.rowCount,
          applyableRows: validation.applyableRows,
          errorRows: validation.errorRows,
          warningRows: validation.warningRows,
          duplicateSuspectRows: validation.duplicateSuspectRows,
          unknownStatusRows: validation.unknownStatusRows,
        }),
      },
    });
    const blockingRows = validation.rows.filter((row) => !row.canApply);
    if (blockingRows.length > 0) {
      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          actorUserId,
          action: "LEAVE_IMPORT_BLOCKED",
          targetType: "LEAVE_IMPORT_BATCH",
          targetId: batch.id,
          metadata: toInputJson({
            batchId: batch.id,
            blockedRowCount: blockingRows.length,
            reasonCode: "ROWS_REQUIRE_REVIEW",
          }),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          actorUserId,
          action: "LEAVE_IMPORT_APPLY_FAILED",
          targetType: "LEAVE_IMPORT_BATCH",
          targetId: batch.id,
          metadata: toInputJson({
            batchId: batch.id,
            rowCount: batch.rowCount,
            errorCount: validation.errorRows,
            warningCount: validation.warningRows,
            blockedRowCount: blockingRows.length,
          }),
        },
      });
      throw new Error("검토가 필요한 행이 있어 반영할 수 없습니다.");
    }

    const appliedRowIds: string[] = [];
    const appliedLedgerIds: string[] = [];
    const appliedLeaveRequestIds: string[] = [];
    const targetYear = batch.targetYear ?? Number(todayInSeoul().slice(0, 4));

    for (const row of batch.rows) {
      if (row.applied) continue;

      const result =
        batch.importType === "MONTHLY_ANNUAL_USAGE"
          ? await applyMonthlyRow({ tx, row: row as LeaveImportApplyRow, actorUserId, targetYear })
          : await applyDetailRow({ tx, row: row as LeaveImportApplyRow, actorUserId });

      if (result.applied) {
        appliedRowIds.push(row.id);
        appliedLedgerIds.push(...result.ledgerIds);
        if (result.leaveRequestId) appliedLeaveRequestIds.push(result.leaveRequestId);

        await tx.leaveImportRow.update({
          where: { id: row.id },
          data: {
            applied: true,
            appliedLeaveRequestId: result.leaveRequestId,
            appliedLedgerIds: result.ledgerIds.length ? toInputJson(result.ledgerIds) : Prisma.JsonNull,
          },
        });
      }
    }

    const updatedBatch = await tx.leaveImportBatch.update({
      where: { id: batch.id },
      data: {
        status: "APPLIED",
        appliedAt: new Date(),
        appliedByUserId: actorUserId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actorUserId,
        actorUserId,
        action: "LEAVE_IMPORT_APPLY_COMPLETED",
        targetType: "LEAVE_IMPORT_BATCH",
        targetId: batch.id,
        metadata: toInputJson({
          batchId: batch.id,
          importType: batch.importType,
          rowCount: batch.rowCount,
          appliedRowCount: appliedRowIds.length,
          appliedLedgerCount: appliedLedgerIds.length,
          appliedLeaveRequestCount: appliedLeaveRequestIds.length,
        }),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actorUserId,
        actorUserId,
        action: "LEAVE_IMPORT_APPLIED",
        targetType: "LEAVE_IMPORT_BATCH",
        targetId: batch.id,
        metadata: toInputJson({
          batchId: batch.id,
          importType: batch.importType,
          appliedRowCount: appliedRowIds.length,
          appliedLedgerCount: appliedLedgerIds.length,
          appliedLeaveRequestCount: appliedLeaveRequestIds.length,
        }),
      },
    });

    return updatedBatch;
  });
}

export async function reverseLeaveImportBatch({
  actorUserId,
  batchId,
  reason = "Leave balance import reverse adjustment",
  prisma = getPrisma(),
}: {
  actorUserId: string;
  batchId: string;
  reason?: string;
  prisma?: PrismaClient;
}) {
  await assertRecentStepUp({
    actorUserId,
    purpose: "POLICY_CHANGE",
  });

  return prisma.$transaction(async (tx) => {
    const batch = await tx.leaveImportBatch.findUnique({
      where: { id: batchId },
      include: { rows: { orderBy: { rowNumber: "asc" } } },
    });

    if (!batch) throw new Error("Import batch not found.");

    const block = async (reasonCode: string) => {
      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          actorUserId,
          action: "LEAVE_BALANCE_IMPORT_REVERSE_BLOCKED",
          targetType: "LEAVE_IMPORT_BATCH",
          targetId: batch.id,
          metadata: toInputJson({
            batchId: batch.id,
            importType: batch.importType,
            status: batch.status,
            reasonCode,
          }),
        },
      });
    };

    if (batch.status !== "APPLIED") {
      await block("BATCH_NOT_APPLIED");
      throw new Error("Only applied import batches can be reversed.");
    }
    if (batch.reversedAt) {
      await block("BATCH_ALREADY_REVERSED");
      throw new Error("This import batch has already been reversed.");
    }
    if (batch.importType !== "MONTHLY_ANNUAL_USAGE") {
      await block("UNSUPPORTED_IMPORT_TYPE");
      throw new Error("Only leave balance adjustment import batches can be reversed.");
    }

    await tx.auditLog.create({
      data: {
        actorId: actorUserId,
        actorUserId,
        action: "LEAVE_IMPORT_REVERSE_REQUESTED",
        targetType: "LEAVE_IMPORT_BATCH",
        targetId: batch.id,
        metadata: toInputJson({
          batchId: batch.id,
          importType: batch.importType,
          rowCount: batch.rowCount,
          reason,
        }),
      },
    });

    const targetYear = batch.targetYear ?? Number(todayInSeoul().slice(0, 4));
    const reversedLedgerIds: string[] = [];
    const reversedAdjustmentIds: string[] = [];

    for (const row of batch.rows) {
      if (!row.applied || !row.matchedUserId) continue;

      const originalLedger = await tx.leaveLedger.findUnique({
        where: { idempotencyKey: `leave-import-monthly:${batch.id}:${row.id}` },
        select: {
          id: true,
          userId: true,
          amount: true,
          metadata: true,
          referenceYear: true,
          leaveAdjustmentId: true,
        },
      });

      if (!originalLedger) continue;

      const year = originalLedger.referenceYear ?? targetYear;
      const reverseIdempotencyKey = leaveImportReverseIdempotencyKey({
        batchId: batch.id,
        rowId: row.id,
        userId: row.matchedUserId,
        year,
      });
      const existingReverseLedger = await tx.leaveLedger.findUnique({
        where: { idempotencyKey: reverseIdempotencyKey },
        select: { id: true },
      });
      if (existingReverseLedger) continue;

      const originalSignedAmount = readSignedLedgerAdjustment({
        amount: originalLedger.amount,
        metadata: originalLedger.metadata,
      });
      const reverseAmount = calculateReverseAdjustmentAmount(originalSignedAmount);
      if (reverseAmount === 0) continue;

      const adjustment = await tx.leaveAdjustment.create({
        data: {
          userId: row.matchedUserId,
          fiscalYear: year,
          year,
          days: new Prisma.Decimal(reverseAmount.toFixed(1)),
          amount: new Prisma.Decimal(reverseAmount.toFixed(1)),
          reason,
          createdById: actorUserId,
          createdByUserId: actorUserId,
        },
      });

      const ledger = await createLeaveLedgerEntry({
        tx,
        userId: row.matchedUserId,
        leaveAdjustmentId: adjustment.id,
        eventType: "ADJUSTED",
        amount: Math.abs(reverseAmount),
        effectiveDate: dateOnlyToDate(`${year}-01-01` as DateOnly),
        referenceYear: year,
        source: "IMPORT_REVERSE_ADJUSTMENT",
        idempotencyKey: reverseIdempotencyKey,
        reason,
        metadata: {
          batchId: batch.id,
          rowId: row.id,
          year,
          signedAmount: reverseAmount,
          adjustmentDirection: reverseAmount < 0 ? "DECREASE" : "INCREASE",
          originalSignedAmount,
          reverseOfLedgerId: originalLedger.id,
          reverseOfLeaveAdjustmentId: originalLedger.leaveAdjustmentId,
        },
        createdByUserId: actorUserId,
      });

      reversedAdjustmentIds.push(adjustment.id);
      if (ledger) reversedLedgerIds.push(ledger.id);
    }

    const updatedBatch = await tx.leaveImportBatch.update({
      where: { id: batch.id },
      data: {
        status: "REVERSED",
        reversedAt: new Date(),
        reversedByUserId: actorUserId,
        reverseReason: reason,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actorUserId,
        actorUserId,
        action: "LEAVE_IMPORT_REVERSED",
        targetType: "LEAVE_IMPORT_BATCH",
        targetId: batch.id,
        metadata: toInputJson({
          batchId: batch.id,
          importType: batch.importType,
          rowCount: batch.rowCount,
          reversedAdjustmentCount: reversedAdjustmentIds.length,
          reversedLedgerCount: reversedLedgerIds.length,
          referenceYear: targetYear,
          reason,
        }),
      },
    });

    return {
      batch: updatedBatch,
      reversedAdjustmentCount: reversedAdjustmentIds.length,
      reversedLedgerCount: reversedLedgerIds.length,
    };
  });
}

export async function createLeaveImportReconciliationAdjustment({
  actorUserId,
  batchId,
  userId,
  year,
  prisma = getPrisma(),
}: {
  actorUserId: string;
  batchId: string;
  userId: string;
  year: number;
  prisma?: PrismaClient;
}) {
  await assertRecentStepUp({
    actorUserId,
    purpose: "POLICY_CHANGE",
  });

  return prisma.$transaction(async (tx) => {
    const batch = await tx.leaveImportBatch.findUnique({
      where: { id: batchId },
      select: { id: true, status: true, importType: true, targetYear: true },
    });
    if (!batch) throw new Error("Import batch를 찾을 수 없습니다.");
    if (batch.status !== "APPLIED") throw new Error("반영 완료 batch만 보정할 수 있습니다.");
    if (batch.importType !== "MONTHLY_ANNUAL_USAGE") {
      throw new Error("월별 연차 사용 내역 batch만 잔여 연차 보정을 지원합니다.");
    }

    const row = await tx.leaveImportRow.findFirst({
      where: {
        batchId,
        matchedUserId: userId,
        remainingAnnualDays: { not: null },
      },
      orderBy: { rowNumber: "asc" },
    });
    if (!row || row.remainingAnnualDays === null) {
      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          actorUserId,
          action: "LEAVE_IMPORT_RECONCILIATION_ADJUSTMENT_BLOCKED",
          targetType: "LEAVE_IMPORT_BATCH",
          targetId: batchId,
          metadata: toInputJson({
            batchId,
            userId,
            year,
            reasonCode: "NO_EXCEL_REMAINING_ROW",
          }),
        },
      });
      throw new Error("엑셀 잔여 연차 row를 찾을 수 없습니다.");
    }

    const comparison = await compareImportedAnnualRemainingWithSystem({
      userId,
      year,
      excelRemainingDays: row.remainingAnnualDays,
      prisma: tx,
    });
    const diff = comparison.diff ?? 0;
    const idempotencyKey = `leave-import-reconciliation:${batchId}:${userId}:${year}`;
    const existingLedger = await tx.leaveLedger.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });

    if (diff === 0 || existingLedger) {
      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          actorUserId,
          action: "LEAVE_IMPORT_RECONCILIATION_ADJUSTMENT_BLOCKED",
          targetType: "LEAVE_IMPORT_BATCH",
          targetId: batchId,
          metadata: toInputJson({
            batchId,
            userId,
            year,
            excelRemaining: comparison.excelRemainingDays,
            systemRemaining: comparison.systemRemainingDays,
            difference: diff,
            reasonCode: existingLedger ? "DUPLICATE_ADJUSTMENT" : "NO_DIFFERENCE",
          }),
        },
      });
      throw new Error(existingLedger ? "이미 해당 batch 보정이 있습니다." : "차이값이 없어 보정할 수 없습니다.");
    }

    await tx.auditLog.create({
      data: {
        actorId: actorUserId,
        actorUserId,
        targetUserId: userId,
        action: "LEAVE_IMPORT_RECONCILIATION_DIFF_FOUND",
        targetType: "LEAVE_IMPORT_BATCH",
        targetId: batchId,
        metadata: toInputJson({
          batchId,
          userId,
          year,
          excelRemaining: comparison.excelRemainingDays,
          systemRemaining: comparison.systemRemainingDays,
          difference: diff,
          reasonCode: "REMAINING_DIFF",
        }),
      },
    });

    const adjustment = await tx.leaveAdjustment.create({
      data: {
        userId,
        fiscalYear: year,
        year,
        days: new Prisma.Decimal(diff.toFixed(1)),
        amount: new Prisma.Decimal(diff.toFixed(1)),
        reason: "휴가 import 반영 후 잔여 연차 보정",
        createdById: actorUserId,
        createdByUserId: actorUserId,
      },
    });

    const ledger = await createLeaveLedgerEntry({
      tx,
      userId,
      leaveAdjustmentId: adjustment.id,
      eventType: "ADJUSTED",
      amount: Math.abs(diff),
      effectiveDate: dateOnlyToDate(`${year}-01-01` as DateOnly),
      referenceYear: year,
      source: "IMPORT_RECONCILIATION_ADJUSTMENT",
      idempotencyKey,
      reason: "Leave import reconciliation adjustment",
      metadata: {
        batchId,
        userId,
        year,
        excelRemaining: comparison.excelRemainingDays,
        systemRemaining: comparison.systemRemainingDays,
        signedAmount: diff,
        adjustmentDirection: diff < 0 ? "DECREASE" : "INCREASE",
      },
      createdByUserId: actorUserId,
    });

    await tx.auditLog.create({
      data: {
        actorId: actorUserId,
        actorUserId,
        targetUserId: userId,
        action: "LEAVE_IMPORT_RECONCILIATION_ADJUSTMENT_CREATED",
        targetType: "LEAVE_IMPORT_BATCH",
        targetId: batchId,
        metadata: toInputJson({
          batchId,
          userId,
          year,
          excelRemaining: comparison.excelRemainingDays,
          systemRemaining: comparison.systemRemainingDays,
          difference: diff,
          adjustmentAmount: diff,
          leaveAdjustmentId: adjustment.id,
          leaveLedgerId: ledger?.id ?? null,
          reasonCode: "REMAINING_DIFF_ADJUSTED",
        }),
      },
    });

    return { adjustment, ledger };
  });
}
