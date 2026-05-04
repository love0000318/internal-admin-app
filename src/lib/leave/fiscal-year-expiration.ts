import { dateOnlyToDate, dateToDateOnly } from "@/lib/leave/calculate-business-days";
import type { DateOnly } from "@/lib/leave/types";

export function getFiscalYearLeaveExpirationDate(year: number): DateOnly {
  if (!Number.isInteger(year) || year < 1900 || year > 3000) {
    throw new Error(`Invalid fiscal year: ${year}`);
  }

  return `${year}-12-31` as DateOnly;
}

export function getFiscalYearLeaveExpirationDateValue(year: number): Date {
  return dateOnlyToDate(getFiscalYearLeaveExpirationDate(year));
}

export function isFiscalYearExpirationMismatch({
  referenceYear,
  expiresAt,
}: {
  referenceYear: number | null | undefined;
  expiresAt: Date | null | undefined;
}) {
  if (!referenceYear || !expiresAt) {
    return false;
  }

  const current = dateToDateOnly(expiresAt);
  const expected = getFiscalYearLeaveExpirationDate(referenceYear);

  if (current === expected) {
    return false;
  }

  return current > expected;
}

export const FISCAL_YEAR_LEDGER_SOURCES = [
  "ANNUAL_AUTO",
  "MANUAL_ADJUSTMENT",
  "IMPORT_MONTHLY_ANNUAL_USAGE",
  "IMPORT_RECONCILIATION_ADJUSTMENT",
  "IMPORT_REVERSE_ADJUSTMENT",
  "SYSTEM_MIGRATION",
] as const;
