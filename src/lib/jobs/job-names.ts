export const JOB_NAMES = {
  BIRTHDAY_HALF_DAY_GRANTS: "birthday-half-day-grants",
  SCHEDULE_ANNUAL_PROMOTION_NOTICES: "schedule-annual-promotion-notices",
  SEND_ANNUAL_PROMOTION_NOTICES: "send-annual-promotion-notices",
  EXPIRE_ANNUAL_LEAVES: "expire-annual-leaves",
  FIX_FISCAL_YEAR_LEAVE_EXPIRATIONS: "fix-fiscal-year-leave-expirations",
  AUTO_CONFIRM_PENDING_LEAVES: "auto-confirm-pending-leaves",
  AUTO_CONFIRM_PAST_START_LEAVES: "auto-confirm-past-start-leaves",
  LEAVE_LEDGER_REBUILD: "leave-ledger-rebuild",
  LEAVE_LEDGER_VALIDATE: "leave-ledger-validate",
  HR_EMPLOYEE_MASTER_IMPORT: "hr-employee-master-import",
  ATTACHMENTS_CHECK: "attachments-check",
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export const MANUAL_JOB_OPTIONS = [
  {
    jobName: JOB_NAMES.LEAVE_LEDGER_VALIDATE,
    label: "LeaveLedger 정합성 검증",
    description: "장부와 지급 데이터의 기본 정합성을 확인합니다.",
    dryRunOnly: true,
  },
  {
    jobName: JOB_NAMES.SCHEDULE_ANNUAL_PROMOTION_NOTICES,
    label: "연차 촉진 스케줄 미리보기",
    description: "연차 촉진 대상과 기존 알림 수를 확인합니다.",
    dryRunOnly: true,
  },
  {
    jobName: JOB_NAMES.EXPIRE_ANNUAL_LEAVES,
    label: "연차 소멸 미리보기",
    description: "소멸 job 실행 전 대상 범위를 확인합니다.",
    dryRunOnly: true,
  },
  {
    jobName: JOB_NAMES.AUTO_CONFIRM_PAST_START_LEAVES,
    label: "미승인 휴가 자동 확정",
    description: "휴가 시작일이 지난 승인 대기 휴가를 자동 확정할 대상을 미리 확인합니다.",
    dryRunOnly: true,
  },
  {
    jobName: JOB_NAMES.BIRTHDAY_HALF_DAY_GRANTS,
    label: "생일 반차 지급 미리보기",
    description: "생일 반차 지급 job의 현재 대상 규모를 확인합니다.",
    dryRunOnly: true,
  },
  {
    jobName: JOB_NAMES.ATTACHMENTS_CHECK,
    label: "첨부파일 상태 점검",
    description: "증명자료 metadata 수와 상태 분포를 확인합니다.",
    dryRunOnly: true,
  },
] as const;

export function isManualJobName(value: string): value is JobName {
  return MANUAL_JOB_OPTIONS.some((option) => option.jobName === value);
}
