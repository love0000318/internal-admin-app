# 동작 플로우 안내서

각 플로우는 실제 route, model, script를 기준으로 작성했다.

## 최초 설치에서 OWNER 생성

1. 운영자가 `.env`를 설정한다.
2. `pnpm db:deploy` 또는 `pnpm db:migrate`를 실행한다.
3. `pnpm db:seed`가 기본 정책과 OWNER 초대를 만든다.
4. OWNER가 초대 링크로 `/invitations/accept`에 접근한다.
5. 가입 완료 시 `User`, `Session`, `AuditLog`가 생성된다.

## OWNER 로그인에서 조직/팀 생성

1. OWNER가 `/login`에서 로그인한다.
2. `/dashboard`로 이동한다.
3. `/organization/teams`에서 팀을 생성한다.
4. 필요하면 LEAD를 지정한다.
5. `Team`과 AuditLog가 갱신된다.

## 직원 초대에서 직원 가입

1. OWNER가 `/organization/invitations`에서 이메일과 역할을 입력한다.
2. `Invitation.tokenHash`가 저장되고 원문 token은 링크로만 표시된다.
3. 직원이 `/invitations/accept`에서 가입한다.
4. `Invitation.status`가 `ACCEPTED`가 되고 `User`가 생성된다.
5. prejoin profile이 연결되어 있으면 HR 프로필도 생성된다.

## HR import에서 온보딩

1. 운영자가 엑셀을 `private/imports`에 둔다.
2. `pnpm hr:import private/imports/employee-master.xlsx`를 실행한다.
3. `EmployeeImportBatch`와 `EmployeePrejoinProfile`이 생성된다.
4. 이메일 기준으로 초대와 prejoin profile이 연결된다.
5. 직원 가입 시 `EmployeeProfile`, `EmployeeSensitiveProfile`, `EmploymentProfile`, child records가 생성된다.
6. 직원은 `/profile/confirm`에서 확인 완료를 누른다.

## 직원 프로필 수정에서 민감정보 변경 요청

1. 직원이 `/profile`에서 정보를 본다.
2. `/profile/edit`에서 허용된 기본 정보를 수정한다.
3. 민감정보 변경은 `EmployeeProfileChangeRequest`로 생성된다.
4. OWNER가 `/admin/profile-change-requests`에서 승인/반려한다.
5. AuditLog에는 changedFields 중심으로 기록하고 민감 원문은 저장하지 않는다.

## 연차 보유 계산에서 승인 반영

1. 연차 정책과 ledger를 기준으로 `/leaves/me`에 잔여를 표시한다.
2. 직원이 `/leaves/me/requests/new`에서 연차를 요청한다.
3. `LeaveRequest`가 `PENDING`이 되고 `LeaveLedger.PENDING`이 생성된다.
4. OWNER/LEAD가 `/leaves/approvals/[requestId]`에서 승인한다.
5. `LeaveLedger.USED`가 생성되고 요청자는 Notification을 받는다.

## 맞춤휴가 생성에서 잔여 반영

1. OWNER가 `/admin/leaves/types`에서 맞춤휴가 유형을 만든다.
2. `/admin/leaves/grants`에서 직원에게 지급한다.
3. `LeaveGrant`와 `LeaveLedger.GRANTED`가 생성된다.
4. 직원이 지급된 grant를 사용해 요청한다.
5. 요청/철회/승인/반려/취소 시 pending/used/remaining과 ledger가 갱신된다.

## 생일 반차 자동 지급

1. OWNER가 `/admin/leaves/birthday-policy`에서 정책을 확인한다.
2. 운영자가 `pnpm jobs:birthday-half-day-grants -- --dry-run`으로 대상자를 확인한다.
3. 실제 실행 시 `LeaveGrant.source = BIRTHDAY_AUTO`가 생성된다.
4. 직원에게 Notification이 생성된다.
5. 직원은 생일 반차를 휴가 요청으로 사용할 수 있다.

## 연차 촉진에서 소멸

1. OWNER가 `/admin/leaves/annual-policy`에서 정책을 확인한다.
2. `pnpm jobs:schedule-annual-promotion-notices`가 notice를 만든다.
3. `pnpm jobs:send-annual-promotion-notices`가 due notice를 Notification으로 보낸다.
4. 직원은 `/leaves/me/use-plan`에서 사용계획을 제출한다.
5. `pnpm jobs:expire-annual-leaves -- --dry-run`으로 소멸 대상을 확인한다.
6. 실제 실행 시 `LeaveLedger.EXPIRED`가 생성된다.

## 증명자료 필수 휴가

1. 휴가 유형의 `attachmentPolicy`를 설정한다.
2. `REQUIRED_BEFORE_REQUEST`는 첨부 없이 요청할 수 없다.
3. `REQUIRED_AFTER_REQUEST`는 요청 후 제출 필요 상태가 된다.
4. 직원이 요청 상세에서 파일을 제출한다.
5. OWNER/담당 LEAD가 승인 상세에서 다운로드/검수한다.
6. 반려 또는 재제출 요청 시 직원에게 Notification이 생성된다.

## 승인 정책 설정

1. OWNER가 `/admin/leaves/approval-policies`에서 정책을 만든다.
2. `/admin/leaves/types`에서 휴가 유형에 정책을 연결한다.
3. 이후 생성되는 요청부터 정책이 적용된다.
4. `NONE`은 자동 승인, `SINGLE`은 OWNER/TEAM_LEAD/CUSTOM_USER 규칙을 따른다.

## 휴가 캘린더 공개 범위

1. 승인된 휴가가 `/leaves/calendar`에 표시된다.
2. `PUBLIC_WITH_TYPE`은 휴가 유형까지 표시한다.
3. `PUBLIC_AS_LEAVE`는 “휴가”로만 표시한다.
4. `PRIVATE_TO_APPROVERS`는 요청자/OWNER/승인권자 외에는 숨긴다.
5. 서버에서 필터링된 DTO만 클라이언트에 전달한다.

## 관리자 리포트에서 CSV export

1. OWNER가 `/admin/reports`에 접근한다.
2. 리포트별 필터를 선택한다.
3. `/admin/reports/export`가 OWNER 권한을 다시 확인한다.
4. allowlist 기반 CSV를 생성한다.
5. `REPORT_EXPORTED` AuditLog가 기록된다.

## Notification 읽음 처리

1. 기능별 action/job이 `Notification`을 만든다.
2. 사용자는 `/notifications`에서 자기 알림을 본다.
3. 알림 클릭 또는 버튼으로 `readAt`을 저장한다.
4. 타인 알림은 조회/수정할 수 없다.

## Job 실행과 실패 알림

1. Job script 또는 관리자 action이 JobRun을 시작한다.
2. 성공/실패/부분 성공 결과를 집계로 저장한다.
3. 실패 시 OWNER에게 HIGH priority Notification을 만든다.
4. summary에는 민감정보를 넣지 않는다.

## 보안 차단 플로우

1. 비로그인은 protected route에서 차단된다.
2. MANAGER는 타인 HR/첨부/admin/report에 접근할 수 없다.
3. LEAD는 담당 범위 밖 요청과 첨부를 처리할 수 없다.
4. EXTERNAL_PARTNER는 내부 기능에 접근할 수 없다.
5. token/fileKey/private path/민감 원문은 화면, CSV, AuditLog, Notification, JobRun에 넣지 않는다.

## 승인 대기 휴가 자동 확정 플로우

1. 직원이 휴가를 요청하고 요청이 `PENDING` 상태로 저장된다.
2. 요청 생성 시 기존 흐름대로 PENDING ledger 또는 LeaveGrant pending 수량이 반영된다.
3. 매일 `jobs:auto-confirm-past-start-leaves` 또는 `/api/cron/auto-confirm-past-start-leaves`가 실행된다.
4. 시스템은 Asia/Seoul date-only 기준으로 시작일이 도래한 PENDING 요청을 조회한다.
5. 승인 정책의 자동 확정 사용 여부와 자동 확정 시점을 확인한다.
6. 증명자료 확인 후 승인 필수 정책이면 `attachmentStatus=ACCEPTED`인 요청만 처리한다.
7. 수량/중복 검증을 다시 수행한다.
8. 요청을 `APPROVED`로 변경하고 `autoConfirmedAt`, `autoConfirmReason`, `approvalSource=AUTO_START_DATE`를 저장한다.
9. LeaveGrant 기반 요청은 pending 수량을 used 수량으로 이동한다.
10. LeaveLedger에 `USED` 이벤트와 `LEAVE_AUTO_CONFIRM` source를 기록한다.
11. 직원 Notification과 AuditLog, JobRun 결과를 기록한다.
12. 이미 처리된 요청은 `status`와 `auto-confirm-used:{leaveRequestId}` idempotencyKey로 중복 처리하지 않는다.

## 초대 가입 인증 코드 흐름

1. OWNER가 `/organization/invitations`에서 직원을 초대한다.
2. 시스템이 초대 token과 1회용 가입 인증 코드를 생성한다.
3. DB에는 tokenHash와 verificationCodeHash만 저장한다.
4. 관리자 화면에 초대 링크와 가입 인증 코드를 생성 직후 한 번 표시한다.
5. 직원은 초대 링크에서 가입 인증 코드를 입력한다.
6. 코드가 유효하면 가입을 진행하고 `verificationCodeConsumedAt`을 저장한다.
7. 코드가 틀리면 attemptCount를 증가시키고 최대 횟수 이후 잠근다.
8. 초대 재발급 시 기존 초대와 코드는 폐기되고 새 링크/코드가 생성된다.
