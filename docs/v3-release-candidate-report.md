# 3차 릴리즈 후보 점검 보고서

작성일: 2026-05-04  
목적: 3차 변경사항을 릴리즈 후보 기준으로 점검하고, 배포 전 blocker와 운영 절차를 명확히 정리한다.

## 최종 판단

**배포 불가**

3차 전체 범위에 포함된 근태/출퇴근 및 근태 수정 요청 기능이 현재 코드에서 확인되지 않는다. `/attendance`, `/attendance/history`, `/admin/attendance`, `src/lib/attendance`가 없으므로 3차 전체 릴리즈 범위 기준으로는 P0 blocker다.

단, 근태 기능을 이번 릴리즈에서 제외하고 Neon 운영 DB에서 migration/preflight/production smoke test를 통과하면, 휴가/초대/보안/UI 범위는 **제한적으로 배포 가능**으로 판단할 수 있다.

## 포함된 3차 기능

- 모바일 UI/UX 보정
- 전역 NotificationBell
- 휴가 캘린더 색상 표시
- 외부 이메일/Slack 알림 provider 구조
- 외부 캘린더 ICS 구독
- 세션/token/초대 보안 강화
- OWNER 권한 보호와 Step-up 재인증
- AuditLog sanitize, 분류, export 보호
- 보안 대시보드
- 비활성 직원 영구 삭제/익명화 삭제

## 제외 또는 차단 기능

- 근태/출퇴근 및 근태 수정 요청: 현재 route/lib 없음
- 카카오 알림톡, SMS, Push notification
- GPS 근태 인증
- 급여 정산, 전자계약
- SSO/MFA
- Google Calendar 양방향 OAuth
- 파일 바이러스 검사
- 고급 리포트

## 실행한 명령

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `corepack pnpm lint` | PASS | ESLint 통과 |
| `corepack pnpm typecheck` | PASS | TypeScript 통과 |
| `corepack pnpm test` | PASS | 26 files, 171 tests passed |
| `corepack pnpm build` | PASS | 첫 실행은 Windows copyfile 오류, `.next` 정리 후 재실행 통과 |
| `corepack pnpm db:validate` | PASS | Prisma schema valid |
| `corepack pnpm db:generate` | PASS | Prisma Client 생성 |
| `corepack pnpm prisma migrate status` | FAIL | 로컬 `localhost:5432` DB 연결 실패 |
| `corepack pnpm preflight` | FAIL | 로컬 DB 연결 실패, local env warning |
| `vercel.cmd env ls production` | FAIL | Vercel CLI 미설치 |

## 통과한 테스트

- lint
- typecheck
- Vitest test suite
- production build
- Prisma schema validation
- Prisma Client generation

## 실패한 테스트와 원인

- `prisma migrate status`: 현재 `.env`의 `DATABASE_URL`이 로컬 PostgreSQL을 가리키지만 DB가 실행 중이 아니어서 실패했다.
- `preflight`: DB 연결 실패로 OWNER/seed/table 접근 확인이 불가능했다. 로컬 환경에서는 일부 secret/env가 unset이라 warning도 발생했다.
- Vercel production env 조회: `vercel.cmd`가 설치되어 있지 않아 CLI 확인이 불가능했다. 실제 값은 문서나 로그에 기록하지 않고 Vercel dashboard에서 이름과 존재 여부만 확인해야 한다.

## P0 blocker

### 발견한 P0

- 근태/출퇴근 기능 부재
  - 영향: 직원 출근/퇴근, 근태 이력, 관리자 근태 검수를 수행할 수 없다.
  - 근거: build route 목록과 파일 탐색에서 `/attendance`, `/attendance/history`, `/admin/attendance`, `src/lib/attendance`가 확인되지 않았다.
  - 조치: 근태를 이번 릴리즈에서 제외하거나 별도 구현/QA 후 릴리즈 후보를 다시 만든다.

- 운영 DB migration 상태 미확인
  - 영향: Neon production DB에 최신 migration이 적용되었는지 현재 세션에서 확인할 수 없다.
  - 근거: 로컬 PostgreSQL 연결 실패로 `migrate status`와 `preflight`가 실패했다.
  - 조치: 운영 Neon `DATABASE_URL` 기준으로 `corepack pnpm prisma migrate deploy`와 `corepack pnpm preflight`를 실행한다.

### 해결한 P0

- 코드 품질 게이트 기준 P0는 없다. `lint`, `typecheck`, `test`, `build`, `db:validate`, `db:generate`가 통과했다.

### 남은 P0

- 근태/출퇴근 route/lib 부재
- 운영 DB migration 상태 미확인

## P1 개선 항목

- 실제 모바일 브라우저에서 360px/390px/430px screenshot 검수가 필요하다.
- 외부 이메일/Slack 알림 provider는 구조가 있으나 production env 확인이 필요하다.
- Vercel CLI가 없어 production env 목록을 로컬에서 확인하지 못했다.
- 일부 legacy 문서에는 과거 인코딩 깨짐이 남아 있을 수 있다.
- Vercel serverless 환경에서 local private attachment storage는 운영 파일 저장소로 부적합하므로 외부 object storage 전환을 권장한다.

## P2 후속 항목

- 카카오 알림톡
- GPS 근태 인증
- 급여 정산
- 전자계약
- SSO/MFA
- Google Calendar 양방향 OAuth
- 파일 바이러스 검사
- 고급 리포트

## 모바일 UI 검수 결과

코드 기준으로 모바일 responsive 보정은 적용되어 있다. 다만 실제 Vercel 배포 URL에서 360px, 390px, 430px, 768px, 1024px, 1440px viewport 수동 검수는 별도로 필요하다.

확인 대상:

- `/login`
- `/invitations/accept`
- `/dashboard`
- `/leaves/me`
- `/leaves/me/requests/new`
- `/leaves/me/use-plan`
- `/leaves/calendar`
- `/notifications`
- `/admin/leaves/settings`
- `/admin/leaves/types`
- `/admin/leaves/balances`
- `/admin/security`
- `/admin/reports`
- `/organization/employees`

근태 화면은 route가 없으므로 검수 대상에서 차단된다.

## 보안 검수 결과

코드 구조 기준으로 다음 항목이 확인되었다.

- Session, invitation token, shortToken, calendar token은 hash 기반 구조를 사용한다.
- 1회용 가입 인증 코드는 hash, attempt limit, consumed/revoked 필드를 가진다.
- rememberMe 세션 만료 정책과 cookie 보안 설정 구조가 있다.
- OWNER/role 변경, 직원 비활성화, 직원 영구 삭제, CSV export에 Step-up purpose가 연결되어 있다.
- 마지막 OWNER 보호와 자기 자신 위험 작업 차단 helper가 존재한다.
- AuditLog metadata sanitize, category/severity 분류, export Step-up 보호, 보안 대시보드가 존재한다.

남은 확인:

- 실제 DB 연결 상태에서 OWNER/LEAD/MANAGER/EXTERNAL_PARTNER 직접 route/API 접근 smoke test가 필요하다.

## DB migration 필요 여부

필요하다. 현재 migration 목록에는 다음 3차 관련 migration이 포함되어 있다.

- `20260503033000_add_calendar_subscription_tokens`
- `20260503043000_add_step_up_verifications`
- `20260503053000_add_session_token_hardening`
- `20260503060000_extend_step_up_security`
- `20260503070000_audit_log_security_fields`
- `20260503080000_employee_permanent_deletion`

운영 DB에는 절대 `prisma migrate reset`을 사용하지 말고 다음 명령만 사용한다.

```powershell
$env:DATABASE_URL='Neon DATABASE_URL'
corepack pnpm prisma migrate deploy
```

## Vercel env 확인 결과

`.env.production.example` 기준 필수 후보는 정리되어 있다. 실제 Vercel production env는 CLI 미설치로 확인하지 못했다.

필수 확인:

- `DATABASE_URL`
- `APP_BASE_URL`
- `NODE_ENV=production`
- `APP_SECRET`
- `SESSION_SECRET`
- `ENCRYPTION_SECRET`
- `TOKEN_SECRET`
- `INVITATION_TOKEN_SECRET`
- `INVITATION_SHORT_TOKEN_SECRET`
- `INVITATION_VERIFICATION_CODE_SECRET`
- `CRON_SECRET`
- `SESSION_EXPIRES_IN_DAYS`
- `REMEMBER_ME_SESSION_EXPIRES_IN_DAYS`
- `STEP_UP_EXPIRES_IN_MINUTES`
- `STEP_UP_MAX_ATTEMPTS`
- `INVITATION_VERIFICATION_CODE_EXPIRES_IN_DAYS`
- `INVITATION_VERIFICATION_CODE_MAX_ATTEMPTS`
- `INVITATION_VERIFICATION_CODE_LENGTH`

외부 알림 비활성 운영:

- `EMAIL_PROVIDER=none`
- `EXTERNAL_EMAIL_NOTIFICATIONS_ENABLED=false`
- `SLACK_NOTIFICATIONS_ENABLED=false`

주의: 실제 secret 값은 문서나 로그에 기록하지 않는다.

## 배포 전 명령

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm db:validate
corepack pnpm db:generate

$env:DATABASE_URL='Neon DATABASE_URL'
corepack pnpm prisma migrate deploy
corepack pnpm db:seed
corepack pnpm preflight
```

## 배포 후 smoke test

1. OWNER 로그인
2. 직원 초대 생성
3. 초대 URL과 1회용 가입 인증 코드 확인
4. 직원 가입
5. 직원 휴가 요청
6. OWNER 휴가 승인
7. 알림센터 확인
8. 보안 대시보드 확인
9. AuditLog 확인
10. 모바일에서 로그인/초대 가입/휴가 요청/휴가 관리 설정 확인
11. 비활성 직원 삭제/익명화 테스트
12. 캘린더 구독 링크 생성과 ICS 응답 확인
13. 근태를 릴리즈에 포함한다면 출근/퇴근/근태 이력/관리자 근태 화면 확인

## 배포 가능 여부

**배포 불가**

근태 기능을 3차 릴리즈에서 제외하고, Neon migration deploy와 production smoke test가 통과하면 **제한적으로 배포 가능**이다.
