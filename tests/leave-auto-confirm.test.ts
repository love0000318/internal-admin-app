import { describe, expect, it } from "vitest";

import { shouldAutoConfirmLeaveRequest } from "@/lib/leave/auto-confirm";

const baseRequest = {
  status: "PENDING" as const,
  startDate: new Date("2026-05-10T00:00:00.000Z"),
  autoConfirmedAt: null,
  attachmentStatus: "NOT_REQUIRED" as const,
  requestKind: "LEGACY" as const,
  user: { status: "ACTIVE" as const },
  customLeaveType: null,
};

const basePolicy = {
  isEnabled: true,
  autoConfirmWhenStartDatePassed: true,
  autoConfirmTiming: "AFTER_START_DATE" as const,
  requireAttachmentAcceptedBeforeApproval: false,
};

describe("leave auto confirm policy", () => {
  it("does not auto confirm on the leave start date", () => {
    expect(
      shouldAutoConfirmLeaveRequest({
        leaveRequest: baseRequest,
        policy: basePolicy,
        today: "2026-05-10",
      }),
    ).toEqual({ shouldAutoConfirm: false, reason: "START_DATE_NOT_REACHED" });
  });

  it("allows auto confirm after the leave start date", () => {
    expect(
      shouldAutoConfirmLeaveRequest({
        leaveRequest: baseRequest,
        policy: basePolicy,
        today: "2026-05-11",
      }),
    ).toEqual({ shouldAutoConfirm: true });
  });

  it("skips future, approved, withdrawn, rejected, and cancelled requests", () => {
    expect(
      shouldAutoConfirmLeaveRequest({
        leaveRequest: baseRequest,
        policy: basePolicy,
        today: "2026-05-09",
      }),
    ).toEqual({ shouldAutoConfirm: false, reason: "START_DATE_NOT_REACHED" });

    for (const status of ["APPROVED", "WITHDRAWN", "REJECTED", "CANCELLED"] as const) {
      expect(
        shouldAutoConfirmLeaveRequest({
          leaveRequest: { ...baseRequest, status },
          policy: basePolicy,
          today: "2026-05-11",
        }),
      ).toEqual({ shouldAutoConfirm: false, reason: "NOT_PENDING" });
    }
  });

  it("keeps today > startDate even if older ON_START_DATE policies exist", () => {
    const policy = { ...basePolicy, autoConfirmTiming: "ON_START_DATE" as const };

    expect(
      shouldAutoConfirmLeaveRequest({
        leaveRequest: baseRequest,
        policy,
        today: "2026-05-10",
      }),
    ).toEqual({ shouldAutoConfirm: false, reason: "START_DATE_NOT_REACHED" });
    expect(
      shouldAutoConfirmLeaveRequest({
        leaveRequest: baseRequest,
        policy,
        today: "2026-05-11",
      }),
    ).toEqual({ shouldAutoConfirm: true });
  });

  it("respects disabled policy, inactive requester, and accepted attachment requirements", () => {
    expect(
      shouldAutoConfirmLeaveRequest({
        leaveRequest: baseRequest,
        policy: { ...basePolicy, autoConfirmWhenStartDatePassed: false },
        today: "2026-05-10",
      }),
    ).toEqual({ shouldAutoConfirm: false, reason: "AUTO_CONFIRM_DISABLED" });

    expect(
      shouldAutoConfirmLeaveRequest({
        leaveRequest: { ...baseRequest, user: { status: "DEACTIVATED" as const } },
        policy: basePolicy,
        today: "2026-05-10",
      }),
    ).toEqual({ shouldAutoConfirm: false, reason: "REQUESTER_INACTIVE" });

    expect(
      shouldAutoConfirmLeaveRequest({
        leaveRequest: { ...baseRequest, attachmentStatus: "SUBMITTED" as const },
        policy: { ...basePolicy, requireAttachmentAcceptedBeforeApproval: true },
        today: "2026-05-11",
      }),
    ).toEqual({ shouldAutoConfirm: false, reason: "ATTACHMENT_NOT_ACCEPTED" });
  });

  it("skips already auto-confirmed or disabled custom leave requests", () => {
    expect(
      shouldAutoConfirmLeaveRequest({
        leaveRequest: { ...baseRequest, autoConfirmedAt: new Date("2026-05-10T00:00:00.000Z") },
        policy: basePolicy,
        today: "2026-05-10",
      }),
    ).toEqual({ shouldAutoConfirm: false, reason: "ALREADY_AUTO_CONFIRMED" });

    expect(
      shouldAutoConfirmLeaveRequest({
        leaveRequest: {
          ...baseRequest,
          requestKind: "CUSTOM_GRANT" as const,
          customLeaveType: { isEnabled: false },
        },
        policy: basePolicy,
        today: "2026-05-10",
      }),
    ).toEqual({ shouldAutoConfirm: false, reason: "LEAVE_TYPE_DISABLED" });
  });
});
