import type { DateOnly } from "@/lib/leave/types";
import { formatTenureDays } from "@/lib/organization/tenure";

export function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function dateOnlyToKorean(value: DateOnly | null | undefined) {
  return value ? formatDate(`${value}T00:00:00.000+09:00`) : "-";
}

export function formatLeaveDays(days: number | null | undefined) {
  if (days === null || days === undefined || Number.isNaN(days)) {
    return "-";
  }

  return `${Number.isInteger(days) ? days : days.toFixed(1)}일`;
}

export { formatTenureDays };
