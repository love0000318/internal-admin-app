function envFlag(name: string, defaultValue: boolean) {
  const value = process.env[name];

  if (value === undefined || value === "") {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export const features = {
  attendanceMonthlyClose: envFlag("ATTENDANCE_MONTHLY_CLOSE_ENABLED", false),
  adminReports: envFlag("ADMIN_REPORTS_ENABLED", true),
  profileSelfService: envFlag("PROFILE_SELF_SERVICE_ENABLED", true),
  calendarSubscription: envFlag("CALENDAR_SUBSCRIPTION_ENABLED", true),
  operationalCleanup: envFlag("OPERATIONAL_CLEANUP_ENABLED", true),
  permissionPreview: envFlag("PERMISSION_PREVIEW_ENABLED", true),
  externalNotifications: envFlag("EXTERNAL_NOTIFICATIONS_ENABLED", false),
};

export function featureUnavailableMessage() {
  return "이 기능은 현재 점검 중입니다. 잠시 후 다시 시도하거나 관리자에게 문의해 주세요.";
}
