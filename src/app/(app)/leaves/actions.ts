"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { assertEnoughLeaveBalance, policyDeductsAnnual } from "@/lib/leave/balance";
import {
  createLeaveAttachmentRecord,
  getAttachmentPolicyForLegacyLeaveType,
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
  recordLeaveRequestPendingLedger,
  recordLeaveRequestWithdrawnLedger,
} from "@/lib/leave/ledger";
import {
  getLeavePolicyMap,
  getUserLeaveBalance,
  listEnabledCompanyHolidayDateOnlys,
} from "@/lib/leave/queries";
import type { DateOnly, LeaveOverlapCandidate } from "@/lib/leave/types";
import { leaveRequestSchema, optionalString } from "@/lib/leave/validation";
import { notifyLeaveApprovalNeeded } from "@/lib/notifications/leave-notifications";
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
    originalFileName: "利앸챸?먮즺 李멸퀬 留곹겕",
    fileKey: null,
    fileUrl: attachmentUrl,
    fileSize: null,
    mimeType: null,
  };
}

async function prepareOptionalAttachment(formData: FormData) {
  try {
    return await prepareAttachmentFromFormData(formData);
  } catch (error) {
    if (error instanceof LeaveAttachmentError) {
      redirectToNewRequest(error.code);
    }

    throw error;
  }
}

async function createCustomGrantLeaveRequest(formData: FormData) {
  const actor = await requireRouteAccess("/leaves/me");
  const { startDate, endDate } = normalizeRequestDates(formData);
  const leaveGrantId = getRequiredFormValue(formData, "leaveGrantId");
  const usageUnit = getCustomUsageUnit(formData.get("usageUnit"));
  const halfDayPeriod = optionalString(formData.get("halfDayPeriod")) as "AM" | "PM" | null;
  const reason = optionalString(formData.get("reason"));
  const attachmentUrl = optionalString(formData.get("attachmentUrl"));
  const preparedAttachment =
    (await prepareOptionalAttachment(formData)) ?? preparedAttachmentFromUrl(attachmentUrl);

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

    assertCustomLeaveGrantRequestAllowed({
      grant,
      userId: actor.id,
      usageUnit,
      amount: requestedDays,
      startDate: startDate as DateOnly,
      endDate: endDate as DateOnly,
      attachmentUrl: preparedAttachment ? "submitted" : null,
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
    attachmentRequired:
      grant!.leaveType.attachmentPolicy === "REQUIRED_BEFORE_REQUEST" ||
      grant!.leaveType.attachmentPolicy === "REQUIRED_AFTER_REQUEST",
    attachmentUrl,
    attachmentStatus: getAttachmentStatusForPolicy({
      attachmentPolicy: grant!.leaveType.attachmentPolicy,
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
          reviewComment: autoApprove ? "?뱀씤 ?뺤콉???곕씪 ?먮룞 ?뱀씤?섏뿀?듬땲??" : undefined,
          attachmentRequired:
            grant!.leaveType.attachmentPolicy === "REQUIRED_BEFORE_REQUEST" ||
            grant!.leaveType.attachmentPolicy === "REQUIRED_AFTER_REQUEST",
          attachmentUrl,
          attachmentStatus: getAttachmentStatusForPolicy({
            attachmentPolicy: grant!.leaveType.attachmentPolicy,
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
        grant!.leaveType.attachmentPolicy === "REQUIRED_AFTER_REQUEST"
      ) {
        await tx.notification.create({
          data: {
            userId: actor.id,
            type: "LEAVE_ATTACHMENT_RESUBMISSION_REQUESTED",
            title: "?닿? 利앸챸?먮즺 ?쒖텧???꾩슂?⑸땲??",
            message: `${grant!.leaveType.name} ?붿껌? 利앸챸?먮즺瑜??섏쨷???쒖텧?댁빞 ?⑸땲??`,
            linkUrl: `/leaves/me/requests/${created.id}`,
            metadata: toJsonValue({ leaveRequestId: created.id }),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorUserId: actor.id,
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
            },
          ],
        },
      });

      if (autoApprove) {
        for (const usage of [
          {
            leaveGrantId,
            amount: requestedDays,
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
              },
            ],
          },
          actorId: actor.id,
        });

        await tx.notification.create({
          data: {
            userId: actor.id,
            type: "LEAVE_APPROVED",
            title: "?닿? ?붿껌???먮룞 ?뱀씤?섏뿀?듬땲??",
            message: `${grant!.leaveType.name} ?붿껌???뱀씤 ?뺤콉???곕씪 ?먮룞 ?뱀씤?섏뿀?듬땲??`,
            linkUrl: `/leaves/me/requests/${created.id}`,
            metadata: toJsonValue({
              leaveRequestId: created.id,
              approvalPolicy: approvalPolicySummary(approvalPolicy),
            }),
          },
        });
      }

      return created;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  if (!autoApprove) {
    await notifyLeaveApprovalNeeded({
      prisma,
      leaveRequest: approvalCheckRequest,
      approvalPolicy,
      leaveRequestId: leaveRequest.id,
      leaveTypeName: grant!.leaveType.name,
    });
  }

  revalidatePath("/leaves/me");
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
  const attachmentPolicy = await getAttachmentPolicyForLegacyLeaveType(
    parsed.data.type,
    policy?.requiresAttachment ?? false,
    prisma,
  );
  const preparedAttachment =
    (await prepareOptionalAttachment(formData)) ??
    preparedAttachmentFromUrl(parsed.data.attachmentUrl ?? null);

  if (!policy?.isEnabled) {
    redirectToNewRequest("disabled-policy");
  }

  const today = todayInSeoul();

  try {
    assertValidLeaveDateRange({
      ...parsed.data,
      startDate: parsed.data.startDate as DateOnly,
      endDate: parsed.data.endDate as DateOnly,
      today,
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

  if (policyDeductsAnnual(policy)) {
    const balance = await getUserLeaveBalance({
      userId: actor.id,
      year: Number((parsed.data.startDate as DateOnly).slice(0, 4)),
      asOfDate: today,
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
    leaveTypeId: null,
    status: "PENDING" as const,
    startDate: dateOnlyToDate(parsed.data.startDate as DateOnly),
    endDate: dateOnlyToDate(parsed.data.endDate as DateOnly),
    halfDayPeriod: parsed.data.type === "HALF_DAY" ? parsed.data.halfDayPeriod ?? null : null,
    dayCount: new Prisma.Decimal(requestedDays),
    reason: parsed.data.reason ?? null,
    attachmentRequired:
      attachmentPolicy === "REQUIRED_BEFORE_REQUEST" ||
      attachmentPolicy === "REQUIRED_AFTER_REQUEST",
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
        status: autoApprove ? "APPROVED" : "PENDING",
        startDate: dateOnlyToDate(parsed.data.startDate as DateOnly),
        endDate: dateOnlyToDate(parsed.data.endDate as DateOnly),
        halfDayPeriod: parsed.data.type === "HALF_DAY" ? parsed.data.halfDayPeriod ?? null : null,
        dayCount: requestedDays,
        reason: parsed.data.reason ?? null,
        reviewerId: autoApprove ? null : undefined,
        reviewedAt: autoApprove ? new Date() : undefined,
        reviewComment: autoApprove ? "?뱀씤 ?뺤콉???곕씪 ?먮룞 ?뱀씤?섏뿀?듬땲??" : undefined,
        attachmentRequired:
          attachmentPolicy === "REQUIRED_BEFORE_REQUEST" ||
          attachmentPolicy === "REQUIRED_AFTER_REQUEST",
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
          title: "?닿? 利앸챸?먮즺 ?쒖텧???꾩슂?⑸땲??",
          message: `${policy.name} ?붿껌? 利앸챸?먮즺瑜??섏쨷???쒖텧?댁빞 ?⑸땲??`,
          linkUrl: `/leaves/me/requests/${created.id}`,
          metadata: toJsonValue({ leaveRequestId: created.id }),
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorUserId: actor.id,
        targetUserId: actor.id,
        action: autoApprove ? "LEAVE_REQUEST_AUTO_APPROVED" : "LEAVE_REQUEST_CREATED",
        targetType: "LEAVE_REQUEST",
        targetId: created.id,
        metadata: toJsonValue({
          leaveRequestId: created.id,
          targetUserId: actor.id,
          leaveType: created.type,
          requestedDays,
          startDate: parsed.data.startDate,
          endDate: parsed.data.endDate,
          approvalPolicy: approvalPolicySummary(approvalPolicy),
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
        actorId: actor.id,
      });

      await tx.notification.create({
        data: {
          userId: actor.id,
          type: "LEAVE_APPROVED",
          title: "?닿? ?붿껌???먮룞 ?뱀씤?섏뿀?듬땲??",
          message: `${policy.name} ?붿껌???뱀씤 ?뺤콉???곕씪 ?먮룞 ?뱀씤?섏뿀?듬땲??`,
          linkUrl: `/leaves/me/requests/${created.id}`,
          metadata: toJsonValue({
            leaveRequestId: created.id,
            approvalPolicy: approvalPolicySummary(approvalPolicy),
          }),
        },
      });
    }

    return created;
  });

  if (!autoApprove) {
    await notifyLeaveApprovalNeeded({
      prisma,
      leaveRequest: approvalCheckRequest,
      approvalPolicy,
      leaveRequestId: leaveRequest.id,
      leaveTypeName: policy.name ?? parsed.data.type,
    });
  }

  revalidatePath("/leaves/me");
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
      grantUsages: true,
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
