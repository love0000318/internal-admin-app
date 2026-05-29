export type DateOnly = `${number}-${number}-${number}`;

export const LEAVE_TYPES = [
  "ANNUAL",
  "HALF_DAY",
  "RESERVE_FORCES",
  "SICK",
  "BEREAVEMENT",
] as const;

export type LeaveType =
  (typeof LEAVE_TYPES)[number];

export type HalfDayPeriod = "AM" | "PM";

export type LeaveRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "WITHDRAWN";

export type LeavePolicy = {
  id?: string;
  type: LeaveType;
  name?: string | null;
  description?: string | null;
  isEnabled: boolean;
  deductsAnnual: boolean;
  deductsAnnualBalance?: boolean | null;
  minRequestDays?: number | null;
  maxRequestDays?: number | null;
  maxDaysPerRequest: number | null;
  maxDaysPerYear: number | null;
  requestWindowStartOffsetDays: number | null;
  requestWindowEndOffsetDays: number | null;
  requiresAttachment: boolean;
  approvalRequired: boolean;
};

export type LeaveBalanceSnapshot = {
  annualEntitled: number;
  manualGranted: number;
  usedDays: number;
  pendingDays: number;
};

export type LeaveRequestInput = {
  type: LeaveType;
  startDate: DateOnly;
  endDate: DateOnly;
  halfDayPeriod?: HalfDayPeriod | null;
  attachmentUrl?: string | null;
};

export type LeaveRequestForBalance = {
  type: LeaveType;
  status: LeaveRequestStatus;
  dayCount: number;
  requestKind?: "LEGACY" | "ANNUAL" | "CUSTOM_GRANT" | string;
  customLeaveType?: {
    code?: string | null;
    category?: string | null;
    deductsAnnualBalance?: boolean | null;
  } | null;
  grantUsages?: Array<{
    leaveGrant?: {
      source?: string | null;
      leaveType?: {
        code?: string | null;
      } | null;
    } | null;
  }>;
};

export type LeaveAdjustmentForBalance = {
  days: number;
};

export type LeaveOverlapCandidate = {
  id?: string;
  type: LeaveType;
  status: LeaveRequestStatus;
  startDate: DateOnly;
  endDate: DateOnly;
  halfDayPeriod?: HalfDayPeriod | null;
};
