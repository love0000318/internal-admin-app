import type { DateOnly } from "@/lib/leave/types";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function parseDateOnly(value: DateOnly) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    throw new Error(`Invalid date-only value: ${value}`);
  }

  return Date.UTC(year, month - 1, day);
}

export function formatDateOnlyInSeoul(date = new Date()): DateOnly {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date) as DateOnly;
}

export function calculateTenureDays(
  hireDate: DateOnly | null | undefined,
  today: DateOnly = formatDateOnlyInSeoul(),
): number | null {
  if (!hireDate) {
    return null;
  }

  const start = parseDateOnly(hireDate);
  const end = parseDateOnly(today);

  return Math.floor((end - start) / ONE_DAY_MS) + 1;
}

export function formatTenureDays(days: number | null) {
  return days === null ? "미입력" : `${days}일차`;
}
