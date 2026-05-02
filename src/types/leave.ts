export type DateOnly = `${number}-${number}-${number}`;

export type LeaveType =
  | "ANNUAL"
  | "HALF_DAY"
  | "RESERVE_FORCES"
  | "SICK"
  | "BEREAVEMENT";

export type HalfDayPeriod = "AM" | "PM";

export type LeaveRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "WITHDRAWN";

export type LeavePolicyDraft = {
  type: LeaveType;
  isEnabled: boolean;
  deductsAnnual: boolean;
  maxDaysPerRequest: number | null;
  maxDaysPerYear: number | null;
  requestWindowStartOffsetDays: number | null;
  requestWindowEndOffsetDays: number | null;
  requiresAttachment: boolean;
  approvalRequired: boolean;
};

export type LeaveBalanceDraft = {
  userId: string;
  fiscalYear: number;
  annualEntitled: number;
  manualGranted: number;
  usedDays: number;
  pendingDays: number;
  expiresAt: DateOnly | null;
};

export type LeaveAdjustmentDraft = {
  userId: string;
  fiscalYear: number;
  days: number;
  reason: string;
  createdById: string;
};

export type CompanyHolidayDraft = {
  date: DateOnly;
  name: string;
};

export type LeaveRequestDraft = {
  id: string;
  userId: string;
  type: LeaveType;
  status: LeaveRequestStatus;
  startDate: DateOnly;
  endDate: DateOnly;
  halfDayPeriod: HalfDayPeriod | null;
  dayCount: number;
  reason: string | null;
  attachmentUrl: string | null;
};

export type LeaveBalanceSnapshot = {
  userId: string;
  annualEntitled: number;
  manualGranted: number;
  usedDays: number;
  pendingDays: number;
  remainingAnnualDays: number;
};

export type LeaveCalculationRules = {
  timezone: "Asia/Seoul";
  dateOnly: true;
  excludeWeekends: true;
  excludeCompanyHolidays: true;
  annualUnderOneYearMonthlyGrant: 1;
  annualUnderOneYearCap: 11;
  annualAfterOneYearBase: 15;
  annualAdditionalEveryTwoYearsAfterThirdYear: 1;
  annualEntitlementCap: 25;
  halfDayValue: 0.5;
  halfDaySingleDateOnly: true;
};
