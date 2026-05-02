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
  MANAGER: "일반 관리자",
  EXTERNAL_PARTNER: "외부 연계 대상자",
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  INVITED: "초대됨",
  ACTIVE: "활성",
  DEACTIVATED: "비활성",
  SUSPENDED: "정지",
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
  INVITATION_CANCELLED: "초대 취소",
  INVITATION_REISSUED: "초대 재발급",
  USER_CREATED: "사용자 생성",
  USER_PROFILE_UPDATED: "직원 정보 수정",
  USER_ROLE_UPDATED: "직원 권한 변경",
  USER_TEAM_UPDATED: "직원 소속 변경",
  USER_DEACTIVATED: "직원 비활성화",
  USER_REACTIVATED: "직원 재활성화",
  LOGIN_SUCCEEDED: "로그인 성공",
  LOGIN_FAILED: "로그인 실패",
  LOGOUT: "로그아웃",
  SESSION_REVOKED: "세션 폐기",
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
  BIRTHDAY_LEAVE_POLICY_UPDATED: "생일 반차 정책 수정",
  BIRTHDAY_HALF_DAY_GRANTED: "생일 반차 지급",
  BIRTHDAY_HALF_DAY_GRANT_SKIPPED: "생일 반차 지급 제외",
  BIRTHDAY_HALF_DAY_NOTIFICATION_CREATED: "생일 반차 알림 생성",
  CUSTOM_LEAVE_REQUEST_CREATED: "맞춤휴가 요청 생성",
  CUSTOM_LEAVE_REQUEST_WITHDRAWN: "맞춤휴가 요청 철회",
  CUSTOM_LEAVE_REQUEST_APPROVED: "맞춤휴가 승인",
  CUSTOM_LEAVE_REQUEST_REJECTED: "맞춤휴가 반려",
  CUSTOM_LEAVE_REQUEST_CANCELLED: "맞춤휴가 승인 취소",
  LEAVE_GRANT_PENDING_AMOUNT_UPDATED: "맞춤휴가 대기 수량 변경",
  LEAVE_GRANT_USED_AMOUNT_UPDATED: "맞춤휴가 사용 수량 변경",
  EMPLOYEE_MASTER_IMPORTED: "인사정보 원장 import",
  EMPLOYEE_PREJOIN_PROFILE_CREATED: "가입 전 인사정보 생성",
  EMPLOYEE_PREJOIN_PROFILE_UPDATED: "가입 전 인사정보 수정",
  EMPLOYEE_PREJOIN_PROFILE_LINKED_TO_INVITATION: "가입 전 인사정보 초대 연결",
  EMPLOYEE_PROFILE_CREATED_FROM_IMPORT: "import 기반 인사 프로필 생성",
  EMPLOYEE_PROFILE_CONFIRMED: "직원 인사정보 확인",
  EMPLOYEE_PROFILE_UPDATED_BY_SELF: "직원 본인 정보 수정",
  EMPLOYEE_PROFILE_UPDATED_BY_OWNER: "OWNER 직원 정보 수정",
  EMPLOYEE_PROFILE_CHANGE_REQUEST_CREATED: "인사정보 수정 요청",
  EMPLOYEE_PROFILE_CHANGE_REQUEST_APPROVED: "인사정보 수정 요청 승인",
  EMPLOYEE_PROFILE_CHANGE_REQUEST_REJECTED: "인사정보 수정 요청 반려",
  SENSITIVE_FIELD_VIEWED: "민감정보 조회",
  SENSITIVE_FIELD_UPDATED: "민감정보 수정",
  COMPANY_HOLIDAY_CREATED: "회사 휴일 생성",
  COMPANY_HOLIDAY_UPDATED: "회사 휴일 수정",
  COMPANY_HOLIDAY_DEACTIVATED: "회사 휴일 비활성화",
  LEAVE_REQUEST_CREATED: "휴가 요청 생성",
  LEAVE_REQUEST_WITHDRAWN: "휴가 요청 철회",
  LEAVE_REQUEST_APPROVED: "휴가 승인",
  LEAVE_REQUEST_REJECTED: "휴가 반려",
  LEAVE_REQUEST_CANCELLED: "승인 휴가 취소",
  LEAVE_ADJUSTMENT_CREATED: "휴가 조정 생성",
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
