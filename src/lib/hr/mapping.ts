import { z } from "zod";

import { normalizePhoneNumber } from "@/lib/auth/phone";
import { dateOnlyToDate } from "@/lib/leave/calculate-business-days";
import type { DateOnly } from "@/lib/leave/types";

const PLACEHOLDER_VALUES = new Set([
  "",
  "-",
  "N/A",
  "n/a",
  "NA",
  "na",
  "없음",
  "해당없음",
  "해당 없음",
]);

export const HR_MAIN_SHEET_NAME = "인사·개인·계약·지급·특이사항";

export function normalizeImportString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();

  return PLACEHOLDER_VALUES.has(text) ? null : text;
}

export function normalizeImportEmail(value: unknown) {
  const email = normalizeImportString(value)?.toLowerCase() ?? null;

  if (!email) {
    return null;
  }

  return z.string().email().safeParse(email).success ? email : null;
}

export function normalizeImportPhone(value: unknown) {
  const phone = normalizeImportString(value);

  if (!phone) {
    return null;
  }

  try {
    return normalizePhoneNumber(phone);
  } catch {
    return phone.replace(/[^\d+]/g, "");
  }
}

export function normalizeImportDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
  }

  const text = normalizeImportString(value);

  if (!text) {
    return null;
  }

  const normalized = text
    .replace(/[./]/g, "-")
    .replace(/년/g, "-")
    .replace(/월/g, "-")
    .replace(/일/g, "")
    .trim();
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;

  return dateOnlyToDate(
    `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` as DateOnly,
  );
}

export function normalizeImportNumber(value: unknown) {
  const text = normalizeImportString(value);

  if (!text) {
    return null;
  }

  const parsed = Number(text.replace(/,/g, ""));

  return Number.isFinite(parsed) ? parsed : null;
}

export function getCell(row: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) {
      return row[name];
    }
  }

  return null;
}

export function rowEmail(row: Record<string, unknown>) {
  return normalizeImportEmail(
    getCell(row, ["이메일", "회사 이메일", "회사이메일", "개인 이메일"]),
  );
}

export function mapMainEmployeeRow(row: Record<string, unknown>) {
  const companyEmail = normalizeImportEmail(
    getCell(row, ["이메일", "회사 이메일", "회사이메일"]),
  );
  const legalName = normalizeImportString(getCell(row, ["이름", "성명"]));

  return {
    employeeNumber: normalizeImportString(getCell(row, ["사번"])),
    legalName,
    displayName: normalizeImportString(
      getCell(row, ["회사 내 이름", "회사내이름", "표시 이름"]),
    ),
    companyEmail,
    personalEmail: normalizeImportEmail(
      getCell(row, ["개인 이메일", "개인이메일"]),
    ),
    phoneNumber: normalizeImportPhone(
      getCell(row, ["휴대전화번호", "휴대폰", "전화번호"]),
    ),
    employmentStatus: normalizeImportString(getCell(row, ["재직상태"])),
    title: normalizeImportString(getCell(row, ["직급", "직책", "직위"])),
    position: normalizeImportString(getCell(row, ["직위"])),
    jobGrade: normalizeImportString(getCell(row, ["직급"])),
    teamName: normalizeImportString(getCell(row, ["조직", "부서", "팀"])),
    teamCode: normalizeImportString(getCell(row, ["조직코드"])),
    hireDate: normalizeImportDate(getCell(row, ["입사일"])),
    groupHireDate: normalizeImportDate(getCell(row, ["그룹사 입사일"])),
    birthDate: normalizeImportDate(getCell(row, ["생년월일", "생일"])),
    englishName: normalizeImportString(getCell(row, ["영문이름"])),
    legalGender: normalizeImportString(getCell(row, ["법적 성별", "성별"])),
    phoneCountryCode: normalizeImportString(
      getCell(row, ["휴대전화번호 국적코드"]),
    ),
    nationalityCode: normalizeImportString(getCell(row, ["국적코드"])),
    residenceCountry: normalizeImportString(getCell(row, ["거주국가"])),
    visaStatus: normalizeImportString(getCell(row, ["체류자격"])),
    address: normalizeImportString(getCell(row, ["집주소", "주소"])),
    postalCode: normalizeImportString(getCell(row, ["우편번호"])),
    residentId: normalizeImportString(
      getCell(row, [
        "주민등록번호 또는 외국인등록번호",
        "주민등록번호",
        "외국인등록번호",
      ]),
    ),
    bankCode: normalizeImportString(getCell(row, ["은행코드"])),
    bankName: normalizeImportString(
      getCell(row, ["은행명", "직접입력 은행/증권사"]),
    ),
    bankAccount: normalizeImportString(
      getCell(row, ["급여계좌", "직접입력 계좌번호"]),
    ),
    bankAccountHolder: normalizeImportString(
      getCell(row, ["예금주 이름", "예금주"]),
    ),
    swiftCode: normalizeImportString(getCell(row, ["swift code", "SWIFT CODE"])),
    veteranOrDisabledStatus: normalizeImportString(
      getCell(row, [
        "장애인·국가유공자 여부",
        "장애인/국가유공자",
        "장애인 국가유공자",
      ]),
    ),
    disabilityGrade: normalizeImportString(getCell(row, ["장애정도"])),
  };
}
