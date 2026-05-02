# 기능 안내서

각 기능의 목적, 사용자, route/model/action 기준 요약이다.

## 인증/초대/세션

### 목적
초대 링크 기반 가입과 안전한 로그인 세션을 제공한다.

### 사용자
OWNER, LEAD, MANAGER.

### 주요 화면
`/login`, `/invitations/accept`, `/signup/invite`.

### 주요 데이터 모델
`User`, `Invitation`, `Session`, `IdentityVerification`.

### 주요 동작
초대 token hash 저장, session token hash 저장, logout revoke, 만료 검증.

### 권한
비로그인은 public route만 가능하다. 내부 route는 ACTIVE 사용자 중심이다.

### AuditLog
`LOGIN_SUCCEEDED`, `LOGIN_FAILED`, `LOGOUT`, `INVITATION_ACCEPTED`.

### Notification
초대/온보딩 관련 알림.

### 테스트 포인트
취소/만료/사용 완료 초대 재사용 차단, revoked session 차단.

### 남은 TODO
실제 본인인증 provider 연동.

## 조직/팀 관리

### 목적
회사 조직과 팀, 리드 담당 범위를 관리한다.

### 사용자
OWNER.

### 주요 화면
`/organization`, `/organization/teams`, `/admin/organization`.

### 주요 데이터 모델
`Team`, `User`.

### 주요 동작
팀 생성/수정/비활성화, parent team, lead user 지정.

### 권한
OWNER만 관리. LEAD/MANAGER는 admin 관리 불가.

### AuditLog
`TEAM_CREATED`, `TEAM_UPDATED`, `TEAM_DEACTIVATED`.

### Notification
필수 아님.

### 테스트 포인트
하위 팀 범위, 마지막 OWNER 보호.

### 남은 TODO
조직도 시각화 고도화.

## 직원 초대/가입

### 목적
직원을 안전하게 초대하고 계정을 생성한다.

### 사용자
OWNER, 초대받은 직원.

### 주요 화면
`/organization/invitations`, `/invitations/accept`.

### 주요 데이터 모델
`Invitation`, `User`, `Team`, `EmployeePrejoinProfile`.

### 주요 동작
초대 생성, 취소, 재발급, 가입 시 prejoin profile 연결.

### 권한
OWNER만 초대 관리. 직원은 자기 초대만 사용.

### AuditLog
`INVITATION_CREATED`, `INVITATION_CANCELLED`, `INVITATION_REISSUED`, `INVITATION_ACCEPTED`.

### Notification
`INVITATION_CREATED`, 온보딩 알림.

### 테스트 포인트
token 원문 DB 미저장, 중복 이메일 차단.

### 남은 TODO
실제 이메일 provider 연동.

## HR 엑셀 import

### 목적
비공개 엑셀 원장을 기반으로 사전 직원 프로필을 만든다.

### 사용자
OWNER/운영자 CLI.

### 주요 화면
전용 import 화면 없음. CLI 중심.

### 주요 데이터 모델
`EmployeeImportBatch`, `EmployeePrejoinProfile`, draft records.

### 주요 동작
`pnpm hr:import <xlsx>`로 batch와 prejoin profile 생성.

### 권한
원본 파일은 private 경로. DB에는 필요한 필드만 저장.

### AuditLog
`EMPLOYEE_MASTER_IMPORTED`, `EMPLOYEE_PREJOIN_PROFILE_CREATED`.

### Notification
가입 후 profile confirmation 알림.

### 테스트 포인트
민감정보 암호화, placeholder/null 처리, public 저장 금지.

### 남은 TODO
전용 OWNER import UI.

## 직원 프로필

### 목적
직원이 자기 정보를 확인하고 허용 항목을 수정한다.

### 사용자
직원, OWNER.

### 주요 화면
`/profile`, `/profile/edit`, `/profile/confirm`.

### 주요 데이터 모델
`EmployeeProfile`, `EmployeeSensitiveProfile`, `EmploymentProfile`, child records.

### 주요 동작
기본 정보 즉시 수정, 민감정보는 변경 요청.

### 권한
직원은 자기 정보만. OWNER는 전체 관리. LEAD는 민감정보 접근 불가.

### AuditLog
`EMPLOYEE_PROFILE_UPDATED_BY_SELF`, `EMPLOYEE_PROFILE_CONFIRMED`.

### Notification
profile confirmation, 변경 요청 결과.

### 테스트 포인트
role/team/hireDate/salary 직접 수정 차단.

### 남은 TODO
OWNER HR 상세 UI 고도화.

## 민감정보 변경 요청

### 목적
민감정보 수정을 승인 기반으로 처리한다.

### 사용자
직원, OWNER.

### 주요 화면
`/admin/profile-change-requests`.

### 주요 데이터 모델
`EmployeeProfileChangeRequest`.

### 주요 동작
요청 생성, OWNER 승인/반려, Notification 생성.

### 권한
직원은 자기 요청만. OWNER만 승인/반려.

### AuditLog
`EMPLOYEE_PROFILE_CHANGE_REQUEST_CREATED`, `APPROVED`, `REJECTED`.

### Notification
요청 등록/승인/반려.

### 테스트 포인트
AuditLog에 민감 원문 없음.

### 남은 TODO
민감 원문 조회 절차 별도 설계.

## 휴가 유형 관리

### 목적
기본 휴가와 맞춤휴가 유형을 설정한다.

### 사용자
OWNER.

### 주요 화면
`/admin/leaves/types`.

### 주요 데이터 모델
`LeaveTypeDefinition`, `ApprovalPolicy`.

### 주요 동작
생성/수정/비활성화, 공개 범위, 증명자료 정책, 승인 정책 연결.

### 권한
OWNER만.

### AuditLog
`LEAVE_TYPE_CREATED`, `LEAVE_TYPE_UPDATED`, `LEAVE_TYPE_DEACTIVATED`.

### Notification
필수 아님.

### 테스트 포인트
시스템 기본 휴가 보호.

### 남은 TODO
복잡한 정책 템플릿.

## 맞춤휴가 지급

### 목적
직원에게 맞춤휴가를 지급하고 잔여를 관리한다.

### 사용자
OWNER, 직원.

### 주요 화면
`/admin/leaves/grants`, `/leaves/me`.

### 주요 데이터 모델
`LeaveGrant`, `LeaveRequestGrantUsage`, `LeaveLedger`.

### 주요 동작
단일/일괄 지급, 회수, 요청 연결.

### 권한
OWNER 지급/회수, 직원 자기 요청.

### AuditLog
`LEAVE_GRANT_CREATED`, `LEAVE_GRANT_BULK_CREATED`, `LEAVE_GRANT_REVOKED`.

### Notification
지급 알림.

### 테스트 포인트
잔여/대기/사용 수량 정합성.

### 남은 TODO
지급 템플릿.

## 생일 반차 자동 지급

### 목적
생일 기준 반차를 자동 지급한다.

### 사용자
OWNER/Job, 직원.

### 주요 화면
`/admin/leaves/birthday-policy`.

### 주요 데이터 모델
`BirthdayLeavePolicy`, `LeaveGrant`, `Notification`.

### 주요 동작
직전 평일 보정, 연도별 중복 방지, dry-run.

### 권한
OWNER 정책 관리, Job 실행.

### AuditLog
`BIRTHDAY_HALF_DAY_GRANTED`, `BIRTHDAY_HALF_DAY_GRANT_SKIPPED`.

### Notification
생일 반차 지급 알림.

### 테스트 포인트
주말/공휴일 보정.

### 남은 TODO
외부 알림 연동.

## 휴가 요청

### 목적
직원이 연차/반차/기본휴가/맞춤휴가를 요청한다.

### 사용자
직원.

### 주요 화면
`/leaves/me/requests/new`, `/leaves/me/requests/[requestId]`.

### 주요 데이터 모델
`LeaveRequest`, `LeaveRequestGrantUsage`, `LeaveAttachment`.

### 주요 동작
잔여/기간/중복/증명자료/승인 정책 검증.

### 권한
직원은 자기 요청만.

### AuditLog
`LEAVE_REQUEST_CREATED`, `CUSTOM_LEAVE_REQUEST_CREATED`.

### Notification
승인권자에게 요청 알림.

### 테스트 포인트
잔여 초과, 반차 AM/PM, 중복 기간.

### 남은 TODO
시간차/분차 UI.

## 휴가 승인/반려/취소

### 목적
OWNER/LEAD가 휴가를 처리한다.

### 사용자
OWNER, LEAD.

### 주요 화면
`/leaves/approvals`, `/leaves/approvals/[requestId]`.

### 주요 데이터 모델
`LeaveRequest`, `ApprovalPolicy`, `LeaveLedger`.

### 주요 동작
승인, 반려, 승인 취소, 자기 승인 방지.

### 권한
OWNER 전체. LEAD는 담당 범위.

### AuditLog
`LEAVE_REQUEST_APPROVED`, `LEAVE_REQUEST_REJECTED`, `LEAVE_REQUEST_CANCELLED`.

### Notification
요청자에게 결과 알림.

### 테스트 포인트
담당 범위 밖 LEAD 차단.

### 남은 TODO
다단계 전자결재.

## LeaveLedger

### 목적
휴가 부여/대기/사용/소멸/회수 이력을 장부로 추적한다.

### 사용자
OWNER, 직원.

### 주요 화면
`/admin/leaves/history`, `/leaves/me`.

### 주요 데이터 모델
`LeaveLedger`.

### 주요 동작
idempotencyKey 기반 중복 방지와 잔여 계산.

### 권한
OWNER 전체, 직원 자기 장부.

### AuditLog
`LEAVE_LEDGER_CREATED`, `LEAVE_LEDGER_VALIDATED`.

### Notification
필수 아님.

### 테스트 포인트
`pnpm leave:ledger:validate`.

### 남은 TODO
대량 정합성 dashboard.

## 연차 정책

### 목적
회계일, 반차 단위, 당겨쓰기, 월차/연차 부여, 소멸 정책을 관리한다.

### 사용자
OWNER.

### 주요 화면
`/admin/leaves/annual-policy`.

### 주요 데이터 모델
`AnnualLeavePolicy`.

### 주요 동작
정책 조회/수정, 연차 계산 helper에 반영.

### 권한
OWNER만.

### AuditLog
`ANNUAL_LEAVE_POLICY_UPDATED`.

### Notification
필수 아님.

### 테스트 포인트
회계연도, 반차 단위, 당겨쓰기 미허용.

### 남은 TODO
노무 검토 후 first fiscal year rule 확정.

## 연차 촉진

### 목적
소멸 예정 연차에 대한 사용계획 제출과 알림을 운영한다.

### 사용자
OWNER, 직원.

### 주요 화면
`/admin/leaves/promotions`, `/leaves/me/use-plan`.

### 주요 데이터 모델
`AnnualLeavePromotionNotice`, `AnnualLeaveUsePlan`.

### 주요 동작
schedule, due notification, use plan, reminder.

### 권한
OWNER 현황 관리, 직원 자기 계획.

### AuditLog
`ANNUAL_LEAVE_PROMOTION_NOTICE_SCHEDULED`, `ANNUAL_LEAVE_USE_PLAN_SUBMITTED`.

### Notification
연차 촉진/리마인드.

### 테스트 포인트
중복 schedule 방지.

### 남은 TODO
전자문서/외부 발송.

## 증명자료

### 목적
휴가 유형별 증명자료 제출과 검수를 지원한다.

### 사용자
직원, OWNER, 담당 LEAD.

### 주요 화면
`/leaves/me/requests/[requestId]`, `/leaves/approvals/[requestId]`.

### 주요 데이터 모델
`LeaveAttachment`, `LeaveRequest`.

### 주요 동작
private upload, MIME/size 검증, 다운로드 권한, 반려/재제출.

### 권한
요청자, OWNER, 담당 LEAD만 접근.

### AuditLog
`LEAVE_ATTACHMENT_UPLOADED`, `LEAVE_ATTACHMENT_DOWNLOADED`, `LEAVE_ATTACHMENT_REJECTED`.

### Notification
제출/승인/반려/재제출.

### 테스트 포인트
public 저장 금지, fileKey 노출 금지.

### 남은 TODO
외부 스토리지, 바이러스 검사.

## 승인 정책

### 목적
휴가 유형별 승인자 규칙과 자동 승인 여부를 설정한다.

### 사용자
OWNER.

### 주요 화면
`/admin/leaves/approval-policies`.

### 주요 데이터 모델
`ApprovalPolicy`, `LeaveTypeDefinition`.

### 주요 동작
NONE 자동 승인, OWNER/TEAM_LEAD/TEAM_LEAD_OR_OWNER/CUSTOM_USER.

### 권한
OWNER만 정책 관리.

### AuditLog
`APPROVAL_POLICY_CREATED`, `LEAVE_REQUEST_AUTO_APPROVED`.

### Notification
요청/자동 승인 알림.

### 테스트 포인트
자기 승인 방지, 증명자료 확인 후 승인.

### 남은 TODO
SEQUENTIAL 실제 워크플로우.

## 휴가 캘린더

### 목적
내/팀/전체 휴가 일정을 공개 범위에 맞게 보여준다.

### 사용자
OWNER, LEAD, MANAGER.

### 주요 화면
`/leaves/calendar`.

### 주요 데이터 모델
`LeaveRequest`, `LeaveTypeDefinition`.

### 주요 동작
서버 필터링, PUBLIC_WITH_TYPE/PUBLIC_AS_LEAVE/PRIVATE_TO_APPROVERS.

### 권한
OWNER 전체, LEAD 담당 범위, MANAGER 자기+같은 팀 공개 휴가.

### AuditLog
조회 로그는 선택 사항.

### Notification
필수 아님.

### 테스트 포인트
사유/증명자료 미노출.

### 남은 TODO
외부 캘린더 연동.

## 관리자 리포트

### 목적
OWNER가 운영 데이터를 조회하고 CSV로 내보낸다.

### 사용자
OWNER.

### 주요 화면
`/admin/reports`와 하위 route, `/admin/reports/export`.

### 주요 데이터 모델
여러 HR/Leave 모델, `AuditLog`.

### 주요 동작
필터, table, CSV export, 민감정보 allowlist.

### 권한
OWNER만 조회/export.

### AuditLog
`REPORT_EXPORTED`.

### Notification
비동기 export 알림은 TODO.

### 테스트 포인트
CSV injection 방어, token/fileKey/passwordHash 제외.

### 남은 TODO
대량 streaming export.

## 알림센터

### 목적
사용자가 자기 알림을 확인하고 읽음 처리한다.

### 사용자
내부 사용자.

### 주요 화면
`/notifications`.

### 주요 데이터 모델
`Notification`.

### 주요 동작
목록, 필터, 읽음, 모두 읽음, linkUrl 이동.

### 권한
자기 알림만.

### AuditLog
`NOTIFICATION_MARKED_READ`, `ALL_NOTIFICATIONS_MARKED_READ`.

### Notification
기능 자체가 Notification 소비자다.

### 테스트 포인트
타인 알림 접근 차단.

### 남은 TODO
외부 push/email.

## JobRun

### 목적
운영 Job 실행 이력을 기록한다.

### 사용자
OWNER.

### 주요 화면
`/admin/jobs`, `/admin/jobs/[jobRunId]`.

### 주요 데이터 모델
`JobRun`.

### 주요 동작
start/complete/fail, dry-run, 실패 알림.

### 권한
OWNER만.

### AuditLog
`JOB_RUN_STARTED`, `JOB_RUN_COMPLETED`, `JOB_RUN_FAILED`.

### Notification
Job 실패/수동 완료 알림.

### 테스트 포인트
summary 민감정보 sanitize.

### 남은 TODO
외부 queue와 retry.

## AuditLog

### 목적
중요 변경과 보안 이벤트를 추적한다.

### 사용자
OWNER.

### 주요 화면
`/admin/audit-logs`.

### 주요 데이터 모델
`AuditLog`.

### 주요 동작
action/target/metadata 기록, 민감값 redact.

### 권한
OWNER만 조회.

### AuditLog
해당 없음.

### Notification
필수 아님.

### 테스트 포인트
민감 원문 미포함.

### 남은 TODO
보안 이벤트 dashboard.

## 보안/개인정보

### 목적
민감정보, token, file, export, 권한을 보호한다.

### 사용자
전체.

### 주요 화면
각 기능 route.

### 주요 데이터 모델
`Session`, `Invitation`, HR sensitive models, `LeaveAttachment`.

### 주요 동작
암호화, 마스킹, allowlist export, private storage, server guard.

### 권한
UI 숨김이 아니라 server action/API에서 검증.

### AuditLog
민감 원문 없이 changedFields/target 중심.

### Notification
metadata sanitize.

### 테스트 포인트
MANAGER 타인 접근 차단, LEAD 범위 밖 차단.

### 남은 TODO
MFA/SSO/IP allowlist.
