# 2차 통합 Smoke Test

이 문서는 2차 HR·휴가 고도화 기능을 실제 운영 흐름 기준으로 점검하기 위한 체크리스트입니다.
각 항목은 실제 계정과 테스트 데이터로 수행하고, 실패 시 확인할 항목을 함께 점검합니다.

## 환경 준비

- [ ] 의존성을 설치한다.
  - 기대 결과: `pnpm install`이 완료된다.
  - 실패 시 확인할 것: Node.js, Corepack, pnpm 버전, 네트워크 접근.

- [ ] Prisma schema를 검증하고 client를 생성한다.
  - 기대 결과: `pnpm db:validate`, `pnpm db:generate`가 통과한다.
  - 실패 시 확인할 것: `prisma/schema.prisma`, migration 상태.

- [ ] DB migration과 seed를 실행한다.
  - 기대 결과: migration이 최신이고 OWNER 초대 또는 ACTIVE OWNER가 존재한다.
  - 실패 시 확인할 것: `DATABASE_URL`, PostgreSQL 실행 상태, seed idempotency.

- [ ] preflight를 실행한다.
  - 기대 결과: 필수 env, seed, 보안 설정, 주요 table 접근이 PASS/WARN/FAIL로 표시된다.
  - 실패 시 확인할 것: `.env`, secret 길이, `CRON_SECRET`, private upload dir.

## OWNER 가입과 기본 운영

- [ ] OWNER 초대 링크로 가입한다.
  - 기대 결과: OWNER 계정이 생성되고 초대는 재사용할 수 없다.
  - 실패 시 확인할 것: invitation status, tokenHash, 만료 시간.

- [ ] OWNER로 로그인하고 대시보드에 접근한다.
  - 기대 결과: `/dashboard`가 표시된다.
  - 실패 시 확인할 것: session cookie, session token hash, user status.

- [ ] 로그인 화면에서 `이 기기에서 자동 로그인 유지`를 선택하고 로그인한다.
  - 기대 결과: 정상 비밀번호 검증 후 로그인되며 세션 만료일이 `REMEMBER_ME_SESSION_EXPIRES_IN_DAYS` 기준으로 설정된다.
  - 실패 시 확인할 것: login action의 `rememberMe` 값, session `expiresAt`, cookie expires.

- [ ] 자동 로그인 유지로 로그인한 뒤 브라우저를 다시 열고 `/dashboard`에 접근한다.
  - 기대 결과: 유효한 httpOnly session cookie로 로그인 상태가 유지된다.
  - 실패 시 확인할 것: cookie expires, session revokedAt/expiresAt, user status.

- [ ] 유효한 세션이 있는 상태로 `/login`에 접근한다.
  - 기대 결과: 별도 입력 없이 `/dashboard`로 이동한다.
  - 실패 시 확인할 것: login page의 `getCurrentUser` redirect 처리.

- [ ] 로그아웃 후 다시 `/dashboard`에 접근한다.
  - 기대 결과: 세션이 revoke되고 cookie가 삭제되어 `/login`으로 이동한다.
  - 실패 시 확인할 것: logout action, session revokedAt, cookie 삭제.

- [ ] 조직/팀을 생성하고 직원을 초대한다.
  - 기대 결과: 팀과 직원 초대가 생성된다.
  - 실패 시 확인할 것: OWNER guard, 팀 unique key, 초대 중복 검증.

- [ ] 직원이 초대 링크로 가입한다.
  - 기대 결과: MANAGER 계정이 생성되고 로그인 가능하다.
  - 실패 시 확인할 것: invitation token, password validation, identity mock production 차단.

- [ ] OWNER가 직원 초대를 생성한 직후 단축 초대 URL과 가입 인증 코드를 확인한다.
  - 기대 결과: `/i/[shortToken]` 형태의 내부 단축 URL과 1회용 가입 인증 코드가 한 번만 표시된다.
  - 실패 시 확인할 것: `shortTokenHash`, `verificationCodeHash`, APP_BASE_URL, 초대 생성 redirect query.

- [ ] 직원이 단축 초대 URL과 가입 인증 코드로 가입한다.
  - 기대 결과: 초대 수락 화면이 표시되고 가입 완료 후 invitation, shortToken, verificationCode가 모두 사용 처리된다.
  - 실패 시 확인할 것: shortToken 만료/폐기/소비 상태, verificationCode attempt count, invitation status.

- [ ] 가입 완료 후 같은 단축 초대 URL에 다시 접근한다.
  - 기대 결과: 초대 링크가 유효하지 않거나 이미 사용된 것으로 처리된다.
  - 실패 시 확인할 것: `shortTokenConsumedAt`, `acceptedAt`, `usedAt`.

- [ ] 초대를 재발급한다.
  - 기대 결과: 기존 긴 token, shortToken, 가입 인증 코드는 폐기되고 새 단축 URL과 새 가입 인증 코드가 생성 직후 한 번 표시된다.
  - 실패 시 확인할 것: 이전 invitation status/cancelledAt, `shortTokenRevokedAt`, `verificationCodeRevokedAt`.

## HR Import와 온보딩

- [ ] 더미 엑셀 fixture로 `pnpm hr:import <xlsx>`를 실행한다.
  - 기대 결과: EmployeeImportBatch와 EmployeePrejoinProfile이 생성된다.
  - 실패 시 확인할 것: 지원 sheet명, 필수 이메일/이름, private import 위치.

- [ ] OWNER가 import 결과와 사전 직원 프로필 연결 상태를 확인한다.
  - 기대 결과: EmployeePrejoinProfile이 생성되어 있고 민감정보 원문은 노출되지 않는다.
  - 실패 시 확인할 것: `hr:import` 결과, EmployeePrejoinProfile DB 상태, HR 리포트.
  - 현재 상태: 전용 `/admin/hr/prejoin-profiles` 목록/상세/검수 route는 없으며 운영은 초대 화면과 HR 리포트 중심이다.

- [ ] 사전 프로필과 같은 이메일로 직원을 초대한다.
  - 기대 결과: 초대가 생성되고 가능한 경우 EmployeePrejoinProfile과 연결된다. DB에는 tokenHash만 저장된다.
  - 실패 시 확인할 것: 중복 pending invitation, active user 중복, employeePrejoinProfileId 연결 여부.
  - 현재 상태: 전용 일괄 초대 화면은 없으므로 일괄 초대는 TODO다.

- [ ] 직원 가입 후 `/profile/confirm`에서 정보를 확인 완료한다.
  - 기대 결과: EmployeeProfile이 생성되고 onboarding/profile confirmation 상태가 갱신된다.
  - 실패 시 확인할 것: prejoin 연결, profileCompletedAt, Notification.

## 직원 프로필과 민감정보 변경 요청

- [ ] 직원이 `/profile`과 `/profile/edit`에 접근한다.
  - 기대 결과: 자기 정보만 표시되고 민감정보는 마스킹된다.
  - 실패 시 확인할 것: route guard, profile query의 userId 조건.

- [ ] displayName, englishName, personalEmail, phoneNumber, address를 수정한다.
  - 기대 결과: 허용된 항목만 즉시 반영되고 AuditLog가 기록된다.
  - 실패 시 확인할 것: profileUpdateSchema, changedFields.

- [ ] role/team/hireDate/salary를 form 조작으로 수정 시도한다.
  - 기대 결과: 서버에서 무시 또는 차단된다.
  - 실패 시 확인할 것: server action allowlist.

- [ ] 주민번호/계좌 변경 요청을 제출한다.
  - 기대 결과: 암호화된 변경 요청이 생성되고 원문은 AuditLog에 남지 않는다.
  - 실패 시 확인할 것: `encryptSensitiveText`, `sanitizeAuditMetadata`.

- [ ] OWNER가 수정 요청을 승인/반려한다.
  - 기대 결과: 상태가 갱신되고 직원 Notification이 생성된다.
  - 실패 시 확인할 것: OWNER guard, requestedChanges 암호화 상태.

## 기본 휴가 요청과 승인

- [ ] 직원이 연차/반차/예비군/병가/경조사를 요청한다.
  - 기대 결과: 정책에 맞게 요청이 생성되며 중복 기간은 차단된다.
  - 실패 시 확인할 것: date-only 계산, CompanyHoliday, 중복 요청 helper.

- [ ] OWNER 또는 담당 LEAD가 승인/반려/승인취소한다.
  - 기대 결과: 권한 범위와 자기 승인 방지가 적용된다.
  - 실패 시 확인할 것: `canApproveLeaveRequest`, LEAD 하위 팀 계산.

- [ ] 직원별 휴가 보유 현황을 확인한다.
  - 기대 결과: 사용/대기/잔여 수량이 화면에 표시된다.
  - 실패 시 확인할 것: LeaveLedger 또는 기존 balance helper.

## 맞춤휴가 지급과 요청

- [ ] OWNER가 맞춤휴가 유형을 생성/수정/비활성화한다.
  - 기대 결과: OWNER만 가능하고 시스템 필드는 보호된다.
  - 실패 시 확인할 것: LeaveTypeDefinition guard, system required 필드.

- [ ] 직원에게 맞춤휴가를 단일/일괄 지급한다.
  - 기대 결과: LeaveGrant가 생성되고 AuditLog/Notification/LeaveLedger가 기록된다.
  - 실패 시 확인할 것: grant unit, effectiveFrom/expiresAt, idempotency.

- [ ] 직원이 지급받은 맞춤휴가를 요청한다.
  - 기대 결과: 기간, 잔여, 단위, 증명자료 정책이 검증된다.
  - 실패 시 확인할 것: LeaveGrant status, remainingAmount, allowedUnits.

- [ ] 철회/승인/반려/승인취소를 수행한다.
  - 기대 결과: pendingAmount/usedAmount/remainingAmount와 LeaveLedger가 정합성을 유지한다.
  - 실패 시 확인할 것: transaction, grant usage, ledger idempotencyKey.

## 생일 반차

- [ ] BirthdayLeavePolicy를 확인한다.
  - 기대 결과: 사용 여부, 지급 수량, 사용 가능 기간이 표시된다.
  - 실패 시 확인할 것: seed, policy page guard.

- [ ] `pnpm jobs:birthday-half-day-grants -- --dry-run`을 실행한다.
  - 기대 결과: 지급 대상/건너뜀 수가 출력된다.
  - 실패 시 확인할 것: 직원 birthDate, ACTIVE status, CompanyHoliday.

- [ ] 실제 지급 job을 실행한다.
  - 기대 결과: BIRTHDAY_AUTO LeaveGrant가 중복 없이 생성된다.
  - 실패 시 확인할 것: referenceYear unique key, 지급일 보정.

- [ ] 직원 생일 정보를 `EmployeeProfile.birthDate`, `User.birthDate`, 사전 프로필 연결 순서로 확인한다.
  - 기대 결과: HR import 또는 직원 상세에서 입력된 생일이 자동 지급 대상 계산에 사용된다.
  - 실패 시 확인할 것: EmployeeProfile.birthDate 저장 여부, User.birthDate fallback, linked EmployeePrejoinProfile.birthDate.

- [ ] `pnpm jobs:birthday-half-day-grants -- --date=YYYY-MM-DD --dry-run`을 실행한다.
  - 기대 결과: 실제 DB 변경 없이 ACTIVE 직원 수, 생일 정보 누락 수, 지급 대상 수, 이미 지급된 수가 요약된다.
  - 실패 시 확인할 것: script 옵션 전달, JobRun dryRun, `grantBirthdayHalfDaysForDate` dryRun 처리.

- [ ] 직원이 생일 반차를 요청한다.
  - 기대 결과: 반차 단위로 요청 가능하고 승인 흐름과 연결된다.
  - 실패 시 확인할 것: custom grant request adapter.

- [ ] 직원 내 휴가 화면과 휴가 요청 화면에서 생일 반차를 확인한다.
  - 기대 결과: 사용 가능 기간 안의 `BIRTHDAY_AUTO` LeaveGrant가 `/leaves/me`와 `/leaves/me/requests/new` 맞춤휴가 선택지에 표시된다.
  - 실패 시 확인할 것: LeaveGrant effectiveFrom/expiresAt, remainingAmount, LeaveType `BIRTHDAY_HALF_DAY` 활성화 상태.

- [ ] 생일 반차 요청 후 승인/반려/철회/승인취소 수량을 확인한다.
  - 기대 결과: 연차 잔여는 차감하지 않고 LeaveGrant pendingAmount/usedAmount/remainingAmount만 전환된다.
  - 실패 시 확인할 것: LeaveRequestGrantUsage, custom grant request transaction, LeaveLedger PENDING/USED/REJECTED/WITHDRAWN/CANCELLED.

## LeaveLedger

- [ ] `pnpm leave:ledger:validate`를 실행한다.
  - 기대 결과: issues found 0이 출력된다.
  - 실패 시 확인할 것: 중복 idempotencyKey, 음수 pending/used/remaining.

- [ ] 관리자 휴가 히스토리와 직원 내 휴가 화면을 비교한다.
  - 기대 결과: 장부 기준 잔여 계산이 일치한다.
  - 실패 시 확인할 것: `calculateLeaveLedgerBalance`, legacy balance fallback.

- [ ] 지급/요청/철회/승인/반려/취소/소멸 이벤트를 확인한다.
  - 기대 결과: GRANTED, PENDING, USED, WITHDRAWN, REJECTED, CANCELLED, EXPIRED가 중복 없이 기록된다.
  - 실패 시 확인할 것: source별 idempotencyKey.

## 연차 정책·촉진·소멸

- [ ] OWNER가 `/admin/leaves/annual-policy`에 접근한다.
  - 기대 결과: 회계일 1월 1일, 반차 단위, 당겨쓰기 미허용 설정이 표시된다.
  - 실패 시 확인할 것: AnnualLeavePolicy seed.

- [ ] `pnpm jobs:schedule-annual-promotion-notices -- --dry-run`을 실행한다.
  - 기대 결과: 기준 연도, 대상자, 생성/건너뜀 수가 출력된다.
  - 실패 시 확인할 것: 입사일, 잔여 연차, policy promotion 설정.

- [ ] 직원이 `/leaves/me/use-plan`에서 사용계획을 제출한다.
  - 기대 결과: 수량 직접 입력 없이 시작일/종료일과 사용 형태로 제출하며, SUBMITTED 상태가 되고 OWNER 화면에서 확인된다.
  - 실패 시 확인할 것: 기간 자동 계산, 과거 날짜, 반차 단일 날짜 제한, 중복 날짜 검증.

- [ ] 사용계획 자동 계산을 확인한다.
  - 기대 결과: 종일 기간은 토요일/일요일/회사 휴일을 제외해 계산되고, 오전/오후 반차는 0.5일로 계산된다.
  - 실패 시 확인할 것: `calculateAnnualUsePlanItemAmount`, CompanyHoliday 조회, 클라이언트/서버 재계산 일치.

- [ ] 사용계획 제출 후 휴가 요청과 장부를 확인한다.
  - 기대 결과: 사용계획 제출만으로 LeaveRequest가 생성되지 않고 LeaveLedger도 차감되지 않는다.
  - 실패 시 확인할 것: `/leaves/me/use-plan` action, LeaveLedger create 경로, 휴가 요청 목록.

- [ ] `pnpm jobs:expire-annual-leaves -- --dry-run`을 실행한다.
  - 기대 결과: 실제 소멸 전 대상자와 수량이 출력된다.
  - 실패 시 확인할 것: expirationDate, ledger remaining 계산.

## 증명자료

- [ ] 예비군 휴가를 증명자료 없이 요청한다.
  - 기대 결과: REQUIRED_BEFORE_REQUEST 오류가 표시된다.
  - 실패 시 확인할 것: LeaveTypeDefinition attachmentPolicy.

- [ ] 병가를 증명자료 없이 요청한다.
  - 기대 결과: 요청은 생성되고 증명자료 제출 필요 상태가 표시된다.
  - 실패 시 확인할 것: REQUIRED_AFTER_REQUEST 상태 계산.

- [ ] 직원이 요청 상세에서 증명자료를 제출한다.
  - 기대 결과: private upload 경로에 저장되고 상태가 SUBMITTED가 된다.
  - 실패 시 확인할 것: MIME type, 10MB 제한, storage provider.

- [ ] OWNER/담당 LEAD가 다운로드하고 담당 범위 밖 사용자가 다운로드를 시도한다.
  - 기대 결과: 권한 있는 사용자는 다운로드 가능, 권한 없는 사용자는 차단된다.
  - 실패 시 확인할 것: `/api/leave-attachments/[attachmentId]/download` 권한 검증.

- [ ] 승인권자가 증명자료 승인/반려/재제출 요청을 수행한다.
  - 기대 결과: 상태, AuditLog, Notification이 갱신된다.
  - 실패 시 확인할 것: reviewComment 필수 여부.

## 휴가 승인 정책

- [ ] OWNER가 승인 정책을 생성/수정/비활성화한다.
  - 기대 결과: OWNER만 가능하다.
  - 실패 시 확인할 것: approval policy actions의 OWNER guard.

- [ ] 휴가 유형에 자동 승인 정책을 연결하고 요청한다.
  - 기대 결과: 요청이 APPROVED로 생성되고 Ledger USED가 기록된다.
  - 실패 시 확인할 것: `shouldAutoApproveLeaveRequest`, grant 차감.

- [ ] OWNER/TEAM_LEAD/TEAM_LEAD_OR_OWNER/CUSTOM_USER 정책을 각각 검수한다.
  - 기대 결과: 정책별 승인자만 승인 가능하고 자기 승인은 차단된다.
  - 실패 시 확인할 것: approver resolver, LEAD scope.

- [ ] 증명자료 확인 후 승인 정책을 검수한다.
  - 기대 결과: attachmentStatus가 ACCEPTED가 아니면 승인 차단된다.
  - 실패 시 확인할 것: `assertAttachmentRequirementForApproval`.

## 휴가 캘린더

- [ ] OWNER, LEAD, MANAGER가 `/leaves/calendar`에 접근한다.
  - 기대 결과: 역할별 범위에 맞는 휴가만 표시된다.
  - 실패 시 확인할 것: calendar server action/helper 권한 필터.

- [ ] EXTERNAL_PARTNER가 캘린더 접근을 시도한다.
  - 기대 결과: 접근 권한 없음이 표시된다.
  - 실패 시 확인할 것: route access guard.

- [ ] PUBLIC_WITH_TYPE, PUBLIC_AS_LEAVE, PRIVATE_TO_APPROVERS를 확인한다.
  - 기대 결과: 유형 표시, `휴가` 표시, 비공개 숨김 정책이 적용된다.
  - 실패 시 확인할 것: LeaveType visibility, title formatter.

- [ ] PENDING 휴가와 반차 오전/오후 표시를 확인한다.
  - 기대 결과: PENDING은 본인/승인권자에게만 표시되고 반차는 오전/오후가 표시된다.
  - 실패 시 확인할 것: status filter, halfDayPeriod label.

- [ ] 캘린더 DTO를 확인한다.
  - 기대 결과: 휴가 사유, 증명자료, 반려 사유가 포함되지 않는다.
  - 실패 시 확인할 것: calendar DTO allowlist.

## 관리자 리포트와 CSV

- [ ] OWNER가 `/admin/reports`와 각 리포트에 접근한다.
  - 기대 결과: 휴가 사용, 장부, 지급, 촉진, 증명자료, 온보딩, 프로필 확인 리포트가 표시된다.
  - 실패 시 확인할 것: OWNER guard, report helper query.

- [ ] CSV export를 실행한다.
  - 기대 결과: UTF-8 BOM, CSV escaping, injection 방어, REPORT_EXPORTED AuditLog가 적용된다.
  - 실패 시 확인할 것: `generateCsvReport`, `sanitizeReportRow`.

- [ ] LEAD가 `/admin/reports`에 접근한다.
  - 기대 결과: 담당 팀과 하위 팀 범위의 휴가/직원 요약만 보이고 보안/감사 요약과 CSV export는 보이지 않는다.

- [ ] MANAGER/EXTERNAL_PARTNER가 리포트 또는 export에 접근한다.
  - 기대 결과: 접근이 차단된다.
  - 실패 시 확인할 것: report page/export route guard.

- [ ] CSV 내용을 확인한다.
  - 기대 결과: 주민번호, 계좌번호, token/tokenHash/passwordHash, fileKey/private path가 없다.
  - 실패 시 확인할 것: report allowlist.

## 알림센터와 Job

- [ ] 사용자가 `/notifications`에 접근한다.
  - 기대 결과: 자기 알림만 표시된다.
  - 실패 시 확인할 것: notification query의 userId 조건.

- [ ] 알림 읽음과 모두 읽음을 실행한다.
  - 기대 결과: readAt이 갱신되고 타인 알림은 변경되지 않는다.
  - 실패 시 확인할 것: notification action의 userId 조건.

- [ ] OWNER가 `/admin/jobs`에 접근한다.
  - 기대 결과: JobRun 목록과 상세가 표시된다.
  - 실패 시 확인할 것: OWNER guard, JobRun table.

- [ ] 안전한 dry-run job을 실행한다.
  - 기대 결과: JobRun이 기록되고 summary에 민감정보가 없다.
  - 실패 시 확인할 것: `runJobWithTracking`, summary sanitizer.

- [ ] cron endpoint가 구현된 경우 secret 없이 호출한다.
  - 기대 결과: 401 또는 cron disabled 오류가 반환된다.
  - 실패 시 확인할 것: `assertCronRequestAuthorized`, `CRON_SECRET`.
  - 현재 상태: `/api/cron/*` route는 없으며 운영은 CLI Job 중심이다.

## 보안·권한

- [ ] MANAGER가 타인 HR 정보와 타인 첨부에 접근한다.
  - 기대 결과: 접근이 차단된다.
  - 실패 시 확인할 것: HR query/action guard, attachment access helper.

- [ ] LEAD가 담당 범위 밖 휴가 승인/첨부 다운로드를 시도한다.
  - 기대 결과: 접근이 차단된다.
  - 실패 시 확인할 것: descendant team calculation.

- [ ] AuditLog, Notification, JobRun summary를 확인한다.
  - 기대 결과: 민감정보 원문은 `[민감정보 숨김]` 또는 집계값으로만 표시된다.
  - 실패 시 확인할 것: sanitize helper 적용 여부.

- [ ] 첨부파일 public 접근을 시도한다.
  - 기대 결과: public URL로 접근할 수 없다.
  - 실패 시 확인할 것: storage root, Next public directory.

## 반응형 UI

- [ ] 모바일에서 휴가 관리 설정 탭을 확인한다.
  - 기대 결과: `휴가 유형 관리`, `승인 정책`, `휴가 지급`, `생일 반차 설정`, `연차 정책 설정`, `연차 촉진 관리`, `회사 휴일 관리` 탭이 한 글자씩 세로로 깨지지 않고 가로 스크롤로 이동할 수 있다.
  - 실패 시 확인할 것: `/admin/leaves/settings` 탭 wrapper의 `overflow-x-auto`, 탭 버튼의 `shrink-0`, `whitespace-nowrap`, `break-keep`.

- [ ] 모바일에서 휴가 유형 목록을 확인한다.
  - 기대 결과: PC용 넓은 테이블 대신 카드형 목록이 표시되고, 각 카드에서 휴가명/코드/구분/사용/유급/부여 방식/증명자료/연차 차감/수정 버튼을 확인할 수 있다.
  - 실패 시 확인할 것: `/admin/leaves/types`의 모바일 카드 영역, PC 테이블의 `hidden md:block` 처리.

- [ ] 모바일에서 휴가 유형 생성/수정 form을 확인한다.
  - 기대 결과: form이 1열로 표시되고 input/select/button이 화면 밖으로 벗어나지 않는다.
  - 실패 시 확인할 것: form wrapper `max-w-full`, input/select `w-full min-w-0`, 버튼 영역 `flex-col sm:flex-row`.

- [ ] PC에서 휴가 유형 관리를 확인한다.
  - 기대 결과: 기존처럼 넓은 테이블이 유지되고, 컬럼명은 세로로 깨지지 않으며 필요한 경우 테이블 내부만 가로 스크롤된다.
  - 실패 시 확인할 것: table `min-w-*`, wrapper `overflow-x-auto`, th/td `whitespace-nowrap break-keep`.

- [ ] 모든 로그인 후 페이지 우측 상단에 알림 아이콘이 표시된다.
  - 기대 결과: `/dashboard`, `/leaves/me`, `/admin/*` 등 protected layout 화면에서 알림센터 아이콘이 우측 상단에 보인다.
  - 실패 시 확인할 것: `(app)/layout.tsx`, `NotificationBell`, 현재 사용자 세션.

- [ ] 읽지 않은 알림이 있으면 빨간 동그라미가 표시되고 아이콘이 진동한다.
  - 기대 결과: unread count가 1 이상이면 badge와 `animate-bell-shake`가 적용된다.
  - 실패 시 확인할 것: `countUnreadNotifications`, Notification readAt, prefers-reduced-motion 설정.

- [ ] 알림 아이콘을 클릭한다.
  - 기대 결과: `/notifications` 알림센터로 이동한다.
  - 실패 시 확인할 것: Link href, protected route 접근 권한.

- [ ] 휴가 캘린더에서 연차와 반차 색상을 확인한다.
  - 기대 결과: 연차는 파란색, 기본 반차는 주황색으로 표시된다.
  - 실패 시 확인할 것: `getLeaveCalendarEventColorClass`, event.leaveTypeCode.

- [ ] 공개 범위가 제한된 휴가 색상을 확인한다.
  - 기대 결과: `PUBLIC_AS_LEAVE` 또는 권한 없는 비공개 휴가는 중립색으로 표시되어 실제 유형을 유추할 수 없다.
  - 실패 시 확인할 것: calendar DTO의 `isPrivate`, `leaveTypeCode` 노출 조건.

- [ ] PC 1440px/1280px에서 관리자 화면을 확인한다.
  - 기대 결과: 사이드바와 본문이 겹치지 않고, 넓은 표는 컬럼명이 읽히는 상태로 표시된다.
  - 실패 시 확인할 것: app layout `min-w-0`, table `min-width`, table wrapper `overflow-x-auto`.

- [ ] 모바일 430px/390px/360px에서 휴가 유형 관리 화면을 확인한다.
  - 기대 결과: 한글 컬럼명이 한 글자씩 세로로 깨지지 않고, 표 영역만 좌우 스크롤된다.
  - 실패 시 확인할 것: `/admin/leaves/types` table wrapper, `break-keep`, `whitespace-nowrap`.

- [ ] 모바일에서 휴가 유형 생성/수정 form을 확인한다.
  - 기대 결과: 입력 form은 1열로 표시되고, 버튼과 입력창이 화면 밖으로 벗어나지 않는다.
  - 실패 시 확인할 것: form grid `grid-cols-1`, input/select `w-full`, 수정 form 최소 폭과 스크롤 영역.

- [ ] 모바일에서 직원별 휴가 보유 현황, 맞춤휴가 지급, 관리자 리포트 표를 확인한다.
  - 기대 결과: 전체 body가 밀리지 않고 각 표 내부에서만 가로 스크롤된다.
  - 실패 시 확인할 것: 해당 table wrapper `overflow-x-auto`, table `min-w-*`.

- [ ] 태블릿 768px~1024px에서 휴가 정책/생일 반차/승인 정책 form을 확인한다.
  - 기대 결과: form이 1~2열로 정리되고, 4열 고정으로 인한 overflow가 없다.
  - 실패 시 확인할 것: form grid breakpoint `md:grid-cols-2`, `xl:grid-cols-4`.

## 최종 확인

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`를 실행한다.
  - 기대 결과: 모두 통과한다.
  - 실패 시 확인할 것: 최근 변경 파일과 테스트 로그.

- [ ] `pnpm preflight`와 주요 job dry-run을 실행한다.
  - 기대 결과: preflight는 통과하고 dry-run은 대상/결과 요약을 출력한다.
  - 실패 시 확인할 것: env, DB, seed, JobRun.

- [ ] `docs/v2-rehearsal-report.md`를 최신 결과로 갱신한다.
  - 기대 결과: 실제 사용 가능 여부와 남은 blocker가 명확하다.
  - 실패 시 확인할 것: 실행 명령 결과와 미검수 시나리오.

## 3차 모바일 UX Smoke Test

- [ ] 모바일 390px에서 `/login`에 접속한다.
  - 기대 결과: 로그인 card가 화면 밖으로 벗어나지 않고, 입력칸과 자동 로그인 유지 영역을 터치하기 쉽다.
  - 실패 시 확인할 것: login page shell, input `w-full`, checkbox label wrapping.
- [ ] 모바일 390px에서 `/invitations/accept` 또는 `/i/[shortToken]` 가입 화면에 접속한다.
  - 기대 결과: 초대 정보와 가입 인증 코드 입력 form이 1열로 표시되고 이메일/긴 값이 화면 밖으로 넘치지 않는다.
  - 실패 시 확인할 것: invitation accept page, signup form input width, summary `break-all`.
- [ ] 모바일 390px에서 `/leaves/me`를 확인한다.
  - 기대 결과: 주요 버튼은 한 줄에 눌기 쉬운 크기로 표시되고, 긴 표는 내부 영역에서만 가로 스크롤된다.
  - 실패 시 확인할 것: leave ledger/request table wrapper `overflow-x-auto`.
- [ ] 모바일 390px에서 `/leaves/me/requests/new`를 확인한다.
  - 기대 결과: 휴가 유형, 날짜, 반차, 사유, 첨부 입력이 1열로 정리되고 제출 버튼이 화면 폭에 맞는다.
  - 실패 시 확인할 것: `LeaveRequestForm` input/select/textarea `w-full min-w-0`.
- [ ] 모바일 390px에서 `/admin/leaves/settings`와 `/admin/leaves/types`를 확인한다.
  - 기대 결과: 설정 탭이 가로 스크롤되고 한글이 세로로 깨지지 않으며, 휴가 유형 목록은 모바일 카드 또는 내부 스크롤로 표시된다.
  - 실패 시 확인할 것: tab `whitespace-nowrap break-keep shrink-0`, table/card responsive 분기.
- [ ] 모바일 390px에서 `/notifications`를 확인한다.
  - 기대 결과: 필터는 가로 스크롤되고 알림 목록은 카드형으로 표시된다.
  - 실패 시 확인할 것: notifications mobile card renderer, filter `min-w-max`.
- [ ] 모바일과 PC에서 `/leaves/calendar`를 확인한다.
  - 기대 결과: 연차는 파란색, 반차는 주황색, 유형 숨김 휴가는 중립색으로 표시된다.
  - 실패 시 확인할 것: `getLeaveCalendarEventColorClass`, calendar DTO `isPrivate`.
- [ ] 모든 protected page 우측 상단 알림 아이콘을 확인한다.
  - 기대 결과: 읽지 않은 알림이 있으면 빨간 badge와 진동 animation이 보이고, 클릭하면 `/notifications`로 이동한다.
  - 실패 시 확인할 것: protected layout, `NotificationBell`, unread count.

## 미승인 휴가 자동 확정 Smoke Test

- [ ] 직원이 내일 또는 기준일에 시작하는 연차/반차 휴가를 요청한다.
  - 기대 결과: 요청 상태가 `PENDING`이고 승인 대기 수량이 반영된다.
  - 실패 시 확인할 것: 휴가 잔여, 중복 휴가, 승인 정책, 증명자료 정책.
- [ ] `pnpm jobs:auto-confirm-past-start-leaves -- --date=YYYY-MM-DD --dry-run`을 실행한다.
  - 기대 결과: 자동 확정 대상 수가 출력되고 DB 변경은 없다.
  - 실패 시 확인할 것: package script, DB 연결, ApprovalPolicy 자동 확정 설정.
- [ ] `pnpm jobs:auto-confirm-past-start-leaves -- --date=YYYY-MM-DD`를 실행한다.
  - 기대 결과: 대상 요청이 `APPROVED`로 변경되고 `autoConfirmedAt`, `approvalSource=AUTO_START_DATE`가 저장된다.
  - 실패 시 확인할 것: LeaveRequest 상태, 사용자 ACTIVE 여부, 증명자료 확인 필요 여부.
- [ ] 직원 내 휴가 상세와 승인 상세를 확인한다.
  - 기대 결과: 승인 완료 상태에 자동 확정 표시와 시스템 자동 확정 승인자가 보인다.
  - 실패 시 확인할 것: generated Prisma client, 상세 페이지 조회 필드.
- [ ] LeaveLedger와 잔여를 확인한다.
  - 기대 결과: `USED` + `LEAVE_AUTO_CONFIRM` 장부가 1건 생성되고 잔여가 중복 차감되지 않는다.
  - 실패 시 확인할 것: `auto-confirm-used:{leaveRequestId}` idempotencyKey, 기존 PENDING ledger.
- [ ] Notification과 AuditLog를 확인한다.
  - 기대 결과: 직원에게 `LEAVE_AUTO_CONFIRMED` 알림이 생성되고 `LEAVE_REQUEST_AUTO_CONFIRMED_AFTER_START_DATE` 감사 로그가 남는다.
  - 실패 시 확인할 것: NotificationType/AuditAction migration 적용 여부.
- [ ] 같은 job을 한 번 더 실행한다.
  - 기대 결과: 이미 승인된 요청은 skip되고 중복 ledger/중복 차감이 없다.
  - 실패 시 확인할 것: `status=PENDING`, `autoConfirmedAt=null`, ledger idempotency 조건.

## 초대 가입 인증 코드 Smoke Test

- [ ] OWNER가 직원 초대를 생성한다.
  - 기대 결과: 초대 링크와 가입 인증 코드가 생성 직후 화면에 표시된다.
  - 실패 시 확인할 것: `createEmployeeInvitation`, `createInvitationVerificationCodePayload`.
- [ ] 초대 목록을 확인한다.
  - 기대 결과: 인증 코드 원문은 보이지 않고 발급/사용/만료/잠김/재발급 필요 상태만 표시된다.
  - 실패 시 확인할 것: `/organization/invitations` 표시 로직.
- [ ] 직원이 초대 링크와 올바른 가입 인증 코드로 가입한다.
  - 기대 결과: 가입이 완료되고 인증 코드는 consumed 처리되어 재사용할 수 없다.
  - 실패 시 확인할 것: `acceptInvitationAction`, `verificationCodeConsumedAt`.
- [ ] 잘못된 가입 인증 코드를 5회 입력한다.
  - 기대 결과: 실패 횟수가 증가하고 최대 횟수 이후 잠김 상태가 된다.
  - 실패 시 확인할 것: `verificationCodeAttemptCount`, `verificationCodeMaxAttempts`.
- [ ] 초대를 재발급한다.
  - 기대 결과: 기존 초대 token/code는 폐기되고 새 링크와 새 코드가 한 번 표시된다.
  - 실패 시 확인할 것: `reissueInvitation`.

## 외부 알림 Smoke Test

- [ ] Vercel 또는 로컬 환경에 EMAIL_PROVIDER, RESEND_API_KEY, EMAIL_FROM, EXTERNAL_EMAIL_NOTIFICATIONS_ENABLED를 설정한다.
  - 기대 결과: `pnpm preflight`에서 외부 이메일 설정이 PASS 또는 의도한 WARN으로 표시된다.
  - 실패 시 확인할 것: production에서 EMAIL_PROVIDER=console 사용 여부, RESEND_API_KEY/EMAIL_FROM 누락.

- [ ] OWNER가 직원 초대 생성 시 `초대 이메일 발송`을 선택한다.
  - 기대 결과: 초대는 생성되고, 이메일 provider가 초대 링크와 가입 인증 코드를 발송한다.
  - 실패 시 확인할 것: 이메일 provider 환경변수, `INVITATION_EMAIL_FAILED` AuditLog. 초대 자체는 성공해야 한다.

- [ ] 직원이 휴가 요청을 생성한다.
  - 기대 결과: 승인권자에게 최소 정보만 포함된 휴가 요청 이메일이 발송된다.
  - 실패 시 확인할 것: 승인권자 email, `LEAVE_REQUESTED` Notification, 외부 dispatcher 로그.

- [ ] OWNER/LEAD가 휴가를 승인 또는 반려한다.
  - 기대 결과: 요청자에게 결과 이메일이 발송되고 반려 사유 원문은 이메일에 포함되지 않는다.
  - 실패 시 확인할 것: requester email, template 내용, AuditLog.

- [ ] 증명자료 재제출 요청을 수행한다.
  - 기대 결과: 직원에게 시스템 링크 중심의 재제출 요청 이메일이 발송된다.
  - 실패 시 확인할 것: 파일명/fileKey/private path가 이메일에 포함되지 않는지.

- [ ] 연차 촉진 알림 Job을 실행한다.
  - 기대 결과: 연차 사용계획 제출 안내 이메일이 발송된다.
  - 실패 시 확인할 것: `ANNUAL_LEAVE_PROMOTION` 또는 `ANNUAL_LEAVE_USE_PLAN_REMINDER` Notification.

- [ ] SLACK_NOTIFICATIONS_ENABLED=true와 SLACK_WEBHOOK_URL을 설정한 뒤 Job 실패 케이스를 만든다.
  - 기대 결과: Slack에 민감정보 없는 운영 실패 알림이 전송된다.
  - 실패 시 확인할 것: `EXTERNAL_SLACK_FAILED` AuditLog, webhook URL 설정.

- [ ] AuditLog를 확인한다.
  - 기대 결과: API key, Slack webhook URL, 초대 token, 가입 인증 코드 원문, codeHash/tokenHash가 저장되어 있지 않다.
  - 실패 시 확인할 것: `sanitizeAuditMetadata`, external notification metadata allowlist.
## 외부 캘린더 ICS 구독 smoke test

- [ ] `/leaves/calendar/settings`에서 내 휴가 캘린더 구독 링크를 생성한다.
  - 기대 결과: 생성 직후 ICS URL이 1회 표시된다.
  - 실패 시 확인할 것: 사용자 권한, DB migration, APP_BASE_URL.
- [ ] 생성된 URL을 브라우저에서 열어 `.ics` 응답을 확인한다.
  - 기대 결과: `BEGIN:VCALENDAR`와 승인 완료 휴가 `VEVENT`가 표시된다.
  - 실패 시 확인할 것: token hash, revokedAt, expiresAt, 사용자 상태.
- [ ] PENDING/REJECTED/CANCELLED/WITHDRAWN 휴가가 ICS에 없는지 확인한다.
  - 기대 결과: APPROVED 휴가만 포함된다.
  - 실패 시 확인할 것: ICS route의 status 필터.
- [ ] PUBLIC_AS_LEAVE 휴가가 “휴가”로만 표시되는지 확인한다.
  - 기대 결과: 민감 유형을 summary나 색상으로 유추할 수 없다.
  - 실패 시 확인할 것: 내부 캘린더 공개 범위 helper 재사용 여부.
- [ ] 구독 링크를 비활성화한 뒤 다시 접근한다.
  - 기대 결과: 404 응답이 반환된다.
  - 실패 시 확인할 것: revokedAt/isEnabled 검증.
## 보안 강화 smoke test

- [ ] OWNER가 직원 상세에서 일반 정보만 수정한다.
  - 기대 결과: 비밀번호 재입력 없이 저장된다.
- [ ] OWNER가 직원 역할을 변경하면서 비밀번호를 입력하지 않는다.
  - 기대 결과: 저장이 거부된다.
- [ ] OWNER가 직원 역할을 변경하면서 현재 비밀번호를 입력한다.
  - 기대 결과: 저장되고 AuditLog에 step-up 성공과 역할 변경이 기록된다.
- [ ] 마지막 OWNER를 비활성화하거나 OWNER 권한 제거를 시도한다.
  - 기대 결과: 서버에서 차단된다.
## 모바일 UX / 디자인 시스템 검수

- [ ] 390px 모바일 화면에서 `/login`에 접속한다.
  - 기대 결과: 로그인 카드가 화면 밖으로 벗어나지 않고 전화번호, 비밀번호, 자동 로그인 유지 체크박스, 로그인 버튼이 1열로 표시된다.
  - 실패 시 확인할 것: auth layout, input width, body horizontal overflow.
- [ ] 390px 모바일 화면에서 `/invitations/accept` 또는 `/i/[shortToken]` 가입 화면에 접속한다.
  - 기대 결과: 초대 요약 카드와 가입 인증 코드 입력 필드가 1열로 표시되고 버튼을 터치하기 쉽다.
  - 실패 시 확인할 것: invitation signup form, max-width, input min-width.
- [ ] 로그인 후 모든 protected page 우측 상단에 알림 아이콘이 표시되는지 확인한다.
  - 기대 결과: 읽지 않은 알림이 있으면 빨간 badge와 진동 애니메이션이 보이고, 클릭 시 `/notifications`로 이동한다.
  - 실패 시 확인할 것: AppShell, NotificationBell, unread count 조회.
- [ ] 모바일에서 `/admin/leaves/settings`와 `/admin/leaves/types`를 확인한다.
  - 기대 결과: 휴가 관리 탭이 가로 스크롤 탭으로 보이며 한글이 세로로 깨지지 않는다.
  - 실패 시 확인할 것: ResponsiveTabs, whitespace-nowrap, break-keep.
- [ ] 모바일에서 휴가 유형 목록을 확인한다.
  - 기대 결과: 모바일은 카드형 목록, PC는 table 형태로 표시된다.
  - 실패 시 확인할 것: MobileCardList, ResponsiveTable, table min-width.
- [ ] 모바일에서 `/leaves/me/requests/new`를 확인한다.
  - 기대 결과: 휴가 유형, 날짜, 반차 구분, 증명자료, 제출 버튼이 1열 흐름으로 표시된다.
  - 실패 시 확인할 것: LeaveRequestForm form grid, input width.
- [ ] 모바일에서 `/leaves/me/use-plan`을 확인한다.
  - 기대 결과: 사용계획 항목이 카드형으로 보이고 자동 계산 수량이 badge로 표시된다.
  - 실패 시 확인할 것: AnnualUsePlanForm layout, calculated amount rendering.
- [ ] `/leaves/calendar`에서 색상 표시를 확인한다.
  - 기대 결과: 연차는 파란색, 반차는 주황색, 생일 반차는 보라색 계열, 비공개/유형 숨김 휴가는 중립색으로 표시된다.
  - 실패 시 확인할 것: getLeaveCalendarEventColorClass, 공개 범위 처리.
## 보안 대시보드 / AuditLog

- [ ] OWNER가 `/admin/security`에 접근할 수 있다.
  - 기대 결과: 최근 CRITICAL/HIGH 이벤트와 로그인 차단, 권한 변경, export, 실패 Job 카드가 표시된다.
  - 실패 시 확인할 것: OWNER 권한, route policy, DB migration 적용 여부.
- [ ] MANAGER/LEAD는 `/admin/security`에 접근할 수 없다.
  - 기대 결과: 접근 권한 없음 화면으로 이동한다.
  - 실패 시 확인할 것: protected layout과 server guard.
- [ ] OWNER가 `/admin/audit-logs`에서 category/severity/action 필터를 사용할 수 있다.
  - 기대 결과: 필터 결과가 표시되고 metadata는 sanitize된 값만 보인다.
  - 실패 시 확인할 것: AuditLog category/severity migration, sanitize helper.
- [ ] AuditLog CSV export는 Step-up 재인증 없이는 실패한다.
  - 기대 결과: 403 또는 step-up-required 응답.
  - 실패 시 확인할 것: `/admin/audit-logs/export` route의 Step-up 검증.
- [ ] AuditLog CSV export 후 `AUDIT_LOG_EXPORTED` 로그가 남는다.
  - 기대 결과: CSV 내용 전체, token, tokenHash, secret은 AuditLog에 저장되지 않는다.
  - 실패 시 확인할 것: export route와 metadata sanitizer.

## 비활성 직원 영구 삭제 smoke test

- [ ] OWNER가 ACTIVE 직원 상세 화면을 연다.
  - 기대 결과: 직원 영구 삭제 Danger Zone이 표시되지 않거나 실행할 수 없다.
- [ ] OWNER가 직원을 비활성화한 뒤 상세 화면을 연다.
  - 기대 결과: Danger Zone과 삭제 영향 분석 건수가 표시된다.
- [ ] Step-up 비밀번호 없이 영구 삭제를 시도한다.
  - 기대 결과: 서버에서 거부되고 직원은 삭제되지 않는다.
- [ ] 확인 문구를 `DELETE`가 아닌 값으로 입력한다.
  - 기대 결과: 서버에서 거부되고 직원은 삭제되지 않는다.
- [ ] 올바른 Step-up 비밀번호와 `DELETE` 확인 문구로 삭제한다.
  - 기대 결과: 기록이 있으면 `DELETED` 상태로 익명화되고, 기록이 없으면 hard delete된다.
- [ ] 직원 목록 기본 조회를 확인한다.
  - 기대 결과: 삭제된 직원은 기본 목록에서 숨겨진다.
- [ ] 직원 목록 상태 필터에서 삭제됨 또는 전체를 선택한다.
  - 기대 결과: OWNER만 `삭제된 직원`을 확인할 수 있고 이메일/전화번호는 노출되지 않는다.
- [ ] 휴가/근태/AuditLog 이력을 확인한다.
  - 기대 결과: 업무 기록은 유지되고 직원명은 `삭제된 직원`으로 표시된다.
- [ ] AuditLog를 확인한다.
  - 기대 결과: `EMPLOYEE_DELETE_IMPACT_ANALYZED`, `EMPLOYEE_PERMANENT_DELETE_REQUESTED`, `EMPLOYEE_ANONYMIZED` 또는 `EMPLOYEE_HARD_DELETED`가 남고 개인정보/token/hash/fileKey가 없다.

## 모바일 반응형 UI 2차 보정 smoke test

- [ ] 360px/390px/430px에서 `/login`을 확인한다.
  - 기대 결과: 제목, 설명, 전화번호/비밀번호 입력, 자동 로그인 유지 체크박스, 로그인 버튼이 화면 밖으로 나가지 않는다.
  - 실패 시 확인할 것: 로그인 card max-width, input `w-full min-w-0`, 버튼 min-height.
- [ ] 360px/390px/430px에서 `/invitations/accept`를 확인한다.
  - 기대 결과: 초대 요약과 가입 인증 코드 입력 form이 1열로 표시되고 긴 이메일이 카드 밖으로 넘치지 않는다.
  - 실패 시 확인할 것: signup form label, summary card `break-words`, input width.
- [ ] 390px에서 `/notifications`를 확인한다.
  - 기대 결과: 알림 카드의 액션 버튼이 `상세 보기`, `읽음 처리` 같은 명확한 한국어로 표시되고 깨진 문자가 없다.
  - 실패 시 확인할 것: 알림 action label mapping, card button width.
- [ ] 390px에서 `/leaves/approvals`를 확인한다.
  - 기대 결과: 승인 요청 목록은 모바일 카드로 읽을 수 있고 승인/반려/상세 버튼이 화면 밖으로 나가지 않는다.
  - 실패 시 확인할 것: mobile card renderer, action button `w-full`, filter grid.
- [ ] 390px에서 `/admin/leaves/settings`와 `/admin/leaves/types`를 확인한다.
  - 기대 결과: 탭은 가로 스크롤되고 `휴가 유형 관리`, `승인 정책`, `생일 반차 설정`, `연차 정책 설정` 문구가 세로로 깨지지 않는다.
  - 실패 시 확인할 것: `ResponsiveTabs`, `whitespace-nowrap`, `break-keep`, `shrink-0`.
- [ ] 390px에서 `/admin/leaves/balances`를 확인한다.
  - 기대 결과: 직원별 휴가 보유 현황과 맞춤휴가 현황이 모바일 카드로 표시되고 이메일/팀/수량이 카드 밖으로 넘치지 않는다.
  - 실패 시 확인할 것: balance mobile card, `min-w-0`, `break-words`.
- [ ] 390px에서 `/leaves/me/use-plan`을 확인한다.
  - 기대 결과: 사용계획 항목은 시작일, 종료일, 사용 형태, 자동 계산 수량, 메모 순서로 1열 표시된다.
  - 실패 시 확인할 것: `AnnualUsePlanForm`, date input width, calculated amount badge.
- [ ] 390px에서 `/admin/reports`와 `/admin/security`를 확인한다.
  - 기대 결과: 카드 제목/설명이 자연스럽게 줄바꿈되고 `바로가기`, `고위험 AuditLog 전체 보기` 버튼이 잘리지 않는다.
  - 실패 시 확인할 것: card `min-w-0`, button `whitespace-nowrap`, description `break-keep`.
- [ ] 768px/1024px/1440px에서 같은 화면들을 확인한다.
  - 기대 결과: PC/태블릿에서는 기존 table과 카드 그리드 사용성이 유지된다.
  - 실패 시 확인할 것: breakpoint `md:block`, `md:hidden`, table `min-w-*`.

## 3차 릴리즈 후보 배포 후 smoke test

1. OWNER 로그인
   - 기대 결과: `/dashboard` 접근 가능.
2. 직원 초대 생성
   - 기대 결과: 단축 초대 URL과 1회용 가입 인증 코드가 생성 직후 표시됨.
3. 직원 가입
   - 기대 결과: 가입 인증 코드 검증 후 ACTIVE 직원 계정 생성.
4. 직원 휴가 요청
   - 기대 결과: 요청 상태가 PENDING 또는 정책에 따른 APPROVED로 표시됨.
5. OWNER 휴가 승인
   - 기대 결과: 휴가 상태와 잔여 수량, AuditLog가 갱신됨.
6. 직원 출근
   - 기대 결과: 근태 기능을 릴리즈에 포함한 경우 `/attendance`에서 출근 기록 생성.
   - 현재 주의: 2026-05-04 코드 기준 `/attendance` route가 확인되지 않아 근태는 릴리즈 blocker다.
7. 직원 퇴근
   - 기대 결과: 근태 기능을 릴리즈에 포함한 경우 퇴근 기록과 근무 시간이 표시됨.
8. 알림센터 확인
   - 기대 결과: 자기 알림만 표시되고 읽음 처리가 가능함.
9. 보안 대시보드 확인
   - 기대 결과: OWNER만 `/admin/security` 접근 가능.
10. AuditLog 확인
    - 기대 결과: 고위험 작업과 smoke test 관련 이벤트가 민감정보 없이 기록됨.
11. 모바일 주요 화면 확인
    - 기대 결과: `/login`, `/invitations/accept`, `/leaves/me`, `/leaves/me/requests/new`, `/notifications`, `/admin/leaves/settings`가 390px에서 사용 가능.
12. 비활성 직원 삭제/익명화 테스트
    - 기대 결과: ACTIVE 직원은 삭제 불가, 비활성 직원은 Step-up 후 hard delete 또는 익명화.
13. 캘린더 구독 링크 생성
    - 기대 결과: `/leaves/calendar/settings`에서 링크 생성 후 ICS 응답에 승인 완료 휴가만 포함.

## 직원 오픈 전 production smoke test

운영 URL:

```txt
https://interal-admin-app.vercel.app
```

2026-05-04 기준 기본 접근성은 HTTP 200과 title `Internal Ops MVP`로 확인했다. 아래 항목은 OWNER/직원 테스트 계정으로 운영자가 직접 수행한다.

1. OWNER 기본 흐름
   - OWNER 로그인
   - 대시보드 접근
   - 알림 아이콘 표시 확인
   - 직원 목록 접근
   - 조직/팀 관리 접근
   - 휴가 승인 요청 접근
   - AuditLog 접근
   - 보안 대시보드 접근

2. 직원 초대/가입 흐름
   - OWNER가 테스트 직원 초대 생성
   - 단축 초대 URL 생성 확인
   - 1회용 가입 인증 코드 생성 확인
   - 시크릿 브라우저에서 초대 URL 접속
   - 인증 코드 입력
   - 직원 가입 완료
   - 동일 인증 코드 재사용 실패 확인
   - 직원 로그인 확인

3. 휴가 요청/승인 흐름
   - 직원 계정으로 로그인
   - 내 휴가 현황 확인
   - 연차 요청
   - 승인 대기 상태 확인
   - OWNER 계정으로 승인 처리
   - 직원 화면에서 승인 완료 확인
   - 잔여 일수 정합성 확인
   - AuditLog 확인

4. 근태 흐름
   - 근태 기능을 이번 릴리즈에 포함한 경우 `/attendance`, `/attendance/history`, `/admin/attendance`를 확인한다.
   - 현재 릴리즈 후보 코드 기준 route가 확인되지 않았으므로, 근태 포함 시 P0 blocker로 다룬다.

5. 모바일 흐름
   - 모바일 실기기 또는 360px/390px/430px viewport에서 로그인, 초대 가입, 휴가 요청, 알림센터, 휴가 관리 설정을 확인한다.

6. 보안 흐름
   - MANAGER admin 접근 실패
   - LEAD 담당 범위 밖 승인 실패
   - Step-up 없이 고위험 작업 실패
   - 마지막 OWNER 보호 확인
   - AuditLog metadata에 민감정보가 없는지 확인
# 휴가 사용내역 엑셀 import

- [ ] OWNER가 `/admin/leaves/import`에 접근할 수 있다.
- [ ] MANAGER/LEAD는 import 화면에 접근할 수 없다.
- [ ] OWNER가 `엑셀 템플릿 다운로드`를 실행한다.
  - 기대 결과: ACTIVE 내부 직원과 현재 휴가 현황 참고값이 포함된 `.xlsx`가 다운로드되고 민감 HR 정보는 포함되지 않는다.
- [ ] MANAGER/LEAD가 템플릿 다운로드 URL에 직접 접근한다.
  - 기대 결과: 접근이 차단된다.
- [ ] 월별 연차 사용 내역 `.xlsx` 업로드 후 미리보기가 생성된다.
- [ ] `직원명/회사이메일/휴대폰/기준연도/총 부여/사용연차/잔여연차`처럼 alias 컬럼을 쓰는 구성원 휴가 현황 파일도 감지된다.
- [ ] 잔여 연차가 0.5일 단위가 아니거나 같은 직원+기준연도 행이 중복되면 오류로 표시된다.
- [ ] 휴가 사용 상세 내역 `.xlsx` 업로드 후 미리보기가 생성된다.
- [ ] 미매칭/UNKNOWN/오류 행이 있으면 최종 반영이 차단된다.
- [ ] Step-up 없이 최종 반영이 실패한다.
- [ ] Step-up 후 검수 완료 batch가 반영된다.
- [ ] 반영 후 LeaveLedger와 AuditLog에 import 이력이 남는다.
- [ ] 엑셀 원본 파일, token, secret, 민감 row 전체가 AuditLog에 저장되지 않는다.
- [ ] 반영 완료 후 batch 상세 화면에서 LeaveRequest/LeaveLedger/LeaveAdjustment 생성 수가 표시된다.
- [ ] 월별 파일 반영 후 엑셀 잔여와 시스템 잔여 차이가 표시된다.
- [ ] 취소 상태 row는 사용량으로 차감되지 않는다.
- [ ] APPLIED 월별 batch에서 직원별 엑셀 잔여와 시스템 잔여 reconciliation이 표시된다.
- [ ] 차이가 있는 직원은 OWNER Step-up 후 `차이값으로 보정`을 실행할 수 있다.
- [ ] 보정은 LeaveAdjustment와 LeaveLedger `ADJUSTED` 이벤트로 남고 기존 ledger를 삭제하지 않는다.
- [ ] 같은 batch/year/userId에 중복 보정이 차단된다.
- [ ] APPLIED 월별 batch 상세에서 `업로드 반영 취소`를 Step-up 없이 실행한다.
  - 기대 결과: Step-up 필요 오류가 표시되고 batch는 변경되지 않는다.
- [ ] Step-up 후 `업로드 반영 취소`를 실행한다.
  - 기대 결과: batch 상태가 `REVERSED`가 되고, 기존 기록 삭제 없이 반대 방향 LeaveAdjustment와 LeaveLedger `IMPORT_REVERSE_ADJUSTMENT`가 생성된다.
- [ ] REVERSED batch를 다시 취소하려고 시도한다.
  - 기대 결과: 재취소가 차단되고 AuditLog에 차단 요약만 남는다.

## 휴가 Import 운영 리허설

- [ ] 실제 개인정보가 없는 가명 fixture 또는 제한된 운영 샘플로 preview-only 업로드를 수행한다.
- [ ] 월별 연차 사용 내역 파일에서 header row, 잔여 연차, 월별 사용량이 정상 파싱된다.
- [ ] 휴가 사용 상세 내역 파일에서 header row 자동 탐색과 Excel serial date 변환이 정상 동작한다.
- [ ] 미매칭 row, UNKNOWN row, 중복 의심 row가 미리보기에서 구분된다.
- [ ] Step-up 없이 최종 반영이 실패한다.
- [ ] Step-up 후 소수 row 반영을 수행하고 batch 재반영이 차단되는지 확인한다.
- [ ] 반영 후 직원별 휴가 현황과 batch reconciliation을 비교한다.
- [ ] AuditLog에 import 요약만 남고 엑셀 원문, token, secret, 민감 row 전체가 저장되지 않는다.
- [ ] 운영자는 [휴가 Import 운영 리허설 Runbook](./leave-import-operation-runbook.md)을 따라 검수한다.
- [ ] 최종 반영 전 [휴가 Import 최종 반영 전 체크리스트](./leave-import-pre-apply-checklist.md)를 완료한다.

## 휴가 Import 최종 운영 QA

### 월별 연차 사용 내역

- [ ] OWNER로 로그인한다.
- [ ] `/admin/leaves/import`에 접근한다.
- [ ] 월별 연차 사용 내역 파일을 업로드한다.
- [ ] header 감지 결과를 확인한다.
- [ ] 직원 매칭 결과를 확인한다.
- [ ] 엑셀 잔여와 시스템 잔여를 비교한다.
- [ ] 차이값을 확인한다.
- [ ] Step-up 없이 반영이 실패하는지 확인한다.
- [ ] Step-up 후 반영이 성공하는지 확인한다.
- [ ] 구성원 휴가 현황에서 잔여 연차를 확인한다.

### 휴가 사용 상세 내역

- [ ] 상세 휴가 사용 내역 파일을 업로드한다.
- [ ] header row 자동 감지를 확인한다.
- [ ] Excel serial date와 문자열 날짜 변환을 확인한다.
- [ ] 휴가 유형 매핑을 확인한다.
- [ ] 상태 매핑을 확인한다.
- [ ] UNKNOWN row가 자동 반영되지 않는지 확인한다.
- [ ] 휴가취소 row가 used로 차감되지 않는지 확인한다.
- [ ] 승인대기 row가 pending으로 반영되는지 확인한다.
- [ ] Step-up 후 반영한다.
- [ ] LeaveRequest와 LeaveLedger 생성 결과를 확인한다.

### 반영 후 검증

- [ ] APPLIED batch reconciliation을 확인한다.
- [ ] 직원별 엑셀 잔여와 시스템 잔여를 비교한다.
- [ ] 차이 발생 직원을 확인한다.
- [ ] 필요한 경우 Step-up 후 차이값으로 보정한다.
- [ ] 보정 후 차이가 0인지 확인한다.
- [ ] AuditLog에 import, reconciliation, adjustment 기록이 남는지 확인한다.
- [ ] AuditLog에 엑셀 row 원문 전체, token, secret, 주민등록번호, 계좌번호, fileKey가 없는지 확인한다.

## 구성원 휴가 현황 권한 smoke test

- [ ] OWNER가 `/admin/leaves/balances`에 접근한다.
  - 기대 결과: 전체 ACTIVE 내부 직원의 휴가 보유, 승인 대기, 사용 완료, 잔여 현황이 표시된다.
- [ ] OWNER가 직원 상세 `/admin/leaves/balances/[userId]`에 접근한다.
  - 기대 결과: 연차, 맞춤휴가, 생일 반차, 최근 휴가 요청, LeaveLedger 요약이 표시되고 민감 HR 정보는 없다.
- [ ] LEAD가 `/admin/leaves/balances`에 접근한다.
  - 기대 결과: 자신이 담당하는 팀과 하위 팀 구성원만 표시된다.
- [ ] LEAD가 담당 범위 밖 직원 상세 URL에 직접 접근한다.
  - 기대 결과: 접근 권한 없음으로 차단된다.
- [ ] MANAGER가 `/admin/leaves/balances`에 접근한다.
  - 기대 결과: 접근 권한 없음으로 차단되고, 본인 현황은 `/leaves/me`에서 확인한다.
- [ ] EXTERNAL_PARTNER가 `/admin/leaves/balances` 또는 `/leaves/me`에 접근한다.
  - 기대 결과: 내부 휴가 현황 접근이 차단된다.
- [ ] OWNER 화면과 LEAD 화면에서 같은 담당 직원의 잔여 수량을 비교한다.
  - 기대 결과: LeaveLedger 기반 잔여 계산이 동일하다.

## 휴가 현황 조회/엑셀 업로드 배포 후 Smoke Test

상세 체크리스트는 `docs/leave-balance-import-post-deploy-smoke-test.md`를 따른다.

- [ ] OWNER 로그인
- [ ] OWNER가 전체 구성원 휴가 현황 조회
- [ ] LEAD가 담당 조직/하위 조직 휴가 현황 조회
- [ ] LEAD가 담당 범위 밖 직원 URL 직접 접근 시 차단
- [ ] MANAGER가 구성원 휴가 현황 접근 시 차단
- [ ] MANAGER가 `/leaves/me`에서 본인 휴가 확인
- [ ] EXTERNAL_PARTNER 내부 휴가 현황 접근 차단
- [ ] OWNER 엑셀 템플릿 다운로드
- [ ] 템플릿에 민감정보 없음
- [ ] OWNER 테스트 엑셀 업로드
- [ ] 미리보기에서 직원 매칭과 오류 행 확인
- [ ] Step-up 없이 반영 실패
- [ ] Step-up 후 반영 성공
- [ ] LeaveAdjustment/LeaveLedger 조정 확인
- [ ] batch 재반영 차단
- [ ] Step-up 후 반영 취소 성공
- [ ] 반영 취소가 역조정으로 기록됨
- [ ] AuditLog에 민감정보 없이 기록됨
- [ ] 모바일에서 구성원 휴가 현황과 import 화면 확인

## 1년 미만 회계연도 비례 연차 Smoke Test

- [ ] 2025-09-01 입사자, 2026-05-01 기준, 2026 회계연도에서 전년도 재직일수가 122일인지 확인한다.
- [ ] 같은 케이스에서 `15 * 122 / 365 = 5.01`이 반차 올림으로 5.5일이 되는지 확인한다.
- [ ] 사용 완료 3일, 승인 대기 0일이면 총 부여 13.5일, 조정 0일, 잔여 10.5일인지 확인한다.
- [ ] 2019-08-19 입사자와 2023-06-30 입사자의 잔여가 이번 패치 전후로 바뀌지 않는지 확인한다.
- [ ] 1년 이상 직원에게 1년 미만 월차 11일 또는 입사 1년차 연차 15일이 반복 표시되지 않는지 확인한다.
- [ ] 사용 완료와 조정이 분리되어 표시되는지 확인한다.
- [ ] 운영 DB에서는 먼저 `pnpm.cmd jobs:audit-fix-leave-integrity -- --dry-run --year=2026`만 실행한다.

## Secret/Token 노출 Smoke Test

- [ ] Git tracked 파일에 `.env`, `.vercel`, `private/`, 실제 엑셀/CSV, key 파일이 없는지 확인
- [ ] 문서와 README에 실제 DB URL/API key/webhook URL이 없는지 확인
- [ ] AuditLog metadata에 token, tokenHash, passwordHash, secret, fileKey가 없는지 확인
- [ ] Notification/JobRun metadata에 token/secret 원문이 없는지 확인
- [ ] OWNER 권한 변경, 직원 비활성화/삭제, 초대 재발급, report export, leave import 반영/취소가 Step-up 없이 실패하는지 확인
- [ ] MANAGER/LEAD/EXTERNAL_PARTNER가 OWNER 전용 API 또는 화면에 직접 접근해도 차단되는지 확인
- [ ] cron endpoint가 `CRON_SECRET` 없이 실행되지 않는지 확인
## 회계연도 휴가 소멸일 smoke test

- [ ] 신규 연차/연차성 조정 지급분의 만료일이 지급 연도 12월 31일로 표시되는지 확인한다.
  - 예: 2026년 지급분은 2026-12-31, 2027년 지급분은 2027-12-31.
- [ ] 생일 반차의 사용 가능 기간이 생일 기준 정책 기간으로 유지되는지 확인한다.
- [ ] 2026년 지급분이 2027년 구성원 휴가 현황 잔여에 포함되지 않는지 확인한다.
- [ ] 운영 DB 보정 전 dry-run을 먼저 실행한다.
  - `pnpm jobs:fix-fiscal-year-leave-expirations -- --dry-run --year=2026`
- [ ] dry-run 결과를 확인한 뒤에만 apply를 실행한다.
  - `pnpm jobs:fix-fiscal-year-leave-expirations -- --apply --year=2026`
- [ ] JobRun/AuditLog에 실행 요약이 남고 직원 개인정보 원문이 출력되지 않는지 확인한다.
## 휴가 import Step-up UI smoke test

- [ ] OWNER로 `/admin/leaves/import/[batchId]` 미리보기 화면에 접근한다.
- [ ] `Step-up 후 최종 반영` 버튼 클릭 시 비밀번호 재인증 모달이 표시된다.
- [ ] 빈 비밀번호 제출 시 오류 메시지가 표시되고 반영되지 않는다.
- [ ] 잘못된 비밀번호 제출 시 오류 메시지가 표시되고 반영되지 않는다.
- [ ] 올바른 비밀번호 제출 후 import 최종 반영이 이어서 실행된다.
- [ ] APPLIED 월별 batch의 `업로드 반영 취소` 버튼도 Step-up 모달을 거친다.
- [ ] 잔여 차이 `차이값 보정` 버튼도 Step-up 모달을 거친다.
- [ ] 서버 action 직접 호출 또는 Step-up 만료 상태에서는 반영/보정/취소가 실패한다.
## 휴가 import 기준연도 smoke test

- [ ] `/admin/leaves/import` 업로드 화면에서 기준연도 기본값이 현재 운영 연도로 표시된다.
- [ ] 2026년 파일 업로드 시 미리보기의 잔여 연차 정합성 검증에 `기준연도 2026`이 표시된다.
- [ ] 직원 입사일이 2019년이어도 batch 기준연도가 2019로 바뀌지 않는다.
- [ ] 엑셀 기준연도와 업로드 화면 기준연도가 다르면 오류 또는 경고 row로 표시된다.
- [ ] 화면 표시 기준연도와 LeaveLedger/잔여 계산에 사용되는 연도가 일치한다.
- [ ] 기존 2019 PARSED batch는 dry-run에서 보정 가능 대상으로 표시된다.
- [ ] 기존 2019 APPLIED batch는 기본 dry-run/apply 대상에서 제외되고 경고가 표시된다.
# 외부 캘린더 구독 smoke test

- [ ] 직원으로 로그인한다.
- [ ] 내 프로필 또는 휴가 캘린더에서 외부 캘린더 연동 화면에 접근한다.
- [ ] Google/Apple/Samsung/Outlook/기타 iCal 지원 캘린더 선택지가 표시된다.
- [ ] 구독 URL을 생성한다.
- [ ] 구독 URL 새 탭 접근 시 `Content-Type: text/calendar` 응답을 확인한다.
- [ ] `BEGIN:VCALENDAR`, `VERSION:2.0`, `VEVENT`를 확인한다.
- [ ] 승인된 휴가가 포함되는지 확인한다.
- [ ] 취소/반려/철회 휴가가 제외되는지 확인한다.
- [ ] 휴가 사유, 증명자료, 관리자 메모가 ICS에 포함되지 않는지 확인한다.
- [ ] URL 재발급 후 기존 URL이 차단되는지 확인한다.
- [ ] 연동 해제 후 URL이 차단되는지 확인한다.
- [ ] 모바일에서 구독 URL, 복사 버튼, 재발급/해제 버튼이 잘리지 않는지 확인한다.

## 근태 월별 마감 smoke test

- [ ] OWNER가 `/admin/attendance/monthly`에 접근할 수 있다.
- [ ] LEAD가 담당 팀 범위의 월별 근태만 조회한다.
- [ ] MANAGER가 관리자 근태 마감 화면에 접근할 수 없다.
- [ ] 요약 카드에 정상, 지각, 조퇴, 결근, 퇴근 누락, 휴가, 수정 요청 대기가 표시된다.
- [ ] OWNER가 Step-up 없이 마감을 시도하면 실패한다.
- [ ] OWNER가 Step-up 후 월 마감을 수행할 수 있다.
- [ ] 마감된 월에서 직원 신규 수정 요청이 차단된다.
- [ ] OWNER가 Step-up 후 마감 해제를 수행할 수 있다.
- [ ] 모바일에서 필터, 카드, 마감 버튼이 잘리지 않는다.
## 알림 고도화 Smoke Test

1. OWNER로 로그인한 뒤 TopBar/MobileTopBar의 NotificationBell unread badge가 표시되는지 확인한다.
2. `/notifications`에서 전체/읽지 않음/근태/보안/Job 그룹과 우선순위 필터를 확인한다.
3. 휴가 요청 생성 후 승인권자 알림이 생성되는지 확인한다.
4. 휴가 승인/반려 후 요청 직원 알림이 생성되는지 확인한다.
5. 근태 수정 요청 생성 후 OWNER 또는 담당 LEAD 알림이 생성되는지 확인한다.
6. Job 실패 테스트 또는 dry-run 실패 케이스에서 OWNER CRITICAL 알림이 생성되는지 확인한다.
7. 개별 읽음과 모두 읽음 처리 후 unread badge가 줄어드는지 확인한다.
8. 알림 화면/API/AuditLog/외부 payload에 token, password, 휴가 사유 원문, 증빙자료 정보가 없는지 확인한다.
