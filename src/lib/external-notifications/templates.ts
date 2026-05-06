import type { NotificationType } from "@/generated/prisma/client";
import { sanitizeSecurityValue } from "@/lib/security/sanitize";

export type ExternalNotificationTemplateParams = {
  type: NotificationType;
  title: string;
  message: string;
  linkUrl?: string | null;
  appBaseUrl?: string;
  context?: Record<string, unknown>;
};

function absoluteUrl(path: string | null | undefined, appBaseUrl: string) {
  if (!path) {
    return null;
  }

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  return `${appBaseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function readString(context: Record<string, unknown> | undefined, key: string) {
  const value = sanitizeSecurityValue(context?.[key]);
  return typeof value === "string" ? value : undefined;
}

function joinLines(lines: Array<string | null | undefined>) {
  return lines.filter(Boolean).join("\n");
}

export function buildExternalEmailTemplate(params: ExternalNotificationTemplateParams) {
  const appBaseUrl = params.appBaseUrl ?? process.env.APP_BASE_URL ?? "";
  const link = absoluteUrl(params.linkUrl, appBaseUrl);
  const leaveType = readString(params.context, "leaveTypeName") ?? "휴가";
  const startDate = readString(params.context, "startDate");
  const endDate = readString(params.context, "endDate");
  const period = startDate && endDate ? `${startDate} ~ ${endDate}` : undefined;

  if (params.type === "LEAVE_REQUESTED" || params.type === "LEAVE_REQUEST_CREATED") {
    return {
      subject: "휴가 승인 요청이 등록되었습니다.",
      text: joinLines([
        "구성원이 휴가 승인을 요청했습니다.",
        "",
        `휴가 유형: ${leaveType}`,
        period ? `기간: ${period}` : null,
        "상태: 승인 대기",
        "",
        link ? `Internal Ops에서 확인해 주세요: ${link}` : null,
      ]),
    };
  }

  if (params.type === "LEAVE_APPROVED" || params.type === "LEAVE_REQUEST_APPROVED") {
    return {
      subject: "휴가 요청이 승인되었습니다.",
      text: joinLines([
        "요청한 휴가가 승인되었습니다.",
        "",
        `휴가 유형: ${leaveType}`,
        period ? `기간: ${period}` : null,
        "",
        link ? `Internal Ops에서 확인하기: ${link}` : null,
      ]),
    };
  }

  if (params.type === "LEAVE_REJECTED" || params.type === "LEAVE_REQUEST_REJECTED") {
    return {
      subject: "휴가 요청이 반려되었습니다.",
      text: joinLines([
        "요청한 휴가가 반려되었습니다.",
        "반려 사유는 Internal Ops에서 확인해 주세요.",
        "",
        link ? `확인하기: ${link}` : null,
      ]),
    };
  }

  if (params.type === "LEAVE_CANCELLED" || params.type === "LEAVE_REQUEST_CANCELLED") {
    return {
      subject: "휴가 요청이 취소되었습니다.",
      text: joinLines([
        "승인된 휴가가 취소되었습니다.",
        "상세 내용은 Internal Ops에서 확인해 주세요.",
        "",
        link ? `확인하기: ${link}` : null,
      ]),
    };
  }

  if (params.type === "LEAVE_ATTACHMENT_RESUBMISSION_REQUESTED") {
    return {
      subject: "휴가 증빙자료 재제출이 필요합니다.",
      text: joinLines([
        "휴가 증빙자료 재제출이 필요합니다.",
        "Internal Ops에서 요청 내용을 확인하고 자료를 다시 제출해 주세요.",
        "",
        link ? `확인하기: ${link}` : null,
      ]),
    };
  }

  if (
    params.type === "ANNUAL_LEAVE_PROMOTION" ||
    params.type === "ANNUAL_LEAVE_PROMOTION_REQUESTED" ||
    params.type === "ANNUAL_LEAVE_USE_PLAN_REMINDER" ||
    params.type === "ANNUAL_LEAVE_EXPIRING"
  ) {
    return {
      subject: "연차 사용 계획 안내",
      text: joinLines([
        "확인할 연차 안내가 있습니다.",
        "Internal Ops에서 연차 사용 계획 또는 소멸 예정 연차를 확인해 주세요.",
        "",
        link ? `확인하기: ${link}` : null,
      ]),
    };
  }

  if (params.type === "ATTENDANCE_CHANGE_REQUEST_CREATED") {
    return {
      subject: "근태 수정 요청이 등록되었습니다.",
      text: joinLines([
        "구성원이 근태 기록 수정을 요청했습니다.",
        "",
        link ? `Internal Ops에서 확인하기: ${link}` : null,
      ]),
    };
  }

  if (params.type === "JOB_FAILED") {
    return {
      subject: "자동 작업 실행에 실패했습니다.",
      text: joinLines([
        "자동 작업 실행에 실패했습니다.",
        "관리자 화면에서 작업 이력을 확인해 주세요.",
        "",
        link ? `확인하기: ${link}` : null,
      ]),
    };
  }

  return {
    subject: params.title,
    text: joinLines([String(sanitizeSecurityValue(params.message)), "", link ? `확인하기: ${link}` : null]),
  };
}

export function buildInvitationEmailTemplate(params: {
  invitationUrl: string;
  verificationCode: string;
}) {
  return {
    subject: "사내 관리 서비스 가입 초대",
    text: [
      "안녕하세요.",
      "",
      "사내 관리 서비스 가입 초대가 도착했습니다.",
      "",
      "아래 링크로 접속해 가입을 완료해 주세요.",
      "",
      "초대 링크:",
      params.invitationUrl,
      "",
      "가입 인증 코드:",
      params.verificationCode,
      "",
      "가입 인증 코드는 1회만 사용할 수 있습니다.",
    ].join("\n"),
  };
}
