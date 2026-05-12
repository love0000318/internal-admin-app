import {
  Prisma,
  type AnnualLeavePromotionNotice,
  type AnnualLeavePromotionNoticeType,
  type AnnualLeaveUsePlan,
  type PrismaClient,
} from "@/generated/prisma/client";
import { dateToDateOnly } from "@/lib/leave/calculate-business-days";
import { createInAppNotificationOnce } from "@/lib/notifications/notifications";

type NotificationDb = PrismaClient | Prisma.TransactionClient;

export const ANNUAL_LEAVE_PROMOTION_POLICY_VERSION =
  "KR-LSA-60-61-2025-10-23";

export const ANNUAL_LEAVE_PROMOTION_LEGAL_BASIS =
  "근로기준법 제60조 및 제61조, 국가법령정보센터 2025-10-23 시행 조문 기준";

export const ANNUAL_LEAVE_PROMOTION_LEGAL_REVIEW_NOTE =
  "웹 알림은 내부 고지 증적이며, 법정 서면 촉구/통보 요건 충족 여부는 노무/법무 검토가 필요합니다.";

export const ANNUAL_LEAVE_PROMOTION_OFFICIAL_SOURCES = [
  "https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=900195417",
  "https://www.moel.go.kr/minwon/fastcounsel/fastcounselView.do?inetDcssMngId=202007141435255511000",
] as const;

export const USE_PLAN_NOTICE_TYPES: AnnualLeavePromotionNoticeType[] = [
  "ANNUAL_USE_PLAN_REQUEST",
  "ANNUAL_SECOND_NOTICE",
  "MONTHLY_FIRST_NOTICE",
  "MONTHLY_SECOND_NOTICE",
];

type PromotionNoticeForNotification = Pick<
  AnnualLeavePromotionNotice,
  | "id"
  | "userId"
  | "referenceYear"
  | "noticeType"
  | "scheduledDate"
  | "expirationDate"
  | "remainingAmount"
  | "unit"
  | "availableFrom"
  | "availableUntil"
  | "submissionDeadline"
  | "policyVersion"
  | "legalBasis"
  | "isRenotice"
>;

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function formatAmount(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "미확정";
  }

  return `${Number.isInteger(value) ? value : value.toFixed(1)}일`;
}

function dateOnly(value: Date | null | undefined) {
  return value ? dateToDateOnly(value) : null;
}

export function getAnnualUsePlanNoticeTitle(noticeType: AnnualLeavePromotionNoticeType) {
  switch (noticeType) {
    case "ANNUAL_SECOND_NOTICE":
      return "연차 사용계획 2차 고지";
    case "MONTHLY_FIRST_NOTICE":
      return "1년 미만 연차 사용계획 제출 요청";
    case "MONTHLY_SECOND_NOTICE":
      return "1년 미만 연차 사용계획 2차 고지";
    case "USE_PLAN_REMINDER":
      return "예정된 연차 사용일이 다가옵니다";
    default:
      return "연차 사용계획 제출 요청";
  }
}

export function getAnnualUsePlanNoticeMessage(
  notice: PromotionNoticeForNotification,
) {
  const remainingAmount = formatAmount(notice.remainingAmount);
  const submissionDeadline = dateOnly(notice.submissionDeadline);
  const availableFrom = dateOnly(notice.availableFrom);
  const availableUntil = dateOnly(notice.availableUntil ?? notice.expirationDate);
  const period =
    availableFrom && availableUntil ? `${availableFrom} ~ ${availableUntil}` : "확인 필요";

  if (notice.noticeType === "USE_PLAN_REMINDER") {
    return `제출한 연차 사용계획일이 다가옵니다. 계획한 일정과 실제 휴가 요청 상태를 확인해 주세요.`;
  }

  const deadlineText = submissionDeadline
    ? `${submissionDeadline}까지`
    : "지정된 기한까지";

  return `미사용 연차 ${remainingAmount}의 사용계획을 ${deadlineText} 제출해 주세요. 사용 가능 기간은 ${period}입니다.`;
}

export function buildAnnualUsePlanNoticeContent(
  notice: PromotionNoticeForNotification,
) {
  const title = getAnnualUsePlanNoticeTitle(notice.noticeType);
  const message = getAnnualUsePlanNoticeMessage(notice);

  return toJsonValue({
    title,
    message,
    noticeType: notice.noticeType,
    policyVersion:
      notice.policyVersion ?? ANNUAL_LEAVE_PROMOTION_POLICY_VERSION,
    legalBasis: notice.legalBasis ?? ANNUAL_LEAVE_PROMOTION_LEGAL_BASIS,
    legalReviewNote: ANNUAL_LEAVE_PROMOTION_LEGAL_REVIEW_NOTE,
    officialSources: ANNUAL_LEAVE_PROMOTION_OFFICIAL_SOURCES,
    remainingAmount: notice.remainingAmount,
    unit: notice.unit,
    availablePeriod: {
      from: dateOnly(notice.availableFrom),
      until: dateOnly(notice.availableUntil ?? notice.expirationDate),
    },
    submissionDeadline: dateOnly(notice.submissionDeadline),
    scheduledDate: dateToDateOnly(notice.scheduledDate),
    isRenotice: notice.isRenotice,
  });
}

function buildNotificationMetadata(notice: PromotionNoticeForNotification) {
  return toJsonValue({
    deduplicationKey: `annual-use-plan-notice:${notice.id}:${notice.userId}`,
    annualLeavePromotionNoticeId: notice.id,
    noticeType: notice.noticeType,
    referenceYear: notice.referenceYear,
    policyVersion:
      notice.policyVersion ?? ANNUAL_LEAVE_PROMOTION_POLICY_VERSION,
    legalBasis: notice.legalBasis ?? ANNUAL_LEAVE_PROMOTION_LEGAL_BASIS,
    remainingAmount: notice.remainingAmount,
    unit: notice.unit,
    availableFrom: dateOnly(notice.availableFrom),
    availableUntil: dateOnly(notice.availableUntil ?? notice.expirationDate),
    submissionDeadline: dateOnly(notice.submissionDeadline),
    requiresWrittenNoticeReview: true,
    legalReviewNote: ANNUAL_LEAVE_PROMOTION_LEGAL_REVIEW_NOTE,
    notificationPurpose: "ANNUAL_LEAVE_USE_PLAN_NOTICE",
  });
}

export async function createAnnualUsePlanRequestNotification({
  notice,
  prisma,
}: {
  notice: PromotionNoticeForNotification;
  prisma: NotificationDb;
}) {
  const content = buildAnnualUsePlanNoticeContent(notice);
  const contentRecord = content as Record<string, unknown>;
  const title = String(contentRecord.title);
  const message = String(contentRecord.message);
  const notificationType =
    notice.noticeType === "USE_PLAN_REMINDER"
      ? "ANNUAL_LEAVE_USE_PLAN_REMINDER"
      : "ANNUAL_LEAVE_PROMOTION_REQUESTED";
  const priority =
    notice.noticeType === "ANNUAL_SECOND_NOTICE" ||
    notice.noticeType === "MONTHLY_SECOND_NOTICE"
      ? "HIGH"
      : "NORMAL";
  const notification = await createInAppNotificationOnce({
    prisma,
    userId: notice.userId,
    type: notificationType,
    priority,
    title,
    message,
    linkUrl: "/leaves/me/use-plan",
    metadata: buildNotificationMetadata(notice),
  });
  const displayedAt = new Date();

  await prisma.annualLeavePromotionNotice.update({
    where: { id: notice.id },
    data: {
      status: "SENT",
      sentAt: displayedAt,
      displayedAt,
      notificationId: notification.id,
      noticeContent: content,
      policyVersion:
        notice.policyVersion ?? ANNUAL_LEAVE_PROMOTION_POLICY_VERSION,
      legalBasis: notice.legalBasis ?? ANNUAL_LEAVE_PROMOTION_LEGAL_BASIS,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "ANNUAL_LEAVE_PROMOTION_NOTICE_SENT",
      targetType: "ANNUAL_LEAVE_PROMOTION_NOTICE",
      targetId: notice.id,
      targetUserId: notice.userId,
      metadata: toJsonValue({
        annualLeavePromotionNoticeId: notice.id,
        notificationId: notification.id,
        referenceYear: notice.referenceYear,
        noticeType: notice.noticeType,
        scheduledDate: dateToDateOnly(notice.scheduledDate),
        displayedAt,
        policyVersion:
          notice.policyVersion ?? ANNUAL_LEAVE_PROMOTION_POLICY_VERSION,
        legalBasis: notice.legalBasis ?? ANNUAL_LEAVE_PROMOTION_LEGAL_BASIS,
        legalReviewNote: ANNUAL_LEAVE_PROMOTION_LEGAL_REVIEW_NOTE,
        remainingAmount: notice.remainingAmount,
        availableFrom: dateOnly(notice.availableFrom),
        availableUntil: dateOnly(notice.availableUntil ?? notice.expirationDate),
        submissionDeadline: dateOnly(notice.submissionDeadline),
        isRenotice: notice.isRenotice,
      }),
    },
  });

  return notification;
}

export async function markAnnualUsePlanNoticesSubmitted({
  userId,
  referenceYear,
  usePlan,
  prisma,
}: {
  userId: string;
  referenceYear: number;
  usePlan: Pick<AnnualLeaveUsePlan, "id" | "submittedAt">;
  prisma: NotificationDb;
}) {
  const submittedAt = usePlan.submittedAt ?? new Date();

  await prisma.annualLeavePromotionNotice.updateMany({
    where: {
      userId,
      referenceYear,
      noticeType: { in: USE_PLAN_NOTICE_TYPES },
    },
    data: {
      annualLeaveUsePlanId: usePlan.id,
      submittedAt,
    },
  });

  return prisma.annualLeavePromotionNotice.updateMany({
    where: {
      userId,
      referenceYear,
      noticeType: { in: ["ANNUAL_SECOND_NOTICE", "MONTHLY_SECOND_NOTICE"] },
      status: "SCHEDULED",
    },
    data: {
      status: "CANCELLED",
      cancelledAt: submittedAt,
      annualLeaveUsePlanId: usePlan.id,
      submittedAt,
    },
  });
}

export async function skipAnnualUsePlanNoticeBecauseSubmitted({
  notice,
  usePlan,
  prisma,
}: {
  notice: Pick<AnnualLeavePromotionNotice, "id" | "userId" | "referenceYear" | "noticeType">;
  usePlan: Pick<AnnualLeaveUsePlan, "id" | "submittedAt">;
  prisma: NotificationDb;
}) {
  const submittedAt = usePlan.submittedAt ?? new Date();

  await prisma.annualLeavePromotionNotice.update({
    where: { id: notice.id },
    data: {
      status: "SKIPPED",
      annualLeaveUsePlanId: usePlan.id,
      submittedAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "ANNUAL_LEAVE_PROMOTION_NOTICE_SENT",
      targetType: "ANNUAL_LEAVE_PROMOTION_NOTICE",
      targetId: notice.id,
      targetUserId: notice.userId,
      metadata: toJsonValue({
        annualLeavePromotionNoticeId: notice.id,
        referenceYear: notice.referenceYear,
        noticeType: notice.noticeType,
        skippedReason: "USE_PLAN_ALREADY_SUBMITTED",
        annualLeaveUsePlanId: usePlan.id,
        submittedAt,
      }),
    },
  });
}
