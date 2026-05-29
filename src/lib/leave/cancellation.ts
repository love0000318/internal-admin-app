import type { LeaveRequestStatus } from "@/generated/prisma/client";
import {
  compareDateOnly,
  dateToDateOnly,
  todayInSeoul,
} from "@/lib/leave/calculate-business-days";
import type { DateOnly } from "@/lib/leave/types";

type RequesterCancellableLeaveRequest = {
  status: LeaveRequestStatus;
  startDate: Date;
  autoConfirmedAt?: Date | null;
};

export function canRequesterCancelApprovedLeaveRequest({
  leaveRequest,
  today = todayInSeoul(),
}: {
  leaveRequest: RequesterCancellableLeaveRequest;
  today?: DateOnly;
}) {
  return (
    leaveRequest.status === "APPROVED" &&
    !leaveRequest.autoConfirmedAt &&
    compareDateOnly(dateToDateOnly(leaveRequest.startDate), today) > 0
  );
}

export function assertRequesterCanCancelApprovedLeaveRequest({
  leaveRequest,
  today = todayInSeoul(),
}: {
  leaveRequest: RequesterCancellableLeaveRequest;
  today?: DateOnly;
}) {
  if (leaveRequest.status !== "APPROVED") {
    throw new Error("not-approved");
  }

  if (leaveRequest.autoConfirmedAt) {
    throw new Error("already-used");
  }

  if (compareDateOnly(dateToDateOnly(leaveRequest.startDate), today) <= 0) {
    throw new Error("already-started");
  }
}
