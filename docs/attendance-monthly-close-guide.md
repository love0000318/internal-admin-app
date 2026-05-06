# 근태 월별 마감 가이드

## 목적

근태 월별 마감은 특정 월의 출근, 퇴근, 지각, 조퇴, 결근, 휴가일, 수정 요청 대기 상태를 확인하고 운영상 확정하는 기능이다. 급여 정산이나 수당 자동 계산 기능이 아니다.

## 권한

- OWNER: 전체 직원의 월별 근태를 조회하고 Step-up 후 마감/마감 해제할 수 있다.
- LEAD: 담당 팀과 하위 팀 범위의 월별 근태만 조회할 수 있다.
- MANAGER: 관리자 월별 근태 마감 화면에 접근할 수 없다.
- EXTERNAL_PARTNER: 내부 근태 기능에 접근할 수 없다.

## 월별 요약

`/admin/attendance/monthly`에서 기준 연도, 월, 팀, 상태, 직원 검색을 선택한다.

요약 항목:

- 정상
- 지각
- 조퇴
- 결근
- 출근 누락
- 퇴근 누락
- 휴가
- 수정 요청 대기
- 마감 상태

## 이상 근태 기준

- 근무일에 기록이 없으면 결근 후보로 표시한다.
- 출근만 있고 퇴근이 없으면 퇴근 누락으로 표시한다.
- 출근 기록 자체가 없으면 출근 누락으로 표시한다.
- 승인된 전일 휴가는 휴가일로 표시한다.
- 반차 휴가는 근무시간 자동 계산 대신 warning으로 표시할 수 있다.
- CompanyHoliday와 주말은 근무일에서 제외한다.

## 마감 절차

1. OWNER가 월별 근태 요약을 확인한다.
2. 퇴근 누락, 결근 후보, 수정 요청 대기 등 경고를 확인한다.
3. 필요하면 수정 요청을 먼저 처리한다.
4. 현재 비밀번호로 Step-up을 통과한다.
5. 경고가 없으면 마감한다.
6. 경고가 있으면 운영 확인 후 `경고가 있어도 확인 후 마감`을 선택할 수 있다.

## 마감 후 제한

- 마감된 월에는 직원이 신규 근태 수정 요청을 만들 수 없다.
- 안내 문구: “이미 마감된 월입니다. 관리자에게 문의해 주세요.”
- 이미 PENDING인 수정 요청은 마감 전 처리하는 것을 권장한다.

## 마감 해제

- OWNER만 Step-up 후 마감 해제할 수 있다.
- 마감 해제 후 직원 수정 요청이 다시 가능하다.
- 마감 해제 사유는 memo와 AuditLog로 남긴다.

## AuditLog

기록 항목:

- `ATTENDANCE_MONTHLY_SUMMARY_VIEWED`
- `ATTENDANCE_MONTH_CLOSED`
- `ATTENDANCE_MONTH_CLOSE_BLOCKED`
- `ATTENDANCE_MONTH_REOPENED`
- `ATTENDANCE_MONTH_REOPEN_BLOCKED`
- `ATTENDANCE_CHANGE_REQUEST_CREATED`
- `ATTENDANCE_CHANGE_REQUEST_BLOCKED_BY_MONTH_CLOSE`

metadata에는 year, month, summaryCounts, reasonCode 등 최소 추적 정보만 저장한다. password, token, secret, 민감 개인정보는 저장하지 않는다.

## 보존 원칙

- 기존 AttendanceRecord와 AttendanceChangeRequest는 삭제하지 않는다.
- 마감 이력 row는 삭제하지 않고 status, closedAt, reopenedAt으로 관리한다.
- 1년 미만 직원 비례연차 로직은 근태 마감과 무관하며 수정하지 않는다.
