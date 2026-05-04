import type {
  AuditAction,
  HalfDayPeriod,
  InvitationStatus,
  LeaveRequestStatus,
  LeaveType,
  Role,
  TeamStatus,
  UserStatus,
} from "@/generated/prisma/enums";

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "총괄 관리자",
  LEAD: "중간 관리자",
  MANAGER: "직원",
  EXTERNAL_PARTNER: "외부 협력자",
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  INVITED: "초대됨",
  ACTIVE: "활성",
  DEACTIVATED: "비활성",
  SUSPENDED: "정지",
  DELETED: "삭제됨",
};

export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  PENDING: "초대 대기",
  ACCEPTED: "가입 완료",
  REVOKED: "회수됨",
  CANCELLED: "취소됨",
  EXPIRED: "만료됨",
};

export const TEAM_STATUS_LABELS: Record<TeamStatus, string> = {
  ACTIVE: "활성",
  INACTIVE: "비활성",
};

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  ANNUAL: "연차",
  HALF_DAY: "반차",
  RESERVE_FORCES: "예비군",
  SICK: "병가",
  BEREAVEMENT: "경조사",
};

export const LEAVE_REQUEST_STATUS_LABELS: Record<LeaveRequestStatus, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인 완료",
  REJECTED: "반려",
  CANCELLED: "취소",
  WITHDRAWN: "철회",
};

export const HALF_DAY_PERIOD_LABELS: Record<HalfDayPeriod, string> = {
  AM: "오전",
  PM: "오후",
};

export const AUDIT_ACTION_LABELS: Partial<Record<AuditAction, string>> = {
  INVITATION_CREATED: "초대 생성",
  INVITATION_ACCEPTED: "초대 수락",
  INVITATION_TOKEN_FAILED: "초대 토큰 검증 실패",
  INVITATION_TOKEN_CONSUMED: "초대 토큰 사용",
  INVITATION_CANCELLED: "초대 취소",
  INVITATION_REISSUED: "초대 재발급",
  INVITATION_VERIFICATION_CODE_CREATED: "가입 인증 코드 생성",
  INVITATION_VERIFICATION_CODE_FAILED: "가입 인증 코드 실패",
  INVITATION_VERIFICATION_CODE_CONSUMED: "가입 인증 코드 사용",
  INVITATION_VERIFICATION_CODE_REVOKED: "가입 인증 코드 폐기",
  INVITATION_SHORT_URL_CREATED: "단축 초대 URL 생성",
  INVITATION_SHORT_URL_CONSUMED: "단축 초대 URL 사용",
  INVITATION_SHORT_URL_REVOKED: "단축 초대 URL 폐기",
  USER_CREATED: "사용자 생성",
  USER_PROFILE_UPDATED: "직원 정보 수정",
  USER_ROLE_UPDATED: "직원 권한 변경",
  USER_TEAM_UPDATED: "직원 소속 변경",
  USER_DEACTIVATED: "직원 비활성화",
  USER_REACTIVATED: "직원 재활성화",
  ROLE_CHANGED: "권한 변경",
  LOGIN: "로그인",
  LOGIN_SUCCEEDED: "로그인 성공",
  LOGIN_FAILED: "로그인 실패",
  LOGIN_BLOCKED: "로그인 차단",
  LOGOUT: "로그아웃",
  SESSION_REVOKED: "세션 폐기",
  SESSION_EXPIRED: "세션 만료",
  TEAM_CREATED: "팀 생성",
  TEAM_UPDATED: "팀 수정",
  TEAM_DEACTIVATED: "팀 비활성화",
  LEAVE_POLICY_UPDATED: "휴가 정책 수정",
  LEAVE_TYPE_CREATED: "휴가 유형 생성",
  LEAVE_TYPE_UPDATED: "휴가 유형 수정",
  LEAVE_TYPE_DEACTIVATED: "휴가 유형 비활성화",
  LEAVE_TYPE_REACTIVATED: "휴가 유형 재활성화",
  LEAVE_GRANT_CREATED: "맞춤휴가 지급",
  LEAVE_GRANT_BULK_CREATED: "맞춤휴가 일괄 지급",
  LEAVE_GRANT_REVOKED: "맞춤휴가 회수",
  LEAVE_REQUEST_CREATED: "휴가 요청 생성",
  LEAVE_REQUEST_WITHDRAWN: "휴가 요청 철회",
  LEAVE_REQUEST_APPROVED: "휴가 승인",
  LEAVE_REQUEST_REJECTED: "휴가 반려",
  LEAVE_REQUEST_CANCELLED: "승인 휴가 취소",
  LEAVE_REQUEST_AUTO_CONFIRMED: "휴가 자동 확정",
  LEAVE_REQUEST_AUTO_CONFIRMED_AFTER_START_DATE: "시작일 경과 휴가 자동 확정",
  LEAVE_ATTACHMENT_UPLOADED: "증명자료 업로드",
  LEAVE_ATTACHMENT_DOWNLOADED: "증명자료 다운로드",
  LEAVE_ATTACHMENT_ACCEPTED: "증명자료 승인",
  LEAVE_ATTACHMENT_REJECTED: "증명자료 반려",
  LEAVE_ATTACHMENT_RESUBMISSION_REQUESTED: "증명자료 재제출 요청",
  REPORT_VIEWED: "리포트 조회",
  REPORT_EXPORTED: "리포트 내보내기",
  AUDIT_LOG_EXPORTED: "감사 로그 내보내기",
  JOB_RUN_STARTED: "작업 시작",
  JOB_RUN_COMPLETED: "작업 완료",
  JOB_RUN_FAILED: "작업 실패",
  NOTIFICATION_MARKED_READ: "알림 읽음 처리",
  ALL_NOTIFICATIONS_MARKED_READ: "모든 알림 읽음 처리",
  STEP_UP_VERIFICATION_SUCCEEDED: "재인증 성공",
  STEP_UP_VERIFICATION_FAILED: "재인증 실패",
  STEP_UP_VERIFICATION_CONSUMED: "재인증 사용",
  OWNER_ROLE_GRANTED: "OWNER 권한 부여",
  OWNER_ROLE_REVOKED: "OWNER 권한 제거",
  LAST_OWNER_PROTECTION_TRIGGERED: "마지막 OWNER 보호",
  SELF_ROLE_CHANGE_BLOCKED: "본인 권한 변경 차단",
  EMPLOYEE_DEACTIVATION_BLOCKED: "직원 비활성화 차단",
  EMPLOYEE_DEACTIVATED_WITH_STEP_UP: "재인증 후 직원 비활성화",
  EMPLOYEE_PERMANENT_DELETE_REQUESTED: "직원 영구 삭제 요청",
  EMPLOYEE_ANONYMIZED: "직원 익명화 삭제",
  EMPLOYEE_HARD_DELETED: "직원 물리 삭제",
  EMPLOYEE_DELETE_BLOCKED: "직원 삭제 차단",
  EMPLOYEE_DELETE_IMPACT_ANALYZED: "직원 삭제 영향 분석",
  UNAUTHORIZED_ACCESS_BLOCKED: "비인가 접근 차단",
  CSRF_BLOCKED: "CSRF 차단",
};

export function roleLabel(role: Role) {
  return ROLE_LABELS[role];
}

export function userStatusLabel(status: UserStatus) {
  return USER_STATUS_LABELS[status];
}

export function invitationStatusLabel(status: InvitationStatus) {
  return INVITATION_STATUS_LABELS[status];
}

export function teamStatusLabel(status: TeamStatus) {
  return TEAM_STATUS_LABELS[status];
}

export function leaveTypeLabel(type: LeaveType) {
  return LEAVE_TYPE_LABELS[type];
}

export function leaveRequestStatusLabel(status: LeaveRequestStatus) {
  return LEAVE_REQUEST_STATUS_LABELS[status];
}

export function halfDayPeriodLabel(period: HalfDayPeriod) {
  return HALF_DAY_PERIOD_LABELS[period];
}

export function auditActionLabel(action: AuditAction) {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
