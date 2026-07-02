"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { Prisma, type AttachmentPolicy } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { assertEnoughLeaveBalance, toNumber } from "@/lib/leave/balance";
import {
  canContinueWithoutStoredAttachment,
  createLeaveAttachmentRecord,
  getAttachmentStatusForPolicy,
  LeaveAttachmentError,
  prepareAttachmentFromFormData,
  type PreparedLeaveAttachment,
} from "@/lib/leave/attachments";
import {
  assertValidLeaveDateRange,
  calculateRequestedLeaveDays,
  dateOnlyToDate,
  dateToDateOnly,
  todayInSeoul,
} from "@/lib/leave/calculate-business-days";
import {
  assertCustomLeaveGrantRequestAllowed,
  calculateCustomLeaveRequestAmount,
  convertLeaveGrantPendingToUsed,
  CustomLeaveRequestError,
  getRequestableLeaveGrantDetail,
  reserveLeaveGrantAmountForPendingRequest,
  releaseLeaveGrantPendingAmount,
  restoreLeaveGrantUsedAmount,
  type CustomLeaveUsageUnit,
} from "@/lib/leave/custom-grant-requests";
import {
  approvalPolicySummary,
  resolveApprovalPolicyForLeaveRequest,
  resolveApprovalPolicyForLeaveTypeCode,
  shouldAutoApproveLeaveRequest,
} from "@/lib/leave/approval-policy";
import { assertNoOverlappingLeaveRequest } from "@/lib/leave/overlap";
import {
  recordLeaveRequestApprovedLedger,
  recordLeaveRequestCancelledLedger,
  recordLeaveRequestPendingLedger,
  recordLeaveRequestWithdrawnLedger,
} from "@/lib/leave/ledger";
import {
  getLeavePolicyMap,
  getUserLeaveBalance,
  listEnabledCompanyHolidayDateOnlys,
} from "@/lib/leave/queries";
import type { DateOnly, LeaveOverlapCandidate } from "@/lib/leave/types";
import {
  getLegacyLeaveTypeRequestError,
  isAttachmentRequiredForPolicy,
  legacyLeaveTypeDeductsAnnualBalance,
  RESERVE_FORCES_LEAVE_TYPE,
  resolveAttachmentPolicyForLeaveType,
  resolveLegacyLeaveAttachmentPolicy,
  type LegacyLeaveTypeDefinitionForRequest,
} from "@/lib/leave/legacy-request-policy";
import { leaveRequestSchema, optionalString } from "@/lib/leave/validation";
import {
  notifyLeaveApprovalNeeded,
  notifyLeaveRequestApproved,
  notifyLeaveRequestRejectedOrCancelled,
} from "@/lib/notifications/leave-notifications";
import { assertRequesterCanCancelApprovedLeaveRequest } from "@/lib/leave/cancellation";
import { requireRouteAccess } from "@/lib/rbac/server-guards";

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getRequiredFormValue(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

function redirectToNewRequest(error: string): never {
  redirect(`/leaves/me/requests/new?error=${error}`);
}

class LeaveRequesterCancelActionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function normalizeRequestDates(formData: FormData) {
  const startDate = getRequiredFormValue(formData, "startDate");
  const endDate = getRequiredFormValue(formData, "endDate") || startDate;

  return { startDate, endDate };
}

function getCustomUsageUnit(value: FormDataEntryValue | null): CustomLeaveUsageUnit {
  return value === "HALF_DAY" ? "HALF_DAY" : "FULL_DAY";
}

function preparedAttachmentFromUrl(attachmentUrl: string | null): PreparedLeaveAttachment | null {
  if (!attachmentUrl) {
    return null;
  }

  return {
    fileName: "external-reference",
    originalFileName: "증빙자료 참고 링크",
    fileKey: null,
    fileUrl: attachmentUrl,
    fileSize: null,
    mimeType: null,
  };
}

async function prepareOptionalAttachment(
  formData: FormData,
  {
    attachmentPolicy,
  }: {
    attachmentPolicy?: AttachmentPolicy;
  } = {},
) {
  try {
    return {
      preparedAttachment: await prepareAttachmentFromFormData(formData),
      attachmentStorageFailureCode: null as string | null,
    };
  } catch (error) {
    if (error instanceof LeaveAttachmentError) {
      if (
        attachmentPolicy &&
        canContinueWithoutStoredAttachment({ attachmentPolicy, error })
      ) {
        return {
          preparedAttachment: null,
          attachmentStorageFailureCode: error.code,
        };
      }

      redirectToNewRequest(error.code);
    }

    throw error;
  }
}

async function getLegacyLeaveTypeDefinitionForRequest({
  type,
  prisma,
}: {
  type: string;
  prisma: ReturnType<typeof getPrisma>;
}): Promise<LegacyLeaveTypeDefinitionForRequest | null> {
  return prisma.leaveTypeDefinition.findUnique({
    where: { code: type },
    select: {
      id: true,
      code: true,
      name: true,
      isEnabled: true,
      attachmentPolicy: true,
      deductsAnnualBalance: true,
    },
  });
}

async function createCustomGrantLeaveRequest(formData: FormData) {
  const actor = await requireRouteAccess("/leaves/me");
  const { startDate, endDate } = normalizeRequestDates(formData);
  const leaveGrantId = getRequiredFormValue(formData, "leaveGrantId");
  const usageUnit = getCustomUsageUnit(formData.get("usageUnit"));
  const halfDayPeriod = optionalString(formData.get("halfDayPeriod")) as "AM" | "PM" | null;
  const reason = optionalString(formData.get("reason"));
  const attachmentUrl = optionalString(formData.get("attachmentUrl"));
  let preparedAttachment: PreparedLeaveAttachment | null = null;
  let attachmentStorageFailureCode: string | null = null;
  let customAttachmentPolicy: AttachmentPolicy = "NOT_REQUIRED";

  if (!leaveGrantId || !startDate || !endDate) {
    redirectToNewRequest("invalid");
  }

  const prisma = getPrisma();
  const today = todayInSeoul();

  try {
    assertValidLeaveDateRange({
      type: usageUnit === "HALF_DAY" ? "HALF_DAY" : "ANNUAL",
      startDate: startDate as DateOnly,
      endDate: endDate as DateOnly,
      halfDayPeriod,
      today,
      allowPast: true,
    });
  } catch {
    redirectToNewRequest("invalid-date");
  }

  const grant = await getRequestableLeaveGrantDetail(leaveGrantId, actor.id, prisma);
  const companyHolidays = await listEnabledCompanyHolidayDateOnlys(
    startDate as DateOnly,
    endDate as DateOnly,
    prisma,
  );
  let requestedDays = 0;

  try {
    requestedDays = calculateCustomLeaveRequestAmount({
      usageUnit,
      startDate: startDate as DateOnly,
      endDate: endDate as DateOnly,
      halfDayPeriod,
      companyHolidays,
      includeHolidayInDeduction: grant?.leaveType.includeHolidayInDeduction ?? false,
    });

    if (requestedDays <= 0) {
      redirectToNewRequest("zero-days");
    }

    if (!grant) {
      throw new CustomLeaveRequestError("grant-not-found");
    }

    customAttachmentPolicy = resolveAttachmentPolicyForLeaveType({
      code: grant.leaveType.code,
      name: grant.leaveType.name,
      attachmentPolicy: grant.leaveType.attachmentPolicy,
    });
    const prepared = await prepareOptionalAttachment(formData, {
      attachmentPolicy: customAttachmentPolicy,
    });
    preparedAttachment =
      prepared.preparedAttachment ?? preparedAttachmentFromUrl(attachmentUrl);
    attachmentStorageFailureCode = prepared.attachmentStorageFailureCode;

    assertCustomLeaveGrantRequestAllowed({
      grant,
      userId: actor.id,
      usageUnit,
      amount: requestedDays,
      startDate: startDate as DateOnly,
      endDate: endDate as DateOnly,
      attachmentUrl: preparedAttachment ? "submitted" : null,
      attachmentPolicy: customAttachmentPolicy,
    });
  } catch (error) {
    if (error instanceof CustomLeaveRequestError) {
      redirectToNewRequest(error.code);
    }

    throw error;
  }

  const existingRequests = await prisma.leaveRequest.findMany({
    where: {
      userId: actor.id,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: dateOnlyToDate(endDate as DateOnly) },
      endDate: { gte: dateOnlyToDate(startDate as DateOnly) },
    },
  });

  try {
    assertNoOverlappingLeaveRequest({
      candidate: {
        type: usageUnit === "HALF_DAY" ? "HALF_DAY" : "ANNUAL",
        status: "PENDING",
        startDate: startDate as DateOnly,
        endDate: endDate as DateOnly,
        halfDayPeriod: usageUnit === "HALF_DAY" ? halfDayPeriod : null,
      },
      existingRequests: existingRequests.map(
        (request): LeaveOverlapCandidate => ({
          id: request.id,
          type: request.type,
          status: request.status,
          startDate: dateToDateOnly(request.startDate),
          endDate: dateToDateOnly(request.endDate),
          halfDayPeriod: request.halfDayPeriod,
        }),
      ),
    });
  } catch {
    redirectToNewRequest("overlap");
  }

  const approvalCheckRequest = {
    id: "__new__",
    userId: actor.id,
    type: usageUnit === "HALF_DAY" ? "HALF_DAY" as const : "ANNUAL" as const,
    requestKind: "CUSTOM_GRANT" as const,
    leaveTypeId: grant!.leaveTypeId,
    status: "PENDING" as const,
    startDate: dateOnlyToDate(startDate as DateOnly),
    endDate: dateOnlyToDate(endDate as DateOnly),
    halfDayPeriod: usageUnit === "HALF_DAY" ? halfDayPeriod : null,
    dayCount: new Prisma.Decimal(requestedDays),
    reason,
    attachmentRequired: isAttachmentRequiredForPolicy(customAttachmentPolicy),
    attachmentUrl,
    attachmentStatus: getAttachmentStatusForPolicy({
      attachmentPolicy: customAttachmentPolicy,
      hasAttachment: Boolean(preparedAttachment),
    }),
    reviewerId: null,
    reviewedAt: null,
    reviewComment: null,
    rejectReason: null,
    cancelReason: null,
    withdrawnAt: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: actor.id,
      role: actor.role,
      status: actor.status ?? "ACTIVE",
      teamId: actor.teamId ?? null,
      name: actor.name,
    },
    customLeaveType: grant!.leaveType,
  };
  const approvalPolicy = await resolveApprovalPolicyForLeaveRequest({
    leaveRequest: approvalCheckRequest,
    prisma,
  });
  const autoApprove = await shouldAutoApproveLeaveRequest({
    leaveRequest: approvalCheckRequest,
    policy: approvalPolicy,
    prisma,
  });

  const leaveRequest = await prisma.$transaction(
    async (tx) => {
      await reserveLeaveGrantAmountForPendingRequest({
        tx,
        leaveGrantId,
        amount: requestedDays,
      });

      const created = await tx.leaveRequest.create({
        data: {
          userId: actor.id,
          type: usageUnit === "HALF_DAY" ? "HALF_DAY" : "ANNUAL",
          requestKind: "CUSTOM_GRANT",
          leaveTypeId: grant!.leaveTypeId,
          status: autoApprove ? "APPROVED" : "PENDING",
          startDate: dateOnlyToDate(startDate as DateOnly),
          endDate: dateOnlyToDate(endDate as DateOnly),
          halfDayPeriod: usageUnit === "HALF_DAY" ? halfDayPeriod : null,
          dayCount: requestedDays,
          reason,
          reviewedAt: autoApprove ? new Date() : undefined,
          reviewComment: autoApprove ? "승인 정책에 따라 자동 승인되었습니다." : undefined,
          attachmentRequired: isAttachmentRequiredForPolicy(customAttachmentPolicy),
          attachmentUrl,
          attachmentStatus: getAttachmentStatusForPolicy({
            attachmentPolicy: customAttachmentPolicy,
            hasAttachment: Boolean(preparedAttachment),
          }),
          grantUsages: {
            create: {
              leaveGrantId,
              amount: requestedDays,
              unit: grant!.unit,
            },
          },
        },
      });

      if (preparedAttachment) {
        await createLeaveAttachmentRecord({
          tx,
          leaveRequestId: created.id,
          uploadedByUserId: actor.id,
          prepared: preparedAttachment,
        });
      }

      if (
        !preparedAttachment &&
        customAttachmentPolicy === "REQUIRED_AFTER_REQUEST"
      ) {
        await tx.notification.create({
          data: {
            userId: actor.id,
            type: "LEAVE_ATTACHMENT_RESUBMISSION_REQUESTED",
            title: "휴가 증빙자료 제출이 필요합니다.",
            message: `${grant!.leaveType.name} 요청은 증빙자료를 추후 제출해야 합니다.`,
            linkUrl: `/leaves/me/requests/${created.id}`,
            metadata: toJsonValue({ leaveRequestId: created.id }),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: autoApprove ? null : actor.id,
          actorUserId: autoApprove ? null : actor.id,
          targetUserId: actor.id,
          action: autoApprove ? "LEAVE_REQUEST_AUTO_APPROVED" : "CUSTOM_LEAVE_REQUEST_CREATED",
          targetType: "LEAVE_REQUEST",
          targetId: created.id,
          metadata: toJsonValue({
            requestKind: "CUSTOM_GRANT",
            leaveRequestId: created.id,
            leaveGrantId,
            leaveTypeId: grant!.leaveTypeId,
            leaveTypeCode: grant!.leaveType.code,
            amount: requestedDays,
            unit: grant!.unit,
            startDate,
            endDate,
            approvalPolicy: approvalPolicySummary(approvalPolicy),
            ...(attachmentStorageFailureCode
              ? { attachmentStorageFailureCode }
              : {}),
          }),
        },
      });

      await recordLeaveRequestPendingLedger({
        tx,
        leaveRequest: {
          ...created,
          grantUsages: [
            {
              leaveGrantId,
              amount: requestedDays,
              unit: grant!.unit,
              leaveGrantSource: grant!.source,
              leaveTypeCode: grant!.leaveType.code,
            },
          ],
        },
      });

      if (autoApprove) {
        for (const usage of [
          {
            leaveGrantId,
            amount: requestedDays,
            leaveGrantSource: grant!.source,
            leaveTypeCode: grant!.leaveType.code,
          },
        ]) {
          await convertLeaveGrantPendingToUsed({
            tx,
            leaveGrantId: usage.leaveGrantId,
            amount: usage.amount,
          });
        }

        await recordLeaveRequestApprovedLedger({
          tx,
          leaveRequest: {
            ...created,
            grantUsages: [
              {
                leaveGrantId,
                amount: requestedDays,
                unit: grant!.unit,
                leaveGrantSource: grant!.source,
                leaveTypeCode: grant!.leaveType.code,
              },
            ],
          },
          actorId: null,
        });

      }

      return created;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  if (autoApprove) {
    await notifyLeaveRequestApproved({
      prisma,
      leaveRequestId: leaveRequest.id,
      approvedByUserId: null,
      approvalSource: "AUTO_POLICY",
    });
  } else {
    await notifyLeaveApprovalNeeded({
      prisma,
      leaveRequest: approvalCheckRequest,
      approvalPolicy,
      leaveRequestId: leaveRequest.id,
      leaveTypeName: grant!.leaveType.name,
    });
  }

  revalidatePath("/leaves/me");
  revalidatePath("/leaves/approvals");
  revalidatePath("/notifications");
  if (autoApprove) {
    revalidatePath("/leaves/calendar");
    revalidatePath("/leaves/approvals/approved");
  }
  redirect(`/leaves/me/requests/${leaveRequest.id}?success=created`);
}

export async function createLeaveRequest(formData: FormData) {
  if (getRequiredFormValue(formData, "requestKind") === "CUSTOM_GRANT") {
    return createCustomGrantLeaveRequest(formData);
  }

  const actor = await requireRouteAccess("/leaves/me");
  const { startDate, endDate } = normalizeRequestDates(formData);
  const parsed = leaveRequestSchema.safeParse({
    type: formData.get("type"),
    startDate,
    endDate,
    halfDayPeriod: optionalString(formData.get("halfDayPeriod")),
    reason: optionalString(formData.get("reason")),
    attachmentUrl: optionalString(formData.get("attachmentUrl")),
  });

  if (!parsed.success) {
    redirectToNewRequest("invalid");
  }

  const prisma = getPrisma();
  const policies = await getLeavePolicyMap(prisma);
  const policy = policies[parsed.data.type];
  const legacyLeaveTypeDefinition = await getLegacyLeaveTypeDefinitionForRequest({
    type: parsed.data.type,
    prisma,
  });
  const legacyTypeError = getLegacyLeaveTypeRequestError({
    type: parsed.data.type,
    leaveTypeDefinition: legacyLeaveTypeDefinition,
  });

  if (legacyTypeError) {
    redirectToNewRequest(legacyTypeError);
  }

  if (!policy?.isEnabled) {
    redirectToNewRequest("disabled-policy");
  }

  const attachmentPolicy = resolveLegacyLeaveAttachmentPolicy({
    type: parsed.data.type,
    leaveTypeDefinition: legacyLeaveTypeDefinition,
    fallbackRequiresAttachment: policy.requiresAttachment,
  });
  const linkedLegacyLeaveTypeId =
    parsed.data.type === RESERVE_FORCES_LEAVE_TYPE
      ? legacyLeaveTypeDefinition?.id ?? null
      : null;
  const prepared = await prepareOptionalAttachment(formData, { attachmentPolicy });
  const preparedAttachment =
    prepared.preparedAttachment ??
    preparedAttachmentFromUrl(parsed.data.attachmentUrl ?? null);
  const attachmentStorageFailureCode = prepared.attachmentStorageFailureCode;

  const today = todayInSeoul();

  try {
    assertValidLeaveDateRange({
      ...parsed.data,
      startDate: parsed.data.startDate as DateOnly,
      endDate: parsed.data.endDate as DateOnly,
      today,
      allowPast: true,
    });
  } catch {
    redirectToNewRequest("invalid-date");
  }

  const companyHolidays = await listEnabledCompanyHolidayDateOnlys(
    parsed.data.startDate as DateOnly,
    parsed.data.endDate as DateOnly,
    prisma,
  );
  let requestedDays = 0;

  try {
    requestedDays = calculateRequestedLeaveDays({
      type: parsed.data.type,
      startDate: parsed.data.startDate as DateOnly,
      endDate: parsed.data.endDate as DateOnly,
      halfDayPeriod: parsed.data.halfDayPeriod,
      companyHolidays,
    });
  } catch {
    redirectToNewRequest("invalid-date");
  }

  if (requestedDays <= 0) {
    redirectToNewRequest("zero-days");
  }

  const maxDays = policy.maxRequestDays ?? policy.maxDaysPerRequest;
  if (
    policy.minRequestDays !== null &&
    policy.minRequestDays !== undefined &&
    requestedDays < policy.minRequestDays
  ) {
    redirectToNewRequest("min-days");
  }

  if (maxDays !== null && requestedDays > maxDays) {
    redirectToNewRequest("max-days");
  }

  let attachmentStatus: ReturnType<typeof getAttachmentStatusForPolicy>;

  try {
    attachmentStatus = getAttachmentStatusForPolicy({
      attachmentPolicy,
      hasAttachment: Boolean(preparedAttachment),
    });
  } catch (error) {
    if (error instanceof LeaveAttachmentError) {
      redirectToNewRequest(error.code);
    }

    throw error;
  }

  const existingRequests = await prisma.leaveRequest.findMany({
    where: {
      userId: actor.id,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: dateOnlyToDate(parsed.data.endDate as DateOnly) },
      endDate: { gte: dateOnlyToDate(parsed.data.startDate as DateOnly) },
    },
  });

  try {
    assertNoOverlappingLeaveRequest({
      candidate: {
        type: parsed.data.type,
        status: "PENDING",
        startDate: parsed.data.startDate as DateOnly,
        endDate: parsed.data.endDate as DateOnly,
        halfDayPeriod: parsed.data.halfDayPeriod,
      },
      existingRequests: existingRequests.map(
        (request): LeaveOverlapCandidate => ({
          id: request.id,
          type: request.type,
          status: request.status,
          startDate: dateToDateOnly(request.startDate),
          endDate: dateToDateOnly(request.endDate),
          halfDayPeriod: request.halfDayPeriod,
        }),
      ),
    });
  } catch {
    redirectToNewRequest("overlap");
  }

  if (
    legacyLeaveTypeDeductsAnnualBalance({
      type: parsed.data.type,
      policy,
    })
  ) {
    const balance = await getUserLeaveBalance({
      userId: actor.id,
      year: Number((parsed.data.startDate as DateOnly).slice(0, 4)),
      prisma,
    });

    try {
      assertEnoughLeaveBalance({ requestedDays, balance });
    } catch {
      redirectToNewRequest("balance");
    }
  }

  const approvalPolicy = await resolveApprovalPolicyForLeaveTypeCode({
    leaveType: parsed.data.type,
    prisma,
  });
  const approvalCheckRequest = {
    id: "__new__",
    userId: actor.id,
    type: parsed.data.type,
    requestKind: "LEGACY" as const,
    leaveTypeId: linkedLegacyLeaveTypeId,
    status: "PENDING" as const,
    startDate: dateOnlyToDate(parsed.data.startDate as DateOnly),
    endDate: dateOnlyToDate(parsed.data.endDate as DateOnly),
    halfDayPeriod: parsed.data.type === "HALF_DAY" ? parsed.data.halfDayPeriod ?? null : null,
    dayCount: new Prisma.Decimal(requestedDays),
    reason: parsed.data.reason ?? null,
    attachmentRequired: isAttachmentRequiredForPolicy(attachmentPolicy),
    attachmentUrl: parsed.data.attachmentUrl ?? null,
    attachmentStatus,
    reviewerId: null,
    reviewedAt: null,
    reviewComment: null,
    rejectReason: null,
    cancelReason: null,
    withdrawnAt: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      id: actor.id,
      role: actor.role,
      status: actor.status ?? "ACTIVE",
      teamId: actor.teamId ?? null,
      name: actor.name,
    },
    customLeaveType: null,
  };
  const autoApprove = await shouldAutoApproveLeaveRequest({
    leaveRequest: approvalCheckRequest,
    policy: approvalPolicy,
    prisma,
  });

  const leaveRequest = await prisma.$transaction(async (tx) => {
    const created = await tx.leaveRequest.create({
      data: {
        userId: actor.id,
        type: parsed.data.type,
        requestKind: "LEGACY",
        leaveTypeId: linkedLegacyLeaveTypeId,
        status: autoApprove ? "APPROVED" : "PENDING",
        startDate: dateOnlyToDate(parsed.data.startDate as DateOnly),
        endDate: dateOnlyToDate(parsed.data.endDate as DateOnly),
        halfDayPeriod: parsed.data.type === "HALF_DAY" ? parsed.data.halfDayPeriod ?? null : null,
        dayCount: requestedDays,
        reason: parsed.data.reason ?? null,
        reviewerId: autoApprove ? null : undefined,
        reviewedAt: autoApprove ? new Date() : undefined,
        reviewComment: autoApprove ? "승인 정책에 따라 자동 승인되었습니다." : undefined,
        attachmentRequired: isAttachmentRequiredForPolicy(attachmentPolicy),
        attachmentUrl: parsed.data.attachmentUrl,
        attachmentStatus,
      },
    });

    if (preparedAttachment) {
      await createLeaveAttachmentRecord({
        tx,
        leaveRequestId: created.id,
        uploadedByUserId: actor.id,
        prepared: preparedAttachment,
      });
    }

    if (!preparedAttachment && attachmentPolicy === "REQUIRED_AFTER_REQUEST") {
      await tx.notification.create({
        data: {
          userId: actor.id,
          type: "LEAVE_ATTACHMENT_RESUBMISSION_REQUESTED",
          title: "휴가 증빙자료 제출이 필요합니다.",
          message: `${policy.name} 요청은 증빙자료를 추후 제출해야 합니다.`,
          linkUrl: `/leaves/me/requests/${created.id}`,
          metadata: toJsonValue({ leaveRequestId: created.id }),
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: autoApprove ? null : actor.id,
        actorUserId: autoApprove ? null : actor.id,
        targetUserId: actor.id,
        action: autoApprove ? "LEAVE_REQUEST_AUTO_APPROVED" : "LEAVE_REQUEST_CREATED",
        targetType: "LEAVE_REQUEST",
        targetId: created.id,
        metadata: toJsonValue({
          leaveRequestId: created.id,
          targetUserId: actor.id,
          leaveType: created.type,
          leaveTypeId: linkedLegacyLeaveTypeId,
          leaveTypeCode: linkedLegacyLeaveTypeId
            ? legacyLeaveTypeDefinition?.code
            : undefined,
          requestedDays,
          startDate: parsed.data.startDate,
          endDate: parsed.data.endDate,
          approvalPolicy: approvalPolicySummary(approvalPolicy),
          ...(attachmentStorageFailureCode
            ? { attachmentStorageFailureCode }
            : {}),
        }),
      },
    });

    await recordLeaveRequestPendingLedger({
      tx,
      leaveRequest: { ...created, grantUsages: [] },
    });

    if (autoApprove) {
      await recordLeaveRequestApprovedLedger({
        tx,
        leaveRequest: { ...created, grantUsages: [] },
        actorId: null,
      });

    }

    return created;
  });

  if (autoApprove) {
    await notifyLeaveRequestApproved({
      prisma,
      leaveRequestId: leaveRequest.id,
      approvedByUserId: null,
      approvalSource: "AUTO_POLICY",
    });
  } else {
    await notifyLeaveApprovalNeeded({
      prisma,
      leaveRequest: approvalCheckRequest,
      approvalPolicy,
      leaveRequestId: leaveRequest.id,
      leaveTypeName: legacyLeaveTypeDefinition?.name ?? policy.name ?? parsed.data.type,
    });
  }

  revalidatePath("/leaves/me");
  revalidatePath("/leaves/approvals");
  revalidatePath("/notifications");
  if (autoApprove) {
    revalidatePath("/leaves/calendar");
    revalidatePath("/leaves/approvals/approved");
  }
  redirect(`/leaves/me/requests/${leaveRequest.id}?success=created`);
}

export async function withdrawLeaveRequest(formData: FormData) {
  const actor = await requireRouteAccess("/leaves/me");
  const requestId = getRequiredFormValue(formData, "requestId");

  if (!requestId) {
    redirect("/leaves/me?error=invalid");
  }

  const prisma = getPrisma();
  const before = await prisma.leaveRequest.findFirst({
    where: {
      id: requestId,
      userId: actor.id,
    },
    include: {
      grantUsages: {
        include: {
          leaveGrant: {
            include: {
              leaveType: true,
            },
          },
        },
      },
      customLeaveType: true,
    },
  });

  if (!before) {
    redirect("/leaves/me?error=not-found");
  }

  if (before.status !== "PENDING") {
    redirect(`/leaves/me/requests/${before.id}?error=not-pending`);
  }

  const leaveRequest = await prisma.$transaction(
    async (tx) => {
      if (before.requestKind === "CUSTOM_GRANT") {
        for (const usage of before.grantUsages) {
          await releaseLeaveGrantPendingAmount({
            tx,
            leaveGrantId: usage.leaveGrantId,
            amount: usage.amount,
          });
        }
      }

      const updated = await tx.leaveRequest.update({
        where: { id: before.id },
        data: {
          status: "WITHDRAWN",
          withdrawnAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorUserId: actor.id,
          targetUserId: actor.id,
          action:
            before.requestKind === "CUSTOM_GRANT"
              ? "CUSTOM_LEAVE_REQUEST_WITHDRAWN"
              : "LEAVE_REQUEST_WITHDRAWN",
          targetType: "LEAVE_REQUEST",
          targetId: updated.id,
          metadata: toJsonValue({
            requestKind: before.requestKind,
            leaveRequestId: updated.id,
            leaveTypeId: before.leaveTypeId,
            leaveTypeCode: before.customLeaveType?.code,
            grantUsages: before.grantUsages.map((usage) => ({
              leaveGrantId: usage.leaveGrantId,
              amount: usage.amount,
              unit: usage.unit,
            })),
            before: { status: before.status },
            after: {
              status: updated.status,
              withdrawnAt: updated.withdrawnAt,
            },
          }),
        },
      });

      await recordLeaveRequestWithdrawnLedger({
        tx,
        leaveRequest: before,
        actorId: actor.id,
      });

      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  revalidatePath("/leaves/me");
  redirect(`/leaves/me/requests/${leaveRequest.id}?success=withdrawn`);
}

export async function cancelMyApprovedLeaveRequest(formData: FormData) {
  const actor = await requireRouteAccess("/leaves/me");
  const requestId = getRequiredFormValue(formData, "requestId");
  const cancelComment = optionalString(formData.get("cancelComment"));

  if (!requestId) {
    redirect("/leaves/me?error=invalid");
  }

  const prisma = getPrisma();
  let leaveRequestId = requestId;

  try {
    const cancelled = await prisma.$transaction(
      async (tx) => {
        const before = await tx.leaveRequest.findFirst({
          where: {
            id: requestId,
            userId: actor.id,
          },
          include: {
            grantUsages: {
              include: {
                leaveGrant: {
                  include: {
                    leaveType: true,
                  },
                },
              },
            },
            customLeaveType: true,
          },
        });

        if (!before) {
          throw new LeaveRequesterCancelActionError("not-found");
        }

        leaveRequestId = before.id;

        try {
          assertRequesterCanCancelApprovedLeaveRequest({ leaveRequest: before });
        } catch (error) {
          throw new LeaveRequesterCancelActionError(
            error instanceof Error ? error.message : "invalid",
          );
        }

        const updateResult = await tx.leaveRequest.updateMany({
          where: {
            id: before.id,
            userId: actor.id,
            status: "APPROVED",
          },
          data: {
            status: "CANCELLED",
            reviewerId: actor.id,
            reviewedAt: new Date(),
            reviewComment: cancelComment,
            cancelReason: cancelComment,
            cancelledAt: new Date(),
          },
        });

        if (updateResult.count !== 1) {
          throw new LeaveRequesterCancelActionError("not-approved");
        }

        if (before.requestKind === "CUSTOM_GRANT") {
          try {
            for (const usage of before.grantUsages) {
              await restoreLeaveGrantUsedAmount({
                tx,
                leaveGrantId: usage.leaveGrantId,
                amount: usage.amount,
              });
            }
          } catch (error) {
            if (error instanceof CustomLeaveRequestError) {
              throw new LeaveRequesterCancelActionError("grant-state");
            }

            throw error;
          }
        }

        const updated = await tx.leaveRequest.findUniqueOrThrow({
          where: { id: before.id },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            actorUserId: actor.id,
            targetUserId: actor.id,
            action:
              before.requestKind === "CUSTOM_GRANT"
                ? "CUSTOM_LEAVE_REQUEST_CANCELLED"
                : "LEAVE_REQUEST_CANCELLED",
            targetType: "LEAVE_REQUEST",
            targetId: updated.id,
            metadata: toJsonValue({
              requestKind: before.requestKind,
              leaveRequestId: updated.id,
              leaveType: before.type,
              leaveTypeId: before.leaveTypeId,
              leaveTypeCode: before.customLeaveType?.code,
              requestedDays: toNumber(before.dayCount),
              startDate: dateToDateOnly(before.startDate),
              endDate: dateToDateOnly(before.endDate),
              cancelSource: "REQUESTER",
              cancelComment,
              grantUsages: before.grantUsages.map((usage) => ({
                leaveGrantId: usage.leaveGrantId,
                amount: usage.amount,
                unit: usage.unit,
              })),
              before: { status: before.status },
              after: {
                status: updated.status,
                cancelledAt: updated.cancelledAt,
              },
            }),
          },
        });

        await recordLeaveRequestCancelledLedger({
          tx,
          leaveRequest: before,
          actorId: actor.id,
        });

        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    leaveRequestId = cancelled.id;
  } catch (error) {
    if (error instanceof LeaveRequesterCancelActionError) {
      const target =
        error.code === "not-found"
          ? "/leaves/me?error=not-found"
          : `/leaves/me/requests/${leaveRequestId}?error=${error.code}`;

      redirect(target);
    }

    throw error;
  }

  await notifyLeaveRequestRejectedOrCancelled({
    leaveRequestId,
    action: "CANCELLED",
    prisma,
  });

  revalidatePath("/leaves/me");
  revalidatePath(`/leaves/me/requests/${leaveRequestId}`);
  revalidatePath("/leaves/approvals");
  revalidatePath("/leaves/approvals/approved");
  revalidatePath("/leaves/calendar");
  revalidatePath("/notifications");
  redirect(`/leaves/me/requests/${leaveRequestId}?success=cancelled`);
}
