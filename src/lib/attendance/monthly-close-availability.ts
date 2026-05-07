import { features } from "@/config/features";
import { isPrismaSchemaPreparationError } from "@/lib/db/schema-errors";

const MISSING_MONTHLY_CLOSE_ERROR_MARKERS = [
  "AttendanceMonthlyClose",
  "AttendanceChangeRequest",
  "attendance_monthly_close",
  "attendance_change_request",
  "AttendanceMonthlyCloseStatus",
  "AttendanceChangeRequestStatus",
  "P2021",
  "P2022",
  "does not exist",
  "doesn't exist",
  "table",
  "relation",
  "column",
  "enum",
];

export function isAttendanceMonthlyCloseEnabled() {
  return features.attendanceMonthlyClose;
}

export function isAttendanceMonthlyCloseSchemaError(error: unknown) {
  return isAttendanceSchemaPreparationError(error);
}

export function isAttendanceSchemaPreparationError(error: unknown) {
  return isPrismaSchemaPreparationError(
    error,
    MISSING_MONTHLY_CLOSE_ERROR_MARKERS,
  );
}
