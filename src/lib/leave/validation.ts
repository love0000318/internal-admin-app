import { z } from "zod";

export const leaveRequestSchema = z.object({
  type: z.enum(["ANNUAL", "HALF_DAY", "RESERVE_FORCES", "SICK", "BEREAVEMENT"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  halfDayPeriod: z.enum(["AM", "PM"]).optional().nullable(),
  reason: z.string().max(1000).optional().nullable(),
  attachmentUrl: z.string().max(2048).optional().nullable(),
});

export const leavePolicyUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  maxDaysPerYear: z.coerce.number().positive().optional().nullable(),
  minRequestDays: z.coerce.number().positive().optional().nullable(),
  maxRequestDays: z.coerce.number().positive().optional().nullable(),
});

export const companyHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(1),
});

export const leaveAdjustmentSchema = z.object({
  userId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  amount: z.coerce.number().refine((value) => value !== 0),
  reason: z.string().trim().min(1).max(1000),
});

export function optionalNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return Number(value);
}

export function optionalString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
