# 기능 상태표

상태는 현재 코드의 route, Prisma model, script 존재 여부와 자동 검증 결과를 기준으로 한다.

| 기능 | 상태 | 실제 route | 관련 모델 | 관련 script | 사용자 | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| OWNER 가입 | COMPLETE | `/invitations/accept`, `/signup/invite` | `Invitation`, `User`, `IdentityVerification` | `db:seed` | OWNER | 초대 token hash 기반 |
| 로그인/로그아웃 | COMPLETE | `/login` | `User`, `Session` | 없음 | 내부 사용자 | session token hash 저장 |
| 조직/팀 관리 | COMPLETE | `/organization`, `/organization/teams`, `/admin/organization` | `Team`, `User` | 없음 | OWNER | 하위 팀 구조 지원 |
| 직원 초대/가입 | COMPLETE | `/organization/invitations`, `/invitations/accept` | `Invitation`, `User`, `Team` | 없음 | OWNER, 직원 | prejoin 연결 가능 |
| HR import | COMPLETE | 화면 없음, CLI 중심 | `EmployeeImportBatch`, `EmployeePrejoinProfile` | `hr:import` | OWNER/운영자 | 원본 파일은 private 경로 |
| 사전 직원 프로필 | PARTIAL | 전용 `/admin/hr/prejoin-profiles` route 없음 | `EmployeePrejoinProfile`, draft models | `hr:import` | OWNER/운영자 | 모델은 있으나 전용 목록/상세/검수 화면과 reviewStatus 필드는 없음 |
| 사전 프로필 기반 초대 | PARTIAL | `/organization/invitations` | `EmployeePrejoinProfile`, `Invitation` | 없음 | OWNER | 이메일 기준 연결 구조는 있으나 전용 일괄 초대 화면은 없음 |
| 직원 온보딩 | PARTIAL | `/profile/confirm`, `/admin/reports/hr/onboarding` | `EmployeeProfile`, `EmployeePrejoinProfile` | 없음 | 직원, OWNER | profile confirm은 있음. 별도 prejoin onboardingStatus 필드는 없음 |
| 직원 프로필 자동 생성 | COMPLETE | 가입 flow, `/profile/confirm` | HR profile models | `hr:import` | 직원 | import 기반 생성 |
| 직원 자기 정보 수정 | COMPLETE | `/profile`, `/profile/edit` | `EmployeeProfile`, records | 없음 | 본인 | 허용 필드만 즉시 수정 |
| 민감정보 변경 요청 | COMPLETE | `/admin/profile-change-requests` | `EmployeeProfileChangeRequest` | 없음 | 직원, OWNER | 원문 AuditLog 금지 |
| 휴가 유형 관리 | COMPLETE | `/admin/leaves/types` | `LeaveTypeDefinition` | `db:seed` | OWNER | visibility/attachment/approval 연결 |
| 맞춤휴가 지급 | COMPLETE | `/admin/leaves/grants` | `LeaveGrant` | 없음 | OWNER | 단일/일괄/회수 |
| 생일 반차 자동 지급 | COMPLETE | `/admin/leaves/birthday-policy` | `BirthdayLeavePolicy`, `LeaveGrant` | `jobs:birthday-half-day-grants` | OWNER/Job | dry-run 지원 |
| 맞춤휴가 요청 | COMPLETE | `/leaves/me/requests/new` | `LeaveRequest`, `LeaveRequestGrantUsage` | 없음 | 직원 | 지급된 grant 기준 |
| LeaveLedger | COMPLETE | `/admin/leaves/history` | `LeaveLedger` | `leave:ledger:rebuild`, `leave:ledger:validate` | OWNER/직원 | source of truth |
| 연차 정책 | COMPLETE | `/admin/leaves/annual-policy` | `AnnualLeavePolicy` | 없음 | OWNER | 회계일/반차/소멸 |
| 연차 촉진 | COMPLETE | `/admin/leaves/promotions`, `/leaves/me/use-plan` | `AnnualLeavePromotionNotice`, `AnnualLeaveUsePlan` | schedule/send jobs | OWNER/직원 | 인앱 알림 중심 |
| 연차 소멸 | COMPLETE | CLI 중심 | `LeaveLedger`, `AnnualLeaveExpirationRun` | `jobs:expire-annual-leaves` | OWNER/Job | dry-run 우선 |
| 증명자료 | COMPLETE | `/leaves/me/requests/[requestId]`, `/api/leave-attachments/[attachmentId]/download` | `LeaveAttachment` | 없음 | 직원, OWNER, 담당 LEAD | private storage |
| 승인 정책 | COMPLETE | `/admin/leaves/approval-policies` | `ApprovalPolicy`, `LeaveTypeDefinition` | `db:seed` | OWNER | sequential은 TODO |
| 휴가 캘린더 | COMPLETE | `/leaves/calendar` | `LeaveRequest`, `LeaveTypeDefinition` | 없음 | OWNER/LEAD/MANAGER | 서버 필터링 |
| 관리자 리포트 | COMPLETE | `/admin/reports` 이하 | 여러 모델 | 없음 | OWNER | export route 존재 |
| CSV export 보안 | COMPLETE | `/admin/reports/export` | `AuditLog` | 없음 | OWNER | allowlist/BOM/injection 방어 |
| 알림센터 | COMPLETE | `/notifications` | `Notification` | 없음 | 내부 사용자 | 자기 알림만 |
| 업무 관리 MVP | PARTIAL | `/admin/work-management` | `ClickUpTaskMirror`, `WorkTaskLocalState`, `ClickUpDocMirror`, `WorkTaskChangeRequest`, `WorkTaskActivity` | 없음 | OWNER | ClickUp Task read-only sync 기반, Docs sync는 service skeleton/준비 상태 |
| JobRun | COMPLETE | `/admin/jobs`, `/admin/jobs/[jobRunId]` | `JobRun` | 주요 jobs | OWNER | 위험 Job UI 제한 |
| Cron endpoint 보안 | PARTIAL | 현재 `/api/cron/*` route 없음 | `JobRun` | CLI jobs | 운영자 | helper는 있으나 endpoint는 3차/TODO |
| 보안/권한 | COMPLETE | protected routes/actions | RBAC/security helpers | `preflight` | 전체 | 서버 guard 중심 |
| AuditLog | COMPLETE | `/admin/audit-logs` | `AuditLog` | 없음 | OWNER | metadata sanitize |

## 2026-05-02 추가 상태

| 기능 | 상태 | 실제 route | 관련 모델 | 관련 script | 사용자 | 비고 |
| --- | --- | --- | --- | --- | --- | --- |
| 미승인 휴가 자동 확정 | COMPLETE | `/api/cron/auto-confirm-past-start-leaves` | `LeaveRequest`, `ApprovalPolicy`, `LeaveLedger`, `JobRun` | `jobs:auto-confirm-past-start-leaves` | Job/OWNER | PENDING 시작일 다음 날부터 APPROVED 전환, `LEAVE_AUTO_CONFIRM` ledger 기록, 중복 차감 방지 |
| Cron endpoint 보안 | PARTIAL | `/api/cron/auto-confirm-past-start-leaves` | `JobRun` | `jobs:auto-confirm-past-start-leaves` | 운영자 | 자동 확정 cron은 `CRON_SECRET` 보호 구현, 다른 운영 job cron endpoint는 TODO |

| 외부 캘린더 ICS 구독 | COMPLETE | `/leaves/calendar/settings`, `/api/calendar/ical` | `CalendarSubscriptionToken`, `CalendarSubscriptionScope` | 없음 | OWNER/LEAD/MANAGER | Google/Apple/Samsung 표준 ICS 읽기 전용 구독. OAuth 양방향 동기화는 TODO. |
