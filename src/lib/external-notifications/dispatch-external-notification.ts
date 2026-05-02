import type { AuditAction, NotificationType } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  shouldNotifySlackLeaveRequests,
} from "@/lib/external-notifications/config";
import { sendEmail } from "@/lib/external-notifications/send-email";
import { sendSlackMessage } from "@/lib/external-notifications/send-slack-message";
import {
  buildExternalEmailTemplate,
  buildInvitationEmailTemplate,
} from "@/lib/external-notifications/templates";
import { maskEmail } from "@/lib/security/masking";
import { sanitizeAuditMetadata, sanitizeSecurityValue } from "@/lib/security/sanitize";

type DispatchExternalNotificationParams = {
  type: NotificationType;
  recipientUserId?: string | null;
  recipientEmail?: string | null;
  title: string;
  message: string;
  linkUrl?: string | null;
  context?: Record<string, unknown>;
};

const EMAIL_NOTIFICATION_TYPES = new Set<NotificationType>([
  "LEAVE_REQUESTED",
  "LEAVE_APPROVED",
  "LEAVE_REJECTED",
  "LEAVE_CANCELLED",
  "LEAVE_ATTACHMENT_RESUBMISSION_REQUESTED",
  "ANNUAL_LEAVE_PROMOTION",
  "ANNUAL_LEAVE_USE_PLAN_REMINDER",
  "JOB_FAILED",
]);

function safeErrorSummary(error: string | undefined) {
  return String(sanitizeSecurityValue(error ?? "unknown external notification error"));
}

async function recordExternalAudit(params: {
  action: AuditAction;
  targetType?: "NOTIFICATION" | "INVITATION" | "JOB_RUN" | "LEAVE_REQUEST";
  targetId?: string | null;
  recipientEmail?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await getPrisma().auditLog.create({
      data: {
        actorId: null,
        actorUserId: null,
        action: params.action,
        targetType: params.targetType ?? "NOTIFICATION",
        targetId: params.targetId ?? null,
        metadata: sanitizeAuditMetadata({
          ...params.metadata,
          recipientMasked: params.recipientEmail
            ? maskEmail(params.recipientEmail)
            : undefined,
        }),
      },
    });
  } catch (error) {
    console.warn("[external-notification:audit-failed]", safeErrorSummary(String(error)));
  }
}

export async function dispatchExternalNotification(
  params: DispatchExternalNotificationParams,
) {
  if (!EMAIL_NOTIFICATION_TYPES.has(params.type)) {
    return;
  }

  try {
    const recipientEmail =
      params.recipientEmail ??
      (params.recipientUserId
        ? (
            await getPrisma().user.findUnique({
              where: { id: params.recipientUserId },
              select: { email: true, status: true },
            })
          )?.email
        : null);

    if (!recipientEmail) {
      return;
    }

    const template = buildExternalEmailTemplate(params);
    const result = await sendEmail({
      to: recipientEmail,
      subject: template.subject,
      text: template.text,
    });

    await recordExternalAudit({
      action: result.ok ? "EXTERNAL_EMAIL_SENT" : "EXTERNAL_EMAIL_FAILED",
      targetType: "NOTIFICATION",
      targetId:
        typeof params.context?.notificationId === "string"
          ? params.context.notificationId
          : null,
      recipientEmail,
      metadata: {
        channel: "EMAIL",
        type: params.type,
        providerMessageId: result.providerMessageId,
        reason: result.ok ? undefined : safeErrorSummary(result.error),
        relatedNotificationId: params.context?.notificationId,
        relatedRequestId: params.context?.leaveRequestId,
      },
    });

    if (params.type === "LEAVE_REQUESTED" && shouldNotifySlackLeaveRequests()) {
      await dispatchSlackMessage({
        text: `[운영 알림] 휴가 승인 요청이 등록되었습니다.\n${params.message}`,
        type: params.type,
        context: params.context,
      });
    }
  } catch (error) {
    console.warn("[external-notification:email-failed]", safeErrorSummary(String(error)));
  }
}

export async function dispatchInvitationEmail(params: {
  invitationId: string;
  recipientEmail: string;
  invitationUrl: string;
  verificationCode: string;
}) {
  try {
    const template = buildInvitationEmailTemplate({
      invitationUrl: params.invitationUrl,
      verificationCode: params.verificationCode,
    });
    const result = await sendEmail({
      to: params.recipientEmail,
      subject: template.subject,
      text: template.text,
    });

    await recordExternalAudit({
      action: result.ok ? "INVITATION_EMAIL_SENT" : "INVITATION_EMAIL_FAILED",
      targetType: "INVITATION",
      targetId: params.invitationId,
      recipientEmail: params.recipientEmail,
      metadata: {
        channel: "EMAIL",
        type: "INVITATION_CREATED",
        providerMessageId: result.providerMessageId,
        reason: result.ok ? undefined : safeErrorSummary(result.error),
        relatedInvitationId: params.invitationId,
      },
    });
  } catch (error) {
    console.warn("[external-notification:invitation-email-failed]", safeErrorSummary(String(error)));
  }
}

export async function dispatchSlackMessage(params: {
  text: string;
  type: NotificationType | "JOB_FAILED";
  context?: Record<string, unknown>;
}) {
  try {
    const result = await sendSlackMessage({ text: params.text });

    await recordExternalAudit({
      action: result.ok ? "EXTERNAL_SLACK_SENT" : "EXTERNAL_SLACK_FAILED",
      targetType:
        typeof params.context?.jobRunId === "string" ? "JOB_RUN" : "NOTIFICATION",
      targetId:
        typeof params.context?.jobRunId === "string"
          ? params.context.jobRunId
          : typeof params.context?.notificationId === "string"
            ? params.context.notificationId
            : null,
      metadata: {
        channel: "SLACK",
        type: params.type,
        reason: result.ok ? undefined : safeErrorSummary(result.error),
        relatedJobRunId: params.context?.jobRunId,
      },
    });
  } catch (error) {
    console.warn("[external-notification:slack-failed]", safeErrorSummary(String(error)));
  }
}
