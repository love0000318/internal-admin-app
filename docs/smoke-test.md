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

- [ ] 조직/팀을 생성하고 직원을 초대한다.
  - 기대 결과: 팀과 직원 초대가 생성된다.
  - 실패 시 확인할 것: OWNER guard, 팀 unique key, 초대 중복 검증.

- [ ] 직원이 초대 링크로 가입한다.
  - 기대 결과: MANAGER 계정이 생성되고 로그인 가능하다.
  - 실패 시 확인할 것: invitation token, password validation, identity mock production 차단.

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

- [ ] 직원이 생일 반차를 요청한다.
  - 기대 결과: 반차 단위로 요청 가능하고 승인 흐름과 연결된다.
  - 실패 시 확인할 것: custom grant request adapter.

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
  - 기대 결과: SUBMITTED 상태가 되고 OWNER 화면에서 확인된다.
  - 실패 시 확인할 것: 계획 총량, 과거 날짜, 중복 날짜 검증.

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

- [ ] MANAGER/LEAD가 리포트 또는 export에 접근한다.
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
