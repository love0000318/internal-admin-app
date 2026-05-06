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
  return process.env.ATTENDANCE_MONTHLY_CLOSE_ENABLED === "true";
}

export function isAttendanceMonthlyCloseSchemaError(error: unknown) {
  return isAttendanceSchemaPreparationError(error);
}

export function isAttendanceSchemaPreparationError(error: unknown) {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : JSON.stringify(error);

  return MISSING_MONTHLY_CLOSE_ERROR_MARKERS.some((marker) =>
    message.toLowerCase().includes(marker.toLowerCase()),
  );
}
