import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  formatCsvDate,
  formatCsvDateTime,
  maskReportPhoneNumber,
  truncateReportText,
  type CsvRow,
} from "@/lib/reports/csv";
import type { ReportType } from "@/lib/reports/definitions";

export type ReportFilters = {
  year?: string;
  q?: string;
  teamId?: string;
  userId?: string;
  leaveTypeId?: string;
  status?: string;
  source?: string;
  eventType?: string;
  noticeType?: string;
  attachmentStatus?: string;
  from?: string;
  to?: string;
};

export type ListReportRowsOptions = {
  limit?: number;
};

const DEFAULT_LIMIT = 100;
const EXPORT_LIMIT = 5000;

const LEGACY_LEAVE_LABELS: Record<string, string> = {
  ANNUAL: "연차",
  HALF_DAY: "반차",
  RESERVE_FORCES: "예비군",
  SICK: "병가",
  BEREAVEMENT: "경조사",
};

const HALF_DAY_LABELS: Record<string, string> = {
  AM: "오전",
  PM: "오후",
};

function parseYear(value: string | undefined) {
  const year = value ? Number.parseInt(value, 10) : new Date().getFullYear();
  return Number.isInteger(year) ? year : new Date().getFullYear();
}

function startOfYear(year: number) {
  return new Date(Date.UTC(year, 0, 1));
}

function endOfYear(year: number) {
  return new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
}

function parseDate(value: string | undefined, endOfDay = false) {
  if (!value) return null;
  const parsed = new Date(
    `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`,
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateRange(filters: ReportFilters) {
  const year = parseYear(filters.year);
  return {
    from: parseDate(filters.from) ?? startOfYear(year),
    to: parseDate(filters.to, true) ?? endOfYear(year),
    year,
  };
}

function clampLimit(value: number | undefined) {
  if (!value) return DEFAULT_LIMIT;
  return Math.min(Math.max(value, 1), EXPORT_LIMIT);
}

function userWhere(filters: ReportFilters): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [];

  if (filters.teamId) {
    and.push({ teamId: filters.teamId });
  }

  if (filters.userId) {
    and.push({ id: filters.userId });
  }

  const query = filters.q?.trim();
  if (query) {
    and.push({
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

function leaveRequestWhere(filters: ReportFilters): Prisma.LeaveRequestWhereInput {
  const range = dateRange(filters);
  return {
    startDate: { lte: range.to },
    endDate: { gte: range.from },
    ...(filters.status ? { status: filters.status as never } : { status: "APPROVED" }),
    ...(filters.leaveTypeId ? { leaveTypeId: filters.leaveTypeId } : {}),
    user: userWhere(filters),
  };
}

function leaveTypeName(row: {
  type?: string;
  customLeaveType?: { name: string; category: string } | null;
}) {
  return row.customLeaveType?.name ?? LEGACY_LEAVE_LABELS[row.type ?? ""] ?? row.type ?? "-";
}

function leaveKind(row: {
  requestKind?: string | null;
  customLeaveType?: { category: string } | null;
}) {
  if (row.requestKind === "CUSTOM_GRANT" || row.customLeaveType?.category === "CUSTOM") {
    return "맞춤휴가";
  }

  return "연차";
}

function birthMonthDay(value: Date | null | undefined) {
  if (!value) return "-";
  return formatCsvDate(value).slice(5);
}

function sourceLabel(value: string | null | undefined) {
  return value ?? "-";
}

function safeReason(value: string | null | undefined) {
  return truncateReportText(value, 80);
}

export async function listReportRows(
  reportType: ReportType,
  filters: ReportFilters,
  options: ListReportRowsOptions = {},
): Promise<CsvRow[]> {
  const prisma = getPrisma();
  const limit = clampLimit(options.limit);

  switch (reportType) {
    case "LEAVE_USAGE":
      return listLeaveUsageRows(prisma, filters, limit);
    case "LEAVE_LEDGER":
      return listLeaveLedgerRows(prisma, filters, limit);
    case "LEAVE_GRANTS":
      return listLeaveGrantRows(prisma, filters, limit, false);
    case "BIRTHDAY_HALF_DAYS":
      return listLeaveGrantRows(prisma, filters, limit, true);
    case "ANNUAL_PROMOTIONS":
      return listAnnualPromotionRows(prisma, filters, limit);
    case "LEAVE_ATTACHMENTS":
      return listLeaveAttachmentRows(prisma, filters, limit);
    case "HR_ONBOARDING":
      return listHrOnboardingRows(prisma, filters, limit);
    case "PROFILE_CONFIRMATIONS":
      return listProfileConfirmationRows(prisma, filters, limit);
  }
}

async function listLeaveUsageRows(
  prisma: ReturnType<typeof getPrisma>,
  filters: ReportFilters,
  take: number,
) {
  const requests = await prisma.leaveRequest.findMany({
    where: leaveRequestWhere(filters),
    include: {
      user: { include: { team: true } },
      reviewer: true,
      customLeaveType: true,
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    take,
  });

  return requests.map((request): CsvRow => ({
    "직원 이름": request.user.name,
    "직원 이메일": request.user.email,
    "팀": request.user.team?.name ?? "-",
    "직급": request.user.title ?? "-",
    "휴가 구분": leaveKind(request),
    "휴가 유형": leaveTypeName(request),
    "시작일": formatCsvDate(request.startDate),
    "종료일": formatCsvDate(request.endDate),
    "반차 구분": request.halfDayPeriod ? HALF_DAY_LABELS[request.halfDayPeriod] : "-",
    "요청 수량": Number(request.dayCount),
    "상태": request.status,
    "승인자": request.reviewer?.name ?? "-",
    "승인일": formatCsvDateTime(request.reviewedAt),
    "증명자료 상태": request.attachmentStatus,
    "요청일": formatCsvDateTime(request.createdAt),
  }));
}

async function listLeaveLedgerRows(
  prisma: ReturnType<typeof getPrisma>,
  filters: ReportFilters,
  take: number,
) {
  const range = dateRange(filters);
  const ledgers = await prisma.leaveLedger.findMany({
    where: {
      effectiveDate: { gte: range.from, lte: range.to },
      ...(filters.eventType ? { eventType: filters.eventType as never } : {}),
      ...(filters.source ? { source: filters.source as never } : {}),
      ...(filters.leaveTypeId ? { leaveTypeId: filters.leaveTypeId } : {}),
      user: userWhere(filters),
    },
    include: {
      user: { include: { team: true } },
      leaveType: true,
      createdByUser: true,
    },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    take,
  });

  return ledgers.map((ledger): CsvRow => ({
    "발생일": formatCsvDate(ledger.effectiveDate),
    "직원 이름": ledger.user.name,
    "직원 이메일": ledger.user.email,
    "팀": ledger.user.team?.name ?? "-",
    "휴가 유형": ledger.leaveType?.name ?? "-",
    "이벤트 유형": ledger.eventType,
    "source": ledger.source,
    "수량": ledger.amount,
    "단위": ledger.unit,
    "기준 연도": ledger.referenceYear ?? "-",
    "사유": safeReason(ledger.reason),
    "관련 휴가 요청 ID": ledger.leaveRequestId ?? "-",
    "관련 지급 ID": ledger.leaveGrantId ?? "-",
    "관련 조정 ID": ledger.leaveAdjustmentId ?? "-",
    "생성자": ledger.createdByUser?.name ?? "-",
    "생성일": formatCsvDateTime(ledger.createdAt),
  }));
}

async function listLeaveGrantRows(
  prisma: ReturnType<typeof getPrisma>,
  filters: ReportFilters,
  take: number,
  birthdayOnly: boolean,
) {
  const range = dateRange(filters);
  const grants = await prisma.leaveGrant.findMany({
    where: {
      createdAt: { gte: range.from, lte: range.to },
      ...(birthdayOnly ? { source: "BIRTHDAY_AUTO" } : {}),
      ...(filters.source ? { source: filters.source as never } : {}),
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.leaveTypeId ? { leaveTypeId: filters.leaveTypeId } : {}),
      user: userWhere(filters),
    },
    include: {
      user: { include: { team: true } },
      leaveType: true,
      grantedByUser: true,
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  if (birthdayOnly) {
    return grants.map((grant): CsvRow => ({
      "직원 이름": grant.user.name,
      "직원 이메일": grant.user.email,
      "팀": grant.user.team?.name ?? "-",
      "생일 월일": birthMonthDay(grant.referenceDate ?? grant.user.birthDate),
      "지급일": formatCsvDateTime(grant.createdAt),
      "사용 가능 시작일": formatCsvDate(grant.effectiveFrom),
      "사용 가능 종료일": formatCsvDate(grant.expiresAt),
      "지급 수량": grant.grantedAmount,
      "사용 수량": grant.usedAmount,
      "잔여 수량": grant.remainingAmount,
      "상태": grant.status,
      "알림 생성 여부": "-",
      "관련 LeaveGrant ID": grant.id,
    }));
  }

  return grants.map((grant): CsvRow => ({
    "지급일": formatCsvDateTime(grant.createdAt),
    "직원 이름": grant.user.name,
    "직원 이메일": grant.user.email,
    "팀": grant.user.team?.name ?? "-",
    "휴가 유형": grant.leaveType.name,
    "지급 수량": grant.grantedAmount,
    "사용 수량": grant.usedAmount,
    "승인 대기 수량": grant.pendingAmount,
    "잔여 수량": grant.remainingAmount,
    "단위": grant.unit,
    "사용 시작일": formatCsvDate(grant.effectiveFrom),
    "만료일": formatCsvDate(grant.expiresAt),
    "상태": grant.status,
    "지급자": grant.grantedByUser.name,
    "지급 사유": safeReason(grant.reason),
    "source": sourceLabel(grant.source),
  }));
}

async function listAnnualPromotionRows(
  prisma: ReturnType<typeof getPrisma>,
  filters: ReportFilters,
  take: number,
) {
  const range = dateRange(filters);
  const notices = await prisma.annualLeavePromotionNotice.findMany({
    where: {
      scheduledDate: { gte: range.from, lte: range.to },
      ...(filters.noticeType ? { noticeType: filters.noticeType as never } : {}),
      ...(filters.status ? { status: filters.status as never } : {}),
      user: userWhere(filters),
    },
    include: {
      user: { include: { team: true, employmentProfile: true } },
      annualLeaveUsePlan: true,
    },
    orderBy: [{ scheduledDate: "asc" }, { createdAt: "desc" }],
    take,
  });

  return notices.map((notice): CsvRow => ({
    "직원 이름": notice.user.name,
    "직원 이메일": notice.user.email,
    "팀": notice.user.team?.name ?? "-",
    "입사일": formatCsvDate(notice.user.employmentProfile?.hireDate ?? notice.user.hireDate),
    "기준 연도": notice.referenceYear,
    "촉진 유형": notice.noticeType,
    "소멸 예정 수량": notice.remainingAmount ?? "-",
    "소멸 예정일": formatCsvDate(notice.expirationDate),
    "알림 예정일": formatCsvDate(notice.scheduledDate),
    "알림 발송일": formatCsvDateTime(notice.sentAt),
    "알림 상태": notice.status,
    "사용계획 상태": notice.annualLeaveUsePlan?.status ?? "-",
    "사용계획 제출일": formatCsvDateTime(notice.annualLeaveUsePlan?.submittedAt),
    "사용계획 총 수량": notice.annualLeaveUsePlan?.totalPlannedAmount ?? "-",
  }));
}

async function listLeaveAttachmentRows(
  prisma: ReturnType<typeof getPrisma>,
  filters: ReportFilters,
  take: number,
) {
  const range = dateRange(filters);
  const attachments = await prisma.leaveAttachment.findMany({
    where: {
      submittedAt: { gte: range.from, lte: range.to },
      ...(filters.attachmentStatus ? { status: filters.attachmentStatus as never } : {}),
      leaveRequest: {
        ...(filters.leaveTypeId ? { leaveTypeId: filters.leaveTypeId } : {}),
        user: userWhere(filters),
      },
    },
    include: {
      leaveRequest: {
        include: {
          user: { include: { team: true } },
          customLeaveType: true,
        },
      },
      reviewedBy: true,
    },
    orderBy: { submittedAt: "desc" },
    take,
  });

  return attachments.map((attachment): CsvRow => ({
    "제출일": formatCsvDateTime(attachment.submittedAt),
    "직원 이름": attachment.leaveRequest.user.name,
    "직원 이메일": attachment.leaveRequest.user.email,
    "팀": attachment.leaveRequest.user.team?.name ?? "-",
    "휴가 유형": leaveTypeName(attachment.leaveRequest),
    "휴가 요청 기간": `${formatCsvDate(attachment.leaveRequest.startDate)} ~ ${formatCsvDate(
      attachment.leaveRequest.endDate,
    )}`,
    "증명자료 상태": attachment.status,
    "파일명": attachment.originalFileName ?? "제출됨",
    "파일 크기": attachment.fileSize ?? "-",
    "MIME type": attachment.mimeType ?? "-",
    "검토자": attachment.reviewedBy?.name ?? "-",
    "검토일": formatCsvDateTime(attachment.reviewedAt),
    "반려/재제출 요청 여부":
      attachment.status === "REJECTED" || attachment.status === "RESUBMISSION_REQUESTED"
        ? "예"
        : "아니오",
  }));
}

async function listHrOnboardingRows(
  prisma: ReturnType<typeof getPrisma>,
  filters: ReportFilters,
  take: number,
) {
  const query = filters.q?.trim();
  const profiles = await prisma.employeePrejoinProfile.findMany({
    where: {
      ...(filters.status ? { sourceStatus: filters.status as never } : {}),
      ...(query
        ? {
            OR: [
              { legalName: { contains: query, mode: "insensitive" } },
              { displayName: { contains: query, mode: "insensitive" } },
              { companyEmail: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      linkedUser: {
        include: {
          team: true,
          profile: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take,
  });

  return profiles.map((profile): CsvRow => ({
    "이름": profile.legalName,
    "회사 내 이름": profile.displayName ?? "-",
    "이메일": profile.companyEmail,
    "전화번호": maskReportPhoneNumber(profile.phoneNumber),
    "팀": profile.linkedUser?.team?.name ?? profile.teamName ?? "-",
    "직급": profile.jobGrade ?? profile.title ?? "-",
    "재직상태": profile.employmentStatus ?? "-",
    "사전 프로필 상태": profile.sourceStatus,
    "초대 연결": profile.linkedInvitationId ? "예" : "아니오",
    "가입 연결": profile.linkedUserId ? "예" : "아니오",
    "프로필 확인 완료일": formatCsvDateTime(
      profile.linkedUser?.profile?.profileCompletedAt,
    ),
    "마지막 초대 ID": profile.linkedInvitationId ?? "-",
  }));
}

async function listProfileConfirmationRows(
  prisma: ReturnType<typeof getPrisma>,
  filters: ReportFilters,
  take: number,
) {
  const users = await prisma.user.findMany({
    where: {
      ...userWhere(filters),
      role: { not: "EXTERNAL_PARTNER" },
    },
    include: {
      team: true,
      profile: true,
      profileChangeRequests: true,
    },
    orderBy: { name: "asc" },
    take,
  });

  return users.map((user): CsvRow => {
    const pending = user.profileChangeRequests.filter(
      (request) => request.status === "PENDING",
    ).length;
    const approved = user.profileChangeRequests.filter(
      (request) => request.status === "APPROVED",
    ).length;
    const rejected = user.profileChangeRequests.filter(
      (request) => request.status === "REJECTED",
    ).length;

    return {
      "직원 이름": user.name,
      "이메일": user.email,
      "팀": user.team?.name ?? "-",
      "직급": user.title ?? user.profile?.jobTitle ?? "-",
      "프로필 확인 여부": user.profile?.profileCompletedAt ? "완료" : "미완료",
      "최초 확인일": formatCsvDateTime(user.profile?.profileCompletedAt),
      "최근 확인일": formatCsvDateTime(user.profile?.lastConfirmedAt),
      "대기 중 수정 요청 수": pending,
      "승인된 수정 요청 수": approved,
      "반려된 수정 요청 수": rejected,
    };
  });
}

export function buildFilterSummary(filters: ReportFilters) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== ""),
  );
}
