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
사용계획은 시작일/종료일과 사용 형태를 입력하면 시스템이 수량을 자동 계산한다. 제출은 실제 휴가 요청을 만들지 않고 LeaveLedger를 차감하지 않는다.

### 권한
OWNER 현황 관리, 직원 자기 계획.

### AuditLog
`ANNUAL_LEAVE_PROMOTION_NOTICE_SCHEDULED`, `ANNUAL_LEAVE_USE_PLAN_SUBMITTED`.

### Notification
연차 촉진/리마인드.

### 테스트 포인트
중복 schedule 방지, 사용계획 기간 자동 계산, 총 계획 수량 초과 차단, LeaveRequest/LeaveLedger 미생성.

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

## 미승인 휴가 자동 확정

### 목적
휴가 시작일이 도래했지만 승인 대기 상태로 남아 있는 요청을 정책에 따라 시스템이 자동 확정한다.

### 사용자
직접 실행은 CLI/cron 또는 OWNER 수동 dry-run 중심이다. 직원은 자동 확정 결과를 내 휴가 상세와 알림으로 확인한다.

### 주요 화면
`/leaves/me`, `/leaves/me/requests/[requestId]`, `/leaves/approvals/[requestId]`, `/admin/jobs`

### 주요 데이터 모델
`ApprovalPolicy`, `LeaveRequest`, `LeaveLedger`, `Notification`, `AuditLog`, `JobRun`

### 주요 동작
`jobs:auto-confirm-past-start-leaves`가 시작일이 지난 `PENDING` 요청을 찾아 `APPROVED`로 변경하고 `LEAVE_AUTO_CONFIRM` 장부를 기록한다.

### 권한
수동 Job 실행은 OWNER만 가능하다. Cron 실행은 `CRON_SECRET`이 필요하다.

### AuditLog
`LEAVE_REQUEST_AUTO_CONFIRMED_AFTER_START_DATE`, `AUTO_CONFIRM_PAST_START_LEAVES_RUN`, `AUTO_CONFIRM_PAST_START_LEAVES_DRY_RUN`

### Notification
직원에게 `LEAVE_AUTO_CONFIRMED` 알림을 생성한다.

### 테스트 포인트
중복 실행 방지, 잔여 중복 차감 방지, 증명자료 확인 필수 정책 skip, JobRun 기록.

### 남은 TODO
증명자료 미확인으로 제외된 요청에 대한 별도 알림.

## 반응형 UI

### 목적
PC, 태블릿, 모바일에서 관리자 표와 휴가 관리 form을 사용할 수 있게 한다.

### 사용자
OWNER, LEAD, MANAGER 등 내부 사용자. 관리자 화면은 기존 권한 정책을 그대로 따른다.

### 주요 화면
`/admin/leaves/types`, `/admin/leaves/settings`, `/admin/leaves/annual-policy`, `/admin/leaves/birthday-policy`, `/admin/leaves/approval-policies`, `/admin/leaves/balances`, `/admin/leaves/grants`, `/admin/reports/*`

### 주요 동작
넓은 표는 `overflow-x-auto`와 `min-w-*`를 사용해 내부 스크롤로 처리한다. form grid는 모바일 1열, 중간 화면 2열, 큰 화면 최대 4열로 표시한다.

### 권한
UI 레이아웃만 조정하며 server action/API 권한 검증은 기존 정책을 유지한다.

### 테스트 포인트
1440px, 1024px, 768px, 430px, 390px, 360px 폭에서 한글 컬럼명이 세로로 깨지지 않는지, form이 화면 밖으로 나가지 않는지 확인한다.

### 남은 TODO
모바일 전용 햄버거 메뉴와 주요 표의 카드형 전환은 후속 UI 고도화 후보로 관리한다.

## 초대 가입 인증 코드

### 목적
외부 이메일/휴대폰 인증 API 없이 OWNER가 직접 전달하는 1회용 코드로 초대 가입을 검증한다.

### 사용자
OWNER, 초대받은 직원.

### 주요 화면
`/organization/invitations`, `/invitations/accept`.

### 주요 데이터 모델
`Invitation.verificationCodeHash`, `verificationCodeExpiresAt`, `verificationCodeConsumedAt`, `verificationCodeRevokedAt`, `verificationCodeAttemptCount`, `verificationCodeMaxAttempts`.

### 주요 동작
초대 생성/재발급 시 원문 코드를 한 번 표시하고, 가입 성공 시 consumed 처리한다.

### 권한
OWNER만 초대와 재발급을 수행한다. 직원은 자신이 받은 초대 링크와 코드로만 가입한다.

### AuditLog
`INVITATION_VERIFICATION_CODE_CREATED`, `INVITATION_VERIFICATION_CODE_FAILED`, `INVITATION_VERIFICATION_CODE_CONSUMED`, `INVITATION_REISSUED_WITH_VERIFICATION_CODE`.

### Notification
초대 코드 자체는 인앱 Notification으로 발송하지 않는다.

### 테스트 포인트
원문 코드 미저장, 실패 횟수 증가, consumed/revoked/expired/locked 코드 차단, production mock 차단.

### 남은 TODO
OWNER 초대 전용 재발급 CLI는 필요 시 추가한다.
## 내부 단축 초대 URL

### 목적
직원에게 전달하기 쉬운 짧은 초대 링크를 내부에서 안전하게 제공한다.

### 사용자
OWNER, 초대받은 직원.

### 주요 화면
`/organization/invitations`, `/i/[shortToken]`, `/invitations/accept`.

### 주요 데이터 모델
`Invitation.shortTokenHash`, `shortTokenExpiresAt`, `shortTokenConsumedAt`, `shortTokenRevokedAt`.

### 주요 동작
초대 생성 시 긴 초대 URL, 단축 초대 URL, 1회용 가입 인증 코드를 함께 생성한다. `/i/[shortToken]`은 `/invitations/accept?shortToken=...`으로 연결되고, 가입 완료 시 shortToken과 인증 코드가 모두 소비 처리된다.

### 권한
OWNER만 단축 초대 URL을 생성하거나 재발급할 수 있다. 초대받은 사용자는 유효한 shortToken과 가입 인증 코드가 있어야 가입할 수 있다.

### AuditLog
`INVITATION_SHORT_URL_CREATED`, `INVITATION_SHORT_URL_CONSUMED`, `INVITATION_SHORT_URL_REVOKED`, `INVITATION_REISSUED_WITH_SHORT_URL`.

### Notification
없음.

### 테스트 포인트
shortToken 원문 미저장, hash 검증, 소비/폐기/만료 차단, 가입 완료 후 재사용 차단, 재발급 시 기존 링크 폐기.

### 남은 TODO
초대 상세 화면 분리와 링크 전달 UI 고도화.

## 자동 로그인 유지

### 목적
개인 기기에서 정상 로그인 후 더 긴 기간 동안 로그인 상태를 유지한다.

### 사용자
OWNER, LEAD, MANAGER 등 로그인 가능한 ACTIVE 내부 사용자.

### 주요 화면
`/login`.

### 주요 데이터 모델
`Session`. 별도 remember token은 만들지 않고 `expiresAt`을 일반 세션과 다르게 설정한다.

### 주요 동작
사용자가 `이 기기에서 자동 로그인 유지`를 선택하고 전화번호/비밀번호 검증에 성공하면 `REMEMBER_ME_SESSION_EXPIRES_IN_DAYS` 기준으로 세션 만료일을 설정한다. 선택하지 않으면 `SESSION_EXPIRES_IN_DAYS`를 사용한다.

### 권한
정상 로그인 성공과 ACTIVE 사용자 상태가 필수다. production quick login이나 mock login은 허용하지 않는다.

### AuditLog
`LOGIN_SUCCEEDED` metadata에 `rememberMe` 여부만 기록할 수 있다. password, session token, tokenHash는 기록하지 않는다.

### Notification
없음.

### 테스트 포인트
일반 로그인과 자동 로그인 유지의 만료일 차이, httpOnly/sameSite/production secure cookie, logout 후 세션 revoke, `/login` 접근 시 유효 세션 redirect.

### 남은 TODO
기기별 세션 관리 UI는 후순위다.
## 3차 모바일/UX 안정화

### 목적

운영 중인 1차/2차 기능을 모바일에서도 사용할 수 있도록 form 폭, table overflow, 탭 줄바꿈, 알림 접근성을 정리한다.

### 사용자

OWNER, LEAD, MANAGER 등 로그인한 내부 사용자.

### 주요 화면

- `/login`
- `/invitations/accept`
- `/i/[shortToken]`
- `/leaves/me`
- `/leaves/me/requests/new`
- `/admin/leaves/settings`
- `/admin/leaves/types`
- `/leaves/calendar`
- `/notifications`

### 주요 동작

- 모바일 form은 1열과 `w-full` 입력으로 표시한다.
- 넓은 table은 PC에서 유지하고 모바일에서는 card 또는 내부 가로 스크롤로 표시한다.
- 설정 탭은 `whitespace-nowrap break-keep` 기반 가로 스크롤로 표시한다.
- protected layout 우측 상단에 알림 아이콘을 표시한다.
- 캘린더 이벤트는 연차/반차/유형 숨김 색상 규칙을 따른다.

### 권한

UI 개선만 수행하며 기존 route/server action 권한 검증을 변경하지 않는다.

### 남은 TODO

- 직원 상세와 관리자 리포트 세부 화면의 모바일 카드형 패턴 확대
- Playwright 모바일 viewport smoke test 자동화

## 외부 알림 연동

### 목적
인앱 Notification을 유지하면서 이메일과 Slack으로 중요한 운영 알림을 보냅니다.

### 사용자
OWNER, LEAD, MANAGER, 초대받은 직원. Slack 운영 알림은 OWNER/운영자 확인용입니다.

### 주요 화면
`/organization/invitations`, `/notifications`, `/admin/jobs`.

### 주요 데이터 모델
신규 설정 모델은 두지 않고 env 기반으로 동작합니다. 발송 결과는 `AuditLog`에 기록합니다.

### 주요 동작
초대 이메일, 휴가 요청/승인/반려/취소 이메일, 증명자료 재제출 이메일, 연차 촉진 이메일, Job 실패 Slack 알림.

### 권한
외부 발송은 기존 server action 권한 검증 이후에만 수행합니다. 발송 실패는 업무 처리 실패로 전파하지 않습니다.

### AuditLog
`EXTERNAL_EMAIL_SENT`, `EXTERNAL_EMAIL_FAILED`, `EXTERNAL_SLACK_SENT`, `EXTERNAL_SLACK_FAILED`, `INVITATION_EMAIL_SENT`, `INVITATION_EMAIL_FAILED`.

### Notification
기존 인앱 Notification은 그대로 생성합니다.

### 테스트 포인트
production console provider 차단, 민감정보 미포함, 외부 발송 실패 시 업무 성공 유지, API key/토큰 AuditLog 미저장.

### 남은 TODO
카카오 알림톡, 재시도 queue, 관리자 알림 설정 UI.
## 외부 캘린더 ICS 구독

### 목적
Google Calendar, Apple Calendar, Samsung Calendar에서 사내 휴가 일정을 읽기 전용으로 확인한다.

### 사용자
OWNER, LEAD, MANAGER. EXTERNAL_PARTNER는 생성할 수 없다.

### 주요 화면
`/leaves/calendar/settings`

### 주요 데이터 모델
`CalendarSubscriptionToken`, `CalendarSubscriptionScope`

### 주요 동작
구독 token을 생성하고 `/api/calendar/ical?token=...`로 ICS를 제공한다. 승인 완료 휴가만 포함한다.

### 권한
MANAGER는 ME/TEAM, LEAD는 ME/TEAM/MANAGED_TEAMS, OWNER는 ME/TEAM/MANAGED_TEAMS/ALL_COMPANY 범위를 생성할 수 있다.

### AuditLog
`CALENDAR_SUBSCRIPTION_CREATED`, `CALENDAR_SUBSCRIPTION_REVOKED`, `CALENDAR_SUBSCRIPTION_REGENERATED`

### 테스트 포인트
raw token 미저장, APPROVED만 출력, 공개 범위 적용, 민감정보 미포함, revoke 후 접근 실패.

### 남은 TODO
Google Calendar OAuth 양방향 동기화는 후속 단계에서 검토한다.
## 비활성 직원 영구 삭제

### 목적
퇴사자 또는 운영상 제거가 필요한 비활성 직원의 개인정보를 삭제/익명화한다.

### 사용자
ACTIVE OWNER만 사용할 수 있다.

### 주요 화면
- `/organization/employees/[userId]`
- `/organization/employees?status=DELETED`

### 주요 데이터 모델
- `User.deletedAt`, `deletedByUserId`, `deletionReason`
- `UserStatus.DELETED`
- `StepUpPurpose.EMPLOYEE_PERMANENT_DELETE`
- `AuditAction.EMPLOYEE_*`

### 주요 동작
비활성 직원에 대해 삭제 영향 분석을 수행하고, 기록이 없으면 hard delete, 기록이 있으면 개인정보 익명화 삭제를 수행한다.

### 권한
OWNER + Step-up 필요. ACTIVE 직원, 자기 자신, 마지막 OWNER는 삭제 불가.

### AuditLog
삭제 영향 분석, 삭제 요청, 익명화, hard delete, 차단 이벤트를 기록한다. 개인정보와 token/hash는 저장하지 않는다.

### 남은 TODO
증명자료 파일의 물리 삭제/보존 정책은 별도 운영 정책으로 확정한다.
# 휴가 사용내역 엑셀 import

- 월별 연차 사용 내역: 직원별 잔여 연차와 월별 사용량을 파싱하고, 검수 후 잔여 연차 차이를 `LeaveAdjustment`/`LeaveLedger`로 보정합니다.
- 휴가 사용 상세 내역: 직원별 휴가 기간, 유형, 수량, 상태를 파싱하고, 검수 후 imported `LeaveRequest`와 `LeaveLedger`로 반영합니다.
- OWNER만 사용할 수 있으며 최종 반영에는 Step-up 재인증이 필요합니다.
- 반영 전 검증은 미매칭, UNKNOWN 상태, 미매핑 휴가 유형, 중복 의심 row, idempotencyKey 중복을 확인합니다.
- 반영 후 batch 상세 화면에서 생성/연결된 LeaveRequest, LeaveLedger, LeaveAdjustment 수와 월별 잔여 reconciliation 결과를 확인할 수 있습니다.
- OWNER는 `/admin/leaves/import`에서 휴가 현황 업로드 템플릿을 다운로드할 수 있습니다. 템플릿은 ACTIVE 내부 직원과 현재 LeaveLedger 기준 참고값만 포함하며 민감 HR 정보는 제외합니다.
- APPLIED 월별 휴가 현황 batch는 Step-up 후 `업로드 반영 취소`가 가능합니다. 취소는 기존 기록 삭제가 아니라 반대 방향 LeaveAdjustment와 LeaveLedger `IMPORT_REVERSE_ADJUSTMENT` 이벤트를 추가하는 방식입니다.
## 구성원 휴가 현황 조회

구성원 휴가 현황은 LeaveLedger 기반 잔여 계산을 재사용해 직원별 연차, 맞춤휴가, 생일 반차, 승인 대기, 사용 완료, 잔여 수량을 보여줍니다.

- OWNER scope: 전체 ACTIVE 내부 직원
- LEAD scope: `Team.leadUserId`로 담당하는 팀과 하위 팀의 ACTIVE 직원
- MANAGER scope: 본인만, 목록 화면 접근 불가
- EXTERNAL_PARTNER scope: 없음

목록과 상세 화면 모두 서버에서 scope를 계산하고, query 단계에서 허용된 userId로 제한합니다. UI 메뉴 숨김은 보조 수단이며 보안 경계가 아닙니다.
## 회계연도 기준 휴가 소멸일

회계연도 기준 지급 휴가는 지급 연도의 12월 31일까지 유효합니다.

- 2026년 지급 휴가: 2026-12-31까지 유효
- 2027년 지급 휴가: 2027-12-31까지 유효

내 휴가 현황, 구성원 휴가 현황, 휴가 요청 화면은 `LeaveGrant.expiresAt`과 `LeaveLedger.referenceYear/expiresAt` 기준을 함께 사용합니다. 2026년 지급분은 2027년 잔여로 남지 않아야 합니다.

생일 반차는 생일 당일~정책상 사용 가능 기간을 유지하며 회계연도 말일 규칙을 적용하지 않습니다.
