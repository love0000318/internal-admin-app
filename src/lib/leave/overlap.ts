import { compareDateOnly } from "@/lib/leave/calculate-business-days";
import type { LeaveOverlapCandidate } from "@/lib/leave/types";

function dateRangesOverlap(
  left: Pick<LeaveOverlapCandidate, "startDate" | "endDate">,
  right: Pick<LeaveOverlapCandidate, "startDate" | "endDate">,
) {
  return (
    compareDateOnly(left.startDate, right.endDate) <= 0 &&
    compareDateOnly(left.endDate, right.startDate) >= 0
  );
}

function isSameHalfDaySlot(
  left: LeaveOverlapCandidate,
  right: LeaveOverlapCandidate,
) {
  return (
    left.type === "HALF_DAY" &&
    right.type === "HALF_DAY" &&
    left.startDate === right.startDate &&
    left.endDate === right.endDate &&
    left.halfDayPeriod === right.halfDayPeriod
  );
}

function canShareSameDate(left: LeaveOverlapCandidate, right: LeaveOverlapCandidate) {
  return (
    left.type === "HALF_DAY" &&
    right.type === "HALF_DAY" &&
    left.startDate === left.endDate &&
    right.startDate === right.endDate &&
    left.startDate === right.startDate &&
    left.halfDayPeriod !== right.halfDayPeriod
  );
}

export function assertNoOverlappingLeaveRequest({
  candidate,
  existingRequests,
}: {
  candidate: LeaveOverlapCandidate;
  existingRequests: LeaveOverlapCandidate[];
}): void {
  const activeRequests = existingRequests.filter(
    (request) => request.status === "PENDING" || request.status === "APPROVED",
  );

  for (const request of activeRequests) {
    if (candidate.id && request.id === candidate.id) {
      continue;
    }

    if (!dateRangesOverlap(candidate, request)) {
      continue;
    }

    if (canShareSameDate(candidate, request)) {
      continue;
    }

    if (isSameHalfDaySlot(candidate, request) || dateRangesOverlap(candidate, request)) {
      throw new Error("Overlapping leave request already exists.");
    }
  }
}
