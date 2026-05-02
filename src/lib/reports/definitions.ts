import type { CsvRow } from "@/lib/reports/csv";

export const REPORT_TYPES = [
  "LEAVE_USAGE",
  "LEAVE_LEDGER",
  "LEAVE_GRANTS",
  "BIRTHDAY_HALF_DAYS",
  "ANNUAL_PROMOTIONS",
  "LEAVE_ATTACHMENTS",
  "HR_ONBOARDING",
  "PROFILE_CONFIRMATIONS",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export type ReportDefinition = {
  type: ReportType;
  title: string;
  description: string;
  path: string;
  defaultFileName: string;
  columns: string[];
};

export const REPORT_DEFINITIONS: Record<ReportType, ReportDefinition> = {
  LEAVE_USAGE: {
    type: "LEAVE_USAGE",
    title: "휴가 사용 현황",
    description: "직원별, 팀별, 휴가 유형별 요청과 승인 현황을 확인합니다.",
    path: "/admin/reports/leaves/usage",
    defaultFileName: "leave-usage-report.csv",
    columns: [
      "직원 이름",
      "직원 이메일",
      "팀",
      "직급",
      "휴가 구분",
      "휴가 유형",
      "시작일",
      "종료일",
      "반차 구분",
      "요청 수량",
      "상태",
      "승인자",
      "승인일",
      "증명자료 상태",
      "요청일",
    ],
  },
  LEAVE_LEDGER: {
    type: "LEAVE_LEDGER",
    title: "휴가 장부",
    description: "LeaveLedger 기준으로 부여, 사용, 대기, 소멸, 조정 이력을 확인합니다.",
    path: "/admin/reports/leaves/ledger",
    defaultFileName: "leave-ledger-report.csv",
    columns: [
      "발생일",
      "직원 이름",
      "직원 이메일",
      "팀",
      "휴가 유형",
      "이벤트 유형",
      "source",
      "수량",
      "단위",
      "기준 연도",
      "사유",
      "관련 휴가 요청 ID",
      "관련 지급 ID",
      "관련 조정 ID",
      "생성자",
      "생성일",
    ],
  },
  LEAVE_GRANTS: {
    type: "LEAVE_GRANTS",
    title: "맞춤휴가 지급",
    description: "직원에게 지급된 맞춤휴가와 잔여 수량을 확인합니다.",
    path: "/admin/reports/leaves/grants",
    defaultFileName: "custom-leave-grants-report.csv",
    columns: [
      "지급일",
      "직원 이름",
      "직원 이메일",
      "팀",
      "휴가 유형",
      "지급 수량",
      "사용 수량",
      "승인 대기 수량",
      "잔여 수량",
      "단위",
      "사용 시작일",
      "만료일",
      "상태",
      "지급자",
      "지급 사유",
      "source",
    ],
  },
  BIRTHDAY_HALF_DAYS: {
    type: "BIRTHDAY_HALF_DAYS",
    title: "생일 반차 지급",
    description: "생일 반차 자동 지급 결과와 사용 현황을 확인합니다.",
    path: "/admin/reports/leaves/birthday-half-days",
    defaultFileName: "birthday-half-day-report.csv",
    columns: [
      "직원 이름",
      "직원 이메일",
      "팀",
      "생일 월일",
      "지급일",
      "사용 가능 시작일",
      "사용 가능 종료일",
      "지급 수량",
      "사용 수량",
      "잔여 수량",
      "상태",
      "알림 생성 여부",
      "관련 LeaveGrant ID",
    ],
  },
  ANNUAL_PROMOTIONS: {
    type: "ANNUAL_PROMOTIONS",
    title: "연차 촉진·사용계획",
    description: "연차 촉진 알림과 사용계획 제출 상태를 확인합니다.",
    path: "/admin/reports/leaves/promotions",
    defaultFileName: "annual-leave-promotion-report.csv",
    columns: [
      "직원 이름",
      "직원 이메일",
      "팀",
      "입사일",
      "기준 연도",
      "촉진 유형",
      "소멸 예정 수량",
      "소멸 예정일",
      "알림 예정일",
      "알림 발송일",
      "알림 상태",
      "사용계획 상태",
      "사용계획 제출일",
      "사용계획 총 수량",
    ],
  },
  LEAVE_ATTACHMENTS: {
    type: "LEAVE_ATTACHMENTS",
    title: "증명자료 제출 현황",
    description: "휴가 증명자료 제출, 검토, 반려, 재제출 요청 상태를 확인합니다.",
    path: "/admin/reports/leaves/attachments",
    defaultFileName: "leave-attachments-report.csv",
    columns: [
      "제출일",
      "직원 이름",
      "직원 이메일",
      "팀",
      "휴가 유형",
      "휴가 요청 기간",
      "증명자료 상태",
      "파일명",
      "파일 크기",
      "MIME type",
      "검토자",
      "검토일",
      "반려/재제출 요청 여부",
    ],
  },
  HR_ONBOARDING: {
    type: "HR_ONBOARDING",
    title: "직원 온보딩 현황",
    description: "사전 직원 정보, 초대, 가입, 프로필 확인 상태를 확인합니다.",
    path: "/admin/reports/hr/onboarding",
    defaultFileName: "hr-onboarding-report.csv",
    columns: [
      "이름",
      "회사 내 이름",
      "이메일",
      "전화번호",
      "팀",
      "직급",
      "재직상태",
      "사전 프로필 상태",
      "초대 연결",
      "가입 연결",
      "프로필 확인 완료일",
      "마지막 초대 ID",
    ],
  },
  PROFILE_CONFIRMATIONS: {
    type: "PROFILE_CONFIRMATIONS",
    title: "직원 프로필 확인 현황",
    description: "직원별 본인 정보 확인 여부와 수정 요청 상태를 확인합니다.",
    path: "/admin/reports/hr/profile-confirmations",
    defaultFileName: "employee-profile-confirmation-report.csv",
    columns: [
      "직원 이름",
      "이메일",
      "팀",
      "직급",
      "프로필 확인 여부",
      "최초 확인일",
      "최근 확인일",
      "대기 중 수정 요청 수",
      "승인된 수정 요청 수",
      "반려된 수정 요청 수",
    ],
  },
};

export function isReportType(value: string | null | undefined): value is ReportType {
  return REPORT_TYPES.includes(value as ReportType);
}

export function getReportDefinition(reportType: ReportType) {
  return REPORT_DEFINITIONS[reportType];
}

export function sanitizeReportRow(row: CsvRow, reportType: ReportType): CsvRow {
  const allowedColumns = REPORT_DEFINITIONS[reportType].columns;

  return Object.fromEntries(
    allowedColumns.map((column) => [column, row[column] ?? null]),
  );
}

export function sanitizeReportRows(rows: CsvRow[], reportType: ReportType) {
  return rows.map((row) => sanitizeReportRow(row, reportType));
}
