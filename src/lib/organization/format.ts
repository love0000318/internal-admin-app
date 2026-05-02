import type { DateOnly } from "@/lib/leave/types";

export function toDateInputValue(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function toDisplayDate(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : "-";
}

export function dateOnlyFromDate(date: Date | null | undefined): DateOnly | null {
  return date ? (date.toISOString().slice(0, 10) as DateOnly) : null;
}
