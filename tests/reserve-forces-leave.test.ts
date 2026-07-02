import { describe, expect, it, vi } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import {
  calculateLeaveBalanceForUser,
} from "@/lib/leave/balance";
import {
  buildLeaveCalendarEventsFromRequest,
  type CalendarLeaveRequest,
} from "@/lib/leave/calendar";
import {
  getLegacyLeaveTypeRequestError,
  isAttachmentRequiredForPolicy,
  isReserveForcesLeaveType,
  legacyLeaveTypeDeductsAnnualBalance,
  RESERVE_FORCES_LEAVE_TYPE,
  resolveAttachmentPolicyForLeaveType,
  resolveLegacyLeaveAttachmentPolicy,
  type LegacyLeaveTypeDefinitionForRequest,
} from "@/lib/leave/legacy-request-policy";
import { getAttachmentStatusForPolicy } from "@/lib/leave/attachments";
import { notifyLeaveApprovalNeeded } from "@/lib/notifications/leave-notifications";
import type { LeavePolicy } from "@/lib/leave/types";
import type { RbacUser } from "@/lib/rbac/roles";

const annualPolicy: LeavePolicy = {
  type: "ANNUAL",
  isEnabled: true,
  deductsAnnual: true,
  deductsAnnualBalance: true,
  minRequestDays: null,
  maxRequestDays: null,
  maxDaysPerRequest: null,
  maxDaysPerYear: null,
  requestWindowStartOffsetDays: null,
  requestWindowEndOffsetDays: null,
  requiresAttachment: false,
  approvalRequired: true,
};

const nonDeductingPolicy: LeavePolicy = {
  type: "SICK",
  isEnabled: true,
  deductsAnnual: false,
  deductsAnnualBalance: false,
  minRequestDays: null,
  maxRequestDays: null,
  maxDaysPerRequest: null,
  maxDaysPerYear: null,
  requestWindowStartOffsetDays: null,
  requestWindowEndOffsetDays: null,
  requiresAttachment: true,
  approvalRequired: true,
};

const misconfiguredReservePolicy: LeavePolicy = {
  ...nonDeductingPolicy,
  type: RESERVE_FORCES_LEAVE_TYPE,
  deductsAnnual: true,
  deductsAnnualBalance: true,
};

const reserveLeaveType: LegacyLeaveTypeDefinitionForRequest = {
  id: "reserve-forces-type",
  code: RESERVE_FORCES_LEAVE_TYPE,
  name: "예비군",
  isEnabled: true,
  attachmentPolicy: "REQUIRED_BEFORE_REQUEST",
  deductsAnnualBalance: true,
};

function policies() {
  return {
    ANNUAL: annualPolicy,
    HALF_DAY: { ...annualPolicy, type: "HALF_DAY" as const },
    RESERVE_FORCES: misconfiguredReservePolicy,
    SICK: nonDeductingPolicy,
    BEREAVEMENT: { ...nonDeductingPolicy, type: "BEREAVEMENT" as const },
  };
}

describe("reserve forces leave requests", () => {
  it("keeps reserve forces leave out of annual balance even if data is misconfigured", () => {
    expect(
      legacyLeaveTypeDeductsAnnualBalance({
        type: RESERVE_FORCES_LEAVE_TYPE,
        policy: misconfiguredReservePolicy,
      }),
    ).toBe(false);

    const balance = calculateLeaveBalanceForUser({
      hireDate: "2024-01-01",
      asOfDate: "2026-05-01",
      fiscalYear: 2026,
      adjustments: [],
      leaveRequests: [
        { type: "ANNUAL", status: "APPROVED", dayCount: 1 },
        { type: "RESERVE_FORCES", status: "APPROVED", dayCount: 2 },
        { type: "RESERVE_FORCES", status: "PENDING", dayCount: 1 },
      ],
      policies: policies(),
    });

    expect(balance.usedDays).toBe(1);
    expect(balance.pendingDays).toBe(0);
    expect(balance.remainingDays).toBe(14);
  });

  it("returns safe validation errors for missing or inactive reserve forces type data", () => {
    expect(
      getLegacyLeaveTypeRequestError({
        type: RESERVE_FORCES_LEAVE_TYPE,
        leaveTypeDefinition: null,
      }),
    ).toBe("reserve-forces-type-missing");
    expect(
      getLegacyLeaveTypeRequestError({
        type: RESERVE_FORCES_LEAVE_TYPE,
        leaveTypeDefinition: { ...reserveLeaveType, isEnabled: false },
      }),
    ).toBe("disabled-policy");
    expect(
      getLegacyLeaveTypeRequestError({
        type: "ANNUAL",
        leaveTypeDefinition: null,
      }),
    ).toBeNull();
  });

  it("treats reserve forces evidence as optional even when policy data requires it", () => {
    const attachmentPolicy = resolveLegacyLeaveAttachmentPolicy({
      type: RESERVE_FORCES_LEAVE_TYPE,
      leaveTypeDefinition: reserveLeaveType,
      fallbackRequiresAttachment: true,
    });

    expect(attachmentPolicy).toBe("OPTIONAL");
    expect(isAttachmentRequiredForPolicy(attachmentPolicy)).toBe(false);
    expect(
      getAttachmentStatusForPolicy({
        attachmentPolicy,
        hasAttachment: false,
      }),
    ).toBe("OPTIONAL");
  });

  it("keeps required evidence validation for non-reserve leave types", () => {
    const sickLeaveType: LegacyLeaveTypeDefinitionForRequest = {
      ...reserveLeaveType,
      code: "SICK",
      name: "병가",
      attachmentPolicy: "REQUIRED_BEFORE_REQUEST",
    };

    const attachmentPolicy = resolveLegacyLeaveAttachmentPolicy({
      type: "SICK",
      leaveTypeDefinition: sickLeaveType,
      fallbackRequiresAttachment: false,
    });

    expect(attachmentPolicy).toBe("REQUIRED_BEFORE_REQUEST");
    expect(isAttachmentRequiredForPolicy(attachmentPolicy)).toBe(true);
    expect(() =>
      getAttachmentStatusForPolicy({
        attachmentPolicy,
        hasAttachment: false,
      }),
    ).toThrow("attachment-required");
  });

  it("maps custom or public-duty reserve forces names to optional evidence", () => {
    expect(isReserveForcesLeaveType({ code: "RESERVE_FORCES" })).toBe(true);
    expect(isReserveForcesLeaveType({ name: "예비군 공가" })).toBe(true);
    expect(
      resolveAttachmentPolicyForLeaveType({
        code: "PUBLIC_DUTY",
        name: "예비군 공가",
        attachmentPolicy: "REQUIRED_BEFORE_REQUEST",
      }),
    ).toBe("OPTIONAL");
  });

  it("creates approval-needed notifications for reserve forces leave", async () => {
    const notifications: Array<{ message: string; linkUrl: string | null }> = [];
    const prisma = {
      user: {
        findMany: vi.fn(async () => [
          { id: "owner", role: "OWNER", status: "ACTIVE", teamId: null },
        ]),
      },
      auditLog: {
        create: vi.fn(async () => ({})),
      },
      notification: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => {
          notifications.push({
            message: data.message,
            linkUrl: data.linkUrl,
          });

          return { id: `notification-${notifications.length}`, ...data };
        }),
      },
    };

    const result = await notifyLeaveApprovalNeeded({
      leaveRequest: {
        id: "reserve-request-1",
        userId: "requester",
        type: RESERVE_FORCES_LEAVE_TYPE,
        requestKind: "LEGACY",
        leaveTypeId: reserveLeaveType.id,
        status: "PENDING",
        startDate: new Date("2026-06-15T00:00:00.000Z"),
        endDate: new Date("2026-06-15T00:00:00.000Z"),
        halfDayPeriod: null,
        dayCount: new Prisma.Decimal(1),
        attachmentStatus: "SUBMITTED",
        user: {
          id: "requester",
          name: "신청자",
          role: "MANAGER",
          status: "ACTIVE",
          teamId: "team-a",
        },
        customLeaveType: null,
      },
      approvalPolicy: {
        id: "owner-approval",
        code: "OWNER_ONLY",
        approvalMode: "SINGLE",
        approverRule: "OWNER",
        customApproverUserId: null,
      },
      leaveRequestId: "reserve-request-1",
      leaveTypeName: "예비군",
      prisma: prisma as never,
    });

    expect(result.count).toBe(1);
    expect(notifications[0]).toMatchObject({
      linkUrl: "/leaves/approvals/reserve-request-1",
    });
    expect(notifications[0].message).toContain("예비군");
  });

  it("shows approved reserve forces leave on the calendar", () => {
    const owner: RbacUser = { id: "owner", role: "OWNER", status: "ACTIVE" };
    const request: CalendarLeaveRequest = {
      id: "reserve-request-1",
      userId: "requester",
      type: RESERVE_FORCES_LEAVE_TYPE,
      leaveTypeId: reserveLeaveType.id,
      status: "APPROVED",
      startDate: new Date("2026-06-15T00:00:00.000Z"),
      endDate: new Date("2026-06-15T00:00:00.000Z"),
      halfDayPeriod: null,
      dayCount: new Prisma.Decimal(1),
      user: {
        id: "requester",
        name: "신청자",
        role: "MANAGER",
        status: "ACTIVE",
        teamId: "team-a",
      },
      customLeaveType: {
        id: reserveLeaveType.id,
        code: RESERVE_FORCES_LEAVE_TYPE,
        name: "예비군",
        visibility: "PUBLIC_WITH_TYPE",
      },
    };

    const events = buildLeaveCalendarEventsFromRequest({
      actor: owner,
      request,
      definitionsByCode: new Map(),
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      leaveRequestId: "reserve-request-1",
      leaveTypeCode: RESERVE_FORCES_LEAVE_TYPE,
      leaveTypeLabel: "예비군",
      detailUrl: "/leaves/approvals/reserve-request-1",
    });
  });
});
