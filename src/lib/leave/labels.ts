import type {
  HalfDayPeriod,
  LeaveRequestStatus,
  LeaveType,
} from "@/lib/leave/types";

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  ANNUAL: "연차",
  HALF_DAY: "반차",
  RESERVE_FORCES: "예비군",
  SICK: "병가",
  BEREAVEMENT: "경조사",
};

export const LEAVE_STATUS_LABELS: Record<LeaveRequestStatus, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인 완료",
  REJECTED: "반려",
  CANCELLED: "취소",
  WITHDRAWN: "철회",
};

export const HALF_DAY_PERIOD_LABELS: Record<HalfDayPeriod, string> = {
  AM: "오전",
  PM: "오후",
};

export function formatLeaveDays(days: number) {
  return `${Number.isInteger(days) ? days : days.toFixed(1)}일`;
}
